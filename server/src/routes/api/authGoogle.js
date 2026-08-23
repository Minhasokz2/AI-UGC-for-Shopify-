// The AUTHENTICATED half of the Google Sign-In popup contract (mounted inside
// the normal /api router, so it has req.shopDomain from attachShopContext).
// Its counterpart, the PUBLIC start/callback pair Google itself redirects
// through, lives in routes/api/auth/google.js — split because a window.open()
// navigation carries none of App Bridge's session-token headers, so the
// popup's own first hit to the backend can't go through
// validateAuthenticatedSession().

const express = require('express');
const crypto = require('crypto');
const { wrapAsync } = require('../../middleware/wrapAsync');

/**
 * @param {{ googleAuthStatesRepo: object, shopsRepo: object }} deps
 */
function createAuthGoogleRouter({ googleAuthStatesRepo, shopsRepo }) {
  const router = express.Router();

  router.post(
    '/google-prepare',
    wrapAsync(async (req, res) => {
      const state = crypto.randomBytes(24).toString('hex');
      await googleAuthStatesRepo.createState(state, { shopDomain: req.shopDomain });
      res.json({ popupUrl: `/api/auth/google/start?state=${state}` });
    }),
  );

  // Resets ONLY the UI gate (googleVerified) so GoogleSignInGate re-prompts —
  // never touches trialEligibilityLocked, so cycling through Google accounts
  // can't be used to re-claim the free trial (see trialCreditsService).
  router.post(
    '/google-sign-out',
    wrapAsync(async (req, res) => {
      await shopsRepo.updateShop(req.shopDomain, { googleVerified: false, verifiedEmail: null });
      res.status(204).end();
    }),
  );

  return router;
}

module.exports = { createAuthGoogleRouter };
