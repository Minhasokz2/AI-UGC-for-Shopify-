// A general HTTP burst guard, distinct from the 20-concurrent-job-per-shop
// admission control enforced separately inside the job-creation route (see
// routes/api/jobs.js) via p-limit's pending-job count. This is a simple
// fixed-window counter per shopDomain, kept in-process memory — the app's
// in-process job worker already assumes a single server instance (see
// README), so an in-memory rate limiter is consistent with that, not an
// additional limitation.

const { RateLimitError } = require('../errors/AppError');

/**
 * Pure fixed-window check-and-increment: given the counter state for one key
 * and the current time, decides whether this request is allowed and returns
 * the state to store back. Extracted from the Express middleware below so the
 * windowing logic itself is directly unit-testable without req/res/Map plumbing.
 * @param {{ windowStart: number, count: number } | undefined} state
 * @param {number} now epoch ms
 * @param {{ windowMs: number, limit: number }} opts
 * @returns {{ allowed: boolean, state: { windowStart: number, count: number } }}
 */
function checkFixedWindow(state, now, { windowMs, limit }) {
  if (!state || now - state.windowStart >= windowMs) {
    return { allowed: true, state: { windowStart: now, count: 1 } };
  }
  if (state.count >= limit) {
    return { allowed: false, state };
  }
  return { allowed: true, state: { windowStart: state.windowStart, count: state.count + 1 } };
}

/**
 * @param {{ limit: number, windowMs?: number, keyFn?: (req: object) => string }} opts
 */
function createBurstGuard({ limit, windowMs = 60_000, keyFn = (req) => req.shopDomain }) {
  const counters = new Map();

  return function burstGuard(req, res, next) {
    const key = keyFn(req);
    const { allowed, state } = checkFixedWindow(counters.get(key), Date.now(), { windowMs, limit });
    counters.set(key, state);
    if (!allowed) {
      next(new RateLimitError());
      return;
    }
    next();
  };
}

module.exports = { createBurstGuard, checkFixedWindow };
