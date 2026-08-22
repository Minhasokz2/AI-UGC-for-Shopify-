// Merchant-facing, read-only template listing for the Templates Gallery.
// Admin CRUD over the same collection lives under /admin/api/templates.

const express = require('express');
const { wrapAsync } = require('../../middleware/wrapAsync');

/**
 * @param {{ templatesRepo: object }} deps
 */
function createTemplatesRouter({ templatesRepo }) {
  const router = express.Router();

  router.get(
    '/',
    wrapAsync(async (req, res) => {
      const templates = await templatesRepo.listTemplates({ category: req.query.category });
      res.json({ templates });
    }),
  );

  return router;
}

module.exports = { createTemplatesRouter };
