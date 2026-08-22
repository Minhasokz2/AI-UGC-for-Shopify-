const request = require('supertest');
const { buildTestApp, createFakeShopify } = require('../../helpers/buildTestApp');
const { CREDIT_PACKS, UNLIMITED_PLAN } = require('../../../src/services/billingPacks');

const SHOP = 'test-shop.myshopify.com';

describe('integration: /api/billing', () => {
  it('GET /status reflects the shop doc', async () => {
    const { app, db } = buildTestApp();
    await db.collection('shops').doc(SHOP).set({ shopDomain: SHOP, plan: 'metered', creditBalance: 42, lifetimeCreditsSpent: 10, lifetimeImagesGenerated: 5 });

    const res = await request(app).get('/api/billing/status');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ plan: 'metered', creditBalance: 42, lifetimeCreditsSpent: 10, lifetimeImagesGenerated: 5 });
  });

  it('GET /custom-purchase/preview computes credits via the shared billingPacks formula', async () => {
    const { app, db } = buildTestApp();
    await db.collection('shops').doc(SHOP).set({ shopDomain: SHOP });

    const res = await request(app).get('/api/billing/custom-purchase/preview').query({ amountCents: 1900 });

    expect(res.status).toBe(200);
    expect(res.body.credits).toBe(200); // same rate as the Starter pack (19.00 / 200 credits)
  });

  it('POST /subscribe creates an appSubscriptionCreate charge and returns its confirmationUrl', async () => {
    const shopify = createFakeShopify({
      graphqlHandler: async () => ({
        data: {
          appSubscriptionCreate: {
            appSubscription: { id: 'gid://shopify/AppSubscription/1' },
            confirmationUrl: 'https://admin.shopify.com/confirm/1',
            userErrors: [],
          },
        },
      }),
    });
    const { app, db } = buildTestApp({ shopify });
    await db.collection('shops').doc(SHOP).set({ shopDomain: SHOP });

    const res = await request(app).post('/api/billing/subscribe').send({ packId: 'growth', period: 'monthly' });

    expect(res.status).toBe(200);
    expect(res.body.confirmationUrl).toBe('https://admin.shopify.com/confirm/1');
  });

  it('POST /confirm grants a pack subscription\'s credits exactly once', async () => {
    const growth = CREDIT_PACKS.find((p) => p.id === 'growth');
    const shopify = createFakeShopify({
      graphqlHandler: async () => ({
        data: { node: { id: 'gid://shopify/AppSubscription/1', name: `MotionArt ${growth.label} (Monthly)`, status: 'ACTIVE' } },
      }),
    });
    const { app, db } = buildTestApp({ shopify });
    await db.collection('shops').doc(SHOP).set({ shopDomain: SHOP, creditBalance: 0 });

    const first = await request(app).post('/api/billing/confirm').send({ chargeId: 'gid://shopify/AppSubscription/1' });
    const second = await request(app).post('/api/billing/confirm').send({ chargeId: 'gid://shopify/AppSubscription/1' });

    expect(first.status).toBe(200);
    expect(first.body).toEqual({ confirmed: true, granted: true });
    expect(second.body).toEqual({ confirmed: true, granted: false });

    const shop = (await db.collection('shops').doc(SHOP).get()).data();
    expect(shop.creditBalance).toBe(growth.monthlyCredits);
  });

  it('POST /confirm activates the Unlimited plan', async () => {
    const shopify = createFakeShopify({
      graphqlHandler: async () => ({
        data: { node: { id: 'gid://shopify/AppSubscription/2', name: `MotionArt ${UNLIMITED_PLAN.label}`, status: 'ACTIVE' } },
      }),
    });
    const { app, db } = buildTestApp({ shopify });
    await db.collection('shops').doc(SHOP).set({ shopDomain: SHOP, plan: 'metered' });

    const res = await request(app).post('/api/billing/confirm').send({ chargeId: 'gid://shopify/AppSubscription/2' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ confirmed: true, plan: 'unlimited' });
    const shop = (await db.collection('shops').doc(SHOP).get()).data();
    expect(shop.plan).toBe('unlimited');
  });

  it('POST /confirm reports confirmed:false for a charge that is not yet ACTIVE', async () => {
    const shopify = createFakeShopify({
      graphqlHandler: async () => ({ data: { node: { id: 'gid://shopify/AppSubscription/3', name: 'MotionArt Growth (Monthly)', status: 'PENDING' } } }),
    });
    const { app, db } = buildTestApp({ shopify });
    await db.collection('shops').doc(SHOP).set({ shopDomain: SHOP });

    const res = await request(app).post('/api/billing/confirm').send({ chargeId: 'gid://shopify/AppSubscription/3' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ confirmed: false, status: 'PENDING' });
  });
});
