const { claimDocForProcessing, heartbeatLease } = require('./leaseClaim');
const { NotFoundError, LostLeaseError } = require('../errors/AppError');
const { JOB_TERMINAL_STATUSES, JOB_LEASE_TIMEOUT_MS } = require('../config/constants');

const CONVERSION_JOBS_COLLECTION = 'conversion_jobs';

/**
 * The Image Optimizer add-on's sibling of jobsRepo, much simpler: no credit
 * ledger (Image Optimizer uses a separate daily-quota model — see
 * imageOptimizerUsageRepo.js — not credits), no idempotency-key job creation,
 * and no publish claiming (optimizer jobs replace-in-place or restore-original,
 * a different and simpler operation than jobsRepo's Shopify publish flow).
 * @param {{ db: object, FieldValue: object, leaseTimeoutMs?: number }} opts
 */
function createConversionJobsRepo({ db, FieldValue, leaseTimeoutMs = JOB_LEASE_TIMEOUT_MS }) {
  const jobsCol = db.collection(CONVERSION_JOBS_COLLECTION);

  async function getById(jobId) {
    const snap = await jobsCol.doc(jobId).get();
    return snap.exists ? { id: jobId, ...snap.data() } : undefined;
  }

  async function createConversionJob({ shopDomain, shopifyProductId, imageUrl, operation }) {
    const ref = jobsCol.doc();
    const job = {
      shopDomain,
      shopifyProductId,
      imageUrl,
      operation,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
    };
    await ref.set(job);
    return { id: ref.id, ...job };
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

  return {
    getById,
    createConversionJob,
    claimForProcessing,
    heartbeat,
    settleConversionSuccess,
    settleConversionFailure,
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
