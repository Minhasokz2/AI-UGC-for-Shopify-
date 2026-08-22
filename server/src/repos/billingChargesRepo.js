// Idempotent record of which Shopify billing charges (subscription activations,
// one-time purchases, and monthly-renewal cycles) have already had their credits
// granted. This exists because credit-granting is triggered from two independent
// places that can both fire for the same charge — a webhook/confirmation-page
// callback, and billingReconciliation.js's periodic poll of
// currentAppInstallation.activeSubscriptions (which exists specifically because
// Shopify does NOT fire APP_SUBSCRIPTIONS_UPDATE on routine successful renewal).
// Without this claim, a renewal could be credited twice.

const BILLING_CHARGES_COLLECTION = 'billing_charges';

/**
 * @param {{ db: object, FieldValue: object }} opts
 */
function createBillingChargesRepo({ db, FieldValue }) {
  const chargesCol = db.collection(BILLING_CHARGES_COLLECTION);

  /**
   * Atomic claim, modeled the same way as usedTrialEmailsRepo/jobsRepo's
   * idempotency-key claim: a single transaction, no separate check step. The
   * `chargeKey` must uniquely identify the thing being credited — for a one-time
   * purchase that's the Shopify charge GID; for a subscription renewal it's
   * `${subscriptionId}:${currentPeriodEnd}` so each billing cycle claims once.
   * @returns {Promise<{ claimed: boolean }>}
   */
  async function claimCharge(chargeKey, { shopDomain, credits, type }) {
    return db.runTransaction(async (tx) => {
      const ref = chargesCol.doc(chargeKey);
      const snap = await tx.get(ref);
      if (snap.exists) {
        return { claimed: false };
      }
      tx.set(ref, { shopDomain, credits, type, processedAt: FieldValue.serverTimestamp() });
      return { claimed: true };
    });
  }

  return {
    claimCharge,
  };
}

let singleton;
/** Lazily builds the production singleton wired to the real Firestore. */
function getBillingChargesRepo() {
  if (!singleton) {
    const { getFirestore } = require('../config/firebase');
    const { FieldValue } = require('firebase-admin/firestore');
    singleton = createBillingChargesRepo({ db: getFirestore(), FieldValue });
  }
  return singleton;
}

module.exports = { createBillingChargesRepo, getBillingChargesRepo };
