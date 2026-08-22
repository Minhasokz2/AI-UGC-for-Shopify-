const { claimDocForProcessing, heartbeatLease } = require('./leaseClaim');
const { pickPushedFilter, computeCandidateWindow } = require('./queryHelpers');
const {
  NotFoundError,
  IdempotencyConflictError,
  NoApprovedVariationsError,
} = require('../errors/AppError');
const { LostLeaseError } = require('../errors/AppError');
const {
  JOB_TERMINAL_STATUSES,
  JOB_LEASE_TIMEOUT_MS,
  JOBS_QUERY_CANDIDATE_WINDOW_MIN,
  JOBS_QUERY_CANDIDATE_WINDOW_MULTIPLIER,
} = require('../config/constants');

const JOBS_COLLECTION = 'jobs';
const SHOPS_COLLECTION = 'shops';
const TRANSACTIONS_COLLECTION = 'transactions';
const IDEMPOTENCY_KEYS_COLLECTION = 'idempotency_keys';
const STATUS_FILTER_PRIORITY = ['status', 'batchId', 'contentType'];
const STALE_PUBLISH_CLAIM_MS = 2 * 60 * 1000;

/**
 * Factory so tests can inject a fake Firestore + FieldValue instead of the real
 * firebase-admin handle. Every method that touches Firestore takes `db`/`FieldValue`
 * from the closure, never re-imported per call.
 *
 * `settleJobSuccess`'s `recomputeCost` is injected per-call (not baked into the
 * factory) deliberately: this repo has no dependency on templatesRepo/
 * allowedModelsRepo (the actual cost source), keeping it self-contained and
 * testable in isolation. The caller (services/credits.js, built later) supplies a
 * closure that reads the authoritative cost from those repos inside the same
 * transaction via the `tx` passed to it.
 *
 * @param {{ db: object, FieldValue: object, leaseTimeoutMs?: number }} opts
 */
