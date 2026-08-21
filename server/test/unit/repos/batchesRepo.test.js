const { createFakeFirestore, FieldValue, FakeTimestamp } = require('../../helpers/fakeFirestore');
const { createBatchesRepo } = require('../../../src/repos/batchesRepo');

function makeRepo() {
  const db = createFakeFirestore();
  const repo = createBatchesRepo({ db, FieldValue });
  return { db, repo };
}

describe('repos/batchesRepo', () => {
  describe('createBatch', () => {
    it('creates a pending batch with zeroed counters', async () => {
      const { repo } = makeRepo();
      const batch = await repo.createBatch({ shopDomain: 'shop-a', totalCount: 3, contentType: 'scene' });

      expect(batch.id).toBeTruthy();
      expect(batch.shopDomain).toBe('shop-a');
      expect(batch.totalCount).toBe(3);
      expect(batch.succeededCount).toBe(0);
      expect(batch.failedCount).toBe(0);
      expect(batch.status).toBe('pending');
      expect(batch.contentType).toBe('scene');
      expect(batch.createdAt).toBeInstanceOf(FakeTimestamp);
    });
  });

  describe('getBatch', () => {
    it('returns undefined for a missing batch', async () => {
      const { repo } = makeRepo();
      expect(await repo.getBatch('missing')).toBeUndefined();
    });

    it('returns the stored batch merged with its id', async () => {
      const { repo } = makeRepo();
      const created = await repo.createBatch({ shopDomain: 'shop-a', totalCount: 2, contentType: 'scene' });
      const fetched = await repo.getBatch(created.id);
      expect(fetched).toEqual(created);
    });
  });

  describe('incrementBatchProgress', () => {
    it('flips status to processing on the first progress report', async () => {
      const { db, repo } = makeRepo();
      const batch = await repo.createBatch({ shopDomain: 'shop-a', totalCount: 3, contentType: 'scene' });

      await repo.incrementBatchProgress(batch.id, { succeeded: true });

      const stored = (await db.collection('batches').doc(batch.id).get()).data();
      expect(stored.status).toBe('processing');
      expect(stored.succeededCount).toBe(1);
      expect(stored.failedCount).toBe(0);
    });

    it('accumulates succeededCount/failedCount across multiple calls and stays processing until fully reported', async () => {
      const { db, repo } = makeRepo();
      const batch = await repo.createBatch({ shopDomain: 'shop-a', totalCount: 3, contentType: 'scene' });

      await repo.incrementBatchProgress(batch.id, { succeeded: true });
      await repo.incrementBatchProgress(batch.id, { succeeded: false });

      const stored = (await db.collection('batches').doc(batch.id).get()).data();
      expect(stored.succeededCount).toBe(1);
      expect(stored.failedCount).toBe(1);
      expect(stored.status).toBe('processing');
    });

    it('flips status to complete once succeededCount + failedCount reaches totalCount', async () => {
      const { db, repo } = makeRepo();
      const batch = await repo.createBatch({ shopDomain: 'shop-a', totalCount: 2, contentType: 'scene' });

      await repo.incrementBatchProgress(batch.id, { succeeded: true });
      const result = await repo.incrementBatchProgress(batch.id, { succeeded: false });

      expect(result.status).toBe('complete');
      const stored = (await db.collection('batches').doc(batch.id).get()).data();
      expect(stored.status).toBe('complete');
      expect(stored.succeededCount).toBe(1);
      expect(stored.failedCount).toBe(1);
    });

    it('a batch not yet fully processed stays processing', async () => {
      const { db, repo } = makeRepo();
      const batch = await repo.createBatch({ shopDomain: 'shop-a', totalCount: 5, contentType: 'scene' });

      await repo.incrementBatchProgress(batch.id, { succeeded: true });
      await repo.incrementBatchProgress(batch.id, { succeeded: true });

      const stored = (await db.collection('batches').doc(batch.id).get()).data();
      expect(stored.status).toBe('processing');
    });
  });
});
