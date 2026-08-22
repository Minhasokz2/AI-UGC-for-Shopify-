// Admin CRUD over the shared allowed-models catalog. Distinct from
// routes/api/models.js, which is the merchant-facing read-only list.

const express = require('express');
const { wrapAsync } = require('../../middleware/wrapAsync');
const { NotFoundError } = require('../../errors/AppError');

/**
 * @param {{ allowedModelsRepo: object }} deps
 */
function createAdminModelsRouter({ allowedModelsRepo }) {
  const router = express.Router();

  router.get(
    '/',
    wrapAsync(async (req, res) => {
      const models = await allowedModelsRepo.listModels({ eligibleFlow: req.query.eligibleFlow, category: req.query.category });
      res.json({ models });
    }),
  );

  router.get(
    '/:id',
    wrapAsync(async (req, res) => {
      const model = await allowedModelsRepo.getModel(req.params.id);
      if (!model) throw new NotFoundError('Model not found');
      res.json({ model });
    }),
  );

  router.put(
    '/:id',
    wrapAsync(async (req, res) => {
      await allowedModelsRepo.upsertModel(req.params.id, req.body);
      const model = await allowedModelsRepo.getModel(req.params.id);
      res.json({ model });
    }),
  );

  router.delete(
    '/:id',
    wrapAsync(async (req, res) => {
      await allowedModelsRepo.deleteModel(req.params.id);
      res.status(204).end();
    }),
  );

  return router;
}

module.exports = { createAdminModelsRouter };
