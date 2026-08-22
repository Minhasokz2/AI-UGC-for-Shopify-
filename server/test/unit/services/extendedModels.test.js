const { EXTENDED_ALLOWED_MODELS, buildRequestInput, extractOutput } = require('../../../src/services/extendedModels');
const { ALLOWED_MODELS } = require('../../../src/services/allowedModelsSeedData');

describe('services/extendedModels', () => {
  describe('EXTENDED_ALLOWED_MODELS', () => {
    it('is keyed by role and includes every upscale/retouch/object_extraction/try_on catalog entry, no more no less', () => {
      const expectedRoles = ALLOWED_MODELS.filter((m) =>
        ['upscale', 'retouch', 'object_extraction', 'try_on'].includes(m.category),
      ).map((m) => m.role);
      expect(Object.keys(EXTENDED_ALLOWED_MODELS).sort()).toEqual(expectedRoles.sort());
    });

    it('excludes scene/text-to-image/background-removal categories', () => {
      expect(EXTENDED_ALLOWED_MODELS.default_scene).toBeUndefined();
      expect(EXTENDED_ALLOWED_MODELS.text_to_image_budget).toBeUndefined();
      expect(EXTENDED_ALLOWED_MODELS.background_removal_budget).toBeUndefined();
    });

    it('includes the try-on role', () => {
      expect(EXTENDED_ALLOWED_MODELS.try_on).toBeDefined();
    });
  });

  describe('buildRequestInput', () => {
    it('image_only → { [imageParam]: imageUrl }', () => {
      const model = { inputShape: 'image_only', imageParam: 'image_url' };
      expect(buildRequestInput(model, { imageUrl: 'https://x/a.png' })).toEqual({ image_url: 'https://x/a.png' });
    });

    it('image_and_prompt → { [imageParam]: imageUrl, prompt }', () => {
      const model = { inputShape: 'image_and_prompt', imageParam: 'image_url' };
      expect(buildRequestInput(model, { imageUrl: 'https://x/a.png', prompt: 'remove background' })).toEqual({
        image_url: 'https://x/a.png',
        prompt: 'remove background',
      });
    });

    it('image_urls_prompt → { [imageParam]: imageUrls, prompt }', () => {
      const model = { inputShape: 'image_urls_prompt', imageParam: 'image_urls' };
      expect(buildRequestInput(model, { imageUrls: ['https://x/a.png', 'https://x/b.png'], prompt: 'blend these' })).toEqual({
        image_urls: ['https://x/a.png', 'https://x/b.png'],
        prompt: 'blend these',
      });
    });

    it('dual_image → { [imageParam.person]: personImageUrl, [imageParam.garment]: garmentImageUrl }', () => {
      const model = { inputShape: 'dual_image', imageParam: { person: 'model_image_url', garment: 'garment_image_url' } };
      expect(
        buildRequestInput(model, { personImageUrl: 'https://x/person.png', garmentImageUrl: 'https://x/shirt.png' }),
      ).toEqual({
        model_image_url: 'https://x/person.png',
        garment_image_url: 'https://x/shirt.png',
      });
    });

    it('image_urls_angles → { [imageParam]: imageUrls, angles }', () => {
      const model = { inputShape: 'image_urls_angles', imageParam: 'image_urls' };
      expect(buildRequestInput(model, { imageUrls: ['https://x/a.png'], angles: ['front', 'side'] })).toEqual({
        image_urls: ['https://x/a.png'],
        angles: ['front', 'side'],
      });
    });

    it('throws for an unrecognized inputShape', () => {
      const model = { id: 'bad-model', inputShape: 'something_else' };
      expect(() => buildRequestInput(model, {})).toThrow(/unrecognized inputShape/);
    });
  });

  describe('extractOutput', () => {
    it('outputField "image" returns the singular image url', () => {
      const model = { outputField: 'image' };
      expect(extractOutput(model, { image: { url: 'https://cdn/a.png' } })).toBe('https://cdn/a.png');
    });

    it('outputField "images" returns every image url', () => {
      const model = { outputField: 'images' };
      expect(extractOutput(model, { images: [{ url: 'https://cdn/a.png' }, { url: 'https://cdn/b.png' }] })).toEqual([
        'https://cdn/a.png',
        'https://cdn/b.png',
      ]);
    });

    it('outputField "video" returns the video url', () => {
      const model = { outputField: 'video' };
      expect(extractOutput(model, { video: { url: 'https://cdn/a.mp4' } })).toBe('https://cdn/a.mp4');
    });

    it('throws for an unrecognized outputField', () => {
      const model = { id: 'bad-model', outputField: 'audio' };
      expect(() => extractOutput(model, {})).toThrow(/unrecognized outputField/);
    });

    it('throws (rather than silently returning undefined) when a singular field is treated as plural', () => {
      const model = { id: 'bad-model', outputField: 'image' };
      expect(() => extractOutput(model, { images: [{ url: 'x' }] })).toThrow();
    });
  });
});
