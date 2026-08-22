/**
 * Pure, network-free margin math for the admin panel's pricing/margin
 * calculator. Reused in two places (per the build brief):
 *   1. The standalone /margin-calculator page.
 *   2. An inline live-preview inside the Model editor as the operator types
 *      a new creditCost.
 *
 * Both call sites recompute this via useMemo on every keystroke — nothing in
 * here does I/O, so that's cheap and safe.
 *
 * --- Units, worked out explicitly ---
 * `GET /admin/api/pricing-config` returns each pack's
 * `monthlyRevenuePerCreditCents` / `annualRevenuePerCreditCents`
 * (server/src/services/billingPacks.js: `priceCents / credits`) — revenue
 * in CENTS per credit sold.
 *
 * A model's own cost is `actualCostUsd` (US DOLLARS) for a generation that
 * consumes `creditCost` credits. To compare against a cents-per-credit
 * revenue figure, convert dollars to cents first, THEN divide by credits:
 *
 *   costPerCreditCents = (actualCostUsd * 100) / creditCost
 *
 * Example: actualCostUsd = 0.05 ($0.05), creditCost = 1
 *   -> costPerCreditCents = (0.05 * 100) / 1 = 5 (five cents/credit)
 *
 * Margin at a given pack is then a plain percentage-off-revenue figure:
 *
 *   marginPct = (revenuePerCreditCents - costPerCreditCents)
 *               / revenuePerCreditCents * 100
 *
 * Example: revenuePerCreditCents = 9.5 (Starter, monthly), costPerCreditCents = 5
 *   -> marginPct = (9.5 - 5) / 9.5 * 100 = 47.368...%
 */

/**
 * Convert a model's real-world cost into cents-per-credit, the same unit
 * pricing-config's revenue figures use.
 * @param {number} actualCostUsd - real USD cost of one generation.
 * @param {number} creditCost - credits charged for that generation.
 * @returns {number} cost per credit, in cents. `Infinity` for a non-finite
 *   or non-positive creditCost (a cost that can never be amortized, i.e.
 *   maximally bad margin) rather than NaN, so downstream math stays a
 *   comparable number instead of poisoning every calculation.
 */
export function computeCostPerCreditCents(actualCostUsd, creditCost) {
  if (!Number.isFinite(actualCostUsd) || !Number.isFinite(creditCost) || creditCost <= 0) {
    return Infinity;
  }
  return (actualCostUsd * 100) / creditCost;
}

/**
 * Read the revenue-per-credit figure a pack already carries for one period.
 * @param {{monthlyRevenuePerCreditCents:number, annualRevenuePerCreditCents:number}} pack
 * @param {'monthly'|'annual'} [period]
 */
export function revenuePerCreditCentsForPack(pack, period = 'monthly') {
  return period === 'annual' ? pack.annualRevenuePerCreditCents : pack.monthlyRevenuePerCreditCents;
}

/**
 * Margin percentage for one pack at one period, given a cost-per-credit
 * already in cents (see computeCostPerCreditCents).
 * @param {object} pack - one entry from GET /admin/api/pricing-config's `packs`.
 * @param {number} costPerCreditCents
 * @param {'monthly'|'annual'} [period]
 * @returns {number} margin percentage. Degenerate inputs (a pack with no
 *   positive revenue rate, or a non-finite cost) resolve to `-Infinity` —
 *   the worst possible margin — rather than NaN, so `computeMarginRange`'s
 *   worst-case reduction and `marginBadgeTone` both still behave sanely.
 */
export function computeMarginForPack(pack, costPerCreditCents, period = 'monthly') {
  const revenuePerCreditCents = revenuePerCreditCentsForPack(pack, period);
  if (!Number.isFinite(revenuePerCreditCents) || revenuePerCreditCents <= 0) {
    return -Infinity;
  }
  if (!Number.isFinite(costPerCreditCents)) {
    return -Infinity;
  }
  return ((revenuePerCreditCents - costPerCreditCents) / revenuePerCreditCents) * 100;
}

// The hard margin floor every plan must clear (server/src/services/billingPacks.js's
// MARGIN_TARGET) — kept in sync by hand since this is a separate frontend
// workspace with no import access to the server's source.
export const MARGIN_TARGET_PCT = 70;

/**
 * Map a margin percentage to a Polaris <Badge tone="...">-compatible tone
 * (verified against @shopify/polaris 13.9.5's Badge Tone union, which
 * includes 'critical' | 'warning' | 'success' among its values).
 * @param {number} marginPct
 * @returns {'critical'|'warning'|'success'}
 */
export function marginBadgeTone(marginPct) {
  if (marginPct < 0) return 'critical';
  if (marginPct < MARGIN_TARGET_PCT) return 'warning';
  return 'success';
}

/**
 * Margin at every pack for one period, plus the worst-case entry called out
 * explicitly. Within a single period the packs' revenue-per-credit rates
 * are monotonically decreasing Starter -> Growth -> Scale (the bulk-discount
 * structure), so Scale is always the worst case for a fixed cost — this
 * reduction finds that generically rather than assuming pack order/identity.
 * @param {object[]} packs - `packs` array from GET /admin/api/pricing-config.
 * @param {number} costPerCreditCents
 * @param {'monthly'|'annual'} [period]
 * @returns {{entries: object[], worstCase: object|null}}
 */
export function computeMarginRange(packs, costPerCreditCents, period = 'monthly') {
  const entries = (packs ?? []).map((pack) => {
    const revenuePerCreditCents = revenuePerCreditCentsForPack(pack, period);
    const marginPct = computeMarginForPack(pack, costPerCreditCents, period);
    return {
      packId: pack.id,
      label: pack.label,
      period,
      revenuePerCreditCents,
      marginPct,
      tone: marginBadgeTone(marginPct),
    };
  });

  const worstCase = entries.reduce(
    (worst, entry) => (worst === null || entry.marginPct < worst.marginPct ? entry : worst),
    null,
  );

  return { entries, worstCase };
}

/**
 * Convenience wrapper combining the two steps above for a model-shaped
 * object (as returned by /admin/api/models or /admin/api/margin/model-costs):
 * `{ actualCostUsd, creditCost }`. Still pure — no network calls.
 * @param {{actualCostUsd:number, creditCost:number}} model
 * @param {object[]} packs
 * @param {'monthly'|'annual'} [period]
 */
export function computeMarginRangeForModel(model, packs, period = 'monthly') {
  const costPerCreditCents = computeCostPerCreditCents(model?.actualCostUsd, model?.creditCost);
  return computeMarginRange(packs, costPerCreditCents, period);
}
