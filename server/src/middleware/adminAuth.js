// Gates every /admin/api route (the standalone, non-embedded admin/ SPA) with
// a static shared-secret header, rather than Shopify session auth — the admin
// panel isn't Shopify-embedded and has no merchant identity to authenticate,
// only whoever holds ADMIN_API_KEY. Also gates the ADMIN_API_KEY-protected
// sweep endpoints (POST /admin/api/sweep/*) an external pinger hits.

const { UnauthorizedError } = require('../errors/AppError');

/**
 * @param {{ adminApiKey: string }} deps
 */
function createAdminAuth({ adminApiKey }) {
  return function adminAuth(req, res, next) {
    const provided = req.headers['x-admin-api-key'];
    if (!provided || provided !== adminApiKey) {
      next(new UnauthorizedError('Invalid or missing admin API key'));
      return;
    }
    next();
  };
}

module.exports = { createAdminAuth };
