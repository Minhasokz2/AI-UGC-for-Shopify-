// Referral codes, sign-up attribution, and commission accrual. Per the spec,
// commission payouts to a referring merchant are TRACKED, not automated —
// Shopify's Billing API has no mechanism to pay a third-party merchant, so
// `commissionOwedCents` accrues on every referred shop's successful payment
// (subscription renewal or credit purchase) and actual payout is a manual,
// out-of-app process. This module never touches money — only the ledger of
// what's owed.

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — avoids visual ambiguity when a merchant reads/types the code
const CODE_LENGTH = 8;
const DEFAULT_COMMISSION_RATE = 0.2; // 20% of every referred shop's payment, for the lifetime of the referral
const MAX_CODE_GENERATION_ATTEMPTS = 5;

/**
 * @param {() => number} random defaults to Math.random; injectable for deterministic tests
 * @returns {string}
 */
function generateReferralCode(random = Math.random) {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * @param {{ shopsRepo: object, referralsRepo: object, random?: Function, commissionRate?: number }} deps
 */
function createReferralsService({ shopsRepo, referralsRepo, random = Math.random, commissionRate = DEFAULT_COMMISSION_RATE }) {
  /**
   * Returns the shop's existing referral code, minting one on first call.
   * Collision-checked against shopsRepo (extremely unlikely at 33^8 codes, but
   * checked rather than assumed) with a small bounded retry.
   */
  async function ensureReferralCode(shopDomain) {
    const shop = await shopsRepo.getShop(shopDomain);
    if (shop?.referralCode) return shop.referralCode;

    for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt += 1) {
      const candidate = generateReferralCode(random);
      // eslint-disable-next-line no-await-in-loop
      const existing = await shopsRepo.findByReferralCode(candidate);
      if (!existing) {
        // eslint-disable-next-line no-await-in-loop
        await shopsRepo.updateShop(shopDomain, { referralCode: candidate });
        return candidate;
      }
    }
    throw new Error('referralsService.js: exhausted referral code generation attempts');
  }

  /**
   * Attributes a newly-installed shop to whichever shop owns `code`. A no-op
   * (not an error) for an unknown code, a self-referral, or a shop that's
   * already been attributed — referral attribution happens at most once per
   * shop, for its lifetime.
   * @returns {Promise<{ applied: boolean, reason?: string, referral?: object }>}
   */
  async function applyReferralCode({ referredShopDomain, code }) {
    const referrerShop = await shopsRepo.findByReferralCode(code);
    if (!referrerShop) return { applied: false, reason: 'unknown_code' };
    if (referrerShop.id === referredShopDomain) return { applied: false, reason: 'self_referral' };

    const existing = await referralsRepo.findByReferredShop(referredShopDomain);
    if (existing) return { applied: false, reason: 'already_referred' };

    const referral = await referralsRepo.createReferral({
      referrerShopDomain: referrerShop.id,
      referredShopDomain,
      code,
    });
    return { applied: true, referral };
  }

  /**
   * Accrues commission for a referred shop's successful payment (subscription
   * charge or credit purchase) — called from the billing-callback route/webhook
   * handler, not from here. Marks the referral 'converted' on its first payment
   * (informational status only; commission keeps accruing on every subsequent
   * payment regardless of status). A no-op if the shop was never referred.
   * @returns {Promise<{ credited: boolean, commissionCents?: number }>}
   */
  async function recordReferredPayment({ referredShopDomain, amountCents }) {
    const referral = await referralsRepo.findByReferredShop(referredShopDomain);
    if (!referral) return { credited: false };

    const commissionCents = Math.round(amountCents * commissionRate);
    await referralsRepo.accrueCommission(referral.id, commissionCents);
    if (referral.status === 'pending') {
      await referralsRepo.markConverted(referral.id);
    }
    return { credited: true, commissionCents };
  }

  /** @returns {Promise<Array>} every referral this shop has made, for the Referrals page. */
  async function listReferralsMade(shopDomain) {
    return referralsRepo.listByReferrer(shopDomain);
  }

  return {
    ensureReferralCode,
    applyReferralCode,
    recordReferredPayment,
    listReferralsMade,
  };
}

let singleton;
/** Lazily builds the production singleton wired to the real Firestore. */
function getReferralsService() {
  if (!singleton) {
    const { getShopsRepo } = require('../repos/shopsRepo');
    const { getReferralsRepo } = require('../repos/referralsRepo');
    singleton = createReferralsService({ shopsRepo: getShopsRepo(), referralsRepo: getReferralsRepo() });
  }
  return singleton;
}

module.exports = { createReferralsService, getReferralsService, generateReferralCode, DEFAULT_COMMISSION_RATE };
