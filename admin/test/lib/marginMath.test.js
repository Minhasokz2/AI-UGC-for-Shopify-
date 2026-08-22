import { describe, it, expect } from 'vitest';
import {
  computeCostPerCreditCents,
  revenuePerCreditCentsForPack,
  computeMarginForPack,
  marginBadgeTone,
  computeMarginRange,
  computeMarginRangeForModel,
  MARGIN_TARGET_PCT,
} from '../../src/lib/marginMath';

// Real pack shape as returned by GET /admin/api/pricing-config, computed by
// hand from server/src/services/billingPacks.js's CREDIT_PACKS + its
// revenuePerCreditCents(pack, period) = priceCents / credits:
//   starter monthly: 1900/200   = 9.5
//   starter annual:  19000/2400 = 7.9166666666666666
//   growth  monthly: 4900/600   = 8.166666666666666
//   growth  annual:  49000/7200 = 6.805555555555555
//   scale   monthly: 9900/1500  = 6.6
//   scale   annual:  99000/18000 = 5.5
const REAL_PACKS = [
  { id: 'starter', label: 'Starter', monthlyRevenuePerCreditCents: 1900 / 200, annualRevenuePerCreditCents: 19000 / 2400 },
  { id: 'growth', label: 'Growth', monthlyRevenuePerCreditCents: 4900 / 600, annualRevenuePerCreditCents: 49000 / 7200 },
  { id: 'scale', label: 'Scale', monthlyRevenuePerCreditCents: 9900 / 1500, annualRevenuePerCreditCents: 99000 / 18000 },
];

describe('computeCostPerCreditCents', () => {
  it('converts dollars-per-generation + credits-per-generation to cents-per-credit', () => {
    // $0.05 for 1 credit => 5 cents/credit
    expect(computeCostPerCreditCents(0.05, 1)).toBeCloseTo(5, 10);
    // $0.10 for 2 credits => 5 cents/credit (same rate, different granularity)
    expect(computeCostPerCreditCents(0.1, 2)).toBeCloseTo(5, 10);
    // $1.98 for 3 credits => 66 cents/credit
    expect(computeCostPerCreditCents(1.98, 3)).toBeCloseTo(66, 10);
  });

  it('treats a non-positive or non-finite creditCost as Infinity, never NaN', () => {
    expect(computeCostPerCreditCents(0.05, 0)).toBe(Infinity);
    expect(computeCostPerCreditCents(0.05, -1)).toBe(Infinity);
    expect(computeCostPerCreditCents(0.05, NaN)).toBe(Infinity);
    expect(computeCostPerCreditCents(NaN, 1)).toBe(Infinity);
  });

  it('handles zero cost (a free/loss-leader model)', () => {
    expect(computeCostPerCreditCents(0, 1)).toBe(0);
  });
});

describe('revenuePerCreditCentsForPack', () => {
  it('defaults to the monthly rate', () => {
    expect(revenuePerCreditCentsForPack(REAL_PACKS[0])).toBeCloseTo(9.5, 10);
  });

  it('reads the annual rate when asked', () => {
    expect(revenuePerCreditCentsForPack(REAL_PACKS[0], 'annual')).toBeCloseTo(19000 / 2400, 10);
  });
});

