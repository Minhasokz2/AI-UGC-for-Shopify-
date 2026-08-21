const USED_TRIAL_EMAILS_COLLECTION = 'used_trial_emails';

/**
 * One-time-grant trial-credit claim, keyed by whatever normalized email string
 * the caller supplies (normalization itself — stripping Gmail dots/+tags — is
 * services/trialCreditsService.js's job, not this repo's).
 * @param {{ db: object, FieldValue: object }} opts
 */
function createUsedTrialEmailsRepo({ db, FieldValue }) {
  const emailsCol = db.collection(USED_TRIAL_EMAILS_COLLECTION);

  /**
   * Atomic claim, modeled the same way as jobsRepo's idempotency key claim: a
   * single transaction, no separate "check" step. If a doc already exists for
   * this email the existing claim wins and is never overwritten.
   * @returns {Promise<{ claimed: boolean, existingShopDomain?: string }>}
   */
  async function claimTrialForEmail(normalizedEmail, { shopDomain }) {
    return db.runTransaction(async (tx) => {
      const ref = emailsCol.doc(normalizedEmail);
      const snap = await tx.get(ref);
      if (snap.exists) {
        return { claimed: false, existingShopDomain: snap.data().shopDomain };
      }
      tx.set(ref, { shopDomain, claimedAt: FieldValue.serverTimestamp() });
      return { claimed: true };
    });
  }

  return {
    claimTrialForEmail,
  };
}

let singleton;
/** Lazily builds the production singleton wired to the real Firestore. */
function getUsedTrialEmailsRepo() {
  if (!singleton) {
    const { getFirestore } = require('../config/firebase');
    const { FieldValue } = require('firebase-admin/firestore');
    singleton = createUsedTrialEmailsRepo({ db: getFirestore(), FieldValue });
  }
  return singleton;
}

module.exports = { createUsedTrialEmailsRepo, getUsedTrialEmailsRepo };
