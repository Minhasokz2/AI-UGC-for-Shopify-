/**
 * Formats integer cents (as used throughout the billing API) as a localized
 * currency string, e.g. 2900 -> "$29.00".
 *
 * @param {number} cents
 * @param {string} [currency]
 * @returns {string}
 */
export function formatCurrency(cents, currency = 'USD') {
  if (typeof cents !== 'number' || Number.isNaN(cents)) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}
