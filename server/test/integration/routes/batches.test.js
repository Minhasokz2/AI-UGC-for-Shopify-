const request = require('supertest');
const { buildTestApp } = require('../../helpers/buildTestApp');

const SHOP = 'test-shop.myshopify.com';

async function seedShop(db, overrides = {}) {
  await db.collection('shops').doc(SHOP).set({ shopDomain: SHOP, creditBalance: 100, plan: 'metered', addOns: {}, ...overrides });
}

describe('integration: /api/batches', () => {
  it('creates one job per item under a shared batch, charging the total up front', async () => {
    const { app, db } = buildTestApp();
    await seedShop(db);
    await db.collection('templates').doc('tpl-1').set({ category: 'scene', modelRole: 'default_scene', creditCost: 2 });

    const res = await request(app)
      .post('/api/batches')
      .set('Idempotency-Key', 'batch-1')
      .send({
        contentType: 'scene',
        templateId: 'tpl-1',
        items: [{ sourceImageUrl: 'https://cdn/1.png' }, { sourceImageUrl: 'https://cdn/2.png' }, { sourceImageUrl: 'https://cdn/3.png' }],
      });

    expect(res.status).toBe(201);
    expect(res.body.batch.totalCount).toBe(3);
    expect(res.body.jobs).toHaveLength(3);
    expect(res.body.jobs.every((j) => j.batchId === res.body.batch.id)).toBe(true);
  });

  it('returns 402 when the shop cannot afford the whole batch, and creates no jobs', async () => {
    const { app, db } = buildTestApp();
    await seedShop(db, { creditBalance: 3 });
    await db.collection('templates').doc('tpl-1').set({ category: 'scene', modelRole: 'default_scene', creditCost: 2 });

    const res = await request(app)
      .post('/api/batches')
      .set('Idempotency-Key', 'batch-2')
      .send({ contentType: 'scene', templateId: 'tpl-1', items: [{ sourceImageUrl: 'https://cdn/1.png' }, { sourceImageUrl: 'https://cdn/2.png' }] });

    expect(res.status).toBe(402);
    const jobs = await db.collection('jobs').get();
    expect(jobs.size).toBe(0);
  });

  it('returns 429 when the batch would exceed the per-shop concurrency cap', async () => {
    const { app, db } = buildTestApp();
    await seedShop(db, { creditBalance: 1000 });
    await db.collection('templates').doc('tpl-1').set({ category: 'scene', modelRole: 'default_scene', creditCost: 1 });
    for (let i = 0; i < 19; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await db.collection('jobs').doc(`active-${i}`).set({ shopDomain: SHOP, status: 'pending' });
    }

    const res = await request(app)
      .post('/api/batches')
      .set('Idempotency-Key', 'batch-3')
      .send({ contentType: 'scene', templateId: 'tpl-1', items: [{ sourceImageUrl: 'https://cdn/1.png' }, { sourceImageUrl: 'https://cdn/2.png' }] });

    expect(res.status).toBe(429);
  });

  it('GET /:batchId returns the batch and its jobs, scoped to the authenticated shop', async () => {
    const { app, db } = buildTestApp();
    await seedShop(db);
    await db.collection('batches').doc('batch-x').set({ shopDomain: SHOP, totalCount: 1, succeededCount: 0, failedCount: 0, status: 'pending' });
    await db.collection('jobs').doc('job-x').set({ shopDomain: SHOP, batchId: 'batch-x', status: 'pending' });

    const res = await request(app).get('/api/batches/batch-x');

    expect(res.status).toBe(200);
    expect(res.body.batch.id).toBe('batch-x');
    expect(res.body.jobs.map((j) => j.id)).toEqual(['job-x']);
  });

  it('GET /:batchId returns 404 for another shop\'s batch', async () => {
    const { app, db } = buildTestApp();
    await seedShop(db);
    await db.collection('batches').doc('batch-x').set({ shopDomain: 'other-shop.myshopify.com', totalCount: 1 });

    const res = await request(app).get('/api/batches/batch-x');

    expect(res.status).toBe(404);
  });
});
