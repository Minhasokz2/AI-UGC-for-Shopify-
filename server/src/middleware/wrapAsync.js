// Wraps an async Express handler so a rejected promise reaches next(err) —
// and therefore middleware/errorHandler.js — instead of crashing the process
// or hanging the request. Every route handler in routes/ is wrapped in this.

/**
 * @param {(req: object, res: object, next: Function) => Promise<any>} handler
 * @returns {(req: object, res: object, next: Function) => void}
 */
function wrapAsync(handler) {
  return function wrapped(req, res, next) {
    // `handler` may throw synchronously before ever returning a promise (e.g. a
    // destructuring error reading req.body) — that throw happens outside
    // Promise.resolve()'s try/catch-equivalent, so it needs its own try/catch
    // rather than relying on .catch() alone to reach every failure path.
    try {
      Promise.resolve(handler(req, res, next)).catch(next);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { wrapAsync };
