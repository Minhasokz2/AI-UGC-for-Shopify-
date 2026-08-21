const { createFakeFirestore, FieldValue, FakeTimestamp } = require('../../helpers/fakeFirestore');
const { createShopsRepo } = require('../../../src/repos/shopsRepo');

function makeRepo() {
  const db = createFakeFirestore();
  const repo = createShopsRepo({ db, FieldValue });
  return { db, repo };
}

describe('repos/shopsRepo', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getOrCreateShop', () => {
    it('creates a shop with defaults on the first call', async () => {
      const { db, repo } = makeRepo();

      const shop = await repo.getOrCreateShop('shop-a.myshopify.com');

      expect(shop.id).toBe('shop-a.myshopify.com');
      expect(shop.shopDomain).toBe('shop-a.myshopify.com');
      expect(shop.creditBalance).toBe(0);
      expect(shop.plan).toBe('metered');
      expect(shop.googleVerified).toBe(false);
      expect(shop.verifiedEmail).toBeNull();
      expect(shop.brandStyleProfile).toBeNull();
      expect(shop.referralCode).toBeNull();
      expect(shop.addOns).toEqual({ imageOptimizer: false });
      expect(shop.lifetimeCreditsSpent).toBe(0);
      expect(shop.lifetimeImagesGenerated).toBe(0);
      expect(shop.uninstalledAt).toBeNull();
      expect(shop.firstJobCreatedAt).toBeNull();
      expect(shop.installedAt).toBeInstanceOf(FakeTimestamp);

      const stored = (await db.collection('shops').doc('shop-a.myshopify.com').get()).data();
      expect(stored.creditBalance).toBe(0);
    });

    it('is idempotent: a second call returns the existing doc without resetting mutated fields', async () => {
      const { db, repo } = makeRepo();
      await repo.getOrCreateShop('shop-a.myshopify.com');

      // Simulate the shop having spent some credits since creation.
      await db.collection('shops').doc('shop-a.myshopify.com').update({ creditBalance: 42 });

      const second = await repo.getOrCreateShop('shop-a.myshopify.com');

      expect(second.creditBalance).toBe(42);
      const stored = (await db.collection('shops').doc('shop-a.myshopify.com').get()).data();
      expect(stored.creditBalance).toBe(42);
    });

    it('concurrent-style repeated calls never duplicate the shop doc', async () => {
      const { db, repo } = makeRepo();
      await repo.getOrCreateShop('shop-a.myshopify.com');
      await repo.getOrCreateShop('shop-a.myshopify.com');
      await repo.getOrCreateShop('shop-a.myshopify.com');

      const all = await db.collection('shops').get();
      expect(all.size).toBe(1);
    });
  });

  describe('getShop', () => {
    it('returns undefined for a missing shop (no auto-create)', async () => {
      const { repo } = makeRepo();
      const shop = await repo.getShop('missing.myshopify.com');
      expect(shop).toBeUndefined();
    });

    it('returns the stored shop merged with its id', async () => {
      const { db, repo } = makeRepo();
      await db.collection('shops').doc('shop-a.myshopify.com').set({ creditBalance: 5 });
      const shop = await repo.getShop('shop-a.myshopify.com');
      expect(shop).toEqual({ id: 'shop-a.myshopify.com', creditBalance: 5 });
    });
  });

  describe('updateShop', () => {
    it('applies a plain update', async () => {
      const { db, repo } = makeRepo();
      await db.collection('shops').doc('shop-a.myshopify.com').set({ creditBalance: 5 });
      await repo.updateShop('shop-a.myshopify.com', { creditBalance: 20 });
      const stored = (await db.collection('shops').doc('shop-a.myshopify.com').get()).data();
      expect(stored.creditBalance).toBe(20);
    });
  });

  describe('markFirstJobCreated', () => {
    it('sets firstJobCreatedAt when not already set', async () => {
      const { db, repo } = makeRepo();
      await db.collection('shops').doc('shop-a.myshopify.com').set({ firstJobCreatedAt: null });

      await repo.markFirstJobCreated('shop-a.myshopify.com');

      const stored = (await db.collection('shops').doc('shop-a.myshopify.com').get()).data();
      expect(stored.firstJobCreatedAt).toBeInstanceOf(FakeTimestamp);
    });

    it('is a no-op on a second call — the original timestamp is never overwritten', async () => {
      vi.useFakeTimers();
      const { db, repo } = makeRepo();
      await db.collection('shops').doc('shop-a.myshopify.com').set({ firstJobCreatedAt: null });

      await repo.markFirstJobCreated('shop-a.myshopify.com');
      const firstStored = (await db.collection('shops').doc('shop-a.myshopify.com').get()).data();
      const originalTimestamp = firstStored.firstJobCreatedAt;

      // Advance real elapsed time so that, if the implementation incorrectly
      // re-wrote the timestamp, this assertion would actually catch it.
      vi.advanceTimersByTime(60_000);
      await repo.markFirstJobCreated('shop-a.myshopify.com');

      const secondStored = (await db.collection('shops').doc('shop-a.myshopify.com').get()).data();
      expect(secondStored.firstJobCreatedAt.isEqual(originalTimestamp)).toBe(true);
    });
  });

  describe('markUninstalled', () => {
    it('sets uninstalledAt', async () => {
      const { db, repo } = makeRepo();
      await db.collection('shops').doc('shop-a.myshopify.com').set({ uninstalledAt: null });

      await repo.markUninstalled('shop-a.myshopify.com');

      const stored = (await db.collection('shops').doc('shop-a.myshopify.com').get()).data();
      expect(stored.uninstalledAt).toBeInstanceOf(FakeTimestamp);
    });
  });
});
