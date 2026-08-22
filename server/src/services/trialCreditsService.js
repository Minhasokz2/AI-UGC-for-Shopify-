// Grants the one-time free trial credit balance after a merchant completes the
// Google Sign-In gate. Two independent anti-abuse checks guard this, since
// either alone is bypassable: (1) a shop can only ever be granted a trial once
// (`shop.googleVerified`), and (2) a single Google identity can't fund
// unlimited trials across many shops (`usedTrialEmailsRepo`'s one-claim-per-
// normalized-email record, keyed globally rather than per shop).

const { FREE_TRIAL_CREDITS } = require('../config/constants');

/**
 * Standard Gmail normalization: `a.b+tag@gmail.com` and `ab@googlemail.com`
 * are the same inbox, so both must resolve to the same trial-eligibility key.
 * Every other provider is left as-is (most don't support this, and guessing
 * wrong would incorrectly merge two real distinct merchants).
 * @param {string} email
 * @returns {string}
 */
function normalizeEmail(email) {
  const trimmed = email.trim().toLowerCase();
  const [local, domain] = trimmed.split('@');
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    const withoutTag = local.split('+')[0];
    const withoutDots = withoutTag.replace(/\./g, '');
    return `${withoutDots}@gmail.com`;
  }
  return trimmed;
}

/**
 * @param {{ shopsRepo: object, usedTrialEmailsRepo: object, FieldValue: object }} deps
 */
function createTrialCreditsService({ shopsRepo, usedTrialEmailsRepo, FieldValue }) {
  /**
   * @param {{ shopDomain: string, email: string }} params
   * @returns {Promise<{ granted: boolean, credits?: number, reason?: string, existingShopDomain?: string }>}
   */
  async function grantTrialIfEligible({ shopDomain, email }) {
    const shop = await shopsRepo.getShop(shopDomain);
    if (shop?.googleVerified) {
      return { granted: false, reason: 'shop_already_verified' };
    }

    const normalizedEmail = normalizeEmail(email);
    const claim = await usedTrialEmailsRepo.claimTrialForEmail(normalizedEmail, { shopDomain });
    if (!claim.claimed) {
      // The Google identity was already spent on a trial elsewhere — the sign-in
      // itself still counts (unlocks the app for this shop), but no free credits.
      await shopsRepo.updateShop(shopDomain, { googleVerified: true, verifiedEmail: email });
      return { granted: false, reason: 'email_already_used', existingShopDomain: claim.existingShopDomain };
    }

    await shopsRepo.updateShop(shopDomain, {
      googleVerified: true,
      verifiedEmail: email,
      creditBalance: FieldValue.increment(FREE_TRIAL_CREDITS),
    });
    return { granted: true, credits: FREE_TRIAL_CREDITS };
  }

  return { grantTrialIfEligible };
}

let singleton;
/** Lazily builds the production singleton wired to the real Firestore. */
function getTrialCreditsService() {
  if (!singleton) {
    const { getShopsRepo } = require('../repos/shopsRepo');
    const { getUsedTrialEmailsRepo } = require('../repos/usedTrialEmailsRepo');
    const { FieldValue } = require('firebase-admin/firestore');
    singleton = createTrialCreditsService({
      shopsRepo: getShopsRepo(),
      usedTrialEmailsRepo: getUsedTrialEmailsRepo(),
      FieldValue,
    });
  }
  return singleton;
}

module.exports = { createTrialCreditsService, getTrialCreditsService, normalizeEmail };
