// Single source of truth for credit-pack pricing. Used by the real
// custom-purchase endpoint, its live-preview endpoint, GET /api/public/pricing
// (marketing site), and GET /admin/api/pricing-config (margin calculator) — so
// numbers can never drift between a preview and the real charge, or between the
// app and the marketing site.
//
// MARGIN_TARGET (70%) is a hard guarantee, not a blended-average goal: every
// model's credit cost (services/allowedModelsSeedData.js) is sized so a shop
// stays at or above this margin even in the worst case — a merchant who spends
// every credit on the single most expensive-per-credit model, on the plan with
// the lowest revenue-per-credit rate of all. That worst-case rate is NOT simply
// "the Scale pack" — Scale billed ANNUALLY undercuts Scale monthly per credit
// (bigger discount for prepaying a year), so it's computed generically below
// across every pack x period combination rather than assumed.

const { ValidationError } = require('../errors/AppError');

const CREDIT_PACKS = Object.freeze([
  Object.freeze({ id: 'starter', label: 'Starter', monthlyPriceCents: 1900, monthlyCredits: 200, annualPriceCents: 19000, annualCredits: 2400 }),
  Object.freeze({ id: 'growth', label: 'Growth', monthlyPriceCents: 4900, monthlyCredits: 600, annualPriceCents: 49000, annualCredits: 7200 }),
  // Scale is the bulk-discount tier — the lowest revenue-per-credit rate of
  // the three packs at a given period, and (see WORST_CASE_REVENUE_PER_CREDIT_USD
  // below) its annual rate is the single lowest rate across the whole catalog.
  Object.freeze({ id: 'scale', label: 'Scale', monthlyPriceCents: 9900, monthlyCredits: 1500, annualPriceCents: 99000, annualCredits: 18000 }),
]);

const MIN_CUSTOM_PURCHASE_CENTS = 500;

// Custom (any-dollar-amount) purchases use the Starter pack's per-credit rate —
// no bulk discount for an arbitrary one-off amount.
const CUSTOM_PURCHASE_CENTS_PER_CREDIT = CREDIT_PACKS[0].monthlyPriceCents / CREDIT_PACKS[0].monthlyCredits;

/** @returns {number} revenue per credit in cents, for the margin calculator */
function revenuePerCreditCents(pack, period = 'monthly') {
  const priceCents = period === 'annual' ? pack.annualPriceCents : pack.monthlyPriceCents;
  const credits = period === 'annual' ? pack.annualCredits : pack.monthlyCredits;
  return priceCents / credits;
}

// The hard margin floor every plan must clear, regardless of usage mix.
const MARGIN_TARGET = 0.7;

// The lowest revenue-per-credit rate available under ANY pack/period combo —
// the actual worst case a merchant can put us in, computed generically rather
// than hardcoded so it can't silently drift out of sync if a pack's price or
// discount changes.
const WORST_CASE_REVENUE_PER_CREDIT_USD = Math.min(
  ...CREDIT_PACKS.flatMap((pack) => [revenuePerCreditCents(pack, 'monthly'), revenuePerCreditCents(pack, 'annual')]),
) / 100;

/**
 * The minimum creditCost a model must be assigned to guarantee MARGIN_TARGET
 * even at WORST_CASE_REVENUE_PER_CREDIT_USD — the formula
 * services/allowedModelsSeedData.js's catalog is priced against. Never
 * returns less than 1 (a credit is the smallest unit we can charge).
 * @param {number} actualCostUsd - real USD cost of one generation.
 * @returns {number}
 */
function minCreditCostForMargin(actualCostUsd) {
  return Math.max(1, Math.ceil(actualCostUsd / (WORST_CASE_REVENUE_PER_CREDIT_USD * (1 - MARGIN_TARGET))));
}

// A truly uncapped "unlimited" plan can't mathematically guarantee ANY margin
// (cost is unbounded, revenue is a fixed $299/mo) — so "unlimited" here means
// a generous fair-use cap sized so that even 100% of it spent on the single
// worst-margin model still clears MARGIN_TARGET on this plan's own revenue.
// Enforced by credits.js/jobsRepo.js; surfaced to merchants as fair-use copy,
// never advertised as literally infinite.
const UNLIMITED_MONTHLY_PRICE_CENTS = 29900;
// cap * (WORST_CASE_REVENUE_PER_CREDIT_USD * (1-MARGIN_TARGET)) [the max any
// single model can cost per credit, by construction of minCreditCostForMargin]
// == (1-MARGIN_TARGET) * price  =>  cap == price / WORST_CASE_REVENUE_PER_CREDIT_USD.
// The MARGIN_TARGET terms cancel — the cap is just "however many credits
// $299 would buy at the worst floor rate", independent of the target itself.
const UNLIMITED_PLAN = Object.freeze({
  id: 'unlimited',
  label: 'Unlimited',
  monthlyPriceCents: UNLIMITED_MONTHLY_PRICE_CENTS,
  fairUseCreditsPerMonth: Math.floor((UNLIMITED_MONTHLY_PRICE_CENTS / 100) / WORST_CASE_REVENUE_PER_CREDIT_USD),
});

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

module.exports = {
  CREDIT_PACKS,
  UNLIMITED_PLAN,
  MIN_CUSTOM_PURCHASE_CENTS,
  CUSTOM_PURCHASE_CENTS_PER_CREDIT,
  MARGIN_TARGET,
  WORST_CASE_REVENUE_PER_CREDIT_USD,
  computeCreditsForAmount,
  revenuePerCreditCents,
  minCreditCostForMargin,
};
