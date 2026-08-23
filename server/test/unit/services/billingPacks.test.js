const {
  CREDIT_PACKS,
  UNLIMITED_PLAN,
  MIN_CUSTOM_PURCHASE_CENTS,
  computeCreditsForAmount,
  revenuePerCreditCents,
} = require('../../../src/services/billingPacks');
const { ValidationError } = require('../../../src/errors/AppError');

describe('services/billingPacks', () => {
  it('defines three packs, each with a larger pack costing less per credit (bulk discount)', () => {
    expect(CREDIT_PACKS).toHaveLength(3);
    const rates = CREDIT_PACKS.map((p) => revenuePerCreditCents(p, 'monthly'));
    expect(rates[0]).toBeGreaterThan(rates[1]);
    expect(rates[1]).toBeGreaterThan(rates[2]);
  });

  it('every pack\'s annual price is a real discount off 12 months of the monthly price, and annual credits are 12x monthly credits', () => {
    // Not required to be an exact 10x multiple — Partner Dashboard's actual
    // configured prices use charm pricing ($499/$999, not $490/$990) — just
    // that paying annually is genuinely cheaper than paying monthly all year.
    for (const pack of CREDIT_PACKS) {
      expect(pack.annualPriceCents).toBeLessThan(pack.monthlyPriceCents * 12);
      expect(pack.annualCredits).toBe(pack.monthlyCredits * 12);
    }
  });

  it('defines an unlimited plan with both a monthly and annual price, each with its own fair-use cap', () => {
    expect(UNLIMITED_PLAN.monthlyPriceCents).toBeGreaterThan(0);
    expect(UNLIMITED_PLAN.annualPriceCents).toBeGreaterThan(0);
    expect(UNLIMITED_PLAN.annualPriceCents).toBeLessThan(UNLIMITED_PLAN.monthlyPriceCents * 12);
    expect(UNLIMITED_PLAN.fairUseCreditsPerMonth).toBeGreaterThan(0);
    // The annual plan's effective monthly revenue is lower than the flat
    // monthly price, so its cap must be smaller too — an equal cap would let
    // an annual subscriber's worst-case usage push margin below MARGIN_TARGET.
    expect(UNLIMITED_PLAN.fairUseCreditsPerMonthAnnual).toBeGreaterThan(0);
    expect(UNLIMITED_PLAN.fairUseCreditsPerMonthAnnual).toBeLessThan(UNLIMITED_PLAN.fairUseCreditsPerMonth);
  });

  describe('computeCreditsForAmount', () => {
    it('computes credits at the Starter pack rate', () => {
      const starter = CREDIT_PACKS.find((p) => p.id === 'starter');
      const rateCentsPerCredit = starter.monthlyPriceCents / starter.monthlyCredits;
      const amountCents = 10000;
      expect(computeCreditsForAmount(amountCents)).toBe(Math.floor(amountCents / rateCentsPerCredit));
    });

    it('rounds down (never grants a fractional credit for free)', () => {
      const credits = computeCreditsForAmount(MIN_CUSTOM_PURCHASE_CENTS + 1);
      expect(Number.isInteger(credits)).toBe(true);
    });

    it('throws ValidationError below the minimum purchase amount', () => {
      expect(() => computeCreditsForAmount(MIN_CUSTOM_PURCHASE_CENTS - 1)).toThrow(ValidationError);
    });

    it('throws ValidationError for a non-integer amount', () => {
      expect(() => computeCreditsForAmount(1000.5)).toThrow(ValidationError);
    });

    it('accepts exactly the minimum amount', () => {
      expect(() => computeCreditsForAmount(MIN_CUSTOM_PURCHASE_CENTS)).not.toThrow();
    });
  });

  describe('revenuePerCreditCents', () => {
    it('computes monthly and annual rates independently', () => {
      const pack = CREDIT_PACKS[0];
      expect(revenuePerCreditCents(pack, 'monthly')).toBeCloseTo(pack.monthlyPriceCents / pack.monthlyCredits);
      expect(revenuePerCreditCents(pack, 'annual')).toBeCloseTo(pack.annualPriceCents / pack.annualCredits);
    });
  });
});
