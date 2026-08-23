const request = require('supertest');
const { buildTestApp, createFakeShopify } = require('../../helpers/buildTestApp');
const { seedAllowedModels } = require('../../../src/services/allowedModelsSeedData');

const SHOP = 'test-shop.myshopify.com';

async function seedShop(db, overrides = {}) {
  await db.collection('shops').doc(SHOP).set({ shopDomain: SHOP, creditBalance: 100, plan: 'metered', addOns: { imageOptimizer: false }, ...overrides });
}

describe('integration: misc authenticated routes', () => {
  it('GET /api/templates and GET /api/models list the shared catalogs', async () => {
    const { app, db } = buildTestApp();
    await seedShop(db);
    await db.collection('templates').doc('tpl-1').set({ category: 'scene', modelRole: 'default_scene', creditCost: 1 });
    await seedAllowedModels({ db });

    const templates = await request(app).get('/api/templates');
    const models = await request(app).get('/api/models');

    expect(templates.status).toBe(200);
    expect(templates.body.templates).toHaveLength(1);
    expect(models.status).toBe(200);
    expect(models.body.models.length).toBeGreaterThan(0);
    expect(models.body.models[0]).toHaveProperty('imageCountConstraint');
  });

  it('POST /api/uploads uploads via cloudinaryService and returns {url, publicId}', async () => {
    const cloudinaryService = { uploadImage: vi.fn().mockResolvedValue({ url: 'https://res.cloudinary.com/x.png', publicId: 'x' }) };
    const { app, db } = buildTestApp({ cloudinaryService });
    await seedShop(db);

    const res = await request(app).post('/api/uploads').send({ image: 'data:image/png;base64,AAAA' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ url: 'https://res.cloudinary.com/x.png', publicId: 'x' });
    expect(cloudinaryService.uploadImage).toHaveBeenCalledWith('data:image/png;base64,AAAA');
  });

  it('GET/PUT /api/brand-settings round-trips the shop\'s brand style profile', async () => {
    const { app, db } = buildTestApp();
    await seedShop(db);

    const before = await request(app).get('/api/brand-settings');
    expect(before.body.brandStyleProfile).toBeNull();

    const put = await request(app).put('/api/brand-settings').send({ brandStyleProfile: { colors: ['#123456'], tone: 'bold' } });
    expect(put.status).toBe(200);

    const after = await request(app).get('/api/brand-settings');
    expect(after.body.brandStyleProfile).toEqual({ colors: ['#123456'], tone: 'bold' });
  });

  it('POST /api/brand-settings/extract calls brandStyle.extractBrandStyle and persists the result', async () => {
    const brandStyle = { extractBrandStyle: vi.fn().mockResolvedValue({ colors: ['#000000'], tone: 'minimalist' }) };
    const { app, db } = buildTestApp({ brandStyle });
    await seedShop(db);

    const res = await request(app).post('/api/brand-settings/extract').send({ imageUrls: ['https://cdn/1.png'] });

    expect(res.status).toBe(200);
    expect(res.body.brandStyleProfile).toEqual({ colors: ['#000000'], tone: 'minimalist' });
    const shop = (await db.collection('shops').doc(SHOP).get()).data();
    expect(shop.brandStyleProfile).toEqual({ colors: ['#000000'], tone: 'minimalist' });
  });

  it('GET /api/referrals mints a code on first call and is stable on a second call', async () => {
    const { app, db } = buildTestApp();
    await seedShop(db);

    const first = await request(app).get('/api/referrals');
    const second = await request(app).get('/api/referrals');

    expect(first.status).toBe(200);
    expect(first.body.code).toMatch(/^[A-Z0-9]{8}$/);
    expect(second.body.code).toBe(first.body.code);
    expect(second.body.referrals).toEqual([]);
  });

  it('POST /api/referrals/apply attributes the requesting shop to the code\'s owner', async () => {
    const { app, db } = buildTestApp();
    await seedShop(db);
    await db.collection('shops').doc('referrer-shop.myshopify.com').set({ shopDomain: 'referrer-shop.myshopify.com', referralCode: 'ABCDEFGH' });

    const res = await request(app).post('/api/referrals/apply').send({ code: 'ABCDEFGH' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ applied: true, referral: expect.objectContaining({ referrerShopDomain: 'referrer-shop.myshopify.com', referredShopDomain: SHOP }) });
  });

  it('POST /api/referrals/apply returns { applied: false, reason: "unknown_code" } for a code that matches no shop', async () => {
    const { app, db } = buildTestApp();
    await seedShop(db);

    const res = await request(app).post('/api/referrals/apply').send({ code: 'NOPE0000' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ applied: false, reason: 'unknown_code' });
  });

  it('POST /api/image-optimizer requires an Idempotency-Key header (400 without one)', async () => {
    const { app, db } = buildTestApp();
    await seedShop(db);

    const res = await request(app)
      .post('/api/image-optimizer')
      .send({ shopifyProductId: 'gid://shopify/Product/1', imageUrl: 'https://cdn/raw.png', operation: 'upscale_budget' });

    expect(res.status).toBe(400);
  });

  it('POST /api/image-optimizer requests an optimization job, respecting the daily quota', async () => {
    const { app, db } = buildTestApp();
    await seedShop(db);

    const res = await request(app)
      .post('/api/image-optimizer')
      .set('Idempotency-Key', 'idem-1')
      .send({ shopifyProductId: 'gid://shopify/Product/1', imageUrl: 'https://cdn/raw.png', operation: 'upscale_budget' });

    expect(res.status).toBe(201);
    expect(res.body.job.operation).toBe('upscale_budget');

    const list = await request(app).get('/api/image-optimizer');
    expect(list.body.jobs).toHaveLength(1);
  });

  it('POST /api/image-optimizer replays the SAME job (201, not a duplicate) for a repeated Idempotency-Key, without consuming a second unit of quota', async () => {
    const { app, db } = buildTestApp();
    await seedShop(db);
    const body = { shopifyProductId: 'gid://shopify/Product/1', imageUrl: 'https://cdn/raw.png', operation: 'upscale_budget' };

    const first = await request(app).post('/api/image-optimizer').set('Idempotency-Key', 'idem-1').send(body);
    const second = await request(app).post('/api/image-optimizer').set('Idempotency-Key', 'idem-1').send(body);

    expect(first.body.job.id).toBe(second.body.job.id);
    const usage = (await db.collection('image_optimizer_usage').doc(SHOP).get()).data();
    expect(usage.countToday).toBe(1);
  });

  it('POST /api/image-optimizer returns 429 once the free daily quota is exhausted', async () => {
    const { app, db } = buildTestApp();
    await seedShop(db);
    await db.collection('image_optimizer_usage').doc(SHOP).set({ date: new Date().toISOString().slice(0, 10), countToday: 10 });

    const res = await request(app)
      .post('/api/image-optimizer')
      .set('Idempotency-Key', 'idem-1')
      .send({ shopifyProductId: 'gid://shopify/Product/1', imageUrl: 'https://cdn/raw.png', operation: 'retouch' });

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('QUOTA_EXCEEDED');
  });

  it('POST /api/products/sync pages through Shopify and upserts the catalog cache', async () => {
    const shopify = createFakeShopify({
      graphqlHandler: async () => ({
        data: {
          products: {
            nodes: [{ id: 'gid://shopify/Product/1', title: 'Widget', productType: 'Gadgets', images: { nodes: [{ url: 'https://cdn/w.png' }] } }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }),
    });
    const { app, db } = buildTestApp({ shopify });
    await seedShop(db);

    const sync = await request(app).post('/api/products/sync');
    expect(sync.status).toBe(200);
    expect(sync.body.syncedCount).toBe(1);

    const list = await request(app).get('/api/products');
    expect(list.body.products).toHaveLength(1);
    expect(list.body.products[0].title).toBe('Widget');
    const stored = await db.collection('products').get();
    expect(stored.size).toBe(1);
  });

  it('GET /api/usage-stats reflects the shop doc and recent transactions', async () => {
    const { app, db } = buildTestApp();
    await seedShop(db, { lifetimeCreditsSpent: 5, lifetimeImagesGenerated: 2 });
    await db.collection('transactions').doc('t1').set({ shopDomain: SHOP, type: 'debit', amount: 5, createdAt: null });

    const res = await request(app).get('/api/usage-stats');

    expect(res.status).toBe(200);
    expect(res.body.lifetimeCreditsSpent).toBe(5);
    expect(res.body.recentTransactions).toHaveLength(1);
  });
});

describe('integration: Google Sign-In popup flow', () => {
  it('POST /api/auth/google-prepare mints a state and returns a popupUrl', async () => {
    const { app, db } = buildTestApp();
    await seedShop(db);

    const res = await request(app).post('/api/auth/google-prepare');

    expect(res.status).toBe(200);
    expect(res.body.popupUrl).toMatch(/^\/api\/auth\/google\/start\?state=/);
  });

  it('GET /api/auth/google/start redirects to the Google consent URL with state forwarded', async () => {
    const { app } = buildTestApp();

    const res = await request(app).get('/api/auth/google/start').query({ state: 'abc123' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('state=abc123');
  });

  it('the full popup round-trip grants the trial and posts a success message back', async () => {
    const googleAuth = {
      exchangeCodeForProfile: vi.fn().mockResolvedValue({ email: 'merchant@example.com', emailVerified: true }),
    };
    const { app, db } = buildTestApp({ googleAuth });
    await seedShop(db, { creditBalance: 0, googleVerified: false });

    const prepare = await request(app).post('/api/auth/google-prepare');
    const state = new URL(prepare.body.popupUrl, 'https://x').searchParams.get('state');

    const callback = await request(app).get('/api/auth/google/callback').query({ code: 'auth-code', state });

    expect(callback.status).toBe(200);
    expect(callback.text).toContain('type: "success"');
    const shop = (await db.collection('shops').doc(SHOP).get()).data();
    expect(shop.googleVerified).toBe(true);
    expect(shop.creditBalance).toBeGreaterThan(0);
  });

  it('the callback posts an error message for an invalid/expired state', async () => {
    const { app } = buildTestApp();

    const res = await request(app).get('/api/auth/google/callback').query({ code: 'auth-code', state: 'never-issued' });

    expect(res.status).toBe(200);
    expect(res.text).toContain("type: \"error\"");
  });

  it('POST /api/auth/google-sign-out clears googleVerified/verifiedEmail but never trialEligibilityLocked, so the trial can\'t be re-granted', async () => {
    const { app, db } = buildTestApp();
    await seedShop(db, { googleVerified: true, verifiedEmail: 'merchant@example.com', trialEligibilityLocked: true, creditBalance: 10 });

    const res = await request(app).post('/api/auth/google-sign-out');

    expect(res.status).toBe(204);
    const shop = (await db.collection('shops').doc(SHOP).get()).data();
    expect(shop.googleVerified).toBe(false);
    expect(shop.verifiedEmail).toBe(null);
    expect(shop.trialEligibilityLocked).toBe(true);
    expect(shop.creditBalance).toBe(10);
  });
});
