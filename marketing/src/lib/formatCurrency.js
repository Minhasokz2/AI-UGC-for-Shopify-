/**
 * Format an integer number of cents as a USD dollar string, e.g. 1900 -> "$19.00".
 * Falls back to "$0.00" for null/undefined/NaN input so a bad API response
 * can't crash rendering. Negative values are formatted (with a leading "-")
 * rather than thrown on, even though they should never occur in practice.
 */
export function formatCentsToDollars(cents) {
  const value = Number(cents);
  const safeValue = Number.isFinite(value) ? value : 0;
  const dollars = safeValue / 100;
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
