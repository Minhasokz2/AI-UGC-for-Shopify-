const { createJobWorker } = require('../../../src/workers/jobWorker');
const generationPipeline = require('../../../src/services/generationPipeline');
const { LostLeaseError } = require('../../../src/errors/AppError');

function makeDeps(overrides = {}) {
  return {
    jobsRepo: {
      claimForProcessing: vi.fn().mockResolvedValue({ claimed: true, job: { id: 'job-1', shopDomain: 'shop-a' } }),
      settleJobSuccess: vi.fn().mockResolvedValue(undefined),
      settleJobFailure: vi.fn().mockResolvedValue({ skipped: false }),
      queryResumableJobs: vi.fn().mockResolvedValue([]),
    },
    templatesRepo: {},
    allowedModelsRepo: {},
    credits: { recomputeCost: vi.fn() },
    workerId: 'worker-1',
    logger: { error: vi.fn() },
    captureException: vi.fn(),
    ...overrides,
  };
}

describe('workers/jobWorker', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('processJob', () => {
    it('claims, runs, and settles success for a claimable job', async () => {
      const deps = makeDeps();
      vi.spyOn(generationPipeline, 'runGenerationJob').mockResolvedValue([{ url: 'https://cdn/a.png' }]);
      const worker = createJobWorker(deps);

      const result = await worker.processJob({ id: 'job-1', shopDomain: 'shop-a' });

      expect(deps.jobsRepo.claimForProcessing).toHaveBeenCalledWith('job-1', { workerId: 'worker-1' });
      expect(deps.jobsRepo.settleJobSuccess).toHaveBeenCalledWith('job-1', {
        workerId: 'worker-1',
        resultVariations: [{ url: 'https://cdn/a.png' }],
        recomputeCost: deps.credits.recomputeCost,
      });
      expect(result).toEqual({ jobId: 'job-1', outcome: 'succeeded' });
    });

    it('skips a job whose claim is refused (already claimed/terminal), without running the pipeline', async () => {
      const deps = makeDeps({ jobsRepo: { ...makeDeps().jobsRepo, claimForProcessing: vi.fn().mockResolvedValue({ claimed: false, reason: 'lease_active' }) } });
      const pipelineSpy = vi.spyOn(generationPipeline, 'runGenerationJob');
      const worker = createJobWorker(deps);

      const result = await worker.processJob({ id: 'job-1', shopDomain: 'shop-a' });

      expect(pipelineSpy).not.toHaveBeenCalled();
      expect(result).toEqual({ jobId: 'job-1', outcome: 'skipped', reason: 'lease_active' });
    });

    it('settles failure, logs, and reports to Sentry when the pipeline throws', async () => {
      const deps = makeDeps();
      const err = new Error('fal.ai timed out');
      vi.spyOn(generationPipeline, 'runGenerationJob').mockRejectedValue(err);
      const worker = createJobWorker(deps);

      const result = await worker.processJob({ id: 'job-1', shopDomain: 'shop-a' });

      expect(deps.jobsRepo.settleJobFailure).toHaveBeenCalledWith('job-1', { workerId: 'worker-1', error: err });
      expect(deps.logger.error).toHaveBeenCalled();
      expect(deps.captureException).toHaveBeenCalledWith(err, { tags: { jobId: 'job-1', shopDomain: 'shop-a' } });
      expect(result).toEqual({ jobId: 'job-1', outcome: 'failed' });
    });

    it('treats a LostLeaseError from the pipeline as a silent skip, never calling settleJobFailure', async () => {
      const deps = makeDeps();
      vi.spyOn(generationPipeline, 'runGenerationJob').mockRejectedValue(new LostLeaseError('job-1'));
      const worker = createJobWorker(deps);

      const result = await worker.processJob({ id: 'job-1', shopDomain: 'shop-a' });

      expect(deps.jobsRepo.settleJobFailure).not.toHaveBeenCalled();
      expect(deps.captureException).not.toHaveBeenCalled();
      expect(result).toEqual({ jobId: 'job-1', outcome: 'skipped', reason: 'lost_lease' });
    });

    it('treats a settleJobFailure that reports skipped:true (lease stolen mid-run) as a skip outcome', async () => {
      const deps = makeDeps();
      deps.jobsRepo.settleJobFailure.mockResolvedValue({ skipped: true });
      vi.spyOn(generationPipeline, 'runGenerationJob').mockRejectedValue(new Error('boom'));
      const worker = createJobWorker(deps);

      const result = await worker.processJob({ id: 'job-1', shopDomain: 'shop-a' });

      expect(result).toEqual({ jobId: 'job-1', outcome: 'skipped', reason: 'lost_lease' });
    });

    it('reports a succeeded batch job\'s progress — regression for incrementBatchProgress never being called in production', async () => {
      const batchesRepo = { incrementBatchProgress: vi.fn().mockResolvedValue(undefined) };
      const deps = makeDeps({
        batchesRepo,
        jobsRepo: { ...makeDeps().jobsRepo, claimForProcessing: vi.fn().mockResolvedValue({ claimed: true, job: { id: 'job-1', shopDomain: 'shop-a', batchId: 'batch-1' } }) },
      });
      vi.spyOn(generationPipeline, 'runGenerationJob').mockResolvedValue([{ url: 'https://cdn/a.png' }]);
      const worker = createJobWorker(deps);

      await worker.processJob({ id: 'job-1', shopDomain: 'shop-a', batchId: 'batch-1' });

      expect(batchesRepo.incrementBatchProgress).toHaveBeenCalledWith('batch-1', { succeeded: true });
    });

    it('reports a failed batch job\'s progress too', async () => {
      const batchesRepo = { incrementBatchProgress: vi.fn().mockResolvedValue(undefined) };
      const deps = makeDeps({
        batchesRepo,
        jobsRepo: { ...makeDeps().jobsRepo, claimForProcessing: vi.fn().mockResolvedValue({ claimed: true, job: { id: 'job-1', shopDomain: 'shop-a', batchId: 'batch-1' } }) },
      });
      vi.spyOn(generationPipeline, 'runGenerationJob').mockRejectedValue(new Error('boom'));
      const worker = createJobWorker(deps);

      await worker.processJob({ id: 'job-1', shopDomain: 'shop-a', batchId: 'batch-1' });

      expect(batchesRepo.incrementBatchProgress).toHaveBeenCalledWith('batch-1', { succeeded: false });
    });

    it('never touches batchesRepo for a non-batch job, even when batchesRepo is provided', async () => {
      const batchesRepo = { incrementBatchProgress: vi.fn() };
      const deps = makeDeps({ batchesRepo });
      vi.spyOn(generationPipeline, 'runGenerationJob').mockResolvedValue([]);
      const worker = createJobWorker(deps);

      await worker.processJob({ id: 'job-1', shopDomain: 'shop-a' });

      expect(batchesRepo.incrementBatchProgress).not.toHaveBeenCalled();
    });
  });

  describe('enqueue concurrency limiting', () => {
    it('never runs more than perShopConcurrency jobs at once for the same shop', async () => {
      const deps = makeDeps({ perShopConcurrency: 2, globalConcurrency: 10 });
      let concurrent = 0;
      let maxConcurrent = 0;
      vi.spyOn(generationPipeline, 'runGenerationJob').mockImplementation(async () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((resolve) => setTimeout(resolve, 10));
        concurrent -= 1;
        return [];
      });
      const worker = createJobWorker(deps);

      await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          worker.enqueue({ id: `job-${i}`, shopDomain: 'shop-a' }).catch(() => {}),
        ),
      );

      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    it('gives each distinct shop its own independent concurrency slot', async () => {
      const deps = makeDeps({ perShopConcurrency: 1, globalConcurrency: 10 });
      deps.jobsRepo.claimForProcessing = vi.fn(async (jobId) => ({ claimed: true, job: { id: jobId } }));
      let concurrent = 0;
      let maxConcurrent = 0;
      vi.spyOn(generationPipeline, 'runGenerationJob').mockImplementation(async () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((resolve) => setTimeout(resolve, 10));
        concurrent -= 1;
        return [];
      });
      const worker = createJobWorker(deps);

      await Promise.all([
        worker.enqueue({ id: 'job-a', shopDomain: 'shop-a' }),
        worker.enqueue({ id: 'job-b', shopDomain: 'shop-b' }),
      ]);

      expect(maxConcurrent).toBe(2); // two shops, each with their own 1-slot limiter -> 2 concurrent overall
    });
  });

  describe('resumeFromFirestore', () => {
    it('re-enqueues every page of resumable jobs and returns the total count', async () => {
      const deps = makeDeps();
      deps.jobsRepo.queryResumableJobs = vi
        .fn()
        .mockResolvedValueOnce([{ id: 'job-1', shopDomain: 'shop-a', createdAt: 1 }, { id: 'job-2', shopDomain: 'shop-a', createdAt: 2 }])
        .mockResolvedValueOnce([]);
      vi.spyOn(generationPipeline, 'runGenerationJob').mockResolvedValue([]);
      const worker = createJobWorker(deps);

      const total = await worker.resumeFromFirestore({ pageSize: 2 });

      expect(total).toBe(2);
      expect(deps.jobsRepo.queryResumableJobs).toHaveBeenCalledTimes(2);
    });

    it('logs (does not throw) if an enqueued job rejects during resume', async () => {
      const deps = makeDeps();
      deps.jobsRepo.queryResumableJobs = vi.fn().mockResolvedValueOnce([{ id: 'job-1', shopDomain: 'shop-a' }]).mockResolvedValueOnce([]);
      deps.jobsRepo.claimForProcessing = vi.fn().mockRejectedValue(new Error('firestore down'));
      const worker = createJobWorker(deps);

      await expect(worker.resumeFromFirestore()).resolves.toBe(1);
      // allow the fire-and-forget enqueue() rejection to be handled
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(deps.logger.error).toHaveBeenCalled();
    });
  });
});
