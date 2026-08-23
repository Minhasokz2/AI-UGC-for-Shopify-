// The in-process job worker: claims a pending job's lease, runs the two-step
// generation pipeline, and settles success/failure — all the orchestration
// generationPipeline.js deliberately does NOT do itself (see that file's
// header comment). Concurrency is capped two ways via nested p-limit
// instances: a per-shop limiter (so one shop can't starve every other shop's
// jobs) wraps a single shared global limiter (so a burst of many distinct
// shops still can't exceed the process's total capacity). Per-shop is the
// OUTER limiter deliberately — a shop's own backlog waits on ITS queue
// without holding a global slot idle in the meantime.
//
// This assumes a single server instance (documented in the README): the
// Firestore lease-claim transaction is what keeps a *rolling redeploy* safe
// (a new instance can safely reclaim a stale lease), not what enables safe
// multi-instance steady-state — two live instances would each run their own
// independent set of these in-memory limiters, unaware of each other's
// concurrency.

const pLimit = require('p-limit');
// Referenced as a namespace object (not destructured) so vi.spyOn can
// intercept it in tests — the same convention used throughout this codebase.
const generationPipeline = require('../services/generationPipeline');
const { LostLeaseError } = require('../errors/AppError');
const { JOB_WORKER_PER_SHOP_CONCURRENCY, JOB_WORKER_GLOBAL_CONCURRENCY } = require('../config/constants');

/**
 * @param {{ jobsRepo: object, templatesRepo: object, allowedModelsRepo: object, credits: object, batchesRepo?: object, workerId: string, logger?: object, captureException?: Function, globalConcurrency?: number, perShopConcurrency?: number }} deps
 */
function createJobWorker({
  jobsRepo,
  templatesRepo,
  allowedModelsRepo,
  credits,
  batchesRepo,
  workerId,
  logger = require('../config/logger').logger,
  captureException = require('../config/sentry').Sentry.captureException,
  globalConcurrency = JOB_WORKER_GLOBAL_CONCURRENCY,
  perShopConcurrency = JOB_WORKER_PER_SHOP_CONCURRENCY,
}) {
  const globalLimit = pLimit(globalConcurrency);
  const shopLimits = new Map();

  function getShopLimit(shopDomain) {
    if (!shopLimits.has(shopDomain)) {
      shopLimits.set(shopDomain, pLimit(perShopConcurrency));
    }
    return shopLimits.get(shopDomain);
  }

  /**
   * Claims, runs, and settles exactly one job — the unit of work a limiter
   * slot wraps. Never throws: every outcome (skip/succeed/fail) is reported
   * back via the return value, so a caller looping over many jobs never needs
   * a try/catch around each `enqueue()` call.
   * @returns {Promise<{ jobId: string, outcome: 'skipped'|'succeeded'|'failed', reason?: string }>}
   */
  async function processJob(job) {
    const claim = await jobsRepo.claimForProcessing(job.id, { workerId });
    if (!claim.claimed) {
      return { jobId: job.id, outcome: 'skipped', reason: claim.reason };
    }

    try {
      const resultVariations = await generationPipeline.runGenerationJob(claim.job, { workerId, jobsRepo, templatesRepo, allowedModelsRepo });
      await jobsRepo.settleJobSuccess(job.id, { workerId, resultVariations, recomputeCost: credits.recomputeCost });
      await reportBatchProgress(claim.job, true);
      return { jobId: job.id, outcome: 'succeeded' };
    } catch (err) {
      if (err instanceof LostLeaseError) {
        // Another worker reclaimed this job after our lease went stale —
        // silently abort rather than clobbering whatever the new owner is doing.
        return { jobId: job.id, outcome: 'skipped', reason: 'lost_lease' };
      }

      // Per the spec: every job failure gets its own Sentry report — distinct
      // from middleware/errorHandler.js's "every 5xx" call site, since a
      // worker has no HTTP response to report through.
      logger.error({ err, jobId: job.id, shopDomain: job.shopDomain }, 'Job failed');
      captureException(err, { tags: { jobId: job.id, shopDomain: job.shopDomain } });

      const settled = await jobsRepo.settleJobFailure(job.id, { workerId, error: err });
      if (settled.skipped) {
        return { jobId: job.id, outcome: 'skipped', reason: 'lost_lease' };
      }
      await reportBatchProgress(claim.job, false);
      return { jobId: job.id, outcome: 'failed' };
    }
  }

  /**
   * Records this job's outcome against its batch (Bulk Generation), if it
   * belongs to one — previously nothing ever called incrementBatchProgress,
   * so a batch's succeededCount/failedCount/status sat frozen at their
   * initial values forever and the frontend's progress bar never moved.
   */
  async function reportBatchProgress(job, succeeded) {
    if (!batchesRepo || !job.batchId) return;
    await batchesRepo.incrementBatchProgress(job.batchId, { succeeded });
  }

  /** Queues a job for processing, respecting both concurrency caps. */
  function enqueue(job) {
    return getShopLimit(job.shopDomain)(() => globalLimit(() => processJob(job)));
  }

  /**
   * Boot-time resume: re-enqueues anything left pending/processing by a
   * killed or redeployed process, paginated rather than one unbounded read.
   * Firing every job's `enqueue()` without awaiting each one lets the
   * concurrency limiters do their job — this just needs to walk every page.
   * @returns {Promise<number>} total jobs re-enqueued
   */
  async function resumeFromFirestore({ pageSize = 200 } = {}) {
    let cursor;
    let total = 0;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const page = await jobsRepo.queryResumableJobs({ cursor, limit: pageSize });
      if (page.length === 0) break;

      page.forEach((job) => {
        enqueue(job).catch((err) => {
          logger.error({ err, jobId: job.id }, 'jobWorker: enqueue failed during resume');
        });
      });
      total += page.length;

      if (page.length < pageSize) break;
      cursor = page[page.length - 1].createdAt;
    }
    return total;
  }

  return { enqueue, processJob, resumeFromFirestore };
}

module.exports = { createJobWorker };
