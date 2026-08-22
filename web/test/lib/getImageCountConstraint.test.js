import { describe, it, expect } from 'vitest';
import { getImageCountConstraint } from '../../src/lib/getImageCountConstraint.js';

describe('getImageCountConstraint', () => {
  it('is a trivial passthrough of model.imageCountConstraint', () => {
    const model = { imageCountConstraint: { min: 2, max: 5 } };
    expect(getImageCountConstraint(model)).toEqual({ min: 2, max: 5 });
  });

  it('falls back to {min:0,max:0} for undefined model', () => {
    expect(getImageCountConstraint(undefined)).toEqual({ min: 0, max: 0 });
  });

  it('falls back to {min:0,max:0} for null model', () => {
    expect(getImageCountConstraint(null)).toEqual({ min: 0, max: 0 });
  });

  it('falls back to {min:0,max:0} when the model has no imageCountConstraint field', () => {
    expect(getImageCountConstraint({ id: 'x' })).toEqual({ min: 0, max: 0 });
  });

  it('never independently re-derives the constraint from category/role', () => {
    // Even if a model looks like a text-to-image model by category, the
    // helper must not guess {min:0,max:0} on its own — it must reflect
    // exactly what the backend sent, whatever that is.
    const model = { category: 'text_to_image', imageCountConstraint: { min: 1, max: 3 } };
    expect(getImageCountConstraint(model)).toEqual({ min: 1, max: 3 });
  });
});
