// Express app assembly. Ordering here is load-bearing — see the header
// comments on each section below for why each piece must come where it does.
// Built via createApp(deps) (deps from container.js) rather than importing
// singletons directly, so test/helpers/buildTestApp.js can build the exact
// same app wired to a fake Firestore + fake Shopify/external clients.

const express = require('express');
const path = require('path');
const { healthHandler } = require('./routes/health');
const { createWebhooksMiddleware } = require('./routes/webhooks');
const { createPublicApiRouter } = require('./routes/api/public');
const { createPublicGoogleAuthRouter } = require('./routes/api/auth/google');
const { createApiRouter } = require('./routes/api');
const { createAdminApiRouter } = require('./routes/admin');
const { createRequestLogger } = require('./middleware/requestLogger');
const { createAttachShopContext } = require('./middleware/auth');
const { createBurstGuard } = require('./middleware/rateLimiter');
const { createAdminAuth } = require('./middleware/adminAuth');
const { createErrorHandler } = require('./middleware/errorHandler');
const { env } = require('./config/env');

/**
 * @param {ReturnType<typeof import('./container').buildDependencies>} deps
 */
function createApp(deps) {
  const { shopify, webhookHandlers, shopsRepo } = deps;
  const app = express();

  app.disable('x-powered-by');
  app.use(createRequestLogger());

  // Before any auth — Render's healthCheckPath hits this.
  app.get('/health', healthHandler);

  // Must run before express.json(): shopify.processWebhooks() needs the raw
  // body for HMAC validation and parses it itself.
  app.use(env.SHOPIFY_WEBHOOK_PATH, createWebhooksMiddleware({ shopify, webhookHandlers }));

  // Raised above the default 100kb so a base64-encoded image upload fits.
  app.use(express.json({ limit: '10mb' }));

  // Unauthenticated carve-outs, mounted before the authenticated /api router.
  app.use('/api/public', createPublicApiRouter());
  app.use('/api/auth/google', createPublicGoogleAuthRouter(deps));

  // The authenticated /api router. validateAuthenticatedSession() sets
  // res.locals.shopify.session (confirmed against the installed SDK under
  // token exchange); attachShopContext turns that into req.shopDomain/req.shop.
  app.use(
    '/api',
    shopify.validateAuthenticatedSession(),
    createAttachShopContext({ shopsRepo }),
    createBurstGuard({ limit: env.RATE_LIMIT_PER_SHOP_PER_MIN }),
    createApiRouter(deps),
  );

  // /admin/api is gated by a static shared secret, not Shopify session auth.
  app.use('/admin/api', createAdminAuth({ adminApiKey: env.ADMIN_API_KEY }), createAdminApiRouter(deps));

  // Static admin/ SPA + fallback. Registered before the broader web/ static
  // block below so /admin/* never falls through to it. Not gated by
  // ensureInstalledOnShop — the admin panel isn't Shopify-embedded.
  const adminDist = path.join(__dirname, '../../admin/dist');
  app.use('/admin', express.static(adminDist));
  app.get('/admin', (req, res) => res.sendFile(path.join(adminDist, 'index.html')));
  app.get('/admin/*name', (req, res) => res.sendFile(path.join(adminDist, 'index.html')));

  // Static web/ SPA + fallback — the embedded merchant-facing app. Gated by
  // ensureInstalledOnShop(), which (confirmed against the installed SDK)
  // redirects into Shopify's embedded iframe URL if the page wasn't loaded
  // inside it yet, and otherwise just lets the first authenticated API call
  // mint the session via token exchange.
  const webDist = path.join(__dirname, '../../web/dist');
  app.use(express.static(webDist));
  const serveWebIndex = [shopify.ensureInstalledOnShop(), (req, res) => res.sendFile(path.join(webDist, 'index.html'))];
  app.get('/', ...serveWebIndex);
  app.get('/*name', ...serveWebIndex);

  // Final catch-all — reached only by a request method/path neither an API
  // router nor a static/SPA GET fallback matched (e.g. a stray POST).
  app.use((req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });

  app.use(createErrorHandler());

  return app;
}

module.exports = { createApp };
