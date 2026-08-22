// Boot sequence: env validate -> firebase init -> resumeFromFirestore ->
// listen. Requiring config/env.js (transitively, via config/logger.js and
// everything else) already validates process.env at import time and throws
// before any of this runs — env problems crash the boot process immediately
// rather than surfacing later at first use.

const os = require('os');
const { FieldValue } = require('firebase-admin/firestore');
const { env } = require('./config/env');
const { logger } = require('./config/logger');
const { initSentry, Sentry } = require('./config/sentry');
const { getFirestore } = require('./config/firebase');
const { getShopify } = require('./config/shopify');
const { buildDependencies } = require('./container');
const { createApp } = require('./app');

async function main() {
  initSentry();

  const db = getFirestore();
  const shopify = getShopify({ db });
  const workerId = `${os.hostname()}-${process.pid}`;
  const deps = buildDependencies({ db, FieldValue, shopify, workerId });

  // A resume failure (e.g. a transient Firestore hiccup, or — in a
  // placeholder-credentials boot — no real connectivity at all) must never
  // block the server from listening: the health check and every route still
  // need to come up. Anything left un-resumed here is still safe — the next
  // boot's resume pass (or the sweep endpoints) will pick it up.
  try {
    const [jobsResumed, optimizerJobsResumed] = await Promise.all([
      deps.jobWorker.resumeFromFirestore(),
      deps.imageOptimizerWorker.resumeFromFirestore(),
    ]);
    logger.info({ jobsResumed, optimizerJobsResumed }, 'Resumed in-flight jobs from Firestore');
  } catch (err) {
    logger.error({ err }, 'Failed to resume in-flight jobs from Firestore — continuing boot anyway');
  }

  const app = createApp(deps);
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, workerId }, 'AI UGC Generator server listening');
  });

  const shutdown = (signal) => {
    logger.info({ signal }, 'Shutting down');
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

if (require.main === module) {
  main().catch((err) => {
    // Sentry may not have flushed by the time process.exit runs below, but
    // this is a boot-time fatal — there's no request context to attach it to
    // anyway, so a synchronous console.error is the honest fallback.
    // eslint-disable-next-line no-console
    console.error('Fatal error during boot:', err);
    Sentry.captureException(err);
    process.exit(1);
  });
}

module.exports = { main };
