// Render terminates TLS automatically for the default *.onrender.com
// hostname, which is why this app has run fine without any HTTPS enforcement
// of its own so far — but that protection is specific to Render's default
// domain, not something the app can rely on if a custom domain is ever
// pointed at it without equivalent TLS termination in front. This middleware
// makes the redirect-to-HTTPS behavior explicit and app-level instead of
// implicit and host-dependent (Shopify App Store requirement 3.1.1).
//
// Render's proxy sets `x-forwarded-proto` on every request it forwards, so
// that header (rather than `req.secure`, which needs `app.set('trust
// proxy', ...)` to be accurate behind any proxy) is the check. Skipped in
// non-production so local/dev HTTP just works.

function createHttpsRedirect({ nodeEnv }) {
  return function httpsRedirect(req, res, next) {
    if (nodeEnv !== 'production') return next();
    if (req.headers['x-forwarded-proto'] === 'https') return next();
    res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  };
}

module.exports = { createHttpsRedirect };
