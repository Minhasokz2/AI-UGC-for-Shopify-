const request = require('supertest');
const { buildTestApp } = require('../../helpers/buildTestApp');
const { env } = require('../../../src/config/env');

function withAdminKey(req) {
  return req.set('x-admin-api-key', env.ADMIN_API_KEY);
}

describe('integration: /admin/api', () => {
  it('rejects every /admin/api route without the admin key (401)', async () => {
    const { app } = buildTestApp();
    const res = await request(app).get('/admin/api/templates');
    expect(res.status).toBe(401);
  });

  it('CRUDs templates', async () => {
    const { app } = buildTestApp();

    const create = await withAdminKey(request(app).put('/admin/api/templates/tpl-1')).send({
      category: 'scene',
      modelRole: 'default_scene',
      creditCost: 2,
      label: 'Studio Shot',
    });
    expect(create.status).toBe(200);
    expect(create.body.template.label).toBe('Studio Shot');

    const list = await withAdminKey(request(app).get('/admin/api/templates'));
    expect(list.body.templates).toHaveLength(1);

    const get = await withAdminKey(request(app).get('/admin/api/templates/tpl-1'));
    expect(get.status).toBe(200);

    const del = await withAdminKey(request(app).delete('/admin/api/templates/tpl-1'));
    expect(del.status).toBe(204);

    const getAfterDelete = await withAdminKey(request(app).get('/admin/api/templates/tpl-1'));
    expect(getAfterDelete.status).toBe(404);
  });

  it('seeds the allowed-models catalog and is idempotent on a second call', async () => {
    const { app } = buildTestApp();

    const first = await withAdminKey(request(app).post('/admin/api/seed-models'));
    expect(first.status).toBe(200);
    expect(first.body.created).toBeGreaterThan(0);
    expect(first.body.skipped).toBe(0);

    const second = await withAdminKey(request(app).post('/admin/api/seed-models'));
    expect(second.body.created).toBe(0);
    expect(second.body.skipped).toBe(first.body.created);
  });

  it('exposes pricing config and per-model margin data', async () => {
    const { app } = buildTestApp();
    await withAdminKey(request(app).post('/admin/api/seed-models'));

    const pricing = await withAdminKey(request(app).get('/admin/api/pricing-config'));
    expect(pricing.status).toBe(200);
    expect(pricing.body.packs[0]).toHaveProperty('monthlyRevenuePerCreditCents');

    const margin = await withAdminKey(request(app).get('/admin/api/margin/model-costs'));
    expect(margin.status).toBe(200);
    expect(margin.body.models.length).toBeGreaterThan(0);
    expect(margin.body.models[0]).toHaveProperty('actualCostUsd');
  });

  it('runs the billing and nurture sweeps on demand', async () => {
    const { app } = buildTestApp();

    const billing = await withAdminKey(request(app).post('/admin/api/sweep/billing'));
    const nurture = await withAdminKey(request(app).post('/admin/api/sweep/nurture'));

    expect(billing.status).toBe(200);
    expect(billing.body.results).toEqual([]);
    expect(nurture.status).toBe(200);
    expect(nurture.body.results).toEqual([]);
  });

  it('lists installed shops and lets an operator adjust a shop\'s credit balance', async () => {
    const { app, db } = buildTestApp();
    await db.collection('shops').doc('admin-test.myshopify.com').set({
      shopDomain: 'admin-test.myshopify.com',
      creditBalance: 10,
      plan: 'metered',
      verifiedEmail: 'admin@example.com',
      uninstalledAt: null,
    });

    const list = await withAdminKey(request(app).get('/admin/api/shops'));
    expect(list.status).toBe(200);
    expect(list.body.shops).toEqual([
      { shopDomain: 'admin-test.myshopify.com', plan: 'metered', creditBalance: 10, verifiedEmail: 'admin@example.com' },
    ]);

    const grant = await withAdminKey(request(app).post('/admin/api/shops/admin-test.myshopify.com/credits')).send({ amount: 100 });
    expect(grant.status).toBe(200);
    expect(grant.body).toEqual({ shopDomain: 'admin-test.myshopify.com', creditBalance: 110 });

    const missing = await withAdminKey(request(app).post('/admin/api/shops/no-such-shop.myshopify.com/credits')).send({ amount: 100 });
    expect(missing.status).toBe(404);

    const invalid = await withAdminKey(request(app).post('/admin/api/shops/admin-test.myshopify.com/credits')).send({ amount: 0 });
    expect(invalid.status).toBe(400);
  });

  it('returns its own 404 for an unmatched /admin/api path, rather than falling through to the admin SPA', async () => {
    const { app } = buildTestApp();
    const res = await withAdminKey(request(app).get('/admin/api/not-a-real-route'));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
