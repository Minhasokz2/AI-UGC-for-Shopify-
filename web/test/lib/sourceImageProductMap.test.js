import { describe, it, expect, beforeEach } from 'vitest';
import { rememberSourceImageProduct, getRememberedProductId } from '../../src/lib/sourceImageProductMap.js';

beforeEach(() => {
  window.localStorage.clear();
});

describe('sourceImageProductMap', () => {
  it('remembers and recalls a productId for a sourceImageUrl', () => {
    rememberSourceImageProduct('https://cdn/img.jpg', 'gid://shopify/Product/1');
    expect(getRememberedProductId('https://cdn/img.jpg')).toBe('gid://shopify/Product/1');
  });

  it('returns undefined for an unknown sourceImageUrl', () => {
    expect(getRememberedProductId('https://cdn/unknown.jpg')).toBeUndefined();
  });

  it('is a no-op when either argument is missing', () => {
    rememberSourceImageProduct(undefined, 'p1');
    rememberSourceImageProduct('https://cdn/img.jpg', undefined);
    expect(getRememberedProductId('https://cdn/img.jpg')).toBeUndefined();
  });

  it('does not throw when localStorage access fails', () => {
    const original = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new Error('blocked');
    };
    expect(() => rememberSourceImageProduct('https://cdn/img.jpg', 'p1')).not.toThrow();
    window.localStorage.setItem = original;
  });
});
