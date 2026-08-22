// Thin wrapper around shopify.processWebhooks() — confirmed against the
// installed SDK, this returns an array of middleware ([express.text(), the
// actual dispatcher]) rather than an Express Router, and it internally
// registers its handlers via api.webhooks.addHandlers on first call. Must be
// mounted in app.js BEFORE the global express.json() middleware, since it
// needs the raw request body for HMAC validation.

/**
 * @param {{ shopify: object, webhookHandlers: object }} deps
 * @returns {Array<Function>} Express middleware array to mount at the webhook path
 */
function createWebhooksMiddleware({ shopify, webhookHandlers }) {
  return shopify.processWebhooks({ webhookHandlers });
}

module.exports = { createWebhooksMiddleware };
