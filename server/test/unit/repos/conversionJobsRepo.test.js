const { createFakeFirestore, FieldValue, FakeTimestamp } = require('../../helpers/fakeFirestore');
const { createConversionJobsRepo } = require('../../../src/repos/conversionJobsRepo');
const { LostLeaseError, NotFoundError } = require('../../../src/errors/AppError');

function makeRepo(overrides = {}) {
  const db = createFakeFirestore();
  const repo = createConversionJobsRepo({ db, FieldValue, leaseTimeoutMs: 60_000, ...overrides });
  return { db, repo };
}

async function seedJob(db, id, data) {
  await db.collection('conversion_jobs').doc(id).set(data);
  return id;
}

describe('repos/conversionJobsRepo', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createConversionJob', () => {
    it('creates a pending job', async () => {
      const { db, repo } = makeRepo();
      const job = await repo.createConversionJob({
        shopDomain: 'shop-a',
        shopifyProductId: 'gid://shopify/Product/1',
        imageUrl: 'https://x/a.png',
        operation: 'compress',
      });

      expect(job.id).toBeTruthy();
      expect(job.status).toBe('pending');
      expect(job.operation).toBe('compress');

      const stored = (await db.collection('conversion_jobs').doc(job.id).get()).data();
      expect(stored.createdAt).toBeInstanceOf(FakeTimestamp);
    });
  });

  describe('getById', () => {
    it('returns undefined for a missing job', async () => {
      const { repo } = makeRepo();
      expect(await repo.getById('missing')).toBeUndefined();
    });
  });

  describe('claimForProcessing / heartbeat (lease semantics)', () => {
    it('claims a pending job', async () => {
      const { db, repo } = makeRepo();
      await seedJob(db, 'job1', { status: 'pending', shopDomain: 's1' });

      const result = await repo.claimForProcessing('job1', { workerId: 'workerA' });

      expect(result.claimed).toBe(true);
      expect(result.job.status).toBe('processing');
      expect(result.job.workerId).toBe('workerA');
    });

    it('a fresh lease refuses reclaim by a different worker', async () => {
      const { db, repo } = makeRepo();
      await seedJob(db, 'job1', { status: 'pending', shopDomain: 's1' });
      await repo.claimForProcessing('job1', { workerId: 'workerA' });

      const result = await repo.claimForProcessing('job1', { workerId: 'workerB' });

      expect(result.claimed).toBe(false);
      expect(result.reason).toBe('lease_active');
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

    it('heartbeat records the progress stage', async () => {
      const { db, repo } = makeRepo();
      await seedJob(db, 'job1', { status: 'pending', shopDomain: 's1' });
      await repo.claimForProcessing('job1', { workerId: 'workerA' });

      await repo.heartbeat('job1', { workerId: 'workerA', stage: 'compressing' });

      const stored = (await db.collection('conversion_jobs').doc('job1').get()).data();
      expect(stored.progressStage).toBe('compressing');
    });

    it('heartbeat throws LostLeaseError if the lease was reclaimed by someone else', async () => {
      const { db, repo } = makeRepo();
      await seedJob(db, 'job1', { status: 'processing', shopDomain: 's1', workerId: 'workerB', claimedAt: FakeTimestamp.now() });

      await expect(repo.heartbeat('job1', { workerId: 'workerA', stage: 'x' })).rejects.toBeInstanceOf(LostLeaseError);
    });
  });

  describe('settleConversionSuccess', () => {
    it('marks the job succeeded with the result image url, no credit logic at all', async () => {
      const { db, repo } = makeRepo();
      await seedJob(db, 'job1', { status: 'processing', shopDomain: 'shop-a', workerId: 'workerA' });

      const { job, alreadySettled } = await repo.settleConversionSuccess('job1', {
        workerId: 'workerA',
        resultImageUrl: 'https://x/result.png',
      });

      expect(alreadySettled).toBe(false);
      expect(job.status).toBe('succeeded');
      expect(job.resultImageUrl).toBe('https://x/result.png');
      const stored = (await db.collection('conversion_jobs').doc('job1').get()).data();
      expect(stored.status).toBe('succeeded');
    });

    it('re-settling an already-succeeded job is idempotent', async () => {
      const { db, repo } = makeRepo();
      await seedJob(db, 'job1', { status: 'processing', shopDomain: 'shop-a', workerId: 'workerA' });

      await repo.settleConversionSuccess('job1', { workerId: 'workerA', resultImageUrl: 'https://x/a.png' });
      const second = await repo.settleConversionSuccess('job1', { workerId: 'workerA', resultImageUrl: 'https://x/a.png' });

      expect(second.alreadySettled).toBe(true);
    });

    it('throws LostLeaseError if another worker now owns the lease', async () => {
      const { db, repo } = makeRepo();
      await seedJob(db, 'job1', { status: 'processing', shopDomain: 'shop-a', workerId: 'workerB' });

      await expect(
        repo.settleConversionSuccess('job1', { workerId: 'workerA', resultImageUrl: 'x' }),
      ).rejects.toBeInstanceOf(LostLeaseError);
    });

    it('throws NotFoundError for a missing job', async () => {
      const { repo } = makeRepo();
      await expect(
        repo.settleConversionSuccess('missing', { workerId: 'workerA', resultImageUrl: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('settleConversionFailure', () => {
    it('marks the job failed', async () => {
      const { db, repo } = makeRepo();
      await seedJob(db, 'job1', { status: 'processing', shopDomain: 'shop-a', workerId: 'workerA' });

      const result = await repo.settleConversionFailure('job1', { workerId: 'workerA', error: new Error('fal.ai timed out') });

      expect(result.skipped).toBe(false);
      const job = (await db.collection('conversion_jobs').doc('job1').get()).data();
      expect(job.status).toBe('failed');
      expect(job.error.message).toBe('fal.ai timed out');
    });

    it('silently skips a stale failure report from a worker that lost its lease', async () => {
      const { db, repo } = makeRepo();
      await seedJob(db, 'job1', { status: 'processing', shopDomain: 'shop-a', workerId: 'workerB' });

      const result = await repo.settleConversionFailure('job1', { workerId: 'workerA', error: new Error('too late') });

      expect(result.skipped).toBe(true);
      const job = (await db.collection('conversion_jobs').doc('job1').get()).data();
      expect(job.status).toBe('processing');
    });
  });

  describe('queryByShop', () => {
    it('returns only the given shop\'s jobs, optionally filtered by status', async () => {
      const { db, repo } = makeRepo();
      await seedJob(db, 'job1', { shopDomain: 'shop-a', status: 'succeeded', createdAt: FakeTimestamp.fromMillis(1) });
      await seedJob(db, 'job2', { shopDomain: 'shop-a', status: 'pending', createdAt: FakeTimestamp.fromMillis(2) });
      await seedJob(db, 'job3', { shopDomain: 'shop-b', status: 'succeeded', createdAt: FakeTimestamp.fromMillis(3) });

      const all = await repo.queryByShop({ shopDomain: 'shop-a' });
      expect(all.map((j) => j.id).sort()).toEqual(['job1', 'job2']);

      const succeededOnly = await repo.queryByShop({ shopDomain: 'shop-a', status: 'succeeded' });
      expect(succeededOnly.map((j) => j.id)).toEqual(['job1']);
    });
  });
});
