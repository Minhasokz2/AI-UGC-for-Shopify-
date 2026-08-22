const { createImageOptimizerService, resolveOptimizerModel } = require('../../../src/services/imageOptimizerService');
const { EXTENDED_ALLOWED_MODELS } = require('../../../src/services/extendedModels');
const modelDispatch = require('../../../src/services/modelDispatch');
const { NotFoundError, QuotaExceededError } = require('../../../src/errors/AppError');

function makeDeps(overrides = {}) {
  return {
    shopsRepo: { getShop: vi.fn().mockResolvedValue({ id: 'shop-a', addOns: { imageOptimizer: false } }) },
    conversionJobsRepo: { createConversionJob: vi.fn().mockResolvedValue({ id: 'job-1' }) },
    imageOptimizerQuota: { checkAndConsumeQuota: vi.fn().mockResolvedValue({ allowed: true, unlimited: false, countToday: 1, freeDailyQuota: 10 }) },
    ...overrides,
  };
}

describe('services/imageOptimizerService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolveOptimizerModel', () => {
    it('resolves upscale_budget/upscale_premium/retouch to their EXTENDED_ALLOWED_MODELS entries', () => {
      expect(resolveOptimizerModel('upscale_budget')).toBe(EXTENDED_ALLOWED_MODELS.upscale_budget);
      expect(resolveOptimizerModel('upscale_premium')).toBe(EXTENDED_ALLOWED_MODELS.upscale_premium);
      expect(resolveOptimizerModel('retouch')).toBe(EXTENDED_ALLOWED_MODELS.retouch);
    });

    it('throws NotFoundError for an operation outside the optimizer allow-list, even if it exists in EXTENDED_ALLOWED_MODELS', () => {
      expect(() => resolveOptimizerModel('try_on')).toThrow(NotFoundError);
      expect(() => resolveOptimizerModel('not_a_real_operation')).toThrow(NotFoundError);
    });
  });

  describe('requestOptimization', () => {
    it('creates a conversion job when the operation is valid and quota allows it', async () => {
      const deps = makeDeps();
      const service = createImageOptimizerService(deps);

      const job = await service.requestOptimization({
        shopDomain: 'shop-a',
        shopifyProductId: 'gid://shopify/Product/1',
        imageUrl: 'https://cdn/raw.png',
        operation: 'upscale_budget',
      });

      expect(deps.imageOptimizerQuota.checkAndConsumeQuota).toHaveBeenCalledWith({ id: 'shop-a', addOns: { imageOptimizer: false } });
      expect(deps.conversionJobsRepo.createConversionJob).toHaveBeenCalledWith({
        shopDomain: 'shop-a',
        shopifyProductId: 'gid://shopify/Product/1',
        imageUrl: 'https://cdn/raw.png',
        operation: 'upscale_budget',
      });
      expect(job).toEqual({ id: 'job-1' });
    });

    it('throws NotFoundError for an unknown operation without ever consuming quota', async () => {
      const deps = makeDeps();
      const service = createImageOptimizerService(deps);

      await expect(
        service.requestOptimization({ shopDomain: 'shop-a', shopifyProductId: 'p', imageUrl: 'u', operation: 'nonsense' }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(deps.imageOptimizerQuota.checkAndConsumeQuota).not.toHaveBeenCalled();
      expect(deps.conversionJobsRepo.createConversionJob).not.toHaveBeenCalled();
    });

    it('throws QuotaExceededError and creates no job once the daily quota is exhausted', async () => {
      const deps = makeDeps({
        imageOptimizerQuota: { checkAndConsumeQuota: vi.fn().mockResolvedValue({ allowed: false, countToday: 10, freeDailyQuota: 10 }) },
      });
      const service = createImageOptimizerService(deps);

      await expect(
        service.requestOptimization({ shopDomain: 'shop-a', shopifyProductId: 'p', imageUrl: 'u', operation: 'retouch' }),
      ).rejects.toBeInstanceOf(QuotaExceededError);
      expect(deps.conversionJobsRepo.createConversionJob).not.toHaveBeenCalled();
    });

    it('passes a fallback { id: shopDomain } shape to quota checking when the shop record does not exist yet', async () => {
      const deps = makeDeps({ shopsRepo: { getShop: vi.fn().mockResolvedValue(undefined) } });
      const service = createImageOptimizerService(deps);

      await service.requestOptimization({ shopDomain: 'brand-new-shop', shopifyProductId: 'p', imageUrl: 'u', operation: 'retouch' });

      expect(deps.imageOptimizerQuota.checkAndConsumeQuota).toHaveBeenCalledWith({ id: 'brand-new-shop' });
    });
  });

  describe('runOptimizationJob', () => {
    it('dispatches to the resolved model with the job image and returns the result url', async () => {
      const dispatchSpy = vi.spyOn(modelDispatch, 'generateSingle').mockResolvedValue('https://cdn/optimized.png');
      const service = createImageOptimizerService(makeDeps());

      const result = await service.runOptimizationJob({ id: 'job-1', operation: 'upscale_premium', imageUrl: 'https://cdn/raw.png' });

      expect(dispatchSpy).toHaveBeenCalledWith(EXTENDED_ALLOWED_MODELS.upscale_premium, { imageUrl: 'https://cdn/raw.png' });
      expect(result).toEqual({ url: 'https://cdn/optimized.png' });
    });
  });
});
