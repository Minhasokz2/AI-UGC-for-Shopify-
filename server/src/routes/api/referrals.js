// Referral payouts are tracked, not automated (Shopify's Billing API has no
// mechanism to pay a third-party merchant) — this route surfaces the
// merchant's own code and what's been accrued; actual payout stays a manual,
// out-of-app process, stated plainly in the frontend copy.

const express = require('express');
const { z } = require('zod');
const { wrapAsync } = require('../../middleware/wrapAsync');

const applyReferralSchema = z.object({ code: z.string().min(1) });

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

  // Merchant-entered referral code — no install-time/OAuth attribution flow
  // exists (that would need a whole separate public-URL/state-passing path),
  // so this is the entry point: a merchant who was referred can enter the
  // code they were given at any time. Safe to call more than once —
  // referralsService.applyReferralCode no-ops for an unknown code, a
  // self-referral, or a shop that's already been attributed.
  router.post(
    '/apply',
    wrapAsync(async (req, res) => {
      const { code } = applyReferralSchema.parse(req.body);
      const result = await referralsService.applyReferralCode({ referredShopDomain: req.shopDomain, code });
      res.json(result);
    }),
  );

  return router;
}

module.exports = { createReferralsRouter };
