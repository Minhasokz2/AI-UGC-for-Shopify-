const { generateSingle, generateNativeBatch } = require('../../../src/services/modelDispatch');
const fal = require('../../../src/services/fal');
const wavespeed = require('../../../src/services/wavespeed');
const textToImageModels = require('../../../src/services/textToImageModels');

describe('services/modelDispatch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateSingle', () => {
    it('dispatches scene/ugc/color_safe categories to fal.generateOne', async () => {
      const spy = vi.spyOn(fal, 'generateOne').mockResolvedValue({ url: 'https://cdn/scene.png' });
      const model = { id: 'm1', category: 'scene', endpoint: 'fal-ai/x', imageParam: 'image_url' };

      const url = await generateSingle(model, { imageUrl: 'https://in/a.png', prompt: 'p' });

      expect(spy).toHaveBeenCalledWith({ model, imageUrl: 'https://in/a.png', prompt: 'p' });
      expect(url).toBe('https://cdn/scene.png');
    });

    it('dispatches text_to_image to textToImageModels.generateTextToImage with numImages:1 and unwraps the single result', async () => {
      const spy = vi
        .spyOn(textToImageModels, 'generateTextToImage')
        .mockResolvedValue([{ url: 'https://cdn/t2i.png' }]);
      const model = { id: 'm2', category: 'text_to_image', endpoint: 'fal-ai/y' };

      const url = await generateSingle(model, { prompt: 'a cat' });

      expect(spy).toHaveBeenCalledWith({ model, prompt: 'a cat', numImages: 1 });
      expect(url).toBe('https://cdn/t2i.png');
    });

    it('dispatches provider:"wavespeed" video models to wavespeed.generateVideo', async () => {
      const spy = vi.spyOn(wavespeed, 'generateVideo').mockResolvedValue({ url: 'https://cdn/video.mp4' });
      const model = { id: 'm3', category: 'video', provider: 'wavespeed', endpoint: 'wavespeed-ai/z', imageParam: 'image_url' };

      const url = await generateSingle(model, { imageUrl: 'https://in/a.png', prompt: 'zoom in' });

      expect(spy).toHaveBeenCalledWith({ model, imageUrl: 'https://in/a.png', prompt: 'zoom in' });
      expect(url).toBe('https://cdn/video.mp4');
    });

    it('dispatches provider:"fal" video models via the fal client + extendedModels shaping (outputField "video")', async () => {
      const subscribe = vi.fn().mockResolvedValue({ data: { video: { url: 'https://cdn/fal-video.mp4' } }, requestId: 'r1' });
      vi.spyOn(fal, 'getClient').mockReturnValue({ subscribe });
      const model = {
        id: 'm4',
        category: 'video',
        provider: 'fal',
        endpoint: 'fal-ai/wan-25/image-to-video',
        inputShape: 'image_and_prompt',
        imageParam: 'image_url',
        outputField: 'video',
      };

      const url = await generateSingle(model, { imageUrl: 'https://in/a.png', prompt: 'zoom in' });

      expect(subscribe).toHaveBeenCalledWith('fal-ai/wan-25/image-to-video', {
        input: { image_url: 'https://in/a.png', prompt: 'zoom in' },
      });
      expect(url).toBe('https://cdn/fal-video.mp4');
    });

    it('dispatches upscale/retouch/object_extraction/try_on categories via extendedModels shaping, unwrapping a plural output to its first url', async () => {
      const subscribe = vi.fn().mockResolvedValue({
        data: { images: [{ url: 'https://cdn/tryon-1.png' }, { url: 'https://cdn/tryon-2.png' }] },
        requestId: 'r2',
      });
      vi.spyOn(fal, 'getClient').mockReturnValue({ subscribe });
      const model = {
        id: 'm5',
        category: 'try_on',
        endpoint: 'fal-ai/fashn/tryon/v1.5',
        inputShape: 'dual_image',
        imageParam: { person: 'model_image_url', garment: 'garment_image_url' },
        outputField: 'images',
      };

      const url = await generateSingle(model, { personImageUrl: 'https://in/person.png', garmentImageUrl: 'https://in/shirt.png' });

      expect(subscribe).toHaveBeenCalledWith('fal-ai/fashn/tryon/v1.5', {
        input: { model_image_url: 'https://in/person.png', garment_image_url: 'https://in/shirt.png' },
      });
      expect(url).toBe('https://cdn/tryon-1.png');
    });

    it('throws for an unrecognized category', async () => {
      const model = { id: 'bad', category: 'something_else' };
      await expect(generateSingle(model, {})).rejects.toThrow(/no dispatch rule/);
    });
  });

  describe('generateNativeBatch', () => {
    it('throws when the model does not support batch generation', async () => {
      const model = { id: 'nb1', category: 'scene', supportsBatch: false };
      await expect(generateNativeBatch(model, { numImages: 3 })).rejects.toThrow(/does not support native batch/);
    });

    it('dispatches a batch-capable scene model to fal.generateBatch', async () => {
      const spy = vi
        .spyOn(fal, 'generateBatch')
        .mockResolvedValue([{ url: 'https://cdn/1.png' }, { url: 'https://cdn/2.png' }]);
      const model = { id: 'nb2', category: 'scene', supportsBatch: true, endpoint: 'fal-ai/x', imageParam: 'image_url' };

      const urls = await generateNativeBatch(model, { imageUrl: 'https://in/a.png', prompt: 'p', numImages: 2 });

      expect(spy).toHaveBeenCalledWith({ model, imageUrl: 'https://in/a.png', prompt: 'p', numImages: 2 });
      expect(urls).toEqual(['https://cdn/1.png', 'https://cdn/2.png']);
    });

    it('dispatches a batch-capable text_to_image model to textToImageModels.generateTextToImage', async () => {
      const spy = vi
        .spyOn(textToImageModels, 'generateTextToImage')
        .mockResolvedValue([{ url: 'https://cdn/a.png' }, { url: 'https://cdn/b.png' }, { url: 'https://cdn/c.png' }]);
      const model = { id: 'nb3', category: 'text_to_image', supportsBatch: true, endpoint: 'fal-ai/y' };

      const urls = await generateNativeBatch(model, { prompt: 'a cat', numImages: 3 });

      expect(spy).toHaveBeenCalledWith({ model, prompt: 'a cat', numImages: 3 });
      expect(urls).toEqual(['https://cdn/a.png', 'https://cdn/b.png', 'https://cdn/c.png']);
    });

    it('throws for a batch-capable model in an unsupported category', async () => {
      const model = { id: 'nb4', category: 'upscale', supportsBatch: true };
      await expect(generateNativeBatch(model, { numImages: 2 })).rejects.toThrow(/not implemented/);
    });
  });
});
