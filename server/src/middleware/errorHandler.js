// The global error handler — mounted LAST in app.js, after every route.
// `err.message` is returned verbatim to the client only for statusCode < 500
// (AppError subclasses the app deliberately throws to communicate something
// safe to show the merchant); any >= 500 error's real message never reaches
// the client regardless of what's set on it — only a fixed generic string
// does — while the real message/stack still go to the log and Sentry, tagged
// with shopDomain/jobId when available so a real incident can be traced back
// to the request that caused it.
//
// Job-worker failures deliberately do NOT go through this handler — a worker
// has no HTTP response to send, so workers/jobWorker.js calls
// Sentry.captureException directly in its own catch block instead.

const { Sentry } = require('../config/sentry');

const GENERIC_MESSAGE = 'Internal server error';

/**
 * @param {{ logger?: object, captureException?: Function }} [deps] injectable for tests
 */
function createErrorHandler({ logger = require('../config/logger').logger, captureException = Sentry.captureException.bind(Sentry) } = {}) {
  // eslint-disable-next-line no-unused-vars
  return function errorHandler(err, req, res, next) {
    const statusCode = err.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;
    const expose = err.expose !== false && statusCode < 500;

    if (statusCode >= 500) {
      logger.error({ err, shopDomain: req.shopDomain, jobId: req.params?.jobId }, 'Unhandled server error');
      captureException(err, { tags: { shopDomain: req.shopDomain, jobId: req.params?.jobId } });
    }

    const body = { error: { code: err.code || 'INTERNAL_ERROR', message: expose ? err.message : GENERIC_MESSAGE } };
    if (expose && err.details) body.error.details = err.details;
    // PublishError's shopifyErrors is Shopify's own structured userErrors array
    // (field/message pairs) — already safe, actionable, merchant-facing data
    // distinct from the exception's own `message`, so it's surfaced even though
    // PublishError's 502 status masks the top-level message above.
    if (err.shopifyErrors?.length) body.error.shopifyErrors = err.shopifyErrors;

    res.status(statusCode).json(body);
  };
}

module.exports = { createErrorHandler, GENERIC_MESSAGE };