function createJobsRepo({ db, FieldValue, leaseTimeoutMs = JOB_LEASE_TIMEOUT_MS }) {
  const jobsCol = db.collection(JOBS_COLLECTION);
  const shopsCol = db.collection(SHOPS_COLLECTION);
  const transactionsCol = db.collection(TRANSACTIONS_COLLECTION);
  const idempotencyCol = db.collection(IDEMPOTENCY_KEYS_COLLECTION);

  async function getById(jobId) {
    const snap = await jobsCol.doc(jobId).get();
    return snap.exists ? { id: jobId, ...snap.data() } : undefined;
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

  /**
   * Refreshes the processing lease and records progress in one write — doubles as
   * the lease heartbeat on slow multi-stage jobs (e.g. background removal).
   */
  async function heartbeat(jobId, { workerId, stage, extraFields = {} }) {
    await heartbeatLease(jobsCol, jobId, {
      db,
      FieldValue,
      workerId,
      extraFields: { progressStage: stage, ...extraFields },
    });
  }

  /**
   * Claims a client-generated idempotency key and creates the job in the SAME
   * transaction — the claim and the job write either both commit or neither does,
   * so there is no crash window between "claimed" and "job exists" that a separate
   * two-phase claimed/completed status would need to guard against. A retried
   * request with the same key simply finds the already-committed job and returns
   * it (isNew: false) instead of creating a duplicate.
   * @returns {Promise<{ job: object, isNew: boolean }>}
   */
  async function claimAndCreateJob(shopDomain, idempotencyKey, jobData) {
    const idemRef = idempotencyCol.doc(`${shopDomain}:${idempotencyKey}`);
    return db.runTransaction(async (tx) => {
      const idemSnap = await tx.get(idemRef);
      if (idemSnap.exists) {
        const idem = idemSnap.data();
        const jobSnap = await tx.get(jobsCol.doc(idem.jobId));
        return { job: { id: idem.jobId, ...jobSnap.data() }, isNew: false };
      }

      const jobRef = jobsCol.doc();
      const job = { ...jobData, shopDomain, status: 'pending' };
      tx.set(idemRef, {
        jobId: jobRef.id,
        shopDomain,
        key: idempotencyKey,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(jobRef, { ...job, createdAt: FieldValue.serverTimestamp() });
      return { job: { id: jobRef.id, ...job }, isNew: true };
    });
  }

  /**
   * Settles a succeeded job: re-verifies lease ownership, re-reads cost from the
   * authoritative template/model record via the injected `recomputeCost` (never
   * trusting a job-creation-time cached estimate), deducts credits atomically
   * unless the shop is on the unlimited plan (which still gets its lifetime usage
   * stats incremented — informational only, never a billing input), and marks the
   * job succeeded. Re-settling an already-succeeded job is idempotent and never
   * double-charges.
   * @param {(tx: object, job: object) => Promise<number>} recomputeCost
   */
  async function settleJobSuccess(jobId, { workerId, resultVariations, recomputeCost }) {
    return db.runTransaction(async (tx) => {
      const jobRef = jobsCol.doc(jobId);
      const jobSnap = await tx.get(jobRef);
      if (!jobSnap.exists) throw new NotFoundError(`Job ${jobId} not found`);
      const job = { id: jobId, ...jobSnap.data() };

      if (job.status === 'succeeded') {
        return { job, ledgerEntryId: job.ledgerEntryId ?? null, alreadySettled: true };
      }
      if (job.status !== 'processing' || job.workerId !== workerId) {
        throw new LostLeaseError(jobId);
      }

      const shopRef = shopsCol.doc(job.shopDomain);
      const shopSnap = await tx.get(shopRef);
      const shop = { id: job.shopDomain, ...(shopSnap.data() || {}) };

      const cost = await recomputeCost(tx, job);

      const updates = {
        status: 'succeeded',
        succeededAt: FieldValue.serverTimestamp(),
        resultVariations,
        chargedCost: cost,
      };

      let ledgerEntryId = null;
      if (shop.plan !== 'unlimited') {
        const newBalance = Math.max(0, (shop.creditBalance ?? 0) - cost);
        const ledgerRef = transactionsCol.doc();
        ledgerEntryId = ledgerRef.id;
        tx.set(ledgerRef, {
          shopDomain: job.shopDomain,
          type: 'debit',
          amount: cost,
          jobId,
          balanceAfter: newBalance,
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.update(shopRef, {
          creditBalance: newBalance,
          lifetimeCreditsSpent: FieldValue.increment(cost),
          lifetimeImagesGenerated: FieldValue.increment(resultVariations.length),
        });
        updates.ledgerEntryId = ledgerEntryId;
      } else {
        // Unlimited plan: no ledger debit, but still tracked against the
        // fair-use monthly cap credits.js's assertSufficientCredits gates on
        // (see billingPacks.js's UNLIMITED_PLAN.fairUseCreditsPerMonth) — reset
        // lazily on month change, same pattern as imageOptimizerUsageRepo's
        // daily reset, rather than a separate scheduled job.
        const monthUtc = new Date().toISOString().slice(0, 7);
        const creditsThisMonth = (shop.unlimitedUsage?.month === monthUtc ? shop.unlimitedUsage?.creditsThisMonth ?? 0 : 0) + cost;
        tx.update(shopRef, {
          lifetimeCreditsSpent: FieldValue.increment(cost),
          lifetimeImagesGenerated: FieldValue.increment(resultVariations.length),
          unlimitedUsage: { month: monthUtc, creditsThisMonth },
        });
      }

      tx.update(jobRef, updates);
      return { job: { ...job, ...updates }, ledgerEntryId, alreadySettled: false };
    });
  }

  /**
   * Marks a job failed. Never touches credit/usage fields — failed jobs are never
   * charged. If the lease was stolen (another worker reclaimed a stale job), this
   * worker's failure report is stale and is silently ignored rather than
   * clobbering whatever the new owner is doing.
   */
  async function settleJobFailure(jobId, { workerId, error }) {
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

  /**
   * Persists approved-variation indices AND claims the publish slot in the same
   * transaction, so a crash between the claim and the actual Shopify API call
   * still leaves a durable record of what was approved. A genuinely concurrent
   * second publish attempt while the first is still in flight (publishStatus
   * 'publishing', not yet succeeded/failed) throws IdempotencyConflictError — the
   * Shopify API call itself happens outside this transaction, so without this
   * check two concurrent requests could both fire it. A 'publishing' claim older
   * than STALE_PUBLISH_CLAIM_MS is presumed abandoned (the process that claimed it
   * crashed before calling finalizePublishSuccess/releasePublishClaim) and may be
   * reclaimed, mirroring the job-processing lease pattern.
   * @returns {Promise<{ claimed: boolean, job: object, alreadyPublished?: boolean }>}
   */
  async function claimPublish(jobId, { approvedVariationIndices }) {
    return db.runTransaction(async (tx) => {
      const jobRef = jobsCol.doc(jobId);
      const jobSnap = await tx.get(jobRef);
      if (!jobSnap.exists) throw new NotFoundError(`Job ${jobId} not found`);
      const job = { id: jobId, ...jobSnap.data() };

      if (job.publishedAt) {
        return { claimed: false, job, alreadyPublished: true };
      }

      if (job.publishStatus === 'publishing') {
        const claimedAtMs = job.publishClaimedAt?.toMillis?.() ?? 0;
        const isStale = Date.now() - claimedAtMs > STALE_PUBLISH_CLAIM_MS;
        if (!isStale) throw new IdempotencyConflictError('This job is already being published.');
      }

      if (!approvedVariationIndices?.length) {
        throw new NoApprovedVariationsError();
      }

      tx.update(jobRef, {
        publishStatus: 'publishing',
        publishClaimedAt: FieldValue.serverTimestamp(),
        approvedVariationIndices,
      });
      return { claimed: true, job: { ...job, publishStatus: 'publishing', approvedVariationIndices } };
    });
  }

  async function finalizePublishSuccess(jobId, { productId, mediaIds }) {
    await jobsCol.doc(jobId).update({
      publishStatus: 'published',
      publishedAt: FieldValue.serverTimestamp(),
      publishedProductId: productId,
      publishedMediaIds: mediaIds,
    });
  }

  /**
   * Releases a failed publish claim so a retry isn't permanently locked out.
   * Deliberately does NOT clear approvedVariationIndices — that approval record
   * should survive so a retry doesn't need the merchant to re-approve.
   */
  async function releasePublishClaim(jobId, { error }) {
    await jobsCol.doc(jobId).update({
      publishStatus: 'failed',
      publishClaimedAt: null,
      lastPublishError: error.message,
    });
  }

  /**
   * At most one of status/batchId/contentType is ever sent to Firestore as an
   * equality filter alongside shopDomain (see repos/queryHelpers.js); any other
   * requested filter is applied in memory over a wider candidate window.
   */
  async function queryJobs({ shopDomain, status, batchId, contentType, orderByField = 'createdAt', direction = 'desc', limit = 20 }) {
    const requested = { status, batchId, contentType };
    const { pushedField, inMemoryFields } = pickPushedFilter(requested, STATUS_FILTER_PRIORITY);
    const candidateWindow = computeCandidateWindow(limit, JOBS_QUERY_CANDIDATE_WINDOW_MIN, JOBS_QUERY_CANDIDATE_WINDOW_MULTIPLIER);

    let query = jobsCol.where('shopDomain', '==', shopDomain);
    if (pushedField) query = query.where(pushedField, '==', requested[pushedField]);
    query = query.orderBy(orderByField, direction).limit(candidateWindow);

    const snap = await query.get();
    let docs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    for (const field of inMemoryFields) docs = docs.filter((doc) => doc[field] === requested[field]);
    return docs.slice(0, limit);
  }

  /**
   * Boot-time resume: re-enqueues anything left pending/processing by a killed or
   * redeployed process. Uses the single-field `status IN [...]` index and is
   * paginated via cursor rather than one unbounded read, to bound memory on a
   * large backlog.
   */
  async function queryResumableJobs({ cursor, limit = 200 } = {}) {
    let query = jobsCol.where('status', 'in', ['pending', 'processing']).orderBy('createdAt', 'asc').limit(limit);
    if (cursor !== undefined) query = query.startAfter(cursor);
    const snap = await query.get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  /**
   * Backs the job-creation route's 20-concurrent-job-per-shop admission
   * control (a business rule distinct from the HTTP burst guard). Requires a
   * composite index on (shopDomain ==, status in) — documented in
   * createFirestoreIndexes.md.
   */
  async function countActiveJobsForShop(shopDomain) {
    const snap = await jobsCol.where('shopDomain', '==', shopDomain).where('status', 'in', ['pending', 'processing']).get();
    return snap.size;
  }

  return {
    getById,
    claimForProcessing,
    heartbeat,
    countActiveJobsForShop,
    claimAndCreateJob,
    settleJobSuccess,
    settleJobFailure,
    claimPublish,
    finalizePublishSuccess,
    releasePublishClaim,
    queryJobs,
    queryResumableJobs,
  };
}

let singleton;
/** Lazily builds the production singleton wired to the real Firestore. */
function getJobsRepo() {
  if (!singleton) {
    const { getFirestore } = require('../config/firebase');
    const { FieldValue } = require('firebase-admin/firestore');
    singleton = createJobsRepo({ db: getFirestore(), FieldValue });
  }
  return singleton;
}

module.exports = { createJobsRepo, getJobsRepo };
