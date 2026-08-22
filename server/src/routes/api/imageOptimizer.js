const express = require('express');
const { z } = require('zod');
const { wrapAsync } = require('../../middleware/wrapAsync');
const { NotFoundError } = require('../../errors/AppError');
const { OPTIMIZER_OPERATIONS } = require('../../services/imageOptimizerService');

const requestSchema = z.object({
  shopifyProductId: z.string(),
  imageUrl: z.string().url(),
  operation: z.enum([...OPTIMIZER_OPERATIONS]),
});

/**
 * @param {{ imageOptimizerService: object, conversionJobsRepo: object }} deps
 */
function createImageOptimizerRouter({ imageOptimizerService, conversionJobsRepo }) {
  const router = express.Router();

  router.post(
    '/',
    wrapAsync(async (req, res) => {
      const parsed = requestSchema.parse(req.body);
      const job = await imageOptimizerService.requestOptimization({ shopDomain: req.shopDomain, ...parsed });
      res.status(201).json({ job });
    }),
  );

  router.get(
    '/',
    wrapAsync(async (req, res) => {
      const jobs = await conversionJobsRepo.queryByShop({ shopDomain: req.shopDomain, status: req.query.status });
      res.json({ jobs });
    }),
  );

  router.get(
    '/:jobId',
    wrapAsync(async (req, res) => {
      const job = await conversionJobsRepo.getById(req.params.jobId);
      if (!job || job.shopDomain !== req.shopDomain) throw new NotFoundError('Conversion job not found');
      res.json({ job });
    }),
  );

  return router;
}

module.exports = { createImageOptimizerRouter };
