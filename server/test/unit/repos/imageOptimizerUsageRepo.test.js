const { createFakeFirestore, FieldValue } = require('../../helpers/fakeFirestore');
const { createImageOptimizerUsageRepo } = require('../../../src/repos/imageOptimizerUsageRepo');

function makeRepo() {
  const db = createFakeFirestore();
  const repo = createImageOptimizerUsageRepo({ db, FieldValue });
  return { db, repo };
}

describe('repos/imageOptimizerUsageRepo', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('checkAndIncrementQuota', () => {
    it('the first call of the day succeeds and sets countToday to 1', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-21T12:00:00Z'));
      const { db, repo } = makeRepo();

      const result = await repo.checkAndIncrementQuota('shop-a', { freeDailyQuota: 3 });

      expect(result).toEqual({ allowed: true, countToday: 1, freeDailyQuota: 3 });
      const stored = (await db.collection('image_optimizer_usage').doc('shop-a').get()).data();
      expect(stored).toEqual({ date: '2026-08-21', countToday: 1 });
    });

    it('repeated calls increment up to the quota', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-21T12:00:00Z'));
      const { repo } = makeRepo();

      const r1 = await repo.checkAndIncrementQuota('shop-a', { freeDailyQuota: 3 });
      const r2 = await repo.checkAndIncrementQuota('shop-a', { freeDailyQuota: 3 });
      const r3 = await repo.checkAndIncrementQuota('shop-a', { freeDailyQuota: 3 });

      expect([r1.countToday, r2.countToday, r3.countToday]).toEqual([1, 2, 3]);
      expect([r1.allowed, r2.allowed, r3.allowed]).toEqual([true, true, true]);
    });

    it('a call once the quota is reached returns allowed:false and does not increment further', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-21T12:00:00Z'));
      const { db, repo } = makeRepo();

      await repo.checkAndIncrementQuota('shop-a', { freeDailyQuota: 2 });
      await repo.checkAndIncrementQuota('shop-a', { freeDailyQuota: 2 });
      const result = await repo.checkAndIncrementQuota('shop-a', { freeDailyQuota: 2 });

      expect(result).toEqual({ allowed: false, countToday: 2, freeDailyQuota: 2 });
      const stored = (await db.collection('image_optimizer_usage').doc('shop-a').get()).data();
      expect(stored.countToday).toBe(2);
    });

    it('a call on a new UTC day resets countToday back to 1 even though yesterday hit the quota', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-21T23:59:00Z'));
      const { repo } = makeRepo();

      await repo.checkAndIncrementQuota('shop-a', { freeDailyQuota: 2 });
      await repo.checkAndIncrementQuota('shop-a', { freeDailyQuota: 2 });
      const atQuota = await repo.checkAndIncrementQuota('shop-a', { freeDailyQuota: 2 });
      expect(atQuota.allowed).toBe(false);

      // Cross the UTC day boundary.
      vi.setSystemTime(new Date('2026-08-22T00:05:00Z'));

      const result = await repo.checkAndIncrementQuota('shop-a', { freeDailyQuota: 2 });

      expect(result).toEqual({ allowed: true, countToday: 1, freeDailyQuota: 2 });
    });

    it('different shops track quota independently', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-21T12:00:00Z'));
      const { repo } = makeRepo();

      await repo.checkAndIncrementQuota('shop-a', { freeDailyQuota: 1 });
      const result = await repo.checkAndIncrementQuota('shop-b', { freeDailyQuota: 1 });

      expect(result).toEqual({ allowed: true, countToday: 1, freeDailyQuota: 1 });
    });
  });

  describe('refundQuota', () => {
    it('decrements today\'s count by 1 — a job that failed should not have cost the merchant a unit', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-21T12:00:00Z'));
      const { db, repo } = makeRepo();
      await repo.checkAndIncrementQuota('shop-a', { freeDailyQuota: 10 });
      await repo.checkAndIncrementQuota('shop-a', { freeDailyQuota: 10 });

      await repo.refundQuota('shop-a');

      const stored = (await db.collection('image_optimizer_usage').doc('shop-a').get()).data();
      expect(stored.countToday).toBe(1);
    });

    it('clamps at 0 rather than going negative', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-21T12:00:00Z'));
      const { db, repo } = makeRepo();
      await repo.checkAndIncrementQuota('shop-a', { freeDailyQuota: 10 });

      await repo.refundQuota('shop-a');
      await repo.refundQuota('shop-a');

      const stored = (await db.collection('image_optimizer_usage').doc('shop-a').get()).data();
      expect(stored.countToday).toBe(0);
    });

    it('is a no-op when the stored count has already rolled over to a new UTC day', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-21T12:00:00Z'));
      const { db, repo } = makeRepo();
      await repo.checkAndIncrementQuota('shop-a', { freeDailyQuota: 10 });

      vi.setSystemTime(new Date('2026-08-22T00:05:00Z'));
      await repo.refundQuota('shop-a');

      const stored = (await db.collection('image_optimizer_usage').doc('shop-a').get()).data();
      expect(stored).toEqual({ date: '2026-08-21', countToday: 1 });
    });

    it('is a no-op when the shop has no usage doc at all yet', async () => {
      const { repo } = makeRepo();
      await expect(repo.refundQuota('never-used-shop')).resolves.not.toThrow();
    });
  });
});
