const request = require('supertest');
const { buildTestApp, createFakeShopify } = require('../../helpers/buildTestApp');
const { CREDIT_PACKS } = require('../../../src/services/billingPacks');
const { PLAN_HANDLES } = require('../../../src/config/appPricingPlans');

const SHOP = 'test-shop.myshopify.com';
const APP_GID = 'gid://shopify/App/1';
const SHOP_GID = 'gid://shopify/Shop/1';

function graphqlHandlerForIds() {
  return async () => ({ data: { currentAppInstallation: { app: { id: APP_GID } }, shop: { id: SHOP_GID } } });
}

describe('integration: /api/billing', () => {
  it('GET /status reflects the shop doc, including googleVerified', async () => {
    const { app, db } = buildTestApp();
    await db.collection('shops').doc(SHOP).set({ shopDomain: SHOP, plan: 'metered', creditBalance: 42, lifetimeCreditsSpent: 10, lifetimeImagesGenerated: 5, googleVerified: true });

    const res = await request(app).get('/api/billing/status');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ plan: 'metered', creditBalance: 42, lifetimeCreditsSpent: 10, lifetimeImagesGenerated: 5, googleVerified: true, verifiedEmail: null });
  });

  it('GET /status reports googleVerified:false for a shop that has never signed in with Google', async () => {
    const { app, db } = buildTestApp();
    await db.collection('shops').doc(SHOP).set({ shopDomain: SHOP, plan: 'metered', creditBalance: 0, lifetimeCreditsSpent: 0, lifetimeImagesGenerated: 0 });

    const res = await request(app).get('/api/billing/status');

    expect(res.body.googleVerified).toBe(false);
  });

  it('GET /packs returns the pricing plans URL for the current shop, built from its domain and the app handle', async () => {
    const { app, db } = buildTestApp();
    await db.collection('shops').doc(SHOP).set({ shopDomain: SHOP });

    const res = await request(app).get('/api/billing/packs');

    expect(res.status).toBe(200);
    expect(res.body.pricingPlansUrl).toBe('https://admin.shopify.com/store/test-shop/charges/ai-ugc-gen-96a0b97f/pricing_plans');
    expect(res.body.packs).toEqual(CREDIT_PACKS);
  });

  describe('POST /confirm-app-pricing-plan', () => {
    it('grants a pack subscription\'s credits exactly once, verified via the Partner API', async () => {
      const growth = CREDIT_PACKS.find((p) => p.id === 'growth');
      const growthHandle = 'growth-monthly-handle';
      PLAN_HANDLES.growth.monthly = growthHandle;
      try {
        const shopify = createFakeShopify({ graphqlHandler: graphqlHandlerForIds() });
        const partnerApiClient = {
          getActiveSubscription: async () => ({
            currentBillingCycle: { startTime: '2026-01-01T00:00:00Z' },
            items: [{ handle: growthHandle }],
          }),
        };
        const { app, db } = buildTestApp({ shopify, partnerApiClient });
        await db.collection('shops').doc(SHOP).set({ shopDomain: SHOP, creditBalance: 0 });

        const first = await request(app).post('/api/billing/confirm-app-pricing-plan').send({ planHandle: growthHandle });
        const second = await request(app).post('/api/billing/confirm-app-pricing-plan').send({ planHandle: growthHandle });

        expect(first.status).toBe(200);
        expect(first.body).toEqual({ confirmed: true, granted: true });
        expect(second.body).toEqual({ confirmed: true, granted: false });

        const shop = (await db.collection('shops').doc(SHOP).get()).data();
        expect(shop.creditBalance).toBe(growth.monthlyCredits);
      } finally {
        PLAN_HANDLES.growth.monthly = null;
      }
    });

    it('activates the Unlimited plan once confirmed', async () => {
      const unlimitedHandle = 'unlimited-handle';
      PLAN_HANDLES.unlimited.monthly = unlimitedHandle;
      try {
        const shopify = createFakeShopify({ graphqlHandler: graphqlHandlerForIds() });
        const partnerApiClient = {
          getActiveSubscription: async () => ({
            currentBillingCycle: { startTime: '2026-01-01T00:00:00Z' },
            items: [{ handle: unlimitedHandle }],
          }),
        };
        const { app, db } = buildTestApp({ shopify, partnerApiClient });
        await db.collection('shops').doc(SHOP).set({ shopDomain: SHOP, plan: 'metered' });

        const res = await request(app).post('/api/billing/confirm-app-pricing-plan').send({ planHandle: unlimitedHandle });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ confirmed: true, plan: 'unlimited' });
        const shop = (await db.collection('shops').doc(SHOP).get()).data();
        expect(shop.plan).toBe('unlimited');
      } finally {
        PLAN_HANDLES.unlimited.monthly = null;
      }
    });

    it('reports confirmed:false — and grants nothing — when the Partner API shows no matching active subscription', async () => {
      const growthHandle = 'growth-monthly-handle';
      PLAN_HANDLES.growth.monthly = growthHandle;
      try {
        const shopify = createFakeShopify({ graphqlHandler: graphqlHandlerForIds() });
        const { app, db } = buildTestApp({ shopify, partnerApiClient: { getActiveSubscription: async () => null } });
        await db.collection('shops').doc(SHOP).set({ shopDomain: SHOP, creditBalance: 0 });

        const res = await request(app).post('/api/billing/confirm-app-pricing-plan').send({ planHandle: growthHandle });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ confirmed: false, reason: 'no_matching_active_subscription' });
        const shop = (await db.collection('shops').doc(SHOP).get()).data();
        expect(shop.creditBalance).toBe(0);
      } finally {
        PLAN_HANDLES.growth.monthly = null;
      }
    });
  });
});
