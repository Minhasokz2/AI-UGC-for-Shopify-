// GDPR-mandatory webhook handlers, registered via shopify.registerWebhooks()
// (config/shopify.js's afterAuth hook) and dispatched by
// shopify.processWebhooks() (routes/webhooks.js). Confirmed against the
// installed SDK: a handler's callback signature is
// `(topic, shop, rawBody, webhookId, apiVersion, context)` — `rawBody` is a
// raw string, JSON.parse'd by whichever handler needs the payload.
//
// Also confirmed: shopify-app-express's processWebhooks() ALWAYS registers its
// own built-in APP_UNINSTALLED handler (bookkeeping for
// ensureInstalledOnShop's AppInstallations cache) on the same callbackUrl —
// since deliveryMethod is Http, the SDK runs multiple handlers for the same
// topic sequentially rather than treating the second as a conflict, so this
// app's own APP_UNINSTALLED handler below runs alongside it, not instead of it.
//
// CUSTOMERS_REDACT and CUSTOMERS_DATA_REQUEST are legitimately no-ops for this
// app's data model: jobs/products are scoped to the SHOP, not to individual
// Shopify customers — no customer-identifying data is ever stored — so there
// is nothing to redact or report per-customer. They're still registered
// (required for every public app to pass Shopify's app review) and log
// receipt for an audit trail.

const { DeliveryMethod } = require('@shopify/shopify-api');
const { env } = require('../config/env');
const { logger } = require('../config/logger');

/**
 * @param {{ shopsRepo: object, productsRepo: object, sessionStorage: object, billingService: object }} deps
 */
function createWebhookHandlers({ shopsRepo, productsRepo, sessionStorage, billingService }) {
  return {
    APP_UNINSTALLED: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: env.SHOPIFY_WEBHOOK_PATH,
      callback: async (_topic, shop) => {
        await shopsRepo.markUninstalled(shop);
        // Must delete the stored session too, not just mark the shop uninstalled —
        // otherwise a reinstall's token exchange (perform-token-exchange.ts in the
        // installed SDK) finds this still-"active" session and reuses it forever,
        // never requesting a fresh token even if the app's required scopes changed
        // in the meantime. Confirmed live: a shop's session sat with a stale scope
        // across multiple full uninstall/reinstall attempts until this was fixed.
        const sessions = await sessionStorage.findSessionsByShop(shop);
        if (sessions.length > 0) {
          await sessionStorage.deleteSessions(sessions.map((session) => session.id));
        }
        logger.info({ shop }, 'webhookHandlers: APP_UNINSTALLED processed');
      },
    },
    SHOP_REDACT: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: env.SHOPIFY_WEBHOOK_PATH,
      // Fired ~48h after uninstall. Best-effort erasure: the cached product
      // catalog copy (owns real Shopify-sourced content) is deleted outright;
      // the shop doc's PII fields are cleared but the doc itself is kept (its
      // id, credit ledger and job history are the merchant's own business
      // records, not something Shopify's customer-privacy law requires erasing).
      callback: async (_topic, shop) => {
        await productsRepo.deleteAllForShop(shop);
        await shopsRepo.updateShop(shop, { verifiedEmail: null, brandStyleProfile: null });
        logger.info({ shop }, 'webhookHandlers: SHOP_REDACT processed');
      },
    },
    CUSTOMERS_REDACT: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: env.SHOPIFY_WEBHOOK_PATH,
      callback: async (_topic, shop) => {
        logger.info({ shop }, 'webhookHandlers: CUSTOMERS_REDACT received (no-op — no per-customer data stored)');
      },
    },
    CUSTOMERS_DATA_REQUEST: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: env.SHOPIFY_WEBHOOK_PATH,
      callback: async (_topic, shop) => {
        logger.info({ shop }, 'webhookHandlers: CUSTOMERS_DATA_REQUEST received (no-op — no per-customer data stored)');
      },
    },
    // Shopify does NOT fire this on a routine successful renewal (that's the
    // whole reason billingReconciliation.js's sweep exists) — it DOES fire on
    // every status transition (cancelled, expired, frozen, declined), which
    // is the only signal that ever tells this app an Unlimited-plan shop
    // needs to be reverted to metered billing. Without this handler,
    // cancelling on Shopify's side left the shop on a permanent free
    // Unlimited bypass — deactivateUnlimitedPlan was correct but dead code,
    // called from nowhere.
    APP_SUBSCRIPTIONS_UPDATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: env.SHOPIFY_WEBHOOK_PATH,
      callback: async (_topic, shop, rawBody) => {
        const subscription = JSON.parse(rawBody).app_subscription;
        if (!subscription || subscription.status === 'ACTIVE') return;

        const shopRecord = await shopsRepo.getShop(shop);
        // Only ever deactivate for the subscription actually recorded as this
        // shop's current one — an event for an old, already-superseded
        // subscription id must never clobber a newer active one.
        if (shopRecord?.plan === 'unlimited' && shopRecord.unlimitedSubscriptionId === subscription.admin_graphql_api_id) {
          await billingService.deactivateUnlimitedPlan(shop);
          logger.info({ shop, status: subscription.status }, 'webhookHandlers: APP_SUBSCRIPTIONS_UPDATE deactivated Unlimited plan');
        }
      },
    },
  };
}

let singleton;
/** Lazily builds the production singleton wired to the real repos. */
function getWebhookHandlers() {
  if (!singleton) {
    const { getShopsRepo } = require('../repos/shopsRepo');
    const { getProductsRepo } = require('../repos/productsRepo');
    const { getBillingService } = require('./billingService');
    const { getShopify } = require('../config/shopify');
    singleton = createWebhookHandlers({
      shopsRepo: getShopsRepo(),
      productsRepo: getProductsRepo(),
      billingService: getBillingService(),
      sessionStorage: getShopify().config.sessionStorage,
    });
  }
  return singleton;
}

module.exports = { createWebhookHandlers, getWebhookHandlers };
