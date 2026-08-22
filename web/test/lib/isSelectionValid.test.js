import { describe, it, expect } from 'vitest';
import { isSelectionValid } from '../../src/lib/isSelectionValid.js';

describe('isSelectionValid', () => {
  it('is valid within [min, max] inclusive', () => {
    expect(isSelectionValid(2, { min: 1, max: 3 })).toBe(true);
    expect(isSelectionValid(1, { min: 1, max: 3 })).toBe(true);
    expect(isSelectionValid(3, { min: 1, max: 3 })).toBe(true);
  });

  it('is invalid below min or above max', () => {
    expect(isSelectionValid(0, { min: 1, max: 3 })).toBe(false);
    expect(isSelectionValid(4, { min: 1, max: 3 })).toBe(false);
  });

  it('handles a {min:0,max:0} text-to-image constraint — only 0 images is valid', () => {
    expect(isSelectionValid(0, { min: 0, max: 0 })).toBe(true);
    expect(isSelectionValid(1, { min: 0, max: 0 })).toBe(false);
  });
});
