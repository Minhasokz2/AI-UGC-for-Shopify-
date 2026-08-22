const request = require('supertest');
const { buildTestApp } = require('../../helpers/buildTestApp');
const { env } = require('../../../src/config/env');

const SHOP = 'test-shop.myshopify.com';

describe('integration: webhooks', () => {
  it('APP_UNINSTALLED marks the shop uninstalled', async () => {
    const { app, db } = buildTestApp();
    await db.collection('shops').doc(SHOP).set({ shopDomain: SHOP, uninstalledAt: null });

    const res = await request(app)
      .post(env.SHOPIFY_WEBHOOK_PATH)
      .set('x-shopify-topic', 'APP_UNINSTALLED')
      .set('x-shopify-shop-domain', SHOP)
      .send({});

    expect(res.status).toBe(200);
    const shop = (await db.collection('shops').doc(SHOP).get()).data();
    expect(shop.uninstalledAt).not.toBeNull();
  });

  it('SHOP_REDACT deletes the cached product catalog and clears PII fields', async () => {
    const { app, db } = buildTestApp();
    await db.collection('shops').doc(SHOP).set({ shopDomain: SHOP, verifiedEmail: 'merchant@example.com', brandStyleProfile: { colors: ['#fff'], tone: 'x' } });
    await db.collection('products').doc(`${SHOP}:1`).set({ shopDomain: SHOP, shopifyProductId: '1', title: 'Widget' });

    const res = await request(app)
      .post(env.SHOPIFY_WEBHOOK_PATH)
      .set('x-shopify-topic', 'SHOP_REDACT')
      .set('x-shopify-shop-domain', SHOP)
      .send({});

    expect(res.status).toBe(200);
    const shop = (await db.collection('shops').doc(SHOP).get()).data();
    expect(shop.verifiedEmail).toBeNull();
    expect(shop.brandStyleProfile).toBeNull();
    const products = await db.collection('products').get();
    expect(products.size).toBe(0);
  });

  it('CUSTOMERS_REDACT and CUSTOMERS_DATA_REQUEST both return 200 as no-ops', async () => {
    const { app } = buildTestApp();

    const redact = await request(app)
      .post(env.SHOPIFY_WEBHOOK_PATH)
      .set('x-shopify-topic', 'CUSTOMERS_REDACT')
      .set('x-shopify-shop-domain', SHOP)
      .send({});
    const dataRequest = await request(app)
      .post(env.SHOPIFY_WEBHOOK_PATH)
      .set('x-shopify-topic', 'CUSTOMERS_DATA_REQUEST')
      .set('x-shopify-shop-domain', SHOP)
      .send({});

    expect(redact.status).toBe(200);
    expect(dataRequest.status).toBe(200);
  });

  it('returns 404 for an unregistered topic', async () => {
    const { app } = buildTestApp();

    const res = await request(app)
      .post(env.SHOPIFY_WEBHOOK_PATH)
      .set('x-shopify-topic', 'NOT_A_REAL_TOPIC')
      .set('x-shopify-shop-domain', SHOP)
      .send({});

    expect(res.status).toBe(404);
  });
});
