const { createImageOptimizerWorker } = require('../../../src/workers/imageOptimizerWorker');
const { LostLeaseError } = require('../../../src/errors/AppError');

function makeDeps(overrides = {}) {
  return {
    conversionJobsRepo: {
      claimForProcessing: vi.fn().mockResolvedValue({ claimed: true, job: { id: 'job-1', shopDomain: 'shop-a', operation: 'retouch' } }),
      settleConversionSuccess: vi.fn().mockResolvedValue(undefined),
      settleConversionFailure: vi.fn().mockResolvedValue({ skipped: false }),
      queryResumableJobs: vi.fn().mockResolvedValue([]),
    },
    imageOptimizerService: {
      runOptimizationJob: vi.fn().mockResolvedValue({ url: 'https://cdn/optimized.png' }),
      refundQuotaForShop: vi.fn().mockResolvedValue(undefined),
    },
    workerId: 'worker-1',
    logger: { error: vi.fn() },
    captureException: vi.fn(),
    ...overrides,
  };
}

describe('workers/imageOptimizerWorker', () => {
  describe('processJob', () => {
    it('claims, runs, and settles success for a claimable job', async () => {
      const deps = makeDeps();
      const worker = createImageOptimizerWorker(deps);

      const result = await worker.processJob({ id: 'job-1', shopDomain: 'shop-a' });

      expect(deps.conversionJobsRepo.settleConversionSuccess).toHaveBeenCalledWith('job-1', {
        workerId: 'worker-1',
        resultImageUrl: 'https://cdn/optimized.png',
      });
      expect(result).toEqual({ jobId: 'job-1', outcome: 'succeeded' });
    });

    it('skips a job whose claim is refused', async () => {
      const deps = makeDeps({
        conversionJobsRepo: { ...makeDeps().conversionJobsRepo, claimForProcessing: vi.fn().mockResolvedValue({ claimed: false, reason: 'terminal' }) },
      });
      const worker = createImageOptimizerWorker(deps);

      const result = await worker.processJob({ id: 'job-1', shopDomain: 'shop-a' });

      expect(deps.imageOptimizerService.runOptimizationJob).not.toHaveBeenCalled();
      expect(result).toEqual({ jobId: 'job-1', outcome: 'skipped', reason: 'terminal' });
    });

    it('settles failure, logs, reports to Sentry, and refunds the merchant\'s quota unit when the run throws', async () => {
      const err = new Error('model call failed');
      const deps = makeDeps({
        imageOptimizerService: { runOptimizationJob: vi.fn().mockRejectedValue(err), refundQuotaForShop: vi.fn().mockResolvedValue(undefined) },
      });
      const worker = createImageOptimizerWorker(deps);

      const result = await worker.processJob({ id: 'job-1', shopDomain: 'shop-a' });

      expect(deps.conversionJobsRepo.settleConversionFailure).toHaveBeenCalledWith('job-1', { workerId: 'worker-1', error: err });
      expect(deps.captureException).toHaveBeenCalledWith(err, { tags: { jobId: 'job-1', shopDomain: 'shop-a' } });
      expect(deps.imageOptimizerService.refundQuotaForShop).toHaveBeenCalledWith('shop-a');
      expect(result).toEqual({ jobId: 'job-1', outcome: 'failed' });
    });

    it('logs but does not rethrow when the quota refund itself fails — the job stays correctly marked failed', async () => {
      const err = new Error('model call failed');
      const refundErr = new Error('refund firestore write failed');
      const deps = makeDeps({
        imageOptimizerService: { runOptimizationJob: vi.fn().mockRejectedValue(err), refundQuotaForShop: vi.fn().mockRejectedValue(refundErr) },
      });
      const worker = createImageOptimizerWorker(deps);

      const result = await worker.processJob({ id: 'job-1', shopDomain: 'shop-a' });

      expect(result).toEqual({ jobId: 'job-1', outcome: 'failed' });
      expect(deps.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: refundErr, jobId: 'job-1', shopDomain: 'shop-a' }),
        'Image Optimizer quota refund failed',
      );
    });

    it('does not refund quota for a stale failure report from a worker that lost its lease', async () => {
      const deps = makeDeps({
        imageOptimizerService: { runOptimizationJob: vi.fn().mockRejectedValue(new Error('boom')), refundQuotaForShop: vi.fn() },
      });
      deps.conversionJobsRepo.settleConversionFailure = vi.fn().mockResolvedValue({ skipped: true });
      const worker = createImageOptimizerWorker(deps);

      await worker.processJob({ id: 'job-1', shopDomain: 'shop-a' });

      expect(deps.imageOptimizerService.refundQuotaForShop).not.toHaveBeenCalled();
    });

    it('treats a LostLeaseError as a silent skip', async () => {
      const deps = makeDeps({ imageOptimizerService: { runOptimizationJob: vi.fn().mockRejectedValue(new LostLeaseError('job-1')) } });
      const worker = createImageOptimizerWorker(deps);

      const result = await worker.processJob({ id: 'job-1', shopDomain: 'shop-a' });

      expect(deps.conversionJobsRepo.settleConversionFailure).not.toHaveBeenCalled();
      expect(result).toEqual({ jobId: 'job-1', outcome: 'skipped', reason: 'lost_lease' });
    });

    it('treats a settleConversionFailure that reports skipped:true as a skip outcome', async () => {
      const deps = makeDeps({ imageOptimizerService: { runOptimizationJob: vi.fn().mockRejectedValue(new Error('boom')) } });
      deps.conversionJobsRepo.settleConversionFailure = vi.fn().mockResolvedValue({ skipped: true });
      const worker = createImageOptimizerWorker(deps);

      const result = await worker.processJob({ id: 'job-1', shopDomain: 'shop-a' });

      expect(result).toEqual({ jobId: 'job-1', outcome: 'skipped', reason: 'lost_lease' });
    });
  });

  describe('resumeFromFirestore', () => {
    it('re-enqueues every page of resumable jobs and returns the total count', async () => {
      const deps = makeDeps();
      deps.conversionJobsRepo.queryResumableJobs = vi
        .fn()
        .mockResolvedValueOnce([{ id: 'job-1', shopDomain: 'shop-a', createdAt: 1 }])
        .mockResolvedValueOnce([]);
      const worker = createImageOptimizerWorker(deps);

      const total = await worker.resumeFromFirestore({ pageSize: 1 });

      expect(total).toBe(1);
    });
  });
});
