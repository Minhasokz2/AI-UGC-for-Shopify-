// Shopify App Pricing orchestration. This app is opted into Shopify App
// Pricing (formerly "Managed Pricing") in Partner Dashboard, which means the
// classic Billing API (appSubscriptionCreate/appPurchaseOneTimeCreate) is
// categorically blocked for BOTH recurring and one-time charges — confirmed
// live (every call 403'd regardless of the `test` flag) and against
// shopify.dev's docs ("Once you opt in to Shopify App Pricing, you can't
// create new recurring application charges using the Billing API").
//
// So there is no "create a charge" call at all anymore: the merchant picks a
// plan on Shopify's own hosted page (getPricingPlansUrl), and Shopify redirects
// them back to this app's /billing page with a `plan_handle` query param.
// confirmAppPricingPlan then verifies — via the Partner API, the ONLY source
// of truth for a Shopify App Pricing subscription's status (the Admin API's
// currentAppInstallation.activeSubscriptions doesn't see these at all) — that
// the shop actually has a matching active subscription before granting
// anything, rather than trusting the client-supplied plan_handle at face
// value (which a merchant could otherwise forge to get free credits).
//
// A one-time custom-amount top-up has no equivalent under Shopify App Pricing
// (its plan types are fixed/graduated/volume recurring, or usage-based via the
// App Events API) — that purchase path is intentionally not offered any more;
// see routes/api/billing.js and CustomAmountPreview.jsx.
//
// grantCreditsForCharge is the shared idempotent entry point used both by the
// initial confirm-on-return call AND by billingReconciliation.js's periodic
// poll (Shopify App Pricing doesn't fire a webhook on renewal either), keyed
// by `app-pricing:${planHandle}:${currentBillingCycle.startTime}` so the same
// billing cycle is never credited twice but a NEW cycle (a fresh startTime)
// grants again.

const { CREDIT_PACKS, UNLIMITED_PLAN } = require('./billingPacks');
const { resolvePlanFromHandle } = require('../config/appPricingPlans');
const { SHOPIFY_APP_HANDLE } = require('../config/constants');

const APP_AND_SHOP_ID_QUERY = `#graphql
  query AppAndShopId {
    currentAppInstallation { app { id } }
    shop { id }
  }
`;

/** @param {string} shopDomain e.g. "my-store.myshopify.com" */
function getPricingPlansUrl(shopDomain) {
  const storeHandle = shopDomain.replace(/\.myshopify\.com$/, '');
  return `https://admin.shopify.com/store/${storeHandle}/charges/${SHOPIFY_APP_HANDLE}/pricing_plans`;
}

/**
 * @param {{ shopsRepo: object, billingChargesRepo: object, getGraphqlClient: Function, partnerApiClient: object, FieldValue: object }} deps
 */
function createBillingService({ shopsRepo, billingChargesRepo, getGraphqlClient, partnerApiClient, FieldValue }) {
  async function getAppAndShopIds(session) {
    const client = getGraphqlClient(session);
    const response = await client.request(APP_AND_SHOP_ID_QUERY);
    return { appId: response.data.currentAppInstallation.app.id, shopId: response.data.shop.id };
  }

  /**
   * Verifies (via the Partner API) that the shop actually holds an active
   * subscription matching `planHandle` before granting anything.
   * @returns {Promise<{ confirmed: boolean, reason?: string, plan?: string, granted?: boolean }>}
   */
  async function confirmAppPricingPlan(session, { shopDomain, planHandle }) {
    const resolved = resolvePlanFromHandle(planHandle);
    if (!resolved) return { confirmed: false, reason: 'unknown_plan_handle' };

    const { appId, shopId } = await getAppAndShopIds(session);
    const subscription = await partnerApiClient.getActiveSubscription({ appId, shopId });
    const matchesHandle = subscription?.items?.some((item) => item.handle === planHandle);
    if (!subscription || !matchesHandle) {
      return { confirmed: false, reason: 'no_matching_active_subscription' };
    }

    const chargeKey = `app-pricing:${planHandle}:${subscription.currentBillingCycle.startTime}`;

    if (resolved.unlimited) {
      await activateUnlimitedPlan(shopDomain, planHandle);
      return { confirmed: true, plan: 'unlimited' };
    }

    const pack = CREDIT_PACKS.find((p) => p.id === resolved.packId);
    const credits = resolved.period === 'annual' ? pack.annualCredits : pack.monthlyCredits;
    const result = await grantCreditsForCharge(shopDomain, { chargeKey, credits, type: 'subscription' });
    return { confirmed: true, ...result };
  }

  /**
   * Grants credits for a claimed charge, exactly once per `chargeKey` — the
   * shared entry point for both the post-redirect confirm call and
   * billingReconciliation.js's renewal poll (see file header). A no-op if this
   * chargeKey was already processed.
   * @returns {Promise<{ granted: boolean }>}
   */
  async function grantCreditsForCharge(shopDomain, { chargeKey, credits, type }) {
    const claim = await billingChargesRepo.claimCharge(chargeKey, { shopDomain, credits, type });
    if (!claim.claimed) return { granted: false };
    await shopsRepo.updateShop(shopDomain, { creditBalance: FieldValue.increment(credits) });
    return { granted: true };
  }

  /** Marks a shop as being on the Unlimited plan once its subscription is confirmed active. */
  async function activateUnlimitedPlan(shopDomain, planHandle) {
    await shopsRepo.updateShop(shopDomain, { plan: 'unlimited', unlimitedPlanHandle: planHandle });
  }

  /** Reverts a shop to the metered plan once its Unlimited subscription is no longer active. */
  async function deactivateUnlimitedPlan(shopDomain) {
    await shopsRepo.updateShop(shopDomain, { plan: 'metered', unlimitedPlanHandle: null });
  }

  return {
    getPricingPlansUrl,
    confirmAppPricingPlan,
    grantCreditsForCharge,
    activateUnlimitedPlan,
    deactivateUnlimitedPlan,
  };
}

let singleton;
/** Lazily builds the production singleton wired to the real Shopify GraphQL + Partner API clients. */
function getBillingService() {
  if (!singleton) {
    const { getShopsRepo } = require('../repos/shopsRepo');
    const { getBillingChargesRepo } = require('../repos/billingChargesRepo');
    const { getShopify } = require('../config/shopify');
    const { getPartnerApiClient } = require('./partnerApiClient');
    const { FieldValue } = require('firebase-admin/firestore');
    singleton = createBillingService({
      shopsRepo: getShopsRepo(),
      billingChargesRepo: getBillingChargesRepo(),
      getGraphqlClient: (session) => new (getShopify().api.clients.Graphql)({ session }),
      partnerApiClient: getPartnerApiClient(),
      FieldValue,
    });
  }
  return singleton;
}

module.exports = { createBillingService, getBillingService, getPricingPlansUrl };
