// Aggregates every /admin/api sub-router. Mounted in app.js behind
// middleware/adminAuth.js's shared-secret header check — never Shopify
// session auth, since the admin panel isn't Shopify-embedded. Ends with its
// own terminal 404, for the same reason routes/api/index.js does.

const express = require('express');
const { createAdminTemplatesRouter } = require('./templates');
const { createAdminModelsRouter } = require('./models');
const { createSeedModelsRouter } = require('./seedModels');
const { createPricingConfigRouter } = require('./pricingConfig');
const { createMarginRouter } = require('./margin');
const { createSweepsRouter } = require('./sweeps');

/**
 * @param {object} deps every repo/service the sub-routers need.
 */
function createAdminApiRouter(deps) {
  const router = express.Router();

  router.use('/templates', createAdminTemplatesRouter(deps));
  router.use('/models', createAdminModelsRouter(deps));
  router.use('/seed-models', createSeedModelsRouter(deps));
  router.use('/pricing-config', createPricingConfigRouter(deps));
  router.use('/margin', createMarginRouter(deps));
  router.use('/sweep', createSweepsRouter(deps));

  router.use((req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });

  return router;
}

module.exports = { createAdminApiRouter };
