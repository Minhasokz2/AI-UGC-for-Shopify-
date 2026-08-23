const { DeliveryMethod } = require('@shopify/shopify-api');
const { createWebhookHandlers } = require('../../../src/services/webhookHandlers');
const { env } = require('../../../src/config/env');

function makeDeps({ sessions = [], shop = {} } = {}) {
  return {
    shopsRepo: {
      markUninstalled: vi.fn().mockResolvedValue(undefined),
      updateShop: vi.fn().mockResolvedValue(undefined),
      getShop: vi.fn().mockResolvedValue(shop),
    },
    productsRepo: { deleteAllForShop: vi.fn().mockResolvedValue(undefined) },
    sessionStorage: {
      findSessionsByShop: vi.fn().mockResolvedValue(sessions),
      deleteSessions: vi.fn().mockResolvedValue(undefined),
    },
    billingService: { deactivateUnlimitedPlan: vi.fn().mockResolvedValue(undefined) },
  };
}

describe('services/webhookHandlers', () => {
  it('registers all four GDPR-mandatory topics plus APP_SUBSCRIPTIONS_UPDATE as Http handlers on the configured webhook path', () => {
    const handlers = createWebhookHandlers(makeDeps());

    for (const topic of ['APP_UNINSTALLED', 'SHOP_REDACT', 'CUSTOMERS_REDACT', 'CUSTOMERS_DATA_REQUEST', 'APP_SUBSCRIPTIONS_UPDATE']) {
      expect(handlers[topic].deliveryMethod).toBe(DeliveryMethod.Http);
      expect(handlers[topic].callbackUrl).toBe(env.SHOPIFY_WEBHOOK_PATH);
      expect(typeof handlers[topic].callback).toBe('function');
    }
  });

  it('APP_UNINSTALLED marks the shop uninstalled', async () => {
    const deps = makeDeps();
    const handlers = createWebhookHandlers(deps);

    await handlers.APP_UNINSTALLED.callback('app/uninstalled', 'shop-a.myshopify.com', '{}', 'wh-1', '2026-07');

    expect(deps.shopsRepo.markUninstalled).toHaveBeenCalledWith('shop-a.myshopify.com');
  });

  it('APP_UNINSTALLED deletes the shop\'s stored session(s) — a reinstall must get a fresh token exchange, never a reused stale-scope session', async () => {
    const deps = makeDeps({ sessions: [{ id: 'offline_shop-a.myshopify.com' }, { id: 'shop-a.myshopify.com_user123' }] });
    const handlers = createWebhookHandlers(deps);

    await handlers.APP_UNINSTALLED.callback('app/uninstalled', 'shop-a.myshopify.com', '{}', 'wh-1', '2026-07');

    expect(deps.sessionStorage.findSessionsByShop).toHaveBeenCalledWith('shop-a.myshopify.com');
    expect(deps.sessionStorage.deleteSessions).toHaveBeenCalledWith(['offline_shop-a.myshopify.com', 'shop-a.myshopify.com_user123']);
  });

  it('APP_UNINSTALLED skips deleteSessions when the shop has no stored session', async () => {
    const deps = makeDeps({ sessions: [] });
    const handlers = createWebhookHandlers(deps);

    await handlers.APP_UNINSTALLED.callback('app/uninstalled', 'shop-a.myshopify.com', '{}', 'wh-1', '2026-07');

    expect(deps.sessionStorage.deleteSessions).not.toHaveBeenCalled();
  });

  it('SHOP_REDACT deletes the cached product catalog and clears PII fields on the shop doc', async () => {
    const deps = makeDeps();
    const handlers = createWebhookHandlers(deps);

    await handlers.SHOP_REDACT.callback('shop/redact', 'shop-a.myshopify.com', '{}', 'wh-2', '2026-07');

    expect(deps.productsRepo.deleteAllForShop).toHaveBeenCalledWith('shop-a.myshopify.com');
    expect(deps.shopsRepo.updateShop).toHaveBeenCalledWith('shop-a.myshopify.com', { verifiedEmail: null, brandStyleProfile: null });
  });

  it('CUSTOMERS_REDACT and CUSTOMERS_DATA_REQUEST resolve without touching any repo (no per-customer data stored)', async () => {
    const deps = makeDeps();
    const handlers = createWebhookHandlers(deps);

    await handlers.CUSTOMERS_REDACT.callback('customers/redact', 'shop-a.myshopify.com', '{}', 'wh-3', '2026-07');
    await handlers.CUSTOMERS_DATA_REQUEST.callback('customers/data_request', 'shop-a.myshopify.com', '{}', 'wh-4', '2026-07');

    expect(deps.shopsRepo.markUninstalled).not.toHaveBeenCalled();
    expect(deps.shopsRepo.updateShop).not.toHaveBeenCalled();
    expect(deps.productsRepo.deleteAllForShop).not.toHaveBeenCalled();
  });

  describe('APP_SUBSCRIPTIONS_UPDATE', () => {
    const body = (status) => JSON.stringify({ app_subscription: { admin_graphql_api_id: 'gid://shopify/AppSubscription/9', status } });

    it('deactivates the Unlimited plan when its own current subscription is cancelled', async () => {
      const deps = makeDeps({ shop: { plan: 'unlimited', unlimitedSubscriptionId: 'gid://shopify/AppSubscription/9' } });
      const handlers = createWebhookHandlers(deps);

      await handlers.APP_SUBSCRIPTIONS_UPDATE.callback('app_subscriptions/update', 'shop-a.myshopify.com', body('CANCELLED'), 'wh-5', '2026-07');

      expect(deps.billingService.deactivateUnlimitedPlan).toHaveBeenCalledWith('shop-a.myshopify.com');
    });

    it.each(['EXPIRED', 'FROZEN', 'DECLINED'])('also deactivates on a %s status', async (status) => {
      const deps = makeDeps({ shop: { plan: 'unlimited', unlimitedSubscriptionId: 'gid://shopify/AppSubscription/9' } });
      const handlers = createWebhookHandlers(deps);

      await handlers.APP_SUBSCRIPTIONS_UPDATE.callback('app_subscriptions/update', 'shop-a.myshopify.com', body(status), 'wh-5', '2026-07');

      expect(deps.billingService.deactivateUnlimitedPlan).toHaveBeenCalled();
    });

    it('does nothing for an ACTIVE status transition (e.g. initial activation)', async () => {
      const deps = makeDeps({ shop: { plan: 'metered' } });
      const handlers = createWebhookHandlers(deps);

      await handlers.APP_SUBSCRIPTIONS_UPDATE.callback('app_subscriptions/update', 'shop-a.myshopify.com', body('ACTIVE'), 'wh-5', '2026-07');

      expect(deps.billingService.deactivateUnlimitedPlan).not.toHaveBeenCalled();
    });

    it('does nothing when the shop is not currently on the Unlimited plan', async () => {
      const deps = makeDeps({ shop: { plan: 'metered' } });
      const handlers = createWebhookHandlers(deps);

      await handlers.APP_SUBSCRIPTIONS_UPDATE.callback('app_subscriptions/update', 'shop-a.myshopify.com', body('CANCELLED'), 'wh-5', '2026-07');

      expect(deps.billingService.deactivateUnlimitedPlan).not.toHaveBeenCalled();
    });

    it('does nothing when the event is for a DIFFERENT, already-superseded subscription id', async () => {
      const deps = makeDeps({ shop: { plan: 'unlimited', unlimitedSubscriptionId: 'gid://shopify/AppSubscription/NEW' } });
      const handlers = createWebhookHandlers(deps);

      await handlers.APP_SUBSCRIPTIONS_UPDATE.callback('app_subscriptions/update', 'shop-a.myshopify.com', body('CANCELLED'), 'wh-5', '2026-07');

      expect(deps.billingService.deactivateUnlimitedPlan).not.toHaveBeenCalled();
    });
  });
});
