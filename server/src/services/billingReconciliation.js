// Periodic sweep that catches silent subscription renewals. Confirmed against
// shopify.dev: APP_SUBSCRIPTIONS_UPDATE fires on status transitions (created,
// cancelled, expired, frozen) but NOT on a routine successful monthly
// auto-renewal — so a shop's credit pack would silently stop granting new
// credits every cycle if this sweep didn't exist. Invocable three ways that all
// run this same code (see render.yaml/README): a local CLI script
// (scripts/sweepBilling.js), an ADMIN_API_KEY-gated HTTP endpoint a free
// external pinger can hit, or a future paid Render Cron Job.
//
// For each installed shop with an active recurring subscription, queries
// Shopify's `currentAppInstallation.activeSubscriptions` for its current
// billing-cycle end date and grants that cycle's credits exactly once — the
// `${subscriptionId}:${currentPeriodEnd}` charge key (via
// billingChargesRepo.claimCharge, called through billingService.grantCreditsForCharge)
// is what makes granting the SAME cycle twice (this sweep firing more than once
// before the next renewal) a no-op instead of a double-grant.

const ACTIVE_SUBSCRIPTIONS_QUERY = `#graphql
  query currentActiveSubscriptions {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        currentPeriodEnd
      }
    }
  }
`;

/**
 * @param {{ shopsRepo: object, billingService: object, getGraphqlClient: Function, getSessionForShop: Function, creditsForPack: Function, log?: Function }} deps
 */
function createBillingReconciliation({ shopsRepo, billingService, getGraphqlClient, getSessionForShop, creditsForPack, log = () => {} }) {
  /**
   * Reconciles a single shop: looks up its active subscription(s) on Shopify
   * and grants credits for any billing cycle not yet claimed.
   * @returns {Promise<{ shopDomain: string, granted: number, skipped: boolean, error?: Error }>}
   */
  async function reconcileShop(shop) {
    const shopDomain = shop.id ?? shop.shopDomain;
    const session = await getSessionForShop(shopDomain);
    if (!session) {
      return { shopDomain, granted: 0, skipped: true, reason: 'no_session' };
    }

    let subscriptions;
    try {
      const client = getGraphqlClient(session);
      const response = await client.request(ACTIVE_SUBSCRIPTIONS_QUERY);
      subscriptions = response.data?.currentAppInstallation?.activeSubscriptions ?? [];
    } catch (err) {
      log({ level: 'error', shopDomain, err }, 'billingReconciliation: failed to query active subscriptions');
      return { shopDomain, granted: 0, skipped: true, error: err };
    }

    let granted = 0;
    for (const subscription of subscriptions) {
      if (subscription.status !== 'ACTIVE') continue;
      const credits = creditsForPack(subscription.name);
      if (!credits) continue;

      // eslint-disable-next-line no-await-in-loop
      const result = await billingService.grantCreditsForCharge(shopDomain, {
        chargeKey: `${subscription.id}:${subscription.currentPeriodEnd}`,
        credits,
        type: 'renewal',
      });
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

/**
 * Maps a subscription's display name (as billingService.js constructs it —
 * e.g. "MotionArt Growth (Monthly)") back to its monthly credit grant. Pure
 * and exported so container.js can build the production billingReconciliation
 * instance with the exact same mapping this file's own singleton uses.
 * @param {string} subscriptionName
 * @returns {number|null} credits to grant, 0 for Unlimited (never draws down a
 *   balance), or null if the name doesn't match any known pack/plan.
 */
function creditsForPack(subscriptionName) {
  const { CREDIT_PACKS, UNLIMITED_PLAN } = require('./billingPacks');
  const pack = CREDIT_PACKS.find((p) => subscriptionName.includes(p.label));
  if (pack) return pack.monthlyCredits;
  if (subscriptionName.includes(UNLIMITED_PLAN.label)) return 0;
  return null;
}

let singleton;
/** Lazily builds the production singleton wired to real Firestore/Shopify. */
function getBillingReconciliation() {
  if (!singleton) {
    const { getShopsRepo } = require('../repos/shopsRepo');
    const { getBillingService } = require('./billingService');
    const { getShopify } = require('../config/shopify');
    const { logger } = require('../config/logger');

    singleton = createBillingReconciliation({
      shopsRepo: getShopsRepo(),
      billingService: getBillingService(),
      getGraphqlClient: (session) => new (getShopify().api.clients.Graphql)({ session }),
      getSessionForShop: async (shopDomain) => {
        const shopify = getShopify();
        const sessions = await shopify.config.sessionStorage.findSessionsByShop(shopDomain);
        return sessions.find((s) => !s.isOnline) ?? sessions[0];
      },
      creditsForPack,
      log: (fields, message) => logger.error(fields, message),
    });
  }
  return singleton;
}

module.exports = { createBillingReconciliation, getBillingReconciliation, creditsForPack };
