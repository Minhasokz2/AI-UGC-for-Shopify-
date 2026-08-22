// Referral payouts are tracked, not automated (Shopify's Billing API has no
// mechanism to pay a third-party merchant) — this route surfaces the
// merchant's own code and what's been accrued; actual payout stays a manual,
// out-of-app process, stated plainly in the frontend copy.

const express = require('express');
const { wrapAsync } = require('../../middleware/wrapAsync');

/**
 * @param {{ referralsService: object }} deps
 */
function createReferralsRouter({ referralsService }) {
  const router = express.Router();

  router.get(
    '/',
    wrapAsync(async (req, res) => {
      const [code, referrals] = await Promise.all([
        referralsService.ensureReferralCode(req.shopDomain),
        referralsService.listReferralsMade(req.shopDomain),
      ]);
      res.json({ code, referrals });
    }),
  );

  return router;
}

module.exports = { createReferralsRouter };
