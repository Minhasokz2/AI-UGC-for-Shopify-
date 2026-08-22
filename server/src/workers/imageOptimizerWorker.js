// The Image Optimizer add-on's sibling of jobWorker.js — same claim/run/
// settle shape and the same nested per-shop/global p-limit concurrency caps,
// but against conversion_jobs (no credit ledger to recompute, no template/
// model resolution — imageOptimizerService.runOptimizationJob already knows
// exactly which fixed model an operation maps to). Deliberately a separate
// file/runtime rather than sharing jobWorker.js's instance: a different
// concurrency profile and failure semantics from the generation pipeline,
// per the plan's "same shape, separate file" design.
//
// `imageOptimizerService` is an already-constructed instance (from
// createImageOptimizerService()/getImageOptimizerService()), not the module
// itself — unlike generationPipeline.js (a stateless module of plain
// functions), imageOptimizerService.js's exports are a factory, so there's no
// module-level function to reference as a spy-able namespace object here.

const pLimit = require('p-limit');
const { LostLeaseError } = require('../errors/AppError');
const { JOB_WORKER_PER_SHOP_CONCURRENCY, JOB_WORKER_GLOBAL_CONCURRENCY } = require('../config/constants');

/**
 * @param {{ conversionJobsRepo: object, imageOptimizerService: object, workerId: string, logger?: object, captureException?: Function, globalConcurrency?: number, perShopConcurrency?: number }} deps
 */
function createImageOptimizerWorker({
  conversionJobsRepo,
  imageOptimizerService,
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

  /** @returns {Promise<{ jobId: string, outcome: 'skipped'|'succeeded'|'failed', reason?: string }>} */
  async function processJob(job) {
    const claim = await conversionJobsRepo.claimForProcessing(job.id, { workerId });
    if (!claim.claimed) {
      return { jobId: job.id, outcome: 'skipped', reason: claim.reason };
    }

    try {
      const { url } = await imageOptimizerService.runOptimizationJob(claim.job);
      await conversionJobsRepo.settleConversionSuccess(job.id, { workerId, resultImageUrl: url });
      return { jobId: job.id, outcome: 'succeeded' };
    } catch (err) {
      if (err instanceof LostLeaseError) {
        return { jobId: job.id, outcome: 'skipped', reason: 'lost_lease' };
      }

      logger.error({ err, jobId: job.id, shopDomain: job.shopDomain }, 'Image Optimizer job failed');
      captureException(err, { tags: { jobId: job.id, shopDomain: job.shopDomain } });

      const settled = await conversionJobsRepo.settleConversionFailure(job.id, { workerId, error: err });
      if (settled.skipped) {
        return { jobId: job.id, outcome: 'skipped', reason: 'lost_lease' };
      }

      // The merchant shouldn't lose their scarce daily quota to a provider
      // failure that wasn't their fault — give the unit back now that the
      // job is durably marked failed. A refund error here is logged but
      // never rethrown: the job is already correctly marked failed, and a
      // missed refund is a much smaller harm than crashing the worker loop.
      try {
        await imageOptimizerService.refundQuotaForShop(job.shopDomain);
      } catch (refundErr) {
        logger.error({ err: refundErr, jobId: job.id, shopDomain: job.shopDomain }, 'Image Optimizer quota refund failed');
        captureException(refundErr, { tags: { jobId: job.id, shopDomain: job.shopDomain } });
      }

      return { jobId: job.id, outcome: 'failed' };
    }
  }

  function enqueue(job) {
    return getShopLimit(job.shopDomain)(() => globalLimit(() => processJob(job)));
  }

  /** @returns {Promise<number>} total jobs re-enqueued */
  async function resumeFromFirestore({ pageSize = 200 } = {}) {
    let cursor;
    let total = 0;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const page = await conversionJobsRepo.queryResumableJobs({ cursor, limit: pageSize });
      if (page.length === 0) break;

      page.forEach((job) => {
        enqueue(job).catch((err) => {
          logger.error({ err, jobId: job.id }, 'imageOptimizerWorker: enqueue failed during resume');
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

module.exports = { createImageOptimizerWorker };
