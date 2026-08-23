// Billing surface, on Shopify App Pricing:
//  - GET /status, /packs: read-only, safe to call anytime. /packs includes
//    pricingPlansUrl — the ONE link the frontend sends merchants to; Shopify
//    hosts the actual plan picker, this app never creates a charge itself.
//  - There is no custom one-time top-up anymore — Shopify App Pricing has no
//    equivalent to an arbitrary-amount one-time purchase (confirmed:
//    appPurchaseOneTimeCreate is blocked exactly like appSubscriptionCreate),
//    so that feature (and its preview endpoint) was removed rather than left
//    pointing at a purchase flow that can never succeed.
//  - POST /confirm-app-pricing-plan: called once the merchant returns from
//    Shopify's hosted pricing page with a `plan_handle` query param. Verifies
//    the subscription via the Partner API (never trusts the query param
//    alone — see billingService.confirmAppPricingPlan) before granting
//    anything.
//
// NOTE: this round-trip (redirect to Shopify's hosted page -> confirm) cannot
// be exercised end-to-end without a real dev store, an app fully configured
// with Shopify App Pricing plans in Partner Dashboard, and Partner API
// credentials — flagged in the README as a required manual verification step.

const express = require('express');
const { z } = require('zod');
const { wrapAsync } = require('../../middleware/wrapAsync');
const { CREDIT_PACKS, UNLIMITED_PLAN } = require('../../services/billingPacks');

const confirmSchema = z.object({ planHandle: z.string() });

/**
 * @param {{ billingService: object }} deps
 */
function createBillingRouter({ billingService }) {
  const router = express.Router();

  router.get('/status', (req, res) => {
    res.json({
      plan: req.shop.plan,
      creditBalance: req.shop.creditBalance,
      lifetimeCreditsSpent: req.shop.lifetimeCreditsSpent,
      lifetimeImagesGenerated: req.shop.lifetimeImagesGenerated,
      // Not billing-specific, but this is the one endpoint the frontend's
      // ['shopStatus'] query already calls on every page load and
      // invalidates after the Google Sign-In popup succeeds — see
      // web/src/components/auth/GoogleSignInGate.jsx, which needs this
      // field to know whether to show the sign-in prompt at all.
      googleVerified: !!req.shop.googleVerified,
      verifiedEmail: req.shop.verifiedEmail ?? null,
    });
  });

  router.get('/packs', (req, res) => {
    res.json({
      packs: CREDIT_PACKS,
      unlimitedPlan: UNLIMITED_PLAN,
      pricingPlansUrl: billingService.getPricingPlansUrl(req.shopDomain),
    });
  });

  router.post(
    '/confirm-app-pricing-plan',
    wrapAsync(async (req, res) => {
      const { planHandle } = confirmSchema.parse(req.body);
      const result = await billingService.confirmAppPricingPlan(res.locals.shopify.session, {
        shopDomain: req.shopDomain,
        planHandle,
      });
      res.json(result);
    }),
  );

  return router;
}

module.exports = { createBillingRouter };
