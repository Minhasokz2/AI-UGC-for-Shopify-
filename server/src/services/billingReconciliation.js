// Periodic sweep that catches silent subscription renewals AND cancellations.
// Shopify App Pricing (this app's billing model) has no webhook at all for
// subscription status — subscription status comes exclusively from the
// Partner API's activeSubscription query (confirmed against shopify.dev),
// and it doesn't fire anything on a routine successful renewal either — so a
// shop's credit pack would silently stop granting new credits every cycle,
// and a churned Unlimited subscriber would stay on the free bypass forever,
// if this sweep didn't exist. Invocable three ways that all run this same
// code (see render.yaml/README): a local CLI script (scripts/sweepBilling.js),
// an ADMIN_API_KEY-gated HTTP endpoint a free external pinger can hit, or a
// future paid Render Cron Job.
//
// For each installed shop, resolves its Partner API shopId via the Admin API
// (using its stored offline session), queries activeSubscription, and grants
// that billing cycle's credits exactly once — the
// `app-pricing:${planHandle}:${currentBillingCycle.startTime}` charge key
// (via billingChargesRepo.claimCharge, through billingService.grantCreditsForCharge)
// is what makes granting the SAME cycle twice (this sweep firing more than
// once before the next renewal) a no-op instead of a double-grant. A shop
// locally recorded as 'unlimited' with no matching active subscription
// anymore is reverted to metered billing.

const { resolvePlanFromHandle } = require('../config/appPricingPlans');
const { CREDIT_PACKS } = require('./billingPacks');

const APP_AND_SHOP_ID_QUERY = `#graphql
  query AppAndShopId {
    currentAppInstallation { app { id } }
    shop { id }
  }
`;

/**
 * @param {{ shopsRepo: object, billingService: object, getGraphqlClient: Function, partnerApiClient: object, getSessionForShop: Function, log?: Function }} deps
 */
function createBillingReconciliation({ shopsRepo, billingService, getGraphqlClient, partnerApiClient, getSessionForShop, log = () => {} }) {
  /**
   * Reconciles a single shop: looks up its active Shopify App Pricing
   * subscription and grants credits for any billing cycle not yet claimed,
   * or reverts a churned Unlimited plan to metered.
   * @returns {Promise<{ shopDomain: string, granted: number, skipped: boolean, error?: Error }>}
   */
  async function reconcileShop(shop) {
    const shopDomain = shop.id ?? shop.shopDomain;
    const session = await getSessionForShop(shopDomain);
    if (!session) {
      return { shopDomain, granted: 0, skipped: true, reason: 'no_session' };
    }

    let subscription;
    try {
      const client = getGraphqlClient(session);
      const idsResponse = await client.request(APP_AND_SHOP_ID_QUERY);
      const appId = idsResponse.data.currentAppInstallation.app.id;
      const shopId = idsResponse.data.shop.id;
      subscription = await partnerApiClient.getActiveSubscription({ appId, shopId });
    } catch (err) {
      log({ level: 'error', shopDomain, err }, 'billingReconciliation: failed to query active subscription');
      return { shopDomain, granted: 0, skipped: true, error: err };
    }

    if (!subscription) {
      if (shop.plan === 'unlimited') {
        await billingService.deactivateUnlimitedPlan(shopDomain);
      }
      return { shopDomain, granted: 0, skipped: false };
    }

    let granted = 0;
    for (const item of subscription.items ?? []) {
      const resolved = resolvePlanFromHandle(item.handle);
      if (!resolved) continue;
      const chargeKey = `app-pricing:${item.handle}:${subscription.currentBillingCycle.startTime}`;

      if (resolved.unlimited) {
        // eslint-disable-next-line no-await-in-loop
        await billingService.activateUnlimitedPlan(shopDomain, item.handle);
        continue;
      }

      const pack = CREDIT_PACKS.find((p) => p.id === resolved.packId);
      const credits = resolved.period === 'annual' ? pack.annualCredits : pack.monthlyCredits;
      // eslint-disable-next-line no-await-in-loop
      const result = await billingService.grantCreditsForCharge(shopDomain, { chargeKey, credits, type: 'renewal' });
      if (result.granted) granted += 1;
    }

    return { shopDomain, granted, skipped: false };
  }

  /**
   * Walks every installed shop, paginated, reconciling each one. A per-shop
   * failure never aborts the sweep — it's recorded in the results and the sweep
   * continues to the next shop.
   * @returns {Promise<{ results: Array }>}
   */
  async function runReconciliationSweep({ pageSize = 100 } = {}) {
    const results = [];
    let cursor;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const page = await shopsRepo.listInstalledShops({ cursor, limit: pageSize });
      if (page.length === 0) break;

      for (const shop of page) {
        // eslint-disable-next-line no-await-in-loop
        const result = await reconcileShop(shop).catch((err) => ({ shopDomain: shop.id, granted: 0, skipped: true, error: err }));
        results.push(result);
      }

      if (page.length < pageSize) break;
      cursor = page[page.length - 1].shopDomain;
    }
    return { results };
  }

  return { reconcileShop, runReconciliationSweep };
}

let singleton;
/** Lazily builds the production singleton wired to real Firestore/Shopify/Partner API. */
function getBillingReconciliation() {
  if (!singleton) {
    const { getShopsRepo } = require('../repos/shopsRepo');
    const { getBillingService } = require('./billingService');
    const { getPartnerApiClient } = require('./partnerApiClient');
    const { getShopify } = require('../config/shopify');
    const { logger } = require('../config/logger');

    singleton = createBillingReconciliation({
      shopsRepo: getShopsRepo(),
      billingService: getBillingService(),
      getGraphqlClient: (session) => new (getShopify().api.clients.Graphql)({ session }),
      partnerApiClient: getPartnerApiClient(),
      getSessionForShop: async (shopDomain) => {
        const shopify = getShopify();
        const sessions = await shopify.config.sessionStorage.findSessionsByShop(shopDomain);
        return sessions.find((s) => !s.isOnline) ?? sessions[0];
      },
      log: (fields, message) => logger.error(fields, message),
    });
  }
  return singleton;
}

module.exports = { createBillingReconciliation, getBillingReconciliation };