describe('computeMarginForPack — boundary cases', () => {
  it('is exactly 0% when cost equals revenue-per-credit', () => {
    const pack = { monthlyRevenuePerCreditCents: 10 };
    const margin = computeMarginForPack(pack, 10);
    expect(margin).toBe(0);
    expect(marginBadgeTone(margin)).toBe('warning'); // 0 is not < 0, but is < MARGIN_TARGET_PCT (70)
  });

  it('is exactly at MARGIN_TARGET_PCT (70%), the warning/success boundary', () => {
    const pack = { monthlyRevenuePerCreditCents: 10 };
    const margin = computeMarginForPack(pack, 3); // (10-3)/10*100 = 70
    expect(margin).toBe(70);
    expect(margin).toBe(MARGIN_TARGET_PCT);
    expect(marginBadgeTone(margin)).toBe('success'); // 70 is not < 70
  });

  it('is negative when cost exceeds revenue-per-credit', () => {
    const pack = { monthlyRevenuePerCreditCents: 10 };
    const margin = computeMarginForPack(pack, 12); // (10-12)/10*100 = -20
    expect(margin).toBe(-20);
    expect(marginBadgeTone(margin)).toBe('critical');
  });

  it('is just under the 70% boundary (69.999...%) and still reads warning', () => {
    const pack = { monthlyRevenuePerCreditCents: 10 };
    const margin = computeMarginForPack(pack, 3.0001); // just over 3 -> just under 70%
    expect(margin).toBeLessThan(70);
    expect(marginBadgeTone(margin)).toBe('warning');
  });

  it('is just under the 0% boundary (-0.01%) and still reads critical', () => {
    const pack = { monthlyRevenuePerCreditCents: 10 };
    const margin = computeMarginForPack(pack, 10.001);
    expect(margin).toBeLessThan(0);
    expect(marginBadgeTone(margin)).toBe('critical');
  });

  it('resolves to -Infinity (never NaN) for a degenerate pack rate', () => {
    expect(computeMarginForPack({ monthlyRevenuePerCreditCents: 0 }, 5)).toBe(-Infinity);
    expect(computeMarginForPack({ monthlyRevenuePerCreditCents: -1 }, 5)).toBe(-Infinity);
  });

  it('resolves to -Infinity for a non-finite cost input', () => {
    expect(computeMarginForPack({ monthlyRevenuePerCreditCents: 10 }, Infinity)).toBe(-Infinity);
  });
});

describe('marginBadgeTone', () => {
  it.each([
    [-100, 'critical'],
    [-0.01, 'critical'],
    [0, 'warning'],
    [69.99, 'warning'],
    [70, 'success'],
    [70.01, 'success'],
    [100, 'success'],
  ])('marginBadgeTone(%f) -> %s', (input, expected) => {
    expect(marginBadgeTone(input)).toBe(expected);
  });
});

describe('computeMarginRange — real pricing-config numbers', () => {
  it('computes monthly margin at every pack for a model that is still under the 70% target at Scale ($0.05/credit cost)', () => {
    const costPerCreditCents = computeCostPerCreditCents(0.05, 1); // 5 cents/credit
    const { entries, worstCase } = computeMarginRange(REAL_PACKS, costPerCreditCents, 'monthly');

    expect(entries).toHaveLength(3);
    const byId = Object.fromEntries(entries.map((e) => [e.packId, e]));

    // (9.5 - 5) / 9.5 * 100
    expect(byId.starter.marginPct).toBeCloseTo(47.368421052631575, 10);
    // (8.16666... - 5) / 8.16666... * 100
    expect(byId.growth.marginPct).toBeCloseTo(38.775510204081634, 10);
    // (6.6 - 5) / 6.6 * 100
    expect(byId.scale.marginPct).toBeCloseTo(24.242424242424244, 10);

    // All three are below MARGIN_TARGET_PCT (70) at this cost level.
    expect(byId.starter.tone).toBe('warning');
    expect(byId.growth.tone).toBe('warning');
    expect(byId.scale.tone).toBe('warning');

    // Scale has the lowest monthly revenue-per-credit rate (6.6), so for a
    // fixed cost it is always the worst-case margin.
    expect(worstCase.packId).toBe('scale');
    expect(worstCase.marginPct).toBeCloseTo(24.242424242424244, 10);
  });

  it('reads success at every pack for a model actually priced to clear the 70% target ($0.01/credit cost)', () => {
    const costPerCreditCents = computeCostPerCreditCents(0.01, 1); // 1 cent/credit
    const { entries, worstCase } = computeMarginRange(REAL_PACKS, costPerCreditCents, 'monthly');
    const byId = Object.fromEntries(entries.map((e) => [e.packId, e]));

    // (6.6 - 1) / 6.6 * 100 = 84.848...% — clears 70 even at Scale, the worst case.
    expect(byId.scale.marginPct).toBeCloseTo(84.84848484848484, 10);
    expect(byId.starter.tone).toBe('success');
    expect(byId.growth.tone).toBe('success');
    expect(byId.scale.tone).toBe('success');
    expect(worstCase.packId).toBe('scale');
  });

  it('surfaces a worst-case margin under the 70% warning threshold at Scale for a costlier model ($0.06/credit)', () => {
    const costPerCreditCents = computeCostPerCreditCents(0.06, 1); // 6 cents/credit
    const { worstCase } = computeMarginRange(REAL_PACKS, costPerCreditCents, 'monthly');

    expect(worstCase.packId).toBe('scale');
    // (6.6 - 6) / 6.6 * 100 = 9.0909...%
    expect(worstCase.marginPct).toBeCloseTo(9.090909090909092, 10);
    expect(worstCase.tone).toBe('warning');
  });

  it('surfaces a negative worst-case margin at Scale for an overpriced-cost model ($0.08/credit)', () => {
    const costPerCreditCents = computeCostPerCreditCents(0.08, 1); // 8 cents/credit
    const { entries, worstCase } = computeMarginRange(REAL_PACKS, costPerCreditCents, 'monthly');

    expect(worstCase.packId).toBe('scale');
    // (6.6 - 8) / 6.6 * 100 = -21.2121...%
    expect(worstCase.marginPct).toBeCloseTo(-21.21212121212121, 10);
    expect(worstCase.tone).toBe('critical');

    // Starter and Growth still positive at this cost level.
    const byId = Object.fromEntries(entries.map((e) => [e.packId, e]));
    expect(byId.starter.marginPct).toBeGreaterThan(0);
    expect(byId.growth.marginPct).toBeGreaterThan(0);
  });

  it('computes the annual period when asked, using annual rates (Scale annual is the lowest rate of all)', () => {
    const costPerCreditCents = computeCostPerCreditCents(0.05, 1); // 5 cents/credit
    const { worstCase } = computeMarginRange(REAL_PACKS, costPerCreditCents, 'annual');

    expect(worstCase.packId).toBe('scale');
    expect(worstCase.period).toBe('annual');
    // (5.5 - 5) / 5.5 * 100 = 9.0909...%
    expect(worstCase.marginPct).toBeCloseTo(9.090909090909092, 10);
  });

  it('returns an empty entries array and a null worst case for an empty packs list', () => {
    const { entries, worstCase } = computeMarginRange([], 5);
    expect(entries).toEqual([]);
    expect(worstCase).toBeNull();
  });
});

