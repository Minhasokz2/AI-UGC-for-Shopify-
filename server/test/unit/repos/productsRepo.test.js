const { createFakeFirestore, FieldValue } = require('../../helpers/fakeFirestore');
const { createProductsRepo } = require('../../../src/repos/productsRepo');

function makeRepo() {
  const db = createFakeFirestore();
  const repo = createProductsRepo({ db, FieldValue });
  return { db, repo };
}

describe('repos/productsRepo', () => {
  describe('upsertProduct', () => {
    it('is keyed deterministically — upserting the same shop+shopifyProductId twice results in exactly one doc', async () => {
      const { db, repo } = makeRepo();
      await repo.upsertProduct({
        shopDomain: 'shop-a',
        shopifyProductId: 'gid://shopify/Product/1',
        title: 'Original Title',
        imageUrls: ['https://x/a.png'],
        category: 'apparel',
      });
      await repo.upsertProduct({
        shopDomain: 'shop-a',
        shopifyProductId: 'gid://shopify/Product/1',
        title: 'Updated Title',
        imageUrls: ['https://x/b.png'],
        category: 'apparel',
      });

      const all = await db.collection('products').get();
      expect(all.size).toBe(1);
      expect(all.docs[0].data().title).toBe('Updated Title');
      expect(all.docs[0].data().imageUrls).toEqual(['https://x/b.png']);
    });

    it('the same shopifyProductId under a different shop does not collide', async () => {
      const { db, repo } = makeRepo();
      await repo.upsertProduct({ shopDomain: 'shop-a', shopifyProductId: 'p1', title: 'A' });
      await repo.upsertProduct({ shopDomain: 'shop-b', shopifyProductId: 'p1', title: 'B' });

      const all = await db.collection('products').get();
      expect(all.size).toBe(2);
    });
  });

  describe('queryByShop', () => {
    async function seedProducts(repo) {
      await repo.upsertProduct({ shopDomain: 'shop-a', shopifyProductId: 'p1', title: 'Blue Widget' });
      await repo.upsertProduct({ shopDomain: 'shop-a', shopifyProductId: 'p2', title: 'Red Widget' });
      await repo.upsertProduct({ shopDomain: 'shop-a', shopifyProductId: 'p3', title: 'Green Gadget' });
      await repo.upsertProduct({ shopDomain: 'shop-b', shopifyProductId: 'p4', title: 'Other Shop Widget' });
    }

    it('scopes strictly to the requested shop', async () => {
      const { repo } = makeRepo();
      await seedProducts(repo);

      const results = await repo.queryByShop({ shopDomain: 'shop-a' });

      expect(results.length).toBe(3);
      expect(results.every((p) => p.shopDomain === 'shop-a')).toBe(true);
    });

    it('filters by search case-insensitively against the title', async () => {
      const { repo } = makeRepo();
      await seedProducts(repo);

      const results = await repo.queryByShop({ shopDomain: 'shop-a', search: 'widget' });

      expect(results.map((r) => r.title).sort()).toEqual(['Blue Widget', 'Red Widget']);
    });

    it('respects the limit', async () => {
      const { repo } = makeRepo();
      await seedProducts(repo);

      const results = await repo.queryByShop({ shopDomain: 'shop-a', limit: 1 });

      expect(results.length).toBe(1);
    });
  });

  describe('deleteAllForShop', () => {
    it('removes every product for the given shop and nothing for another shop', async () => {
      const { db, repo } = makeRepo();
      await repo.upsertProduct({ shopDomain: 'shop-a', shopifyProductId: 'p1', title: 'A' });
      await repo.upsertProduct({ shopDomain: 'shop-a', shopifyProductId: 'p2', title: 'B' });
      await repo.upsertProduct({ shopDomain: 'shop-b', shopifyProductId: 'p3', title: 'C' });

      await repo.deleteAllForShop('shop-a');

      const remaining = await db.collection('products').get();
      expect(remaining.size).toBe(1);
      expect(remaining.docs[0].data().shopDomain).toBe('shop-b');
    });

    it('is a no-op when the shop has no products', async () => {
      const { repo } = makeRepo();
      await expect(repo.deleteAllForShop('shop-with-nothing')).resolves.not.toThrow();
    });
  });
});
