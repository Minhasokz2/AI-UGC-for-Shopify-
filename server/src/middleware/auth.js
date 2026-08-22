// Runs immediately after shopify.validateAuthenticatedSession() in the
// authenticated /api router (see app.js) — that middleware, confirmed against
// the installed SDK's source, sets `res.locals.shopify.session` (a real
// Session instance) on success. This middleware turns that into the two
// things every downstream /api route handler actually wants:
// `req.shopDomain` (a plain string) and `req.shop` (the shop's Firestore
// doc, auto-created on first authenticated call via the same idempotent
// getOrCreateShop used by config/shopify.js's afterAuth hook — so a shop
// doc exists even if webhook registration's afterAuth call somehow raced or
// failed).

const { UnauthorizedError } = require('../errors/AppError');

/**
 * @param {{ shopsRepo: object }} deps
 */
function createAttachShopContext({ shopsRepo }) {
  return function attachShopContext(req, res, next) {
    const shopDomain = res.locals?.shopify?.session?.shop;
    if (!shopDomain) {
      next(new UnauthorizedError('No authenticated session found'));
      return;
    }
    req.shopDomain = shopDomain;
    shopsRepo
      .getOrCreateShop(shopDomain)
      .then((shop) => {
        req.shop = shop;
        next();
      })
      .catch(next);
  };
}

module.exports = { createAttachShopContext };
