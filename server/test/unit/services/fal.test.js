const { CUSTOM_SCENE_MODELS, generateOne, generateBatch } = require('../../../src/services/fal');
const { ALLOWED_MODELS } = require('../../../src/services/allowedModelsSeedData');

describe('services/fal', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('CUSTOM_SCENE_MODELS', () => {
    it('is keyed by role and includes every scene/ugc/color_safe catalog entry, no more no less', () => {
      const expectedRoles = ALLOWED_MODELS.filter((m) => ['scene', 'ugc', 'color_safe'].includes(m.category)).map(
        (m) => m.role,
      );
      expect(Object.keys(CUSTOM_SCENE_MODELS).sort()).toEqual(expectedRoles.sort());
    });

    it('includes the roles services/modelRouter.js routes to', () => {
      expect(CUSTOM_SCENE_MODELS.default_scene).toBeDefined();
      expect(CUSTOM_SCENE_MODELS.image_editing_ugc).toBeDefined();
      expect(CUSTOM_SCENE_MODELS.photorealistic_color_safe).toBeDefined();
    });

    it('excludes categories outside scene/ugc/color_safe (e.g. background_removal, upscale)', () => {
      expect(CUSTOM_SCENE_MODELS.background_removal_budget).toBeUndefined();
      expect(CUSTOM_SCENE_MODELS.upscale_budget).toBeUndefined();
    });
  });

  describe('generateOne', () => {
    it('builds a single-image payload for an image_and_prompt model', async () => {
      const subscribe = vi.fn().mockResolvedValue({ data: { image: { url: 'https://cdn/out.png' } } });
      const model = { id: 'm1', endpoint: 'fal-ai/x', inputShape: 'image_and_prompt', imageParam: 'image_url', outputField: 'image' };

      await generateOne({ model, imageUrl: 'https://in/a.png', prompt: 'p', client: { subscribe } });

      expect(subscribe).toHaveBeenCalledWith('fal-ai/x', { input: { image_url: 'https://in/a.png', prompt: 'p' } });
    });

    it('builds a real ARRAY (not a bare string) for an image_urls_prompt model — regression for the UGC/premium-scene multi-image bug', async () => {
      const subscribe = vi.fn().mockResolvedValue({ data: { images: [{ url: 'https://cdn/out.png' }] } });
      const model = {
        id: 'nano-banana-edit-ugc',
        endpoint: 'fal-ai/nano-banana/edit',
        inputShape: 'image_urls_prompt',
        imageParam: 'image_urls',
        outputField: 'images',
      };

      await generateOne({
        model,
        imageUrls: ['https://in/person.png', 'https://in/product.png'],
        prompt: 'p',
        client: { subscribe },
      });

      expect(subscribe).toHaveBeenCalledWith('fal-ai/nano-banana/edit', {
        input: { image_urls: ['https://in/person.png', 'https://in/product.png'], prompt: 'p' },
      });
    });

    it('unwraps a plural outputField by returning only the first image', async () => {
      const subscribe = vi.fn().mockResolvedValue({
        data: { images: [{ url: 'https://cdn.test/first.png' }, { url: 'https://cdn.test/second.png' }] },
        requestId: 'r2',
      });
      const model = { id: 'test-plural', endpoint: 'fal-ai/test-plural', inputShape: 'image_and_prompt', imageParam: 'image_url', outputField: 'images' };

      const result = await generateOne({ model, imageUrl: 'https://in.test/x.png', prompt: 'p', client: { subscribe } });

      expect(result).toEqual({ url: 'https://cdn.test/first.png' });
    });

    it('throws on an unrecognized outputField', async () => {
      const badModel = { id: 'test-bad', endpoint: 'fal-ai/test-bad', inputShape: 'image_and_prompt', imageParam: 'image_url', outputField: 'video' };
      const client = { subscribe: vi.fn().mockResolvedValue({ data: {}, requestId: 'r3' }) };
      await expect(generateOne({ model: badModel, imageUrl: 'x', client })).rejects.toThrow(/unrecognized outputField/);
    });
  });

  describe('generateBatch', () => {
    it('includes num_images alongside a correctly-shaped multi-image payload', async () => {
      const subscribe = vi.fn().mockResolvedValue({ data: { images: [{ url: 'https://cdn/1.png' }, { url: 'https://cdn/2.png' }] } });
      const model = {
        id: 'm2',
        endpoint: 'fal-ai/x',
        inputShape: 'image_urls_prompt',
        imageParam: 'image_urls',
        outputField: 'images',
        supportsBatch: true,
      };

      const results = await generateBatch({ model, imageUrls: ['https://in/a.png'], prompt: 'p', numImages: 2, client: { subscribe } });

      expect(subscribe).toHaveBeenCalledWith('fal-ai/x', {
        input: { image_urls: ['https://in/a.png'], prompt: 'p', num_images: 2 },
      });
      expect(results).toEqual([{ url: 'https://cdn/1.png' }, { url: 'https://cdn/2.png' }]);
    });
  });
});
