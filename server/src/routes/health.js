// Mounted before any auth in app.js — Render's healthCheckPath hits this.
// A plain handler, not a Router: app.js mounts it with app.get('/health', ...)
// (an exact-path match, not an app.use() prefix mount), and a Router's own
// internal routes are matched against the ORIGINAL unstripped req.url — a
// Router with an internal '/' route would never match a request whose url is
// still '/health' at that point, so it must be a plain (req, res) handler.

function healthHandler(req, res) {
  res.json({ status: 'ok' });
}

module.exports = { healthHandler };
