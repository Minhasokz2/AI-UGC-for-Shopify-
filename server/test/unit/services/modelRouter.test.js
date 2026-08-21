const {
  isColorCritical,
  selectSceneModelRoleKey,
  selectVideoModelRoleKey,
} = require('../../../src/services/modelRouter');

describe('services/modelRouter', () => {
  describe('isColorCritical', () => {
    it('flags skincare, cosmetics, makeup, and beauty as color-critical', () => {
      expect(isColorCritical('skincare')).toBe(true);
      expect(isColorCritical('cosmetics')).toBe(true);
      expect(isColorCritical('makeup')).toBe(true);
      expect(isColorCritical('beauty')).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(isColorCritical('Skincare')).toBe(true);
      expect(isColorCritical('BEAUTY')).toBe(true);
    });

    it('returns false for other categories, undefined, or null', () => {
      expect(isColorCritical('apparel')).toBe(false);
      expect(isColorCritical(undefined)).toBe(false);
      expect(isColorCritical(null)).toBe(false);
    });
  });

  describe('selectSceneModelRoleKey', () => {
    it('routes ugc content type to the image-editing role regardless of category', () => {
      expect(selectSceneModelRoleKey({ contentType: 'ugc', productCategory: 'skincare' })).toBe('image_editing_ugc');
      expect(selectSceneModelRoleKey({ contentType: 'ugc', productCategory: 'apparel' })).toBe('image_editing_ugc');
    });

    it('routes color-critical scene categories to the photorealistic color-safe role', () => {
      expect(selectSceneModelRoleKey({ contentType: 'scene', productCategory: 'cosmetics' })).toBe('photorealistic_color_safe');
    });

    it('routes non-color-critical scene categories to the default scene role', () => {
      expect(selectSceneModelRoleKey({ contentType: 'scene', productCategory: 'apparel' })).toBe('default_scene');
      expect(selectSceneModelRoleKey({ contentType: 'scene' })).toBe('default_scene');
    });
  });

  describe('selectVideoModelRoleKey', () => {
    it('maps each tier to its role key', () => {
      expect(selectVideoModelRoleKey({ tier: 'fast' })).toBe('video_fast');
      expect(selectVideoModelRoleKey({ tier: 'standard' })).toBe('video_standard');
      expect(selectVideoModelRoleKey({ tier: 'premium' })).toBe('video_premium');
    });

    it('defaults to standard when no tier or an unknown tier is given', () => {
      expect(selectVideoModelRoleKey()).toBe('video_standard');
      expect(selectVideoModelRoleKey({})).toBe('video_standard');
      expect(selectVideoModelRoleKey({ tier: 'ultra-mega' })).toBe('video_standard');
    });
  });
});
