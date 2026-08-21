const { LostLeaseError } = require('../errors/AppError');

/**
 * Generic Firestore-transaction lease claim, shared by jobsRepo and
 * conversionJobsRepo. A `pending`-equivalent (non-terminal, unclaimed) document is
 * always claimable; a document already claimed (has a `claimedAt` lease) is only
 * reclaimable once that lease has gone stale — i.e. its original worker is
 * presumed dead (crashed, or replaced by a Render rolling deploy), not just slow.
 *
 * True concurrent-claim safety (two workers racing to claim the SAME document at
 * the same instant) is NOT provided by this function's own logic — it comes from
 * Firestore's real transaction semantics: two transactions that read-then-write the
 * same document are optimistically-concurrency-controlled, so Firestore aborts and
 * retries the loser, which then re-reads the winner's committed state and correctly
 * refuses. This is exactly why the claim is implemented as a transaction rather than
 * a plain conditional write. The in-memory fake Firestore used in unit tests does
 * NOT model this contention/retry behavior (it has no concept of two transactions
 * racing), so that specific property rests on Firestore's documented guarantees,
 * not on anything asserted by this repo's test suite.
 *
 * @param {import('firebase-admin/firestore').CollectionReference} collectionRef
 * @param {string} docId
 * @param {{
 *   db: import('firebase-admin/firestore').Firestore,
 *   FieldValue: typeof import('firebase-admin/firestore').FieldValue,
 *   workerId: string,
 *   leaseTimeoutMs: number,
 *   terminalStatuses: string[],
 *   claimableStatuses: string[],
 * }} opts
 * @returns {Promise<{ claimed: boolean, doc?: object, reason?: 'not_found'|'terminal'|'lease_active' }>}
 */
async function claimDocForProcessing(collectionRef, docId, { db, FieldValue, workerId, leaseTimeoutMs, terminalStatuses, claimableStatuses }) {
  return db.runTransaction(async (tx) => {
    const ref = collectionRef.doc(docId);
    const snap = await tx.get(ref);
    if (!snap.exists) return { claimed: false, reason: 'not_found' };

    const doc = { id: docId, ...snap.data() };

    if (terminalStatuses.includes(doc.status)) {
      return { claimed: false, reason: 'terminal' };
    }

    if (!claimableStatuses.includes(doc.status)) {
      const claimedAtMs = doc.claimedAt?.toMillis?.() ?? 0;
      const isStale = Date.now() - claimedAtMs > leaseTimeoutMs;
      if (!isStale) return { claimed: false, reason: 'lease_active' };
      // Lease is stale — the original worker is presumed dead; fall through and reclaim.
    }

    tx.update(ref, {
      status: 'processing',
      claimedAt: FieldValue.serverTimestamp(),
      workerId,
      claimAttempts: FieldValue.increment(1),
    });

    return { claimed: true, doc: { ...doc, status: 'processing', workerId } };
  });
}

/**
 * Re-verifies lease ownership and refreshes it in one transaction, optionally
 * recording extra fields (e.g. a freshly-computed intermediate result) in the same
 * write — so a slow multi-stage job's own progress updates double as the lease
 * heartbeat. Throws LostLeaseError (never HTTP-facing — caught by the worker) if
 * this caller no longer owns the lease, so a worker that was reclaimed after going
 * stale aborts instead of continuing to clobber the new owner's work.
 *
 * @param {import('firebase-admin/firestore').CollectionReference} collectionRef
 * @param {string} docId
 * @param {{ db: object, FieldValue: object, workerId: string, extraFields?: object }} opts
 */
async function heartbeatLease(collectionRef, docId, { db, FieldValue, workerId, extraFields = {} }) {
  return db.runTransaction(async (tx) => {
    const ref = collectionRef.doc(docId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new LostLeaseError(docId);
    const doc = snap.data();
    if (doc.status !== 'processing' || doc.workerId !== workerId) {
      throw new LostLeaseError(docId);
    }
    tx.update(ref, { claimedAt: FieldValue.serverTimestamp(), ...extraFields });
  });
}

module.exports = { claimDocForProcessing, heartbeatLease };
