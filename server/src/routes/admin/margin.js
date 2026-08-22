// Feeds admin/lib/marginMath.js's per-model margin calculator: every model's
// actual USD cost alongside its currently-assigned creditCost, so the admin
// can see (and the frontend can compute, client-side, per the plan) whether a
// model is priced with enough margin at every pack's revenue-per-credit rate.

const express = require('express');
const { wrapAsync } = require('../../middleware/wrapAsync');

/**
 * @param {{ allowedModelsRepo: object }} deps
 */
function createMarginRouter({ allowedModelsRepo }) {
  const router = express.Router();

  router.get(
    '/model-costs',
    wrapAsync(async (req, res) => {
      const models = await allowedModelsRepo.listModels();
      res.json({
        models: models.map((m) => ({
          id: m.id,
          label: m.label,
          category: m.category,
          actualCostUsd: m.actualCostUsd,
          creditCost: m.creditCost,
          needsPriceReview: !!m.needsPriceReview,
        })),
      });
    }),
  );

  return router;
}

module.exports = { createMarginRouter };
