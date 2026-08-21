const { CUSTOM_SCENE_MODELS, generateOne, generateBatch } = require('../../../src/services/fal');
const { ALLOWED_MODELS } = require('../../../src/services/allowedModelsSeedData');

describe('services/fal', () => {
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
    const singularModel = {
      id: 'test-singular',
      endpoint: 'fal-ai/test-singular',
      imageParam: 'image_url',
      outputField: 'image',
    };
    const pluralModel = {
      id: 'test-plural',
      endpoint: 'fal-ai/test-plural',
      imageParam: 'image_url',
      outputField: 'images',
    };

    it('calls client.subscribe with the model endpoint and an input built from imageParam + prompt', async () => {
      const subscribe = vi.fn().mockResolvedValue({ data: { image: { url: 'https://cdn.test/a.png' } }, requestId: 'r1' });
      const client = { subscribe };

      const result = await generateOne({
        model: singularModel,
        imageUrl: 'https://in.test/product.png',
        prompt: 'a red car',
        client,
      });

      expect(subscribe).toHaveBeenCalledWith('fal-ai/test-singular', {
        input: { image_url: 'https://in.test/product.png', prompt: 'a red car' },
      });
      expect(result).toEqual({ url: 'https://cdn.test/a.png' });
    });

    it('unwraps a plural outputField by returning only the first image', async () => {
      const subscribe = vi.fn().mockResolvedValue({
        data: { images: [{ url: 'https://cdn.test/first.png' }, { url: 'https://cdn.test/second.png' }] },
        requestId: 'r2',
      });
      const client = { subscribe };

      const result = await generateOne({ model: pluralModel, imageUrl: 'https://in.test/x.png', prompt: 'p', client });

      expect(result).toEqual({ url: 'https://cdn.test/first.png' });
    });

    it('throws for a model with a dual_image (non-string) imageParam', async () => {
      const dualModel = { id: 'test-dual', endpoint: 'fal-ai/test-dual', imageParam: { person: 'a', garment: 'b' } };
      await expect(generateOne({ model: dualModel, imageUrl: 'x', client: { subscribe: vi.fn() } })).rejects.toThrow();
    });

    it('throws on an unrecognized outputField', async () => {
      const badModel = { id: 'test-bad', endpoint: 'fal-ai/test-bad', imageParam: 'image_url', outputField: 'video' };
      const client = { subscribe: vi.fn().mockResolvedValue({ data: {}, requestId: 'r3' }) };
      await expect(generateOne({ model: badModel, imageUrl: 'x', client })).rejects.toThrow(/unrecognized outputField/);
    });
  });

  describe('generateBatch', () => {
    const batchModel = {
      id: 'test-batch',
      endpoint: 'fal-ai/test-batch',
      imageParam: 'image_url',
      outputField: 'images',
      supportsBatch: true,
    };

    it('calls subscribe once with a num_images batch param and returns every image', async () => {
      const subscribe = vi.fn().mockResolvedValue({
        data: { images: [{ url: 'https://cdn.test/1.png' }, { url: 'https://cdn.test/2.png' }, { url: 'https://cdn.test/3.png' }] },
        requestId: 'r4',
      });
      const client = { subscribe };

      const result = await generateBatch({
        model: batchModel,
        imageUrl: 'https://in.test/x.png',
        prompt: 'p',
        numImages: 3,
        client,
      });

      expect(subscribe).toHaveBeenCalledTimes(1);
      expect(subscribe).toHaveBeenCalledWith('fal-ai/test-batch', {
        input: { image_url: 'https://in.test/x.png', prompt: 'p', num_images: 3 },
      });
      expect(result).toEqual([
        { url: 'https://cdn.test/1.png' },
        { url: 'https://cdn.test/2.png' },
        { url: 'https://cdn.test/3.png' },
      ]);
    });

    it('throws for a singular outputField:"image" model regardless of supportsBatch', async () => {
      const singularBatchModel = { ...batchModel, outputField: 'image' };
      await expect(
        generateBatch({ model: singularBatchModel, imageUrl: 'x', numImages: 2, client: { subscribe: vi.fn() } }),
      ).rejects.toThrow(/singular outputField/);
    });

    it('throws for a non-batch-capable model even with a plural outputField', async () => {
      const nonBatchModel = { ...batchModel, supportsBatch: false };
      await expect(
        generateBatch({ model: nonBatchModel, imageUrl: 'x', numImages: 2, client: { subscribe: vi.fn() } }),
      ).rejects.toThrow(/does not support batch/);
    });
  });
});
