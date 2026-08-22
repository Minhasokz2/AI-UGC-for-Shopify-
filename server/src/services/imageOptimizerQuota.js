// Image Optimizer's daily-quota gate. Deliberately a fundamentally different
// accounting model than the credit ledger: a plain per-day counter, reset
// lazily (see repos/imageOptimizerUsageRepo.js) rather than debited per use. A
// shop with the paid `addOns.imageOptimizer` flag set bypasses the quota
// entirely — the add-on's whole value proposition is "unlimited optimization",
// so no counter is even consulted for those shops.

const { IMAGE_OPTIMIZER_FREE_DAILY_QUOTA } = require('../config/constants');

/**
 * @param {{ imageOptimizerUsageRepo: object }} deps
 */
function createImageOptimizerQuota({ imageOptimizerUsageRepo }) {
  /**
   * @param {object} shop a shop record (from shopsRepo.getShop/getOrCreateShop)
   * @returns {Promise<{ allowed: boolean, unlimited: boolean, countToday?: number, freeDailyQuota?: number }>}
   */
  async function checkAndConsumeQuota(shop) {
    if (shop?.addOns?.imageOptimizer) {
      return { allowed: true, unlimited: true };
    }
    const shopDomain = shop?.id ?? shop?.shopDomain;
    const result = await imageOptimizerUsageRepo.checkAndIncrementQuota(shopDomain, {
      freeDailyQuota: IMAGE_OPTIMIZER_FREE_DAILY_QUOTA,
    });
    return { allowed: result.allowed, unlimited: false, countToday: result.countToday, freeDailyQuota: result.freeDailyQuota };
  }

  /**
   * Compensates a quota unit for a shop whose job failed or whose job
   * creation errored after quota was already consumed. A no-op for a shop
   * on the paid add-on — that path never consumed a counted unit to begin
   * with, so there's nothing to give back.
   * @param {object} shop a shop record (from shopsRepo.getShop/getOrCreateShop)
   */
  async function refundQuota(shop) {
    if (shop?.addOns?.imageOptimizer) return;
    const shopDomain = shop?.id ?? shop?.shopDomain;
    await imageOptimizerUsageRepo.refundQuota(shopDomain);
  }

  return { checkAndConsumeQuota, refundQuota };
}

let singleton;
/** Lazily builds the production singleton wired to the real Firestore. */
function getImageOptimizerQuota() {
  if (!singleton) {
    const { getImageOptimizerUsageRepo } = require('../repos/imageOptimizerUsageRepo');
    singleton = createImageOptimizerQuota({ imageOptimizerUsageRepo: getImageOptimizerUsageRepo() });
  }
  return singleton;
}

module.exports = { createImageOptimizerQuota, getImageOptimizerQuota };
