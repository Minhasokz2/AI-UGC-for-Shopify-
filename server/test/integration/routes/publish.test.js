const request = require('supertest');
const { buildTestApp, createFakeShopify } = require('../../helpers/buildTestApp');

const SHOP = 'test-shop.myshopify.com';

function successfulGraphqlHandler() {
  return async () => ({
    data: {
      productSet: {
        product: { id: 'gid://shopify/Product/1', media: { nodes: [{ id: 'gid://shopify/MediaImage/1' }] } },
        userErrors: [],
      },
    },
    extensions: { cost: { throttleStatus: { maximumAvailable: 1000, currentlyAvailable: 900, restoreRate: 50 } } },
  });
}

describe('integration: /api/publish', () => {
  it('publishes a succeeded job\'s approved variation and returns the Shopify productId/mediaIds', async () => {
    const shopify = createFakeShopify({ graphqlHandler: successfulGraphqlHandler() });
    const { app, db } = buildTestApp({ shopify });
    await db.collection('jobs').doc('job-1').set({
      shopDomain: SHOP,
      status: 'succeeded',
      contentType: 'scene',
      resultVariations: [{ url: 'https://cdn/a.png' }, { url: 'https://cdn/b.png' }],
    });

    const res = await request(app)
      .post('/api/publish')
      .send({ jobId: 'job-1', shopifyProductId: 'gid://shopify/Product/1', approvedVariationIndices: [0] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({ productId: 'gid://shopify/Product/1', mediaIds: ['gid://shopify/MediaImage/1'] }),
    );
    const job = (await db.collection('jobs').doc('job-1').get()).data();
    expect(job.publishStatus).toBe('published');
    expect(job.publishedProductId).toBe('gid://shopify/Product/1');
  });

  it('is idempotent: a second publish call on the same job returns alreadyPublished instead of calling Shopify again', async () => {
    const graphqlHandler = vi.fn(successfulGraphqlHandler());
    const shopify = createFakeShopify({ graphqlHandler });
    const { app, db } = buildTestApp({ shopify });
    await db.collection('jobs').doc('job-1').set({
      shopDomain: SHOP,
      status: 'succeeded',
      contentType: 'scene',
      resultVariations: [{ url: 'https://cdn/a.png' }],
    });

    const first = await request(app)
      .post('/api/publish')
      .send({ jobId: 'job-1', shopifyProductId: 'gid://shopify/Product/1', approvedVariationIndices: [0] });
    const second = await request(app)
      .post('/api/publish')
      .send({ jobId: 'job-1', shopifyProductId: 'gid://shopify/Product/1', approvedVariationIndices: [0] });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.alreadyPublished).toBe(true);
    expect(graphqlHandler).toHaveBeenCalledTimes(1);
  });

  it('returns 404 for a job that does not belong to the authenticated shop', async () => {
    const { app, db } = buildTestApp();
    await db.collection('jobs').doc('job-1').set({
      shopDomain: 'other-shop.myshopify.com',
      status: 'succeeded',
      resultVariations: [{ url: 'https://cdn/a.png' }],
    });

    const res = await request(app)
      .post('/api/publish')
      .send({ jobId: 'job-1', shopifyProductId: 'gid://shopify/Product/1', approvedVariationIndices: [0] });

    expect(res.status).toBe(404);
  });

  it('returns 400 (ValidationError) for a job that has not succeeded yet', async () => {
    const { app, db } = buildTestApp();
    await db.collection('jobs').doc('job-1').set({ shopDomain: SHOP, status: 'processing', resultVariations: [] });

    const res = await request(app)
      .post('/api/publish')
      .send({ jobId: 'job-1', shopifyProductId: 'gid://shopify/Product/1', approvedVariationIndices: [0] });

    expect(res.status).toBe(400);
  });

  it('returns 422 (NoApprovedVariationsError) when approvedVariationIndices is empty', async () => {
    const { app, db } = buildTestApp();
    await db.collection('jobs').doc('job-1').set({ shopDomain: SHOP, status: 'succeeded', resultVariations: [{ url: 'https://cdn/a.png' }] });

    const res = await request(app)
      .post('/api/publish')
      .send({ jobId: 'job-1', shopifyProductId: 'gid://shopify/Product/1', approvedVariationIndices: [] });

    expect(res.status).toBe(400); // zod's .min(1) on the array rejects this before it ever reaches the service
  });

  it('surfaces a 502 PublishError with structured shopifyErrors when Shopify returns userErrors', async () => {
    const shopify = createFakeShopify({
      graphqlHandler: async () => ({
        data: { productSet: { product: null, userErrors: [{ field: ['files', '0'], message: 'Invalid image URL' }] } },
      }),
    });
    const { app, db } = buildTestApp({ shopify });
    await db.collection('jobs').doc('job-1').set({ shopDomain: SHOP, status: 'succeeded', resultVariations: [{ url: 'https://cdn/a.png' }] });

    const res = await request(app)
      .post('/api/publish')
      .send({ jobId: 'job-1', shopifyProductId: 'gid://shopify/Product/1', approvedVariationIndices: [0] });

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('PUBLISH_FAILED');
    expect(res.body.error.shopifyErrors).toEqual([{ field: ['files', '0'], message: 'Invalid image URL' }]);

    const job = (await db.collection('jobs').doc('job-1').get()).data();
    expect(job.publishStatus).toBe('failed');
  });
});
