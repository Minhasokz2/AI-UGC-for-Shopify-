const { ApiVersion } = require('@shopify/shopify-api');
const { shopifyApp } = require('@shopify/shopify-app-express');
const { env } = require('./env');
const { logger } = require('./logger');
const { getFirestore } = require('./firebase');
const { FirestoreSessionStorage } = require('../repos/FirestoreSessionStorage');

// Pinned to a specific dated version rather than LATEST_API_VERSION (which was
// removed from @shopify/shopify-api — apiVersion is now a required config field).
// Verified directly against the installed SDK at build time (2026-08-21):
// ApiVersion.July26 ("2026-07") is the current stable/GA quarterly version;
// October26 is still the unreleased release candidate until 2026-10-01. Re-verify
// before bumping; Shopify ships a new stable version every Jan/Apr/Jul/Oct 1st with
// roughly 9 months of overlap support.
const CURRENT_API_VERSION = ApiVersion.July26;

let cachedShopify;

/**
 * Lazily builds (and memoizes) the shopifyApp() instance. Lazy for the same reason
 * config/firebase.js's getFirestore() is lazy: constructing FirestoreSessionStorage
 * requires a real Firestore handle, which eagerly validates credentials — importing
 * this module (e.g. transitively, from a unit test that never touches Shopify auth)
 * must not crash on placeholder/test env values.
 *
 * Pass `{ db }` to build an independent, non-memoized instance wired to an injected
 * Firestore (real or fake) — used by test/helpers/buildTestApp.js so integration
 * tests never touch a real Firebase project.
 * @param {{ db?: import('firebase-admin/firestore').Firestore }} [overrides]
 */
function getShopify(overrides = {}) {
  if (cachedShopify && !overrides.db) return cachedShopify;

  const db = overrides.db || getFirestore();

  // `shopify` is declared with `let` (not `const`) so the `hooks.afterAuth` closure
  // below can reference it — by the time afterAuth actually runs (on a real
  // request, well after this function has returned), `shopify` is fully assigned.
  let shopify;
  shopify = shopifyApp({
    api: {
      apiKey: env.SHOPIFY_API_KEY,
      apiSecretKey: env.SHOPIFY_API_SECRET,
      apiVersion: CURRENT_API_VERSION,
      hostName: env.SHOPIFY_APP_URL.replace(/^https?:\/\//, ''),
      isEmbeddedApp: true,
      // `scopes` is deliberately omitted — this app uses Shopify-managed installation,
      // so scopes are declared in shopify.app.toml / the Partner Dashboard, not here.
      future: {
        // Embedded apps should use token exchange instead of the OAuth Authorization
        // Code Grant flow — avoids full-page-redirect reauth-loop failure modes inside
        // Shopify's admin iframe. Verified against the installed SDK's source
        // (middlewares/perform-token-exchange.mjs): hooks.afterAuth DOES still fire
        // under token exchange, once per newly-exchanged session (deduped by the
        // SDK's own idempotent-promise handler) — so webhook registration below is
        // the same afterAuth hook the classic OAuth flow would use, not a bespoke
        // lazy-registration workaround.
        tokenExchange: true,
      },
    },
    auth: { path: '/api/auth', callbackPath: '/api/auth/callback' },
    webhooks: { path: env.SHOPIFY_WEBHOOK_PATH },
    sessionStorage: new FirestoreSessionStorage(db),
    hooks: {
      afterAuth: async ({ session }) => {
        await shopify.registerWebhooks({ session });
        // Lazy require: shopsRepo depends on config/firebase (already loaded) but
        // this avoids config/shopify.js having a hard load-order dependency on the
        // repos layer for a callback that only ever runs at request time.
        const { getOrCreateShop } = require('../repos/shopsRepo');
        await getOrCreateShop(session.shop);
        logger.info({ shop: session.shop }, 'Registered webhooks and ensured shop doc after auth');
      },
    },
  });

  if (!overrides.db) cachedShopify = shopify;
  return shopify;
}

module.exports = { getShopify, CURRENT_API_VERSION };
