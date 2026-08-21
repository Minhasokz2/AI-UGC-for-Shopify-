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

  it('every pack\'s annual price is 10x its monthly price and annual credits are 12x monthly credits', () => {
    for (const pack of CREDIT_PACKS) {
      expect(pack.annualPriceCents).toBe(pack.monthlyPriceCents * 10);
      expect(pack.annualCredits).toBe(pack.monthlyCredits * 12);
    }
  });

  it('defines an unlimited plan', () => {
    expect(UNLIMITED_PLAN.monthlyPriceCents).toBeGreaterThan(0);
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
