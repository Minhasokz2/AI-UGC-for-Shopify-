const express = require('express');
const { z } = require('zod');
const { wrapAsync } = require('../../middleware/wrapAsync');
const { NotFoundError, ValidationError } = require('../../errors/AppError');

const publishSchema = z.object({
  jobId: z.string(),
  shopifyProductId: z.string(),
  approvedVariationIndices: z.array(z.number().int().min(0)).min(1),
});

/**
 * @param {{ jobsRepo: object, publishService: object }} deps
 */
function createPublishRouter({ jobsRepo, publishService }) {
  const router = express.Router();

  router.post(
    '/',
    wrapAsync(async (req, res) => {
      const { jobId, shopifyProductId, approvedVariationIndices } = publishSchema.parse(req.body);

      const job = await jobsRepo.getById(jobId);
      if (!job || job.shopDomain !== req.shopDomain) {
        throw new NotFoundError('Job not found');
      }
      if (job.status !== 'succeeded') {
        throw new ValidationError('Job must have succeeded before it can be published');
      }

      const result = await publishService.publishJob({
        job,
        session: res.locals.shopify.session,
        approvedVariationIndices,
        shopifyProductId,
      });

      res.json(result);
    }),
  );

  return router;
}

module.exports = { createPublishRouter, publishSchema };
