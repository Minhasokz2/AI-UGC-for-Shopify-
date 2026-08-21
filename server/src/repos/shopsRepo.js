const SHOPS_COLLECTION = 'shops';

const SHOP_DEFAULTS = {
  creditBalance: 0,
  plan: 'metered',
  googleVerified: false,
  verifiedEmail: null,
  brandStyleProfile: null,
  referralCode: null,
  addOns: { imageOptimizer: false },
  lifetimeCreditsSpent: 0,
  lifetimeImagesGenerated: 0,
  uninstalledAt: null,
  firstJobCreatedAt: null,
};

/**
 * Factory so tests can inject a fake Firestore + FieldValue instead of the real
 * firebase-admin handle, matching every other repo in this codebase.
 * @param {{ db: object, FieldValue: object }} opts
 */
function createShopsRepo({ db, FieldValue }) {
  const shopsCol = db.collection(SHOPS_COLLECTION);

  /**
   * Idempotent shop bootstrap: reads the shop doc inside a transaction and, if
   * missing, creates it with defaults and returns it. Because the read-check-write
   * happens in one transaction, repeated/concurrent calls never duplicate the doc
   * or reset fields an existing shop has since mutated (e.g. creditBalance).
   */
  async function getOrCreateShop(shopDomain) {
    return db.runTransaction(async (tx) => {
      const ref = shopsCol.doc(shopDomain);
      const snap = await tx.get(ref);
      if (snap.exists) {
        return { id: shopDomain, ...snap.data() };
      }
      const shop = {
        shopDomain,
        ...SHOP_DEFAULTS,
        installedAt: FieldValue.serverTimestamp(),
      };
      tx.set(ref, shop);
      return { id: shopDomain, ...shop };
    });
  }

  async function getShop(shopDomain) {
    const snap = await shopsCol.doc(shopDomain).get();
    return snap.exists ? { id: shopDomain, ...snap.data() } : undefined;
  }

  async function updateShop(shopDomain, fields) {
    await shopsCol.doc(shopDomain).update(fields);
  }

  /**
   * Sets `firstJobCreatedAt` only if it isn't already set, backing the
   * onboarding-card dismissal condition ("disappears permanently once a first job
   * exists"). Read-check-then-write in a transaction so a second call is a no-op
   * that never overwrites the original timestamp.
   */
  async function markFirstJobCreated(shopDomain) {
    return db.runTransaction(async (tx) => {
      const ref = shopsCol.doc(shopDomain);
      const snap = await tx.get(ref);
      const shop = snap.exists ? snap.data() : {};
      if (shop.firstJobCreatedAt) return;
      tx.update(ref, { firstJobCreatedAt: FieldValue.serverTimestamp() });
    });
  }

  async function markUninstalled(shopDomain) {
    await shopsCol.doc(shopDomain).update({ uninstalledAt: FieldValue.serverTimestamp() });
  }

  return {
    getOrCreateShop,
    getShop,
    updateShop,
    markFirstJobCreated,
    markUninstalled,
  };
}

let singleton;
/** Lazily builds the production singleton wired to the real Firestore. */
function getShopsRepo() {
  if (!singleton) {
    const { getFirestore } = require('../config/firebase');
    const { FieldValue } = require('firebase-admin/firestore');
    singleton = createShopsRepo({ db: getFirestore(), FieldValue });
  }
  return singleton;
}

module.exports = { createShopsRepo, getShopsRepo };
