// Merchant-facing, read-only model catalog listing, backing Custom Prompt
// Studio's ModelPicker. Every returned model already carries its precomputed
// imageCountConstraint — the frontend's getImageCountConstraint() is a
// trivial passthrough over this field, never an independently-derived enum
// (see allowedModelsSeedData.js's header comment for why).

const express = require('express');
const { wrapAsync } = require('../../middleware/wrapAsync');

/**
 * @param {{ allowedModelsRepo: object }} deps
 */
function createModelsRouter({ allowedModelsRepo }) {
  const router = express.Router();

  router.get(
    '/',
    wrapAsync(async (req, res) => {
      const models = await allowedModelsRepo.listModels({ eligibleFlow: req.query.eligibleFlow, category: req.query.category });
      res.json({ models });
    }),
  );

  return router;
}

module.exports = { createModelsRouter };
