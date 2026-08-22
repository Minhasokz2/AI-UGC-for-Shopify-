const { TEXT_TO_IMAGE_MODELS, generateTextToImage } = require('../../../src/services/textToImageModels');
const { ALLOWED_MODELS } = require('../../../src/services/allowedModelsSeedData');

describe('services/textToImageModels', () => {
  describe('TEXT_TO_IMAGE_MODELS', () => {
    it('is keyed by role and includes every text_to_image catalog entry, no more no less', () => {
      const expectedRoles = ALLOWED_MODELS.filter((m) => m.category === 'text_to_image').map((m) => m.role);
      expect(Object.keys(TEXT_TO_IMAGE_MODELS).sort()).toEqual(expectedRoles.sort());
      expect(expectedRoles.length).toBeGreaterThan(0);
    });

    it('every entry hides the image-attach control (imageCountConstraint max === 0)', () => {
      for (const model of Object.values(TEXT_TO_IMAGE_MODELS)) {
        expect(model.imageCountConstraint).toEqual({ min: 0, max: 0 });
      }
    });
  });

  describe('generateTextToImage', () => {
    const model = { id: 'test-t2i', endpoint: 'fal-ai/test-t2i' };

    it('calls client.subscribe with {prompt, num_images} and unwraps every image', async () => {
      const subscribe = vi.fn().mockResolvedValue({
        data: { images: [{ url: 'https://cdn/1.png' }, { url: 'https://cdn/2.png' }] },
        requestId: 'r1',
      });
      const client = { subscribe };

      const result = await generateTextToImage({ model, prompt: 'a cat on a chair', numImages: 2, client });

      expect(subscribe).toHaveBeenCalledWith('fal-ai/test-t2i', {
        input: { prompt: 'a cat on a chair', num_images: 2 },
      });
      expect(result).toEqual([{ url: 'https://cdn/1.png' }, { url: 'https://cdn/2.png' }]);
    });

    it('uses the same code path for every model — no per-model branching', async () => {
      const otherModel = { id: 'test-t2i-2', endpoint: 'fal-ai/other' };
      const subscribe = vi.fn().mockResolvedValue({ data: { images: [{ url: 'https://cdn/x.png' }] }, requestId: 'r2' });
      const client = { subscribe };

      await generateTextToImage({ model: otherModel, prompt: 'p', numImages: 1, client });

      expect(subscribe).toHaveBeenCalledWith('fal-ai/other', { input: { prompt: 'p', num_images: 1 } });
    });
  });
});
