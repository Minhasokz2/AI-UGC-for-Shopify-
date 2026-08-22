// The PUBLIC half of the Google Sign-In popup contract — no session token
// involved, security comes entirely from the opaque `state` value minted by
// POST /api/auth/google-prepare (routes/api/authGoogle.js) and consumed
// exactly once here. Mounted at /api/auth/google, BEFORE the authenticated
// /api router in app.js.
//
// `start` doesn't need to touch Firestore at all: it just forwards `state`
// through to Google's consent URL (Google round-trips it back verbatim per
// the OAuth2 spec) — the actual state validation happens at `callback`, the
// only place shopDomain is actually needed. `callback` always resolves to a
// tiny HTML page that postMessages the result back to the opener and closes
// itself, per the reconciled frontend contract in
// web/src/hooks/useGoogleSignInPopup.js — it never redirects or renders
// visible content, so every failure path below still returns that same shape.

const express = require('express');
const { wrapAsync } = require('../../../middleware/wrapAsync');
const { logger } = require('../../../config/logger');

function popupResultHtml(type) {
  return `<!doctype html><html><body><script>
    window.opener.postMessage({source: 'motionart-google-auth', type: ${JSON.stringify(type)}}, window.location.origin);
    window.close();
  </script></body></html>`;
}

/**
 * @param {{ googleAuthStatesRepo: object, googleAuth: object, trialCreditsService: object }} deps
 */
function createPublicGoogleAuthRouter({ googleAuthStatesRepo, googleAuth, trialCreditsService }) {
  const router = express.Router();

  router.get('/start', (req, res) => {
    const { state } = req.query;
    if (!state || typeof state !== 'string') {
      res.status(400).send('Missing state');
      return;
    }
    res.redirect(googleAuth.getAuthUrl(state));
  });

  router.get(
    '/callback',
    wrapAsync(async (req, res) => {
      const { code, state, error: googleError } = req.query;

      if (googleError || !code || !state) {
        res.set('Content-Type', 'text/html').send(popupResultHtml('error'));
        return;
      }

      const consumed = await googleAuthStatesRepo.consumeState(state);
      if (!consumed) {
        res.set('Content-Type', 'text/html').send(popupResultHtml('error'));
        return;
      }

      let profile;
      try {
        profile = await googleAuth.exchangeCodeForProfile(code);
      } catch (err) {
        logger.error({ err, shopDomain: consumed.shopDomain }, 'Google token exchange failed');
        res.set('Content-Type', 'text/html').send(popupResultHtml('error'));
        return;
      }

      if (!profile.emailVerified) {
        res.set('Content-Type', 'text/html').send(popupResultHtml('error'));
        return;
      }

      await trialCreditsService.grantTrialIfEligible({ shopDomain: consumed.shopDomain, email: profile.email });
      res.set('Content-Type', 'text/html').send(popupResultHtml('success'));
    }),
  );

  return router;
}

module.exports = { createPublicGoogleAuthRouter, popupResultHtml };
