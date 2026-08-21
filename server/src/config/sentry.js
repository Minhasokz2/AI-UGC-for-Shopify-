const Sentry = require('@sentry/node');
const { env } = require('./env');

let initialized = false;

function initSentry() {
  if (initialized || !env.SENTRY_DSN) return;
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV });
  initialized = true;
}

module.exports = { Sentry, initSentry };
