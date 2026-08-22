// Attaches a per-request child logger (req.log) via pino-http, so every log
// line during a request carries a shared request id — and so
// middleware/errorHandler.js's `req.log?.error(...)` call always has
// something to call. Mounted early in app.js, before any route.

const pinoHttp = require('pino-http');
const { logger } = require('../config/logger');

function createRequestLogger() {
  return pinoHttp({ logger });
}

module.exports = { createRequestLogger };
