const { createFakeFirestore, FieldValue, FakeTimestamp } = require('../../helpers/fakeFirestore');
const { createConversionBatchesRepo } = require('../../../src/repos/conversionBatchesRepo');

function makeRepo() {
  const db = createFakeFirestore();
  const repo = createConversionBatchesRepo({ db, FieldValue });
  return { db, repo };
}

describe('repos/conversionBatchesRepo', () => {
  describe('createBatch', () => {
    it('creates a pending batch with zeroed counters', async () => {
      const { db, repo } = makeRepo();
      const batch = await repo.createBatch({ shopDomain: 'shop-a', totalCount: 2, contentType: 'compress' });

      expect(batch.id).toBeTruthy();
      expect(batch.status).toBe('pending');
      expect(batch.succeededCount).toBe(0);
      expect(batch.failedCount).toBe(0);

      const stored = (await db.collection('conversion_batches').doc(batch.id).get()).data();
      expect(stored.createdAt).toBeInstanceOf(FakeTimestamp);
    });
  });

  describe('getBatch', () => {
    it('returns undefined for a missing batch', async () => {
      const { repo } = makeRepo();
      expect(await repo.getBatch('missing')).toBeUndefined();
    });
  });

  describe('incrementBatchProgress', () => {
    it('two sequential calls (one succeeded, one failed) on a totalCount:2 batch results in status complete', async () => {
      const { db, repo } = makeRepo();
      const batch = await repo.createBatch({ shopDomain: 'shop-a', totalCount: 2, contentType: 'compress' });

      await repo.incrementBatchProgress(batch.id, { succeeded: true });
      const result = await repo.incrementBatchProgress(batch.id, { succeeded: false });

      expect(result.status).toBe('complete');
      const stored = (await db.collection('conversion_batches').doc(batch.id).get()).data();
      expect(stored.status).toBe('complete');
      expect(stored.succeededCount).toBe(1);
      expect(stored.failedCount).toBe(1);
    });

    it('a batch not yet fully processed stays processing', async () => {
      const { db, repo } = makeRepo();
      const batch = await repo.createBatch({ shopDomain: 'shop-a', totalCount: 3, contentType: 'compress' });

      await repo.incrementBatchProgress(batch.id, { succeeded: true });

      const stored = (await db.collection('conversion_batches').doc(batch.id).get()).data();
      expect(stored.status).toBe('processing');
    });

    it('accumulates succeededCount/failedCount across multiple calls', async () => {
      const { db, repo } = makeRepo();
      const batch = await repo.createBatch({ shopDomain: 'shop-a', totalCount: 4, contentType: 'compress' });

      await repo.incrementBatchProgress(batch.id, { succeeded: true });
      await repo.incrementBatchProgress(batch.id, { succeeded: true });
      await repo.incrementBatchProgress(batch.id, { succeeded: false });

      const stored = (await db.collection('conversion_batches').doc(batch.id).get()).data();
      expect(stored.succeededCount).toBe(2);
      expect(stored.failedCount).toBe(1);
      expect(stored.status).toBe('processing');
    });
  });
});
