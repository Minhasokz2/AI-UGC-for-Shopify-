// Admin CRUD over the shared (not shop-scoped) template catalog. Distinct
// from routes/api/templates.js, which is the merchant-facing read-only list.

const express = require('express');
const { wrapAsync } = require('../../middleware/wrapAsync');
const { NotFoundError } = require('../../errors/AppError');

/**
 * @param {{ templatesRepo: object }} deps
 */
function createAdminTemplatesRouter({ templatesRepo }) {
  const router = express.Router();

  router.get(
    '/',
    wrapAsync(async (req, res) => {
      const templates = await templatesRepo.listTemplates({ category: req.query.category });
      res.json({ templates });
    }),
  );

  router.get(
    '/:slug',
    wrapAsync(async (req, res) => {
      const template = await templatesRepo.getTemplate(req.params.slug);
      if (!template) throw new NotFoundError('Template not found');
      res.json({ template });
    }),
  );

  router.put(
    '/:slug',
    wrapAsync(async (req, res) => {
      await templatesRepo.upsertTemplate(req.params.slug, req.body);
      const template = await templatesRepo.getTemplate(req.params.slug);
      res.json({ template });
    }),
  );

  router.delete(
    '/:slug',
    wrapAsync(async (req, res) => {
      await templatesRepo.deleteTemplate(req.params.slug);
      res.status(204).end();
    }),
  );

  return router;
}

module.exports = { createAdminTemplatesRouter };
