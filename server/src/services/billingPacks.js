// Single source of truth for credit-pack pricing. Used by the real
// custom-purchase endpoint, its live-preview endpoint, GET /api/public/pricing
// (marketing site), and GET /admin/api/pricing-config (margin calculator) — so
// numbers can never drift between a preview and the real charge, or between the
// app and the marketing site.
//
// Every model's credit cost (services/allowedModelsSeedData.js) is chosen so it
// stays profitable even at the Scale pack's revenue-per-credit floor — the
// cheapest bulk-discount tier — per the formula documented on each pack below.

const { ValidationError } = require('../errors/AppError');

const CREDIT_PACKS = Object.freeze([
  Object.freeze({ id: 'starter', label: 'Starter', monthlyPriceCents: 1900, monthlyCredits: 200, annualPriceCents: 19000, annualCredits: 2400 }),
  Object.freeze({ id: 'growth', label: 'Growth', monthlyPriceCents: 4900, monthlyCredits: 600, annualPriceCents: 49000, annualCredits: 7200 }),
  // Scale is the bulk-discount tier: $0.066/credit monthly — every model's
  // creditCost is priced so it stays profitable even at this floor rate.
  Object.freeze({ id: 'scale', label: 'Scale', monthlyPriceCents: 9900, monthlyCredits: 1500, annualPriceCents: 99000, annualCredits: 18000 }),
]);

const UNLIMITED_PLAN = Object.freeze({ id: 'unlimited', label: 'Unlimited', monthlyPriceCents: 29900 });

const MIN_CUSTOM_PURCHASE_CENTS = 500;

// Custom (any-dollar-amount) purchases use the Starter pack's per-credit rate —
// no bulk discount for an arbitrary one-off amount.
const CUSTOM_PURCHASE_CENTS_PER_CREDIT = CREDIT_PACKS[0].monthlyPriceCents / CREDIT_PACKS[0].monthlyCredits;

/**
 * The single computation both the live preview and the real custom-purchase
 * endpoint call — so a merchant is never charged a different rate than they
 * previewed.
 * @param {number} amountCents
 * @returns {number} credits granted
 */
function computeCreditsForAmount(amountCents) {
  if (!Number.isInteger(amountCents) || amountCents < MIN_CUSTOM_PURCHASE_CENTS) {
    throw new ValidationError(`Custom purchase amount must be at least $${(MIN_CUSTOM_PURCHASE_CENTS / 100).toFixed(2)}.`);
  }
  return Math.floor(amountCents / CUSTOM_PURCHASE_CENTS_PER_CREDIT);
}

/** @returns {number} revenue per credit in cents, for the margin calculator */
function revenuePerCreditCents(pack, period = 'monthly') {
  const priceCents = period === 'annual' ? pack.annualPriceCents : pack.monthlyPriceCents;
  const credits = period === 'annual' ? pack.annualCredits : pack.monthlyCredits;
  return priceCents / credits;
}

module.exports = {
  CREDIT_PACKS,
  UNLIMITED_PLAN,
  MIN_CUSTOM_PURCHASE_CENTS,
  CUSTOM_PURCHASE_CENTS_PER_CREDIT,
  computeCreditsForAmount,
  revenuePerCreditCents,
};
