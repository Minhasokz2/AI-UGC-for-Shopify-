// Job creation, listing, and detail — the core generation-request surface.
// Every business rule the spec calls out explicitly happens here, in this
// order (each one short-circuits before any Firestore write, except the
// idempotency+job-creation transaction itself which is inherently atomic):
//   1. persona guard (422) — before any cost is even estimated
//   2. per-shop concurrent-job cap (429) — before spending a cost estimate
//   3. sufficient-credits check (402) — the last gate before the write
//   4. idempotent job creation (201 new / 200 replay) via jobsRepo.claimAndCreateJob
//
// Model resolution deliberately happens here too (not deferred to the worker)
// so the cost estimate is against a real resolved model rather than a guess —
// generationPipeline.js re-resolves it again at run time rather than trusting
// this snapshot, exactly like credits.recomputeCost never trusts the estimate
// written here.

const express = require('express');
const { z } = require('zod');
const { wrapAsync } = require('../../middleware/wrapAsync');
const { resolveModelForJob } = require('../../services/generationPipeline');
const personaGuard = require('../../services/personaGuard');
const { ValidationError, NotFoundError, ConcurrencyLimitError } = require('../../errors/AppError');
const { JOB_WORKER_PER_SHOP_CONCURRENCY } = require('../../config/constants');

const CONTENT_TYPES = ['scene', 'ugc', 'video', 'custom', 'tryOn'];

const createJobSchema = z.object({
  contentType: z.enum(CONTENT_TYPES),
  templateId: z.string().optional(),
  modelId: z.string().optional(),
  prompt: z.string().optional(),
  sourceImageUrl: z.string().url().optional(),
  imageUrls: z.array(z.string().url()).optional(),
  personImageUrl: z.string().url().optional(),
  garmentImageUrl: z.string().url().optional(),
  numImages: z.number().int().min(1).max(10).default(1),
  personaAttributes: z.object({ ageRange: z.string() }).optional(),
  videoTier: z.enum(['fast', 'standard', 'premium']).optional(),
  productCategory: z.string().optional(),
  reuseProcessedImageFrom: z.string().optional(),
  batchId: z.string().optional(),
});

/**
 * Resolves the model up front to (a) validate templateId/modelId exist and
 * (b) get a real cost estimate — see file header. For a template-based job,
 * `templateId` (not the resolved model's id) stays the job's cost-lookup key,
 * since a template's own creditCost can differ from its underlying model's.
 * @returns {Promise<{ model: object, costEstimateInput: { templateId?: string, modelId?: string, numImages: number } }>}
 */
async function resolveAndEstimate(job, { templatesRepo, allowedModelsRepo }) {
  const model = await resolveModelForJob(job, { templatesRepo, allowedModelsRepo });
  const costEstimateInput = job.templateId
    ? { templateId: job.templateId, numImages: job.numImages }
    : { modelId: job.modelId || model.id, numImages: job.numImages };
  return { model, costEstimateInput };
}

/**
 * @param {{ jobsRepo: object, templatesRepo: object, allowedModelsRepo: object, credits: object }} deps
 */
function createJobsRouter({ jobsRepo, templatesRepo, allowedModelsRepo, credits, jobWorker }) {
  const router = express.Router();

  router.post(
    '/',
    wrapAsync(async (req, res) => {
      const parsed = createJobSchema.parse(req.body);
      const idempotencyKey = req.headers['idempotency-key'];
      if (!idempotencyKey || typeof idempotencyKey !== 'string') {
        throw new ValidationError('Missing required Idempotency-Key header');
      }

      if (parsed.contentType === 'ugc') {
        personaGuard.assertAdultPersona(parsed.personaAttributes);
      }

      const activeCount = await jobsRepo.countActiveJobsForShop(req.shopDomain);
      if (activeCount >= JOB_WORKER_PER_SHOP_CONCURRENCY) {
        throw new ConcurrencyLimitError('shop');
      }

      const { costEstimateInput } = await resolveAndEstimate(parsed, { templatesRepo, allowedModelsRepo });
      const estimatedCost = await credits.estimateJobCost(costEstimateInput);
      credits.assertSufficientCredits(req.shop, estimatedCost);

      const { job, isNew } = await jobsRepo.claimAndCreateJob(req.shopDomain, idempotencyKey, {
        ...parsed,
        shopDomain: req.shopDomain,
        status: 'pending',
        progressStage: null,
        resultVariations: [],
        approvedVariationIndices: [],
        publishStatus: 'unpublished',
        idempotencyKey,
      });

      // Fire-and-forget: starts processing immediately rather than waiting for
      // the next poll cycle. A replay (isNew:false) or a process that dies
      // right after this call is still safe — resumeFromFirestore picks up
      // anything left pending on the next boot, and the worker's own claim
      // transaction makes a duplicate enqueue() a no-op.
      if (isNew) jobWorker.enqueue(job).catch(() => {});

      res.status(isNew ? 201 : 200).json({ job });
    }),
  );

  router.get(
    '/',
    wrapAsync(async (req, res) => {
      const { status, batchId, contentType, limit } = req.query;
      const jobs = await jobsRepo.queryJobs({
        shopDomain: req.shopDomain,
        status,
        batchId,
        contentType,
        limit: limit ? Number(limit) : undefined,
      });
      res.json({ jobs });
    }),
  );

  router.get(
    '/:jobId',
    wrapAsync(async (req, res) => {
      const job = await jobsRepo.getById(req.params.jobId);
      if (!job || job.shopDomain !== req.shopDomain) {
        throw new NotFoundError('Job not found');
      }
      res.json({ job });
    }),
  );

  return router;
}

module.exports = { createJobsRouter, createJobSchema, resolveAndEstimate, CONTENT_TYPES };
