const IMAGE_OPTIMIZER_USAGE_COLLECTION = 'image_optimizer_usage';

/**
 * Per-shop daily quota counter for the Image Optimizer add-on. The daily reset
 * is lazy (no cron): whenever the stored `date` doesn't match today's UTC date,
 * the stored count is simply treated as 0 for this check.
 * @param {{ db: object, FieldValue: object }} opts
 */
function createImageOptimizerUsageRepo({ db, FieldValue }) {
  const usageCol = db.collection(IMAGE_OPTIMIZER_USAGE_COLLECTION);

  /**
   * Atomically checks and, if under quota, increments today's usage count.
   * `new Date()` is used deliberately (this is real application code computing
   * "today", not a workflow script) — tests control it via
   * vi.useFakeTimers()/vi.setSystemTime().
   * @returns {Promise<{ allowed: boolean, countToday: number, freeDailyQuota: number }>}
   */
  async function checkAndIncrementQuota(shopDomain, { freeDailyQuota }) {
    return db.runTransaction(async (tx) => {
      const ref = usageCol.doc(shopDomain);
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : undefined;
      const todayUtc = new Date().toISOString().slice(0, 10);

      const isNewDay = !data || data.date !== todayUtc;
      const countToday = isNewDay ? 0 : (data.countToday ?? 0);

      if (countToday >= freeDailyQuota) {
        return { allowed: false, countToday, freeDailyQuota };
      }

      const newCount = countToday + 1;
      tx.set(ref, { date: todayUtc, countToday: newCount });
      return { allowed: true, countToday: newCount, freeDailyQuota };
    });
  }

  return {
    checkAndIncrementQuota,
  };
}

let singleton;
/** Lazily builds the production singleton wired to the real Firestore. */
function getImageOptimizerUsageRepo() {
  if (!singleton) {
    const { getFirestore } = require('../config/firebase');
    const { FieldValue } = require('firebase-admin/firestore');
    singleton = createImageOptimizerUsageRepo({ db: getFirestore(), FieldValue });
  }
  return singleton;
}

module.exports = { createImageOptimizerUsageRepo, getImageOptimizerUsageRepo };
