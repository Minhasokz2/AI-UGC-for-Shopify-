const REFERRALS_COLLECTION = 'referrals';

/**
 * Factory so tests can inject a fake Firestore + FieldValue instead of the real
 * firebase-admin handle, matching every other repo in this codebase.
 * @param {{ db: object, FieldValue: object }} opts
 */
function createReferralsRepo({ db, FieldValue }) {
  const referralsCol = db.collection(REFERRALS_COLLECTION);

  async function createReferral({ referrerShopDomain, referredShopDomain, code }) {
    const ref = referralsCol.doc();
    const referral = {
      referrerShopDomain,
      referredShopDomain,
      code,
      status: 'pending',
      commissionOwedCents: 0,
      createdAt: FieldValue.serverTimestamp(),
    };
    await ref.set(referral);
    return { id: ref.id, ...referral };
  }

  /** At most one referral record should exist per referred shop — a shop is referred once. */
  async function findByReferredShop(referredShopDomain) {
    const snap = await referralsCol.where('referredShopDomain', '==', referredShopDomain).limit(1).get();
    if (snap.empty) return undefined;
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  async function markConverted(referralId) {
    await referralsCol.doc(referralId).update({
      status: 'converted',
      convertedAt: FieldValue.serverTimestamp(),
    });
  }

  /** Single-document single-field increment — doesn't need a full transaction. */
  async function accrueCommission(referralId, amountCents) {
    await referralsCol.doc(referralId).update({
      commissionOwedCents: FieldValue.increment(amountCents),
    });
  }

  async function listByReferrer(referrerShopDomain) {
    const snap = await referralsCol.where('referrerShopDomain', '==', referrerShopDomain).get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  return {
    createReferral,
    findByReferredShop,
    markConverted,
    accrueCommission,
    listByReferrer,
  };
}

let singleton;
/** Lazily builds the production singleton wired to the real Firestore. */
function getReferralsRepo() {
  if (!singleton) {
    const { getFirestore } = require('../config/firebase');
    const { FieldValue } = require('firebase-admin/firestore');
    singleton = createReferralsRepo({ db: getFirestore(), FieldValue });
  }
  return singleton;
}

module.exports = { createReferralsRepo, getReferralsRepo };
