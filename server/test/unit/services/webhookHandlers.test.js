const { DeliveryMethod } = require('@shopify/shopify-api');
const { createWebhookHandlers } = require('../../../src/services/webhookHandlers');
const { env } = require('../../../src/config/env');

function makeDeps() {
  return {
    shopsRepo: { markUninstalled: vi.fn().mockResolvedValue(undefined), updateShop: vi.fn().mockResolvedValue(undefined) },
    productsRepo: { deleteAllForShop: vi.fn().mockResolvedValue(undefined) },
  };
}

describe('services/webhookHandlers', () => {
  it('registers all four GDPR-mandatory topics as Http handlers on the configured webhook path', () => {
    const handlers = createWebhookHandlers(makeDeps());

    for (const topic of ['APP_UNINSTALLED', 'SHOP_REDACT', 'CUSTOMERS_REDACT', 'CUSTOMERS_DATA_REQUEST']) {
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
});
