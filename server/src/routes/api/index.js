// Aggregates every authenticated /api sub-router. Mounted in app.js AFTER
// shopify.validateAuthenticatedSession() + attachShopContext + the burst
// guard, so every handler below can trust req.shopDomain/req.shop. Ends with
// its own terminal 404 — load-bearing: without it, an unmatched /api/* path
// would fall through past this router into the static/SPA-fallback layers
// mounted later in app.js and silently get a 200 HTML page instead of a 404.

const express = require('express');
const { createJobsRouter } = require('./jobs');
const { createBatchesRouter } = require('./batches');
const { createTemplatesRouter } = require('./templates');
const { createModelsRouter } = require('./models');
const { createProductsRouter } = require('./products');
const { createUploadsRouter } = require('./uploads');
const { createPublishRouter } = require('./publish');
const { createBillingRouter } = require('./billing');
const { createReferralsRouter } = require('./referrals');
const { createBrandSettingsRouter } = require('./brandSettings');
const { createImageOptimizerRouter } = require('./imageOptimizer');
const { createUsageStatsRouter } = require('./usageStats');
const { createAuthGoogleRouter } = require('./authGoogle');

/**
 * @param {object} deps every repo/service the sub-routers need — see each
 *   sub-router's own factory for its exact shape.
 */
function createApiRouter(deps) {
  const router = express.Router();

  router.use('/jobs', createJobsRouter(deps));
  router.use('/batches', createBatchesRouter(deps));
  router.use('/templates', createTemplatesRouter(deps));
  router.use('/models', createModelsRouter(deps));
  router.use('/products', createProductsRouter(deps));
  router.use('/uploads', createUploadsRouter(deps));
  router.use('/publish', createPublishRouter(deps));
  router.use('/billing', createBillingRouter(deps));
  router.use('/referrals', createReferralsRouter(deps));
  router.use('/brand-settings', createBrandSettingsRouter(deps));
  router.use('/image-optimizer', createImageOptimizerRouter(deps));
  router.use('/usage-stats', createUsageStatsRouter(deps));
  router.use('/auth', createAuthGoogleRouter(deps));

  router.use((req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });

  return router;
}

module.exports = { createApiRouter };