describe('computeMarginRangeForModel — combining a model object with pricing-config', () => {
  it('flags the correct worst-case margin for a well-priced model (clears 70%) regardless of needsPriceReview', () => {
    const model = {
      id: 'seedream-scene-v1',
      label: 'Seedream Scene v1',
      actualCostUsd: 0.01,
      creditCost: 1,
      needsPriceReview: true, // math must not care about this flag either way
    };
    const { worstCase } = computeMarginRangeForModel(model, REAL_PACKS, 'monthly');
    expect(worstCase.packId).toBe('scale');
    expect(worstCase.marginPct).toBeCloseTo(84.84848484848484, 10);
    expect(worstCase.tone).toBe('success');
    // needsPriceReview is orthogonal data the UI combines with this result —
    // marginMath itself never reads or reasons about it.
    expect(model.needsPriceReview).toBe(true);
  });

  it('produces the same result whether needsPriceReview is true or false, for identical cost/creditCost', () => {
    const base = { actualCostUsd: 0.06, creditCost: 1 };
    const flagged = computeMarginRangeForModel({ ...base, needsPriceReview: true }, REAL_PACKS, 'monthly');
    const unflagged = computeMarginRangeForModel({ ...base, needsPriceReview: false }, REAL_PACKS, 'monthly');
    expect(flagged.worstCase.marginPct).toBe(unflagged.worstCase.marginPct);
    expect(flagged.worstCase.tone).toBe(unflagged.worstCase.tone);
  });

  it('handles a model with creditCost of 0 by resolving to the worst possible margin (-Infinity), not a crash', () => {
    const model = { actualCostUsd: 0.05, creditCost: 0, needsPriceReview: true };
    const { worstCase } = computeMarginRangeForModel(model, REAL_PACKS, 'monthly');
    expect(worstCase.marginPct).toBe(-Infinity);
    expect(worstCase.tone).toBe('critical');
  });
});
