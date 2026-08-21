// Google Sign-In (OAuth2) mechanics backing the popup flow's
// GET /api/auth/google/start and /callback routes (built later — this file
// only provides the OAuth mechanics). Verified against the installed
// `google-auth-library` package (v9.15.1):
// `new OAuth2Client({ clientId, clientSecret, redirectUri })` exposes
// `.generateAuthUrl(opts)` (sync, returns the consent URL string),
// `.getToken(code)` (resolves to `{ tokens: Credentials, res }`), and
// `.verifyIdToken({ idToken, audience })` (resolves to a `LoginTicket` whose
// `.getPayload()` returns the decoded `{ sub, email, email_verified, ... }`
// claims) — all exactly as assumed.

const { OAuth2Client } = require('google-auth-library');
const { env } = require('../config/env');

const SCOPES = ['openid', 'email', 'profile'];

let realClient;
/** Lazily-constructed real OAuth2Client, configured from env. */
function getClient() {
  if (!realClient) {
    realClient = new OAuth2Client({
      clientId: env.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirectUri: env.GOOGLE_OAUTH_REDIRECT_URI,
    });
  }
  return realClient;
}

/**
 * @param {string} state opaque CSRF-protection value round-tripped through Google
 * @param {{ client?: object }} [opts]
 * @returns {string} the Google consent URL to redirect the user to
 */
function getAuthUrl(state, { client = getClient() } = {}) {
  return client.generateAuthUrl({
    access_type: 'online',
    scope: SCOPES,
    state,
  });
}

/**
 * @param {string} code the authorization code from Google's redirect
 * @param {{ client?: object }} [opts]
 * @returns {Promise<{ email: string, emailVerified: boolean, sub: string }>}
 */
async function exchangeCodeForProfile(code, { client = getClient() } = {}) {
  const { tokens } = await client.getToken(code);
  if (!tokens || !tokens.id_token) {
    throw new Error('googleAuth.js: no id_token returned from Google token exchange');
  }
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: env.GOOGLE_OAUTH_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload) {
    throw new Error('googleAuth.js: could not decode Google ID token payload');
  }
  return {
    email: payload.email,
    emailVerified: !!payload.email_verified,
    sub: payload.sub,
  };
}

module.exports = { getAuthUrl, exchangeCodeForProfile, getClient };
