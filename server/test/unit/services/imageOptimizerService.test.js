const { createImageOptimizerService, resolveOptimizerModel } = require('../../../src/services/imageOptimizerService');
const { EXTENDED_ALLOWED_MODELS } = require('../../../src/services/extendedModels');
const modelDispatch = require('../../../src/services/modelDispatch');
const { NotFoundError, QuotaExceededError } = require('../../../src/errors/AppError');

function makeDeps(overrides = {}) {
  return {
    shopsRepo: { getShop: vi.fn().mockResolvedValue({ id: 'shop-a', addOns: { imageOptimizer: false } }) },
    conversionJobsRepo: {
      findByIdempotencyKey: vi.fn().mockResolvedValue(undefined),
      claimAndCreateConversionJob: vi.fn().mockResolvedValue({ job: { id: 'job-1' }, isNew: true }),
    },
    imageOptimizerQuota: {
      checkAndConsumeQuota: vi.fn().mockResolvedValue({ allowed: true, unlimited: false, countToday: 1, freeDailyQuota: 10 }),
      refundQuota: vi.fn().mockResolvedValue(undefined),
    },
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
        idempotencyKey: 'idem-1',
      });

      expect(deps.conversionJobsRepo.findByIdempotencyKey).toHaveBeenCalledWith('shop-a', 'idem-1');
      expect(deps.imageOptimizerQuota.checkAndConsumeQuota).toHaveBeenCalledWith({ id: 'shop-a', addOns: { imageOptimizer: false } });
      expect(deps.conversionJobsRepo.claimAndCreateConversionJob).toHaveBeenCalledWith('shop-a', 'idem-1', {
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
        service.requestOptimization({ shopDomain: 'shop-a', shopifyProductId: 'p', imageUrl: 'u', operation: 'nonsense', idempotencyKey: 'k' }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(deps.imageOptimizerQuota.checkAndConsumeQuota).not.toHaveBeenCalled();
      expect(deps.conversionJobsRepo.claimAndCreateConversionJob).not.toHaveBeenCalled();
    });

    it('throws QuotaExceededError and creates no job once the daily quota is exhausted', async () => {
      const deps = makeDeps({
        imageOptimizerQuota: {
          checkAndConsumeQuota: vi.fn().mockResolvedValue({ allowed: false, countToday: 10, freeDailyQuota: 10 }),
          refundQuota: vi.fn(),
        },
      });
      const service = createImageOptimizerService(deps);

      await expect(
        service.requestOptimization({ shopDomain: 'shop-a', shopifyProductId: 'p', imageUrl: 'u', operation: 'retouch', idempotencyKey: 'k' }),
      ).rejects.toBeInstanceOf(QuotaExceededError);
      expect(deps.conversionJobsRepo.claimAndCreateConversionJob).not.toHaveBeenCalled();
    });

    it('passes a fallback { id: shopDomain } shape to quota checking when the shop record does not exist yet', async () => {
      const deps = makeDeps({ shopsRepo: { getShop: vi.fn().mockResolvedValue(undefined) } });
      const service = createImageOptimizerService(deps);

      await service.requestOptimization({ shopDomain: 'brand-new-shop', shopifyProductId: 'p', imageUrl: 'u', operation: 'retouch', idempotencyKey: 'k' });

      expect(deps.imageOptimizerQuota.checkAndConsumeQuota).toHaveBeenCalledWith({ id: 'brand-new-shop' });
    });

    it('returns the existing job for a repeated idempotency key WITHOUT ever touching quota — the double-click/retry case', async () => {
      const deps = makeDeps({
        conversionJobsRepo: {
          findByIdempotencyKey: vi.fn().mockResolvedValue({ id: 'job-existing' }),
          claimAndCreateConversionJob: vi.fn(),
        },
      });
      const service = createImageOptimizerService(deps);

      const job = await service.requestOptimization({
        shopDomain: 'shop-a',
        shopifyProductId: 'p',
        imageUrl: 'u',
        operation: 'retouch',
        idempotencyKey: 'idem-1',
      });

      expect(job).toEqual({ id: 'job-existing' });
      expect(deps.imageOptimizerQuota.checkAndConsumeQuota).not.toHaveBeenCalled();
      expect(deps.conversionJobsRepo.claimAndCreateConversionJob).not.toHaveBeenCalled();
    });

    it('refunds the just-consumed quota unit and rethrows if job creation itself throws', async () => {
      const deps = makeDeps({
        conversionJobsRepo: {
          findByIdempotencyKey: vi.fn().mockResolvedValue(undefined),
          claimAndCreateConversionJob: vi.fn().mockRejectedValue(new Error('firestore write failed')),
        },
      });
      const service = createImageOptimizerService(deps);

      await expect(
        service.requestOptimization({ shopDomain: 'shop-a', shopifyProductId: 'p', imageUrl: 'u', operation: 'retouch', idempotencyKey: 'k' }),
      ).rejects.toThrow('firestore write failed');

      expect(deps.imageOptimizerQuota.refundQuota).toHaveBeenCalledWith({ id: 'shop-a', addOns: { imageOptimizer: false } });
    });
  });

  describe('refundQuotaForShop', () => {
    it('looks up the shop and refunds its quota', async () => {
      const deps = makeDeps();
      const service = createImageOptimizerService(deps);

      await service.refundQuotaForShop('shop-a');

      expect(deps.shopsRepo.getShop).toHaveBeenCalledWith('shop-a');
      expect(deps.imageOptimizerQuota.refundQuota).toHaveBeenCalledWith({ id: 'shop-a', addOns: { imageOptimizer: false } });
    });

    it('falls back to { id: shopDomain } when the shop record is missing', async () => {
      const deps = makeDeps({ shopsRepo: { getShop: vi.fn().mockResolvedValue(undefined) } });
      const service = createImageOptimizerService(deps);

      await service.refundQuotaForShop('brand-new-shop');

      expect(deps.imageOptimizerQuota.refundQuota).toHaveBeenCalledWith({ id: 'brand-new-shop' });
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
