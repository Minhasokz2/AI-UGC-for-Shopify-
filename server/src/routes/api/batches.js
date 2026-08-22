// Bulk generation: one shared prompt/model/content-type applied across many
// catalog items in a single request, each becoming its own job under one
// `batches` doc. Reuses exactly the same admission-control order as
// routes/api/jobs.js (persona guard -> concurrency cap -> credits) but
// against the WHOLE batch's totals, since a batch that would blow either
// limit must fail atomically up front rather than partially create jobs.

const express = require('express');
const { z } = require('zod');
const { wrapAsync } = require('../../middleware/wrapAsync');
const { resolveAndEstimate } = require('./jobs');
const personaGuard = require('../../services/personaGuard');
const { ValidationError, ConcurrencyLimitError, NotFoundError } = require('../../errors/AppError');
const { JOB_WORKER_PER_SHOP_CONCURRENCY } = require('../../config/constants');
const { CONTENT_TYPES } = require('./jobs');

const createBatchSchema = z.object({
  contentType: z.enum(CONTENT_TYPES),
  templateId: z.string().optional(),
  modelId: z.string().optional(),
  prompt: z.string().optional(),
  numImages: z.number().int().min(1).max(10).default(1),
  personaAttributes: z.object({ ageRange: z.string() }).optional(),
  videoTier: z.enum(['fast', 'standard', 'premium']).optional(),
  productCategory: z.string().optional(),
  items: z.array(z.object({ sourceImageUrl: z.string().url() })).min(1).max(200),
});

/**
 * @param {{ jobsRepo: object, batchesRepo: object, templatesRepo: object, allowedModelsRepo: object, credits: object }} deps
 */
function createBatchesRouter({ jobsRepo, batchesRepo, templatesRepo, allowedModelsRepo, credits }) {
  const router = express.Router();

  router.post(
    '/',
    wrapAsync(async (req, res) => {
      const parsed = createBatchSchema.parse(req.body);
      const idempotencyKey = req.headers['idempotency-key'];
      if (!idempotencyKey || typeof idempotencyKey !== 'string') {
        throw new ValidationError('Missing required Idempotency-Key header');
      }

      if (parsed.contentType === 'ugc') {
        personaGuard.assertAdultPersona(parsed.personaAttributes);
      }

      const activeCount = await jobsRepo.countActiveJobsForShop(req.shopDomain);
      if (activeCount + parsed.items.length > JOB_WORKER_PER_SHOP_CONCURRENCY) {
        throw new ConcurrencyLimitError('shop');
      }

      const { costEstimateInput } = await resolveAndEstimate(parsed, { templatesRepo, allowedModelsRepo });
      const perItemCost = await credits.estimateJobCost(costEstimateInput);
      credits.assertSufficientCredits(req.shop, perItemCost * parsed.items.length);

      const batch = await batchesRepo.createBatch({
        shopDomain: req.shopDomain,
        totalCount: parsed.items.length,
        contentType: parsed.contentType,
      });

      const jobs = [];
      for (let i = 0; i < parsed.items.length; i += 1) {
        const item = parsed.items[i];
        // eslint-disable-next-line no-await-in-loop
        const { job } = await jobsRepo.claimAndCreateJob(req.shopDomain, `${idempotencyKey}:${i}`, {
          contentType: parsed.contentType,
          templateId: parsed.templateId,
          modelId: parsed.modelId,
          prompt: parsed.prompt,
          numImages: parsed.numImages,
          personaAttributes: parsed.personaAttributes,
          videoTier: parsed.videoTier,
          productCategory: parsed.productCategory,
          sourceImageUrl: item.sourceImageUrl,
          shopDomain: req.shopDomain,
          batchId: batch.id,
          status: 'pending',
          progressStage: null,
          resultVariations: [],
          approvedVariationIndices: [],
          publishStatus: 'unpublished',
          idempotencyKey: `${idempotencyKey}:${i}`,
        });
        jobs.push(job);
      }

      res.status(201).json({ batch, jobs });
    }),
  );

  router.get(
    '/:batchId',
    wrapAsync(async (req, res) => {
      const batch = await batchesRepo.getBatch(req.params.batchId);
      if (!batch || batch.shopDomain !== req.shopDomain) {
        throw new NotFoundError('Batch not found');
      }
      const jobs = await jobsRepo.queryJobs({ shopDomain: req.shopDomain, batchId: batch.id, limit: batch.totalCount });
      res.json({ batch, jobs });
    }),
  );

  return router;
}

module.exports = { createBatchesRouter, createBatchSchema };
