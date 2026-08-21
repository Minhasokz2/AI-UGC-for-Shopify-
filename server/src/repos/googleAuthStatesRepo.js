const GOOGLE_AUTH_STATES_COLLECTION = 'google_auth_states';
const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Short-lived (~10 min TTL) OAuth `state` records, swept lazily on consume
 * rather than via a cron.
 * @param {{ db: object, FieldValue: object }} opts
 */
function createGoogleAuthStatesRepo({ db, FieldValue }) {
  const statesCol = db.collection(GOOGLE_AUTH_STATES_COLLECTION);

  async function createState(state, { shopDomain }) {
    await statesCol.doc(state).set({ shopDomain, createdAt: FieldValue.serverTimestamp() });
  }

  /**
   * One-time use: consuming a state deletes it (inside a transaction, so it can
   * never be consumed twice even under a hypothetical race) whether or not it
   * turns out to be expired. A missing or expired state both resolve to
   * `undefined`.
   * @returns {Promise<{ shopDomain: string } | undefined>}
   */
  async function consumeState(state, { maxAgeMs = DEFAULT_MAX_AGE_MS } = {}) {
    return db.runTransaction(async (tx) => {
      const ref = statesCol.doc(state);
      const snap = await tx.get(ref);
      if (!snap.exists) return undefined;

      const data = snap.data();
      tx.delete(ref);

      const createdAtMs = data.createdAt?.toMillis?.() ?? 0;
      const isExpired = Date.now() - createdAtMs > maxAgeMs;
      if (isExpired) return undefined;

      return { shopDomain: data.shopDomain };
    });
  }

  return {
    createState,
    consumeState,
  };
}

let singleton;
/** Lazily builds the production singleton wired to the real Firestore. */
function getGoogleAuthStatesRepo() {
  if (!singleton) {
    const { getFirestore } = require('../config/firebase');
    const { FieldValue } = require('firebase-admin/firestore');
    singleton = createGoogleAuthStatesRepo({ db: getFirestore(), FieldValue });
  }
  return singleton;
}

module.exports = { createGoogleAuthStatesRepo, getGoogleAuthStatesRepo };
