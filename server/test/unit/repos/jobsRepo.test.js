const { createFakeFirestore, FieldValue, FakeTimestamp } = require('../../helpers/fakeFirestore');
const { createJobsRepo } = require('../../../src/repos/jobsRepo');
const { LostLeaseError, NotFoundError, IdempotencyConflictError, NoApprovedVariationsError } = require('../../../src/errors/AppError');

function makeRepo(overrides = {}) {
  const db = createFakeFirestore();
  const repo = createJobsRepo({ db, FieldValue, leaseTimeoutMs: 60_000, ...overrides });
  return { db, repo };
}

async function seedJob(db, id, data) {
  await db.collection('jobs').doc(id).set(data);
  return id;
}

async function seedShop(db, shopDomain, data) {
  await db.collection('shops').doc(shopDomain).set({ creditBalance: 0, plan: 'metered', lifetimeCreditsSpent: 0, lifetimeImagesGenerated: 0, ...data });
}

describe('repos/jobsRepo', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('claimForProcessing (lease semantics)', () => {
    it('claims a pending job', async () => {
      const { db, repo } = makeRepo();
      await seedJob(db, 'job1', { status: 'pending', shopDomain: 's1' });

      const result = await repo.claimForProcessing('job1', { workerId: 'workerA' });

      expect(result.claimed).toBe(true);
      expect(result.job.status).toBe('processing');
      expect(result.job.workerId).toBe('workerA');
      const stored = (await db.collection('jobs').doc('job1').get()).data();
      expect(stored.status).toBe('processing');
      expect(stored.claimAttempts).toBe(1);
    });

    it('returns not_found for a missing job', async () => {
      const { repo } = makeRepo();
      const result = await repo.claimForProcessing('missing', { workerId: 'workerA' });
      expect(result).toEqual({ claimed: false, job: undefined, reason: 'not_found' });
    });

    it('a fresh lease refuses reclaim by a different worker', async () => {
      const { db, repo } = makeRepo();
      await seedJob(db, 'job1', { status: 'pending', shopDomain: 's1' });
      await repo.claimForProcessing('job1', { workerId: 'workerA' });

      const result = await repo.claimForProcessing('job1', { workerId: 'workerB' });

      expect(result.claimed).toBe(false);
      expect(result.reason).toBe('lease_active');
      const stored = (await db.collection('jobs').doc('job1').get()).data();
      expect(stored.workerId).toBe('workerA');
    });

    it('a stale lease allows reclaim by a different worker', async () => {
      vi.useFakeTimers();
      const { db, repo } = makeRepo({ leaseTimeoutMs: 60_000 });
      await seedJob(db, 'job1', { status: 'pending', shopDomain: 's1' });
      await repo.claimForProcessing('job1', { workerId: 'workerA' });

      vi.advanceTimersByTime(60_001);

      const result = await repo.claimForProcessing('job1', { workerId: 'workerB' });

      expect(result.claimed).toBe(true);
      expect(result.job.workerId).toBe('workerB');
    });

    it('succeeded, failed, and cancelled jobs never reclaim regardless of lease age', async () => {
      vi.useFakeTimers();
      const { db, repo } = makeRepo({ leaseTimeoutMs: 60_000 });
      for (const status of ['succeeded', 'failed', 'cancelled']) {
        await seedJob(db, `job-${status}`, {
          status,
          shopDomain: 's1',
          workerId: 'workerA',
          claimedAt: FakeTimestamp.now(),
        });
      }

      vi.advanceTimersByTime(10 * 60_000); // well past any lease timeout

      for (const status of ['succeeded', 'failed', 'cancelled']) {
        const result = await repo.claimForProcessing(`job-${status}`, { workerId: 'workerB' });
        expect(result).toMatchObject({ claimed: false, reason: 'terminal' });
      }
    });

    it('a heartbeat() call resets staleness so a claim attempt within the timeout of the heartbeat still refuses', async () => {
      vi.useFakeTimers();
      const { db, repo } = makeRepo({ leaseTimeoutMs: 60_000 });
      await seedJob(db, 'job1', { status: 'pending', shopDomain: 's1' });
      await repo.claimForProcessing('job1', { workerId: 'workerA' });

      vi.advanceTimersByTime(50_000); // still within the original lease
      await repo.heartbeat('job1', { workerId: 'workerA', stage: 'in_progress' });

      vi.advanceTimersByTime(55_000); // 105s since the original claim (would be stale), 55s since heartbeat
      const result = await repo.claimForProcessing('job1', { workerId: 'workerB' });

      expect(result.claimed).toBe(false);
      expect(result.reason).toBe('lease_active');

      vi.advanceTimersByTime(6_000); // now 61s since the heartbeat — stale relative to IT
      const secondAttempt = await repo.claimForProcessing('job1', { workerId: 'workerB' });
      expect(secondAttempt.claimed).toBe(true);
    });

    it('heartbeat records the progress stage and any extra fields', async () => {
      const { db, repo } = makeRepo();
      await seedJob(db, 'job1', { status: 'pending', shopDomain: 's1' });
      await repo.claimForProcessing('job1', { workerId: 'workerA' });

      await repo.heartbeat('job1', { workerId: 'workerA', stage: 'background_removed', extraFields: { processedImageUrl: 'https://x/y.png' } });

      const stored = (await db.collection('jobs').doc('job1').get()).data();
      expect(stored.progressStage).toBe('background_removed');
      expect(stored.processedImageUrl).toBe('https://x/y.png');
    });

    it('heartbeat throws LostLeaseError if the lease was reclaimed by someone else', async () => {
      const { db, repo } = makeRepo();
      await seedJob(db, 'job1', { status: 'processing', shopDomain: 's1', workerId: 'workerB', claimedAt: FakeTimestamp.now() });

      await expect(repo.heartbeat('job1', { workerId: 'workerA', stage: 'x' })).rejects.toBeInstanceOf(LostLeaseError);
    });
  });

  describe('claimAndCreateJob (idempotent job creation)', () => {
    it('creates a new job on the first call', async () => {
      const { repo } = makeRepo();
      const { job, isNew } = await repo.claimAndCreateJob('shop-a', 'key-1', { contentType: 'scene', prompt: 'x' });
      expect(isNew).toBe(true);
      expect(job.status).toBe('pending');
      expect(job.shopDomain).toBe('shop-a');
    });

    it('a retried request with the same key returns the existing job instead of creating a duplicate', async () => {
      const { db, repo } = makeRepo();
      const first = await repo.claimAndCreateJob('shop-a', 'key-1', { contentType: 'scene', prompt: 'x' });
      const second = await repo.claimAndCreateJob('shop-a', 'key-1', { contentType: 'scene', prompt: 'a different prompt' });

      expect(second.isNew).toBe(false);
      expect(second.job.id).toBe(first.job.id);
      expect(second.job.prompt).toBe('x'); // the original job, not the retried payload

      const allJobs = await db.collection('jobs').get();
      expect(allJobs.size).toBe(1);
    });

    it('the same idempotency key under a different shop does not collide', async () => {
      const { repo } = makeRepo();
      const a = await repo.claimAndCreateJob('shop-a', 'key-1', { contentType: 'scene' });
      const b = await repo.claimAndCreateJob('shop-b', 'key-1', { contentType: 'scene' });
      expect(a.job.id).not.toBe(b.job.id);
    });
  });

  describe('settleJobSuccess', () => {
    it('deducts the recomputed cost, writes a ledger entry, and increments lifetime stats', async () => {
      const { db, repo } = makeRepo();
      await seedShop(db, 'shop-a', { creditBalance: 10, plan: 'metered' });
      await seedJob(db, 'job1', { status: 'processing', shopDomain: 'shop-a', workerId: 'workerA' });

      const { job, ledgerEntryId } = await repo.settleJobSuccess('job1', {
        workerId: 'workerA',
        resultVariations: [{ url: 'a' }, { url: 'b' }],
        recomputeCost: async () => 3,
      });

      expect(job.status).toBe('succeeded');
      expect(job.chargedCost).toBe(3);
      expect(ledgerEntryId).toBeTruthy();

      const shop = (await db.collection('shops').doc('shop-a').get()).data();
      expect(shop.creditBalance).toBe(7);
      expect(shop.lifetimeCreditsSpent).toBe(3);
      expect(shop.lifetimeImagesGenerated).toBe(2);

      const ledger = await db.collection('transactions').where('jobId', '==', 'job1').get();
      expect(ledger.size).toBe(1);
      expect(ledger.docs[0].data().amount).toBe(3);
      expect(ledger.docs[0].data().balanceAfter).toBe(7);
    });

    it('clamps the balance at zero rather than going negative', async () => {
      const { db, repo } = makeRepo();
      await seedShop(db, 'shop-a', { creditBalance: 1, plan: 'metered' });
      await seedJob(db, 'job1', { status: 'processing', shopDomain: 'shop-a', workerId: 'workerA' });

      await repo.settleJobSuccess('job1', { workerId: 'workerA', resultVariations: [{ url: 'a' }], recomputeCost: async () => 5 });

      const shop = (await db.collection('shops').doc('shop-a').get()).data();
      expect(shop.creditBalance).toBe(0);
    });

    it('unlimited-plan shops skip the balance check and ledger write but still get lifetime stats incremented', async () => {
      const { db, repo } = makeRepo();
      await seedShop(db, 'shop-a', { creditBalance: 0, plan: 'unlimited' });
      await seedJob(db, 'job1', { status: 'processing', shopDomain: 'shop-a', workerId: 'workerA' });

      const { ledgerEntryId } = await repo.settleJobSuccess('job1', {
        workerId: 'workerA',
        resultVariations: [{ url: 'a' }],
        recomputeCost: async () => 4,
      });

      expect(ledgerEntryId).toBeNull();
      const shop = (await db.collection('shops').doc('shop-a').get()).data();
      expect(shop.creditBalance).toBe(0);
      expect(shop.lifetimeCreditsSpent).toBe(4);
      expect(shop.lifetimeImagesGenerated).toBe(1);
      const ledger = await db.collection('transactions').get();
      expect(ledger.empty).toBe(true);
    });

    it('re-settling an already-succeeded job is idempotent and never double-charges', async () => {
      const { db, repo } = makeRepo();
      await seedShop(db, 'shop-a', { creditBalance: 10, plan: 'metered' });
      await seedJob(db, 'job1', { status: 'processing', shopDomain: 'shop-a', workerId: 'workerA' });
      const recomputeCost = vi.fn(async () => 3);

      await repo.settleJobSuccess('job1', { workerId: 'workerA', resultVariations: [{ url: 'a' }], recomputeCost });
      const second = await repo.settleJobSuccess('job1', { workerId: 'workerA', resultVariations: [{ url: 'a' }], recomputeCost });

      expect(second.alreadySettled).toBe(true);
      expect(recomputeCost).toHaveBeenCalledTimes(1); // never re-invoked once already settled
      const shop = (await db.collection('shops').doc('shop-a').get()).data();
      expect(shop.creditBalance).toBe(7); // charged exactly once
    });

    it('throws LostLeaseError if another worker now owns the lease', async () => {
      const { db, repo } = makeRepo();
      await seedShop(db, 'shop-a', {});
      await seedJob(db, 'job1', { status: 'processing', shopDomain: 'shop-a', workerId: 'workerB' });

      await expect(
        repo.settleJobSuccess('job1', { workerId: 'workerA', resultVariations: [], recomputeCost: async () => 1 }),
      ).rejects.toBeInstanceOf(LostLeaseError);
    });

    it('throws NotFoundError for a missing job', async () => {
      const { repo } = makeRepo();
      await expect(
        repo.settleJobSuccess('missing', { workerId: 'workerA', resultVariations: [], recomputeCost: async () => 1 }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('settleJobFailure', () => {
    it('marks the job failed without touching credits or usage stats', async () => {
      const { db, repo } = makeRepo();
      await seedShop(db, 'shop-a', { creditBalance: 10, lifetimeCreditsSpent: 0 });
      await seedJob(db, 'job1', { status: 'processing', shopDomain: 'shop-a', workerId: 'workerA' });

      const result = await repo.settleJobFailure('job1', { workerId: 'workerA', error: new Error('fal.ai timed out') });

      expect(result.skipped).toBe(false);
      const job = (await db.collection('jobs').doc('job1').get()).data();
      expect(job.status).toBe('failed');
      expect(job.error.message).toBe('fal.ai timed out');
      const shop = (await db.collection('shops').doc('shop-a').get()).data();
      expect(shop.creditBalance).toBe(10);
      expect(shop.lifetimeCreditsSpent).toBe(0);
    });

    it('silently skips a stale failure report from a worker that lost its lease', async () => {
      const { db, repo } = makeRepo();
      await seedJob(db, 'job1', { status: 'processing', shopDomain: 'shop-a', workerId: 'workerB' });

      const result = await repo.settleJobFailure('job1', { workerId: 'workerA', error: new Error('too late') });

      expect(result.skipped).toBe(true);
      const job = (await db.collection('jobs').doc('job1').get()).data();
      expect(job.status).toBe('processing'); // untouched
    });
  });

  describe('claimPublish / finalizePublishSuccess / releasePublishClaim', () => {
    it('claims the publish slot and persists approved variation indices atomically', async () => {
      const { db, repo } = makeRepo();
      await seedJob(db, 'job1', { status: 'succeeded', shopDomain: 'shop-a' });

      const result = await repo.claimPublish('job1', { approvedVariationIndices: [0, 2] });

      expect(result.claimed).toBe(true);
      const job = (await db.collection('jobs').doc('job1').get()).data();
      expect(job.publishStatus).toBe('publishing');
      expect(job.approvedVariationIndices).toEqual([0, 2]);
    });

    it('throws NoApprovedVariationsError when nothing was approved', async () => {
      const { db, repo } = makeRepo();
      await seedJob(db, 'job1', { status: 'succeeded', shopDomain: 'shop-a' });
      await expect(repo.claimPublish('job1', { approvedVariationIndices: [] })).rejects.toBeInstanceOf(NoApprovedVariationsError);
    });

    it('re-publishing an already-published job returns alreadyPublished instead of re-claiming', async () => {
      const { db, repo } = makeRepo();
      await seedJob(db, 'job1', { status: 'succeeded', shopDomain: 'shop-a', publishedAt: FakeTimestamp.now(), publishStatus: 'published' });

      const result = await repo.claimPublish('job1', { approvedVariationIndices: [0] });

      expect(result.claimed).toBe(false);
      expect(result.alreadyPublished).toBe(true);
    });

    it('a fresh concurrent publish claim throws IdempotencyConflictError', async () => {
      const { db, repo } = makeRepo();
      await seedJob(db, 'job1', { status: 'succeeded', shopDomain: 'shop-a', publishStatus: 'publishing', publishClaimedAt: FakeTimestamp.now() });

      await expect(repo.claimPublish('job1', { approvedVariationIndices: [0] })).rejects.toBeInstanceOf(IdempotencyConflictError);
    });

    it('a stale publish claim (crashed process) may be reclaimed', async () => {
      vi.useFakeTimers();
      const { db, repo } = makeRepo();
      await seedJob(db, 'job1', { status: 'succeeded', shopDomain: 'shop-a', publishStatus: 'publishing', publishClaimedAt: FakeTimestamp.now() });

      vi.advanceTimersByTime(3 * 60_000);

      const result = await repo.claimPublish('job1', { approvedVariationIndices: [0] });
      expect(result.claimed).toBe(true);
    });

    it('releasePublishClaim clears the claim but keeps the approval indices for a retry', async () => {
      const { db, repo } = makeRepo();
      await seedJob(db, 'job1', { status: 'succeeded', shopDomain: 'shop-a' });
      await repo.claimPublish('job1', { approvedVariationIndices: [1] });

      await repo.releasePublishClaim('job1', { error: new Error('Shopify 502') });

      const job = (await db.collection('jobs').doc('job1').get()).data();
      expect(job.publishStatus).toBe('failed');
      expect(job.publishClaimedAt).toBeNull();
      expect(job.approvedVariationIndices).toEqual([1]);
      expect(job.lastPublishError).toBe('Shopify 502');
    });

    it('finalizePublishSuccess marks the job published with the Shopify product/media ids', async () => {
      const { db, repo } = makeRepo();
      await seedJob(db, 'job1', { status: 'succeeded', shopDomain: 'shop-a' });
      await repo.claimPublish('job1', { approvedVariationIndices: [0] });

      await repo.finalizePublishSuccess('job1', { productId: 'gid://shopify/Product/1', mediaIds: ['gid://shopify/Media/1'] });

      const job = (await db.collection('jobs').doc('job1').get()).data();
      expect(job.publishStatus).toBe('published');
      expect(job.publishedProductId).toBe('gid://shopify/Product/1');
      expect(job.publishedMediaIds).toEqual(['gid://shopify/Media/1']);
      expect(job.publishedAt).toBeInstanceOf(FakeTimestamp);
    });
  });

  describe('queryJobs', () => {
    async function seedManyJobs(db) {
      const fixtures = [
        { id: 'j1', shopDomain: 's1', status: 'pending', contentType: 'scene', createdAtMs: 1 },
        { id: 'j2', shopDomain: 's1', status: 'succeeded', contentType: 'scene', createdAtMs: 2 },
        { id: 'j3', shopDomain: 's1', status: 'succeeded', contentType: 'ugc', createdAtMs: 3 },
        { id: 'j4', shopDomain: 's2', status: 'succeeded', contentType: 'scene', createdAtMs: 4 },
      ];
      for (const f of fixtures) await db.collection('jobs').doc(f.id).set(f);
    }

    it('filters by shopDomain plus a single pushed field (status), applying a second filter in memory', async () => {
      const { db, repo } = makeRepo();
      await seedManyJobs(db);

      const results = await repo.queryJobs({ shopDomain: 's1', status: 'succeeded', contentType: 'ugc', orderByField: 'createdAtMs' });

      expect(results.map((r) => r.id)).toEqual(['j3']);
    });

    it('scopes strictly to the requested shop', async () => {
      const { db, repo } = makeRepo();
      await seedManyJobs(db);
      const results = await repo.queryJobs({ shopDomain: 's2', orderByField: 'createdAtMs' });
      expect(results.map((r) => r.id)).toEqual(['j4']);
    });
  });

  describe('queryResumableJobs', () => {
    it('returns only pending/processing jobs, not succeeded/failed', async () => {
      const { db, repo } = makeRepo();
      await db.collection('jobs').doc('a').set({ status: 'pending', createdAt: FakeTimestamp.fromMillis(1) });
      await db.collection('jobs').doc('b').set({ status: 'processing', createdAt: FakeTimestamp.fromMillis(2) });
      await db.collection('jobs').doc('c').set({ status: 'succeeded', createdAt: FakeTimestamp.fromMillis(3) });

      const resumable = await repo.queryResumableJobs();
      expect(resumable.map((j) => j.id).sort()).toEqual(['a', 'b']);
    });
  });

  describe('countActiveJobsForShop', () => {
    it('counts only pending/processing jobs for the given shop', async () => {
      const { db, repo } = makeRepo();
      await db.collection('jobs').doc('a').set({ shopDomain: 'shop-a', status: 'pending' });
      await db.collection('jobs').doc('b').set({ shopDomain: 'shop-a', status: 'processing' });
      await db.collection('jobs').doc('c').set({ shopDomain: 'shop-a', status: 'succeeded' });
      await db.collection('jobs').doc('d').set({ shopDomain: 'shop-b', status: 'pending' });

      expect(await repo.countActiveJobsForShop('shop-a')).toBe(2);
      expect(await repo.countActiveJobsForShop('shop-b')).toBe(1);
      expect(await repo.countActiveJobsForShop('shop-c')).toBe(0);
    });
  });
});
