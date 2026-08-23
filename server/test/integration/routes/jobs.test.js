const request = require('supertest');
const { buildTestApp } = require('../../helpers/buildTestApp');
const { seedAllowedModels } = require('../../../src/services/allowedModelsSeedData');

const SHOP = 'test-shop.myshopify.com';

async function seedShop(db, overrides = {}) {
  await db.collection('shops').doc(SHOP).set({
    shopDomain: SHOP,
    creditBalance: 100,
    plan: 'metered',
    addOns: { imageOptimizer: false },
    ...overrides,
  });
}

describe('integration: /api/jobs', () => {
  describe('POST /api/jobs', () => {
    it('creates a job (201) and requires an Idempotency-Key header (400 without one)', async () => {
      const { app, db } = buildTestApp();
      await seedShop(db);
      await db.collection('templates').doc('tpl-1').set({ category: 'scene', modelRole: 'default_scene', creditCost: 3 });

      const missingKey = await request(app)
        .post('/api/jobs')
        .send({ contentType: 'scene', templateId: 'tpl-1', sourceImageUrl: 'https://cdn/raw.png' });
      expect(missingKey.status).toBe(400);

      const created = await request(app)
        .post('/api/jobs')
        .set('Idempotency-Key', 'idem-1')
        .send({ contentType: 'scene', templateId: 'tpl-1', sourceImageUrl: 'https://cdn/raw.png', numImages: 1 });
      expect(created.status).toBe(201);
      expect(created.body.job.templateId).toBe('tpl-1');
      expect(created.body.job.status).toBe('pending');
    });

    it('replays the SAME job (200, not a duplicate) for a repeated Idempotency-Key', async () => {
      const { app, db } = buildTestApp();
      await seedShop(db);
      await db.collection('templates').doc('tpl-1').set({ category: 'scene', modelRole: 'default_scene', creditCost: 3 });
      const body = { contentType: 'scene', templateId: 'tpl-1', sourceImageUrl: 'https://cdn/raw.png', numImages: 1 };

      const first = await request(app).post('/api/jobs').set('Idempotency-Key', 'idem-1').send(body);
      const second = await request(app).post('/api/jobs').set('Idempotency-Key', 'idem-1').send(body);

      expect(first.status).toBe(201);
      expect(second.status).toBe(200);
      expect(second.body.job.id).toBe(first.body.job.id);
      const allJobs = await db.collection('jobs').get();
      expect(allJobs.size).toBe(1);
    });

    it('returns 402 when the shop has insufficient credits', async () => {
      const { app, db } = buildTestApp();
      await seedShop(db, { creditBalance: 0 });
      await db.collection('templates').doc('tpl-1').set({ category: 'scene', modelRole: 'default_scene', creditCost: 3 });

      const res = await request(app)
        .post('/api/jobs')
        .set('Idempotency-Key', 'idem-2')
        .send({ contentType: 'scene', templateId: 'tpl-1', sourceImageUrl: 'https://cdn/raw.png' });

      expect(res.status).toBe(402);
      expect(res.body.error.code).toBe('INSUFFICIENT_CREDITS');
    });

    it('returns 429 when an unlimited-plan shop has already hit its fair-use cap for the month', async () => {
      const { UNLIMITED_PLAN } = require('../../../src/services/billingPacks');
      const { app, db } = buildTestApp();
      const monthUtc = new Date().toISOString().slice(0, 7);
      await seedShop(db, { plan: 'unlimited', unlimitedUsage: { month: monthUtc, creditsThisMonth: UNLIMITED_PLAN.fairUseCreditsPerMonth } });
      await db.collection('templates').doc('tpl-1').set({ category: 'scene', modelRole: 'default_scene', creditCost: 3 });

      const res = await request(app)
        .post('/api/jobs')
        .set('Idempotency-Key', 'idem-unlimited-1')
        .send({ contentType: 'scene', templateId: 'tpl-1', sourceImageUrl: 'https://cdn/raw.png' });

      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('QUOTA_EXCEEDED');
    });

    it('an unlimited-plan shop under its fair-use cap creates the job normally (201)', async () => {
      const { app, db } = buildTestApp();
      await seedShop(db, { plan: 'unlimited', creditBalance: 0 });
      await db.collection('templates').doc('tpl-1').set({ category: 'scene', modelRole: 'default_scene', creditCost: 3 });

      const res = await request(app)
        .post('/api/jobs')
        .set('Idempotency-Key', 'idem-unlimited-2')
        .send({ contentType: 'scene', templateId: 'tpl-1', sourceImageUrl: 'https://cdn/raw.png' });

      expect(res.status).toBe(201);
    });

    it('returns 422 for a ugc job whose persona is not an adult, before any credits are checked', async () => {
      const { app, db } = buildTestApp();
      await seedShop(db, { creditBalance: 0 }); // would also fail credits — persona must be checked first

      const res = await request(app)
        .post('/api/jobs')
        .set('Idempotency-Key', 'idem-3')
        .send({ contentType: 'ugc', sourceImageUrl: 'https://cdn/raw.png', personaAttributes: { ageRange: 'minor' } });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('PERSONA_NOT_ADULT');
    });

    it('returns 429 once the shop is at its concurrent-job cap', async () => {
      const { app, db } = buildTestApp();
      await seedShop(db, { creditBalance: 1000 });
      await db.collection('templates').doc('tpl-1').set({ category: 'scene', modelRole: 'default_scene', creditCost: 1 });
      for (let i = 0; i < 20; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await db.collection('jobs').doc(`active-${i}`).set({ shopDomain: SHOP, status: 'pending' });
      }

      const res = await request(app)
        .post('/api/jobs')
        .set('Idempotency-Key', 'idem-cap')
        .send({ contentType: 'scene', templateId: 'tpl-1', sourceImageUrl: 'https://cdn/raw.png' });

      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('CONCURRENCY_LIMIT');
    });

    it('returns 404 for a templateId that does not exist', async () => {
      const { app, db } = buildTestApp();
      await seedShop(db);

      const res = await request(app)
        .post('/api/jobs')
        .set('Idempotency-Key', 'idem-4')
        .send({ contentType: 'scene', templateId: 'missing-template', sourceImageUrl: 'https://cdn/raw.png' });

      expect(res.status).toBe(404);
    });

    it('returns 400 for a malformed body (zod validation)', async () => {
      const { app, db } = buildTestApp();
      await seedShop(db);

      const res = await request(app).post('/api/jobs').set('Idempotency-Key', 'idem-5').send({ contentType: 'not-a-real-type' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for a tryOn job missing personImageUrl/garmentImageUrl', async () => {
      const { app, db } = buildTestApp();
      await seedShop(db);

      const res = await request(app).post('/api/jobs').set('Idempotency-Key', 'idem-6').send({ contentType: 'tryOn', personImageUrl: 'https://cdn/person.png' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for a custom job with no modelId', async () => {
      const { app, db } = buildTestApp();
      await seedShop(db);

      const res = await request(app).post('/api/jobs').set('Idempotency-Key', 'idem-7').send({ contentType: 'custom', prompt: 'a cat' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for a template-less scene job with no sourceImageUrl and no reuseProcessedImageFrom', async () => {
      const { app, db } = buildTestApp();
      await seedShop(db);

      const res = await request(app).post('/api/jobs').set('Idempotency-Key', 'idem-8').send({ contentType: 'scene' });

      expect(res.status).toBe(400);
    });

    it('accepts a template-less scene job that reuses a prior job\'s processed image instead of a fresh sourceImageUrl', async () => {
      const { app, db } = buildTestApp();
      await seedShop(db, { creditBalance: 1000 });
      await seedAllowedModels({ db });
      await db.collection('jobs').doc('prior-job').set({ shopDomain: SHOP, status: 'succeeded', processedImageUrl: 'https://cdn/clean.png' });

      const res = await request(app)
        .post('/api/jobs')
        .set('Idempotency-Key', 'idem-9')
        .send({ contentType: 'scene', reuseProcessedImageFrom: 'prior-job' });

      expect(res.status).toBe(201);
    });

    it('persists a real modelId on an auto-routed (no templateId) job, so settlement can charge it — regression for jobs that used to settle with neither templateId nor modelId', async () => {
      const { app, db } = buildTestApp();
      await seedShop(db, { creditBalance: 1000 });
      await seedAllowedModels({ db });

      const res = await request(app)
        .post('/api/jobs')
        .set('Idempotency-Key', 'idem-ugc-modelid')
        .send({ contentType: 'ugc', sourceImageUrl: 'https://cdn/raw.png', personaAttributes: { ageRange: 'adult' } });

      expect(res.status).toBe(201);
      expect(res.body.job.modelId).toBeTruthy();
      expect(res.body.job.templateId).toBeUndefined();
      const model = await db.collection('allowed_models').doc(res.body.job.modelId).get();
      expect(model.exists).toBe(true);
    });

    it('persists a real video modelId (matching the chosen videoTier) on a Video Studio job', async () => {
      const { app, db } = buildTestApp();
      await seedShop(db, { creditBalance: 1000 });
      await seedAllowedModels({ db });

      const res = await request(app)
        .post('/api/jobs')
        .set('Idempotency-Key', 'idem-video-modelid')
        .send({ contentType: 'video', sourceImageUrl: 'https://cdn/raw.png', videoTier: 'fast', prompt: 'slow pan' });

      expect(res.status).toBe(201);
      expect(res.body.job.modelId).toBeTruthy();
      const model = await db.collection('allowed_models').doc(res.body.job.modelId).get();
      expect(model.exists).toBe(true);
      expect(model.data().category).toBe('video');
    });

    it('a templateId-based job does NOT also get a modelId written — the template\'s own creditCost stays the settlement lookup key', async () => {
      const { app, db } = buildTestApp();
      await seedShop(db, { creditBalance: 1000 });
      await db.collection('templates').doc('tpl-1').set({ category: 'scene', modelRole: 'default_scene', creditCost: 3 });

      const res = await request(app)
        .post('/api/jobs')
        .set('Idempotency-Key', 'idem-template-no-modelid')
        .send({ contentType: 'scene', templateId: 'tpl-1', sourceImageUrl: 'https://cdn/raw.png' });

      expect(res.status).toBe(201);
      expect(res.body.job.templateId).toBe('tpl-1');
      expect(res.body.job.modelId).toBeUndefined();
    });
  });

  describe('GET /api/jobs and GET /api/jobs/:jobId', () => {
    it('lists only the authenticated shop\'s jobs', async () => {
      const { app, db } = buildTestApp();
      await seedShop(db);
      await db.collection('jobs').doc('mine').set({ shopDomain: SHOP, status: 'succeeded', createdAt: null });
      await db.collection('jobs').doc('theirs').set({ shopDomain: 'other-shop.myshopify.com', status: 'succeeded', createdAt: null });

      const res = await request(app).get('/api/jobs');

      expect(res.status).toBe(200);
      expect(res.body.jobs.map((j) => j.id)).toEqual(['mine']);
    });

    it('returns 404 for a job belonging to a different shop', async () => {
      const { app, db } = buildTestApp();
      await seedShop(db);
      await db.collection('jobs').doc('theirs').set({ shopDomain: 'other-shop.myshopify.com', status: 'succeeded' });

      const res = await request(app).get('/api/jobs/theirs');

      expect(res.status).toBe(404);
    });

    it('returns the job for its owning shop', async () => {
      const { app, db } = buildTestApp();
      await seedShop(db);
      await db.collection('jobs').doc('mine').set({ shopDomain: SHOP, status: 'succeeded' });

      const res = await request(app).get('/api/jobs/mine');

      expect(res.status).toBe(200);
      expect(res.body.job.id).toBe('mine');
    });
  });
});
