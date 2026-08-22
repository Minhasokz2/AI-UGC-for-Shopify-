// Backs the Dashboard's usage/ROI card. Deliberately reads straight off the
// shop doc's lifetime counters (kept up to date by jobsRepo.settleJobSuccess)
// plus the recent credit ledger — no separate aggregation job or cache.

const express = require('express');
const { wrapAsync } = require('../../middleware/wrapAsync');

/**
 * @param {{ transactionsRepo: object }} deps
 */
function createUsageStatsRouter({ transactionsRepo }) {
  const router = express.Router();

  router.get(
    '/',
    wrapAsync(async (req, res) => {
      const recentTransactions = await transactionsRepo.queryByShop({ shopDomain: req.shopDomain, limit: 20 });
      res.json({
        creditBalance: req.shop.creditBalance,
        lifetimeCreditsSpent: req.shop.lifetimeCreditsSpent,
        lifetimeImagesGenerated: req.shop.lifetimeImagesGenerated,
        plan: req.shop.plan,
        recentTransactions,
      });
    }),
  );

  return router;
}

module.exports = { createUsageStatsRouter };
