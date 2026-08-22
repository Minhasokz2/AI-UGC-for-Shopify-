// Image Optimizer add-on orchestration: request-side quota enforcement plus
// the actual per-job optimization call. Deliberately its own sibling of
// generationPipeline.js rather than sharing runtime with it — no background
// removal step (an existing catalog photo is being improved in place, not
// composited into a new scene), no credit ledger (see imageOptimizerQuota.js),
// and a fixed small set of operations rather than the full model catalog.

const { NotFoundError, QuotaExceededError } = require('../errors/AppError');
const { EXTENDED_ALLOWED_MODELS } = require('./extendedModels');
const modelDispatch = require('./modelDispatch');

/** The only EXTENDED_ALLOWED_MODELS roles Image Optimizer is allowed to invoke — excludes object_extraction/try_on, which belong to other flows. */
const OPTIMIZER_OPERATIONS = new Set(['upscale_budget', 'upscale_premium', 'retouch']);

/**
 * @param {string} operation
 * @returns {object} the resolved model
 */
function resolveOptimizerModel(operation) {
  if (!OPTIMIZER_OPERATIONS.has(operation)) {
    throw new NotFoundError(`Unknown Image Optimizer operation "${operation}"`);
  }
  return EXTENDED_ALLOWED_MODELS[operation];
}

/**
 * @param {{ shopsRepo: object, conversionJobsRepo: object, imageOptimizerQuota: object }} deps
 */
function createImageOptimizerService({ shopsRepo, conversionJobsRepo, imageOptimizerQuota }) {
  /**
   * Validates the operation, enforces the daily quota (consuming one unit of
   * it), and creates the conversion job. Quota is checked (and consumed) AFTER
   * operation validation, so an invalid operation never burns a merchant's
   * daily allowance.
   *
   * `idempotencyKey` is checked FIRST, before quota is ever touched — a
   * retried/double-clicked request for the same logical action must never
   * burn a second unit of the scarce (default 10/day) free quota. If job
   * creation itself throws after quota was already consumed (e.g. a
   * Firestore write error), that unit is refunded rather than silently lost.
   */
  async function requestOptimization({ shopDomain, shopifyProductId, imageUrl, operation, idempotencyKey }) {
    resolveOptimizerModel(operation);

    const existing = await conversionJobsRepo.findByIdempotencyKey(shopDomain, idempotencyKey);
    if (existing) return existing;

    const shop = await shopsRepo.getShop(shopDomain);
    const quota = await imageOptimizerQuota.checkAndConsumeQuota(shop ?? { id: shopDomain });
    if (!quota.allowed) {
      throw new QuotaExceededError(
        `Daily Image Optimizer quota reached (${quota.countToday}/${quota.freeDailyQuota}). Upgrade the add-on or try again tomorrow.`,
      );
    }

    try {
      const { job } = await conversionJobsRepo.claimAndCreateConversionJob(shopDomain, idempotencyKey, {
        shopifyProductId,
        imageUrl,
        operation,
      });
      return job;
    } catch (err) {
      await imageOptimizerQuota.refundQuota(shop ?? { id: shopDomain });
      throw err;
    }
  }

  /**
   * Gives back the quota unit consumed for a job that the worker has just
   * marked failed — a merchant shouldn't lose their scarce daily allowance
   * to a transient provider failure (fal.ai timeout/error), mirroring how a
   * metered-plan shop is never charged credits for a failed generation.
   */
  async function refundQuotaForShop(shopDomain) {
    const shop = await shopsRepo.getShop(shopDomain);
    await imageOptimizerQuota.refundQuota(shop ?? { id: shopDomain });
  }

  /**
   * Given a claimed conversion job, runs the actual model call.
   * @param {object} job
   * @returns {Promise<{ url: string }>}
   */
  async function runOptimizationJob(job) {
    const model = resolveOptimizerModel(job.operation);
    const url = await modelDispatch.generateSingle(model, { imageUrl: job.imageUrl });
    return { url };
  }

  return { requestOptimization, runOptimizationJob, refundQuotaForShop };
}

let singleton;
/** Lazily builds the production singleton wired to the real Firestore. */
function getImageOptimizerService() {
  if (!singleton) {
    const { getShopsRepo } = require('../repos/shopsRepo');
    const { getConversionJobsRepo } = require('../repos/conversionJobsRepo');
    const { getImageOptimizerQuota } = require('./imageOptimizerQuota');
    singleton = createImageOptimizerService({
      shopsRepo: getShopsRepo(),
      conversionJobsRepo: getConversionJobsRepo(),
      imageOptimizerQuota: getImageOptimizerQuota(),
    });
  }
  return singleton;
}

module.exports = { createImageOptimizerService, getImageOptimizerService, resolveOptimizerModel, OPTIMIZER_OPERATIONS };
