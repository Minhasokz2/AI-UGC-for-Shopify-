const { createImageOptimizerQuota } = require('../../../src/services/imageOptimizerQuota');
const { IMAGE_OPTIMIZER_FREE_DAILY_QUOTA } = require('../../../src/config/constants');

describe('services/imageOptimizerQuota', () => {
  describe('checkAndConsumeQuota', () => {
    it('bypasses the daily counter entirely for a shop with the imageOptimizer add-on active', async () => {
      const imageOptimizerUsageRepo = { checkAndIncrementQuota: vi.fn() };
      const quota = createImageOptimizerQuota({ imageOptimizerUsageRepo });

      const result = await quota.checkAndConsumeQuota({ id: 'shop-a', addOns: { imageOptimizer: true } });

      expect(result).toEqual({ allowed: true, unlimited: true });
      expect(imageOptimizerUsageRepo.checkAndIncrementQuota).not.toHaveBeenCalled();
    });

    it('delegates to the usage repo with the configured free daily quota for a shop without the add-on', async () => {
      const imageOptimizerUsageRepo = {
        checkAndIncrementQuota: vi.fn().mockResolvedValue({ allowed: true, countToday: 3, freeDailyQuota: IMAGE_OPTIMIZER_FREE_DAILY_QUOTA }),
      };
      const quota = createImageOptimizerQuota({ imageOptimizerUsageRepo });

      const result = await quota.checkAndConsumeQuota({ id: 'shop-a', addOns: { imageOptimizer: false } });

      expect(imageOptimizerUsageRepo.checkAndIncrementQuota).toHaveBeenCalledWith('shop-a', { freeDailyQuota: IMAGE_OPTIMIZER_FREE_DAILY_QUOTA });
      expect(result).toEqual({ allowed: true, unlimited: false, countToday: 3, freeDailyQuota: IMAGE_OPTIMIZER_FREE_DAILY_QUOTA });
    });

    it('propagates allowed:false once the free quota is exhausted', async () => {
      const imageOptimizerUsageRepo = {
        checkAndIncrementQuota: vi.fn().mockResolvedValue({ allowed: false, countToday: IMAGE_OPTIMIZER_FREE_DAILY_QUOTA, freeDailyQuota: IMAGE_OPTIMIZER_FREE_DAILY_QUOTA }),
      };
      const quota = createImageOptimizerQuota({ imageOptimizerUsageRepo });

      const result = await quota.checkAndConsumeQuota({ id: 'shop-a' });

      expect(result.allowed).toBe(false);
    });

    it('falls back to shopDomain when no id field is present', async () => {
      const imageOptimizerUsageRepo = { checkAndIncrementQuota: vi.fn().mockResolvedValue({ allowed: true, countToday: 1, freeDailyQuota: 10 }) };
      const quota = createImageOptimizerQuota({ imageOptimizerUsageRepo });

      await quota.checkAndConsumeQuota({ shopDomain: 'shop-b.myshopify.com' });

      expect(imageOptimizerUsageRepo.checkAndIncrementQuota).toHaveBeenCalledWith('shop-b.myshopify.com', expect.anything());
    });
  });

  describe('refundQuota', () => {
    it('delegates to the usage repo for a shop without the add-on', async () => {
      const imageOptimizerUsageRepo = { refundQuota: vi.fn().mockResolvedValue(undefined) };
      const quota = createImageOptimizerQuota({ imageOptimizerUsageRepo });

      await quota.refundQuota({ id: 'shop-a', addOns: { imageOptimizer: false } });

      expect(imageOptimizerUsageRepo.refundQuota).toHaveBeenCalledWith('shop-a');
    });

    it('is a no-op for a shop with the paid add-on — that path never consumed a counted unit', async () => {
      const imageOptimizerUsageRepo = { refundQuota: vi.fn() };
      const quota = createImageOptimizerQuota({ imageOptimizerUsageRepo });

      await quota.refundQuota({ id: 'shop-a', addOns: { imageOptimizer: true } });

      expect(imageOptimizerUsageRepo.refundQuota).not.toHaveBeenCalled();
    });

    it('falls back to shopDomain when no id field is present', async () => {
      const imageOptimizerUsageRepo = { refundQuota: vi.fn().mockResolvedValue(undefined) };
      const quota = createImageOptimizerQuota({ imageOptimizerUsageRepo });

      await quota.refundQuota({ shopDomain: 'shop-b.myshopify.com' });

      expect(imageOptimizerUsageRepo.refundQuota).toHaveBeenCalledWith('shop-b.myshopify.com');
    });
  });
});
