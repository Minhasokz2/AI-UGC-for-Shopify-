import { describe, it, expect } from 'vitest';
import { formatCurrency } from '../../src/lib/formatCurrency.js';

describe('formatCurrency', () => {
  it('formats integer cents as USD', () => {
    expect(formatCurrency(2900)).toBe('$29.00');
  });

  it('formats zero cents', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('returns empty string for non-numeric input', () => {
    expect(formatCurrency(undefined)).toBe('');
    expect(formatCurrency(NaN)).toBe('');
  });
});
