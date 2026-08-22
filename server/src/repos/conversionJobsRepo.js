const { claimDocForProcessing, heartbeatLease } = require('./leaseClaim');
const { NotFoundError, LostLeaseError } = require('../errors/AppError');
const { JOB_TERMINAL_STATUSES, JOB_LEASE_TIMEOUT_MS } = require('../config/constants');

const CONVERSION_JOBS_COLLECTION = 'conversion_jobs';
const CONVERSION_IDEMPOTENCY_COLLECTION = 'conversion_idempotency_keys';

/**
 * The Image Optimizer add-on's sibling of jobsRepo, much simpler: no credit
 * ledger (Image Optimizer uses a separate daily-quota model — see
 * imageOptimizerUsageRepo.js — not credits), and no publish claiming
 * (optimizer jobs replace-in-place or restore-original, a different and
 * simpler operation than jobsRepo's Shopify publish flow). Idempotent job
 * creation mirrors jobsRepo.claimAndCreateJob's shape, in its own
 * conversion_idempotency_keys namespace — a duplicate/retried optimize
 * request must never create two jobs (or, by extension via
 * imageOptimizerService, burn two quota units for one logical request).
 * @param {{ db: object, FieldValue: object, leaseTimeoutMs?: number }} opts
 */
function createConversionJobsRepo({ db, FieldValue, leaseTimeoutMs = JOB_LEASE_TIMEOUT_MS }) {
  const jobsCol = db.collection(CONVERSION_JOBS_COLLECTION);
  const idempotencyCol = db.collection(CONVERSION_IDEMPOTENCY_COLLECTION);

  async function getById(jobId) {
    const snap = await jobsCol.doc(jobId).get();
    return snap.exists ? { id: jobId, ...snap.data() } : undefined;
  }

  /**
   * Cheap non-transactional pre-check so the common case (a genuine retry —
   * not a millisecond-level concurrent double-submit) never even reaches the
   * quota-consumption step in imageOptimizerService. Not itself the
   * correctness guarantee against a true race — claimAndCreateConversionJob's
   * transaction is — just an optimization to skip an unnecessary quota debit
   * on the far more common sequential-retry case.
   * @returns {Promise<object|undefined>}
   */
  async function findByIdempotencyKey(shopDomain, idempotencyKey) {
    const idemSnap = await idempotencyCol.doc(`${shopDomain}:${idempotencyKey}`).get();
    if (!idemSnap.exists) return undefined;
    return getById(idemSnap.data().jobId);
  }

  /**
   * Claims the idempotency key and creates the job in the SAME transaction —
   * mirrors jobsRepo.claimAndCreateJob's shape (see that file's doc comment
   * for the full reasoning): claim and job write either both commit or
   * neither does, and a retried request with the same key simply gets back
   * the already-committed job (isNew:false) instead of a duplicate.
   * @returns {Promise<{ job: object, isNew: boolean }>}
   */
  async function claimAndCreateConversionJob(shopDomain, idempotencyKey, jobData) {
    const idemRef = idempotencyCol.doc(`${shopDomain}:${idempotencyKey}`);
    return db.runTransaction(async (tx) => {
      const idemSnap = await tx.get(idemRef);
      if (idemSnap.exists) {
        const jobId = idemSnap.data().jobId;
        const jobSnap = await tx.get(jobsCol.doc(jobId));
        return { job: { id: jobId, ...jobSnap.data() }, isNew: false };
      }

      const jobRef = jobsCol.doc();
      const job = { ...jobData, shopDomain, status: 'pending', createdAt: FieldValue.serverTimestamp() };
      tx.set(idemRef, { jobId: jobRef.id, shopDomain, key: idempotencyKey, createdAt: FieldValue.serverTimestamp() });
      tx.set(jobRef, job);
      return { job: { id: jobRef.id, ...job }, isNew: true };
    });
  }

  /** @returns {Promise<{claimed: boolean, job?: object, reason?: string}>} */
  async function claimForProcessing(jobId, { workerId }) {
    const result = await claimDocForProcessing(jobsCol, jobId, {
      db,
      FieldValue,
      workerId,
      leaseTimeoutMs,
      terminalStatuses: JOB_TERMINAL_STATUSES,
      claimableStatuses: ['pending'],
    });
    return { claimed: result.claimed, job: result.doc, reason: result.reason };
  }

  async function heartbeat(jobId, { workerId, stage, extraFields = {} }) {
    await heartbeatLease(jobsCol, jobId, {
      db,
      FieldValue,
      workerId,
      extraFields: { progressStage: stage, ...extraFields },
    });
  }

  /**
   * Same lease-reverification shape as jobsRepo's settleJobSuccess, minus any
   * credit/ledger logic: re-checks status==='processing' && workerId matches,
   * and re-settling an already-succeeded job is idempotent.
   */
  async function settleConversionSuccess(jobId, { workerId, resultImageUrl }) {
    return db.runTransaction(async (tx) => {
      const jobRef = jobsCol.doc(jobId);
      const jobSnap = await tx.get(jobRef);
      if (!jobSnap.exists) throw new NotFoundError(`Conversion job ${jobId} not found`);
      const job = { id: jobId, ...jobSnap.data() };

      if (job.status === 'succeeded') {
        return { job, alreadySettled: true };
      }
      if (job.status !== 'processing' || job.workerId !== workerId) {
        throw new LostLeaseError(jobId);
      }

      const updates = {
        status: 'succeeded',
        succeededAt: FieldValue.serverTimestamp(),
        resultImageUrl,
      };
      tx.update(jobRef, updates);
      return { job: { ...job, ...updates }, alreadySettled: false };
    });
  }

  /**
   * Marks a conversion job failed. A stale worker's failure report (lease
   * already reclaimed by someone else) is silently skipped rather than
   * clobbering the new owner's work.
   */
  async function settleConversionFailure(jobId, { workerId, error }) {
    return db.runTransaction(async (tx) => {
      const jobRef = jobsCol.doc(jobId);
      const jobSnap = await tx.get(jobRef);
      if (!jobSnap.exists) return { skipped: true };
      const job = jobSnap.data();
      if (job.status !== 'processing' || job.workerId !== workerId) {
        return { skipped: true };
      }
      tx.update(jobRef, {
        status: 'failed',
        failedAt: FieldValue.serverTimestamp(),
        error: { message: error.message, code: error.code || 'UNKNOWN' },
      });
      return { skipped: false };
    });
  }

  /** Backs the Image Optimizer's job-history listing. */
  async function queryByShop({ shopDomain, status, limit = 50 }) {
    let query = jobsCol.where('shopDomain', '==', shopDomain);
    if (status !== undefined) query = query.where('status', '==', status);
    query = query.orderBy('createdAt', 'desc').limit(limit);
    const snap = await query.get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  /** Boot-time resume, mirroring jobsRepo.queryResumableJobs. */
  async function queryResumableJobs({ cursor, limit = 200 } = {}) {
    let query = jobsCol.where('status', 'in', ['pending', 'processing']).orderBy('createdAt', 'asc').limit(limit);
    if (cursor !== undefined) query = query.startAfter(cursor);
    const snap = await query.get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  return {
    getById,
    findByIdempotencyKey,
    claimAndCreateConversionJob,
    claimForProcessing,
    heartbeat,
    settleConversionSuccess,
    settleConversionFailure,
    queryByShop,
    queryResumableJobs,
  };
}

let singleton;
/** Lazily builds the production singleton wired to the real Firestore. */
function getConversionJobsRepo() {
  if (!singleton) {
    const { getFirestore } = require('../config/firebase');
    const { FieldValue } = require('firebase-admin/firestore');
    singleton = createConversionJobsRepo({ db: getFirestore(), FieldValue });
  }
  return singleton;
}

module.exports = { createConversionJobsRepo, getConversionJobsRepo };
