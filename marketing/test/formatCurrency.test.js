import { describe, expect, it } from 'vitest';
import { formatCentsToDollars } from '../src/lib/formatCurrency.js';

describe('formatCentsToDollars', () => {
  it('formats a round number of cents', () => {
    expect(formatCentsToDollars(1900)).toBe('$19.00');
  });

  it('formats zero cents', () => {
    expect(formatCentsToDollars(0)).toBe('$0.00');
  });

  it('formats a non-round number of cents', () => {
    expect(formatCentsToDollars(1999)).toBe('$19.99');
  });

  it('rounds fractional cents down to two decimal places of display', () => {
    expect(formatCentsToDollars(150)).toBe('$1.50');
  });

  it('does not crash on negative input and still renders a value', () => {
    expect(formatCentsToDollars(-500)).toBe('-$5.00');
  });

  it('does not crash on null/undefined/NaN input', () => {
    expect(formatCentsToDollars(null)).toBe('$0.00');
    expect(formatCentsToDollars(undefined)).toBe('$0.00');
    expect(formatCentsToDollars(NaN)).toBe('$0.00');
  });
});
