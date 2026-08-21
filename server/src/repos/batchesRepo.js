const BATCHES_COLLECTION = 'batches';

/**
 * Factory so tests can inject a fake Firestore + FieldValue instead of the real
 * firebase-admin handle, matching every other repo in this codebase.
 * @param {{ db: object, FieldValue: object }} opts
 */
function createBatchesRepo({ db, FieldValue }) {
  const batchesCol = db.collection(BATCHES_COLLECTION);

  async function createBatch({ shopDomain, totalCount, contentType }) {
    const ref = batchesCol.doc();
    const batch = {
      shopDomain,
      totalCount,
      succeededCount: 0,
      failedCount: 0,
      status: 'pending',
      contentType,
      createdAt: FieldValue.serverTimestamp(),
    };
    await ref.set(batch);
    return { id: ref.id, ...batch };
  }

  async function getBatch(batchId) {
    const snap = await batchesCol.doc(batchId).get();
    return snap.exists ? { id: batchId, ...snap.data() } : undefined;
  }

  /**
   * Atomically records one job's outcome against the batch: increments
   * succeededCount/failedCount via FieldValue.increment, and — since the post-
   * increment total must be computed from a value read inside the SAME
   * transaction, never from a blind increment followed by a separate re-read —
   * flips status to 'complete' in the same write once every job has reported in.
   * The first progress report also flips a still-'pending' batch to 'processing'.
   */
  async function incrementBatchProgress(batchId, { succeeded }) {
    return db.runTransaction(async (tx) => {
      const ref = batchesCol.doc(batchId);
      const snap = await tx.get(ref);
      const batch = { id: batchId, ...snap.data() };

      const field = succeeded ? 'succeededCount' : 'failedCount';
      const newSucceeded = (batch.succeededCount ?? 0) + (succeeded ? 1 : 0);
      const newFailed = (batch.failedCount ?? 0) + (succeeded ? 0 : 1);

      const updates = { [field]: FieldValue.increment(1) };
      if (batch.status === 'pending') updates.status = 'processing';
      if (newSucceeded + newFailed >= batch.totalCount) updates.status = 'complete';

      tx.update(ref, updates);

      return {
        id: batchId,
        ...batch,
        succeededCount: newSucceeded,
        failedCount: newFailed,
        status: updates.status ?? batch.status,
      };
    });
  }

  return {
    createBatch,
    getBatch,
    incrementBatchProgress,
  };
}

let singleton;
/** Lazily builds the production singleton wired to the real Firestore. */
function getBatchesRepo() {
  if (!singleton) {
    const { getFirestore } = require('../config/firebase');
    const { FieldValue } = require('firebase-admin/firestore');
    singleton = createBatchesRepo({ db: getFirestore(), FieldValue });
  }
  return singleton;
}

module.exports = { createBatchesRepo, getBatchesRepo };
