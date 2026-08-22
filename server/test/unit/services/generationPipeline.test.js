const {
  resolveModelForJob,
  needsBackgroundRemoval,
  runGenerationJob,
  VIDEO_MODELS,
} = require('../../../src/services/generationPipeline');
const fal = require('../../../src/services/fal');
const { EXTENDED_ALLOWED_MODELS } = require('../../../src/services/extendedModels');
const backgroundRemoval = require('../../../src/services/backgroundRemoval');
const modelDispatch = require('../../../src/services/modelDispatch');
const { PersonaGuardError, NotFoundError } = require('../../../src/errors/AppError');

function makeDeps(overrides = {}) {
  return {
    workerId: 'worker-1',
    jobsRepo: { getById: vi.fn(), heartbeat: vi.fn().mockResolvedValue(undefined) },
    templatesRepo: { getTemplate: vi.fn() },
    allowedModelsRepo: { getModel: vi.fn() },
    ...overrides,
  };
}

describe('services/generationPipeline', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolveModelForJob', () => {
    it('resolves a scene template via its modelRole against CUSTOM_SCENE_MODELS', async () => {
      const deps = makeDeps();
      deps.templatesRepo.getTemplate.mockResolvedValue({ category: 'scene', modelRole: 'default_scene' });

      const model = await resolveModelForJob({ templateId: 'tpl-1' }, deps);

      expect(model).toBe(fal.CUSTOM_SCENE_MODELS.default_scene);
    });

    it('resolves a video template via its modelRole against VIDEO_MODELS', async () => {
      const deps = makeDeps();
      deps.templatesRepo.getTemplate.mockResolvedValue({ category: 'video', modelRole: 'video_fast' });

      const model = await resolveModelForJob({ templateId: 'tpl-video' }, deps);

      expect(model).toBe(VIDEO_MODELS.video_fast);
    });

    it('throws NotFoundError for a missing template', async () => {
      const deps = makeDeps();
      deps.templatesRepo.getTemplate.mockResolvedValue(undefined);
      await expect(resolveModelForJob({ templateId: 'missing' }, deps)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws when a template references an unknown modelRole', async () => {
      const deps = makeDeps();
      deps.templatesRepo.getTemplate.mockResolvedValue({ category: 'scene', modelRole: 'not_a_real_role' });
      await expect(resolveModelForJob({ templateId: 'tpl-1' }, deps)).rejects.toThrow(/unknown modelRole/);
    });

    it('resolves tryOn content type to the fixed try-on model, no template needed', async () => {
      const model = await resolveModelForJob({ contentType: 'tryOn' }, makeDeps());
      expect(model).toBe(EXTENDED_ALLOWED_MODELS.try_on);
    });

    it('resolves custom content type via the merchant-chosen modelId', async () => {
      const deps = makeDeps();
      const chosenModel = { id: 'model-x', category: 'upscale' };
      deps.allowedModelsRepo.getModel.mockResolvedValue(chosenModel);

      const model = await resolveModelForJob({ contentType: 'custom', modelId: 'model-x' }, deps);

      expect(deps.allowedModelsRepo.getModel).toHaveBeenCalledWith('model-x');
      expect(model).toBe(chosenModel);
    });

    it('throws NotFoundError for a custom job whose modelId does not exist', async () => {
      const deps = makeDeps();
      deps.allowedModelsRepo.getModel.mockResolvedValue(undefined);
      await expect(resolveModelForJob({ contentType: 'custom', modelId: 'missing' }, deps)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('resolves a template-less video job via modelRouter tier routing', async () => {
      const model = await resolveModelForJob({ contentType: 'video', videoTier: 'premium' }, makeDeps());
      expect(model).toBe(VIDEO_MODELS.video_premium);
    });

    it('resolves a template-less ugc job to the UGC image-editing role', async () => {
      const model = await resolveModelForJob({ contentType: 'ugc' }, makeDeps());
      expect(model).toBe(fal.CUSTOM_SCENE_MODELS.image_editing_ugc);
    });

    it('resolves a template-less scene job via color-critical product-category routing', async () => {
      const model = await resolveModelForJob({ contentType: 'scene', productCategory: 'skincare' }, makeDeps());
      expect(model).toBe(fal.CUSTOM_SCENE_MODELS.photorealistic_color_safe);
    });
  });

  describe('needsBackgroundRemoval', () => {
    it('is true for scene/ugc/color_safe models with no reuse and no existing processed image', () => {
      expect(needsBackgroundRemoval({}, { category: 'scene' })).toBe(true);
      expect(needsBackgroundRemoval({}, { category: 'ugc' })).toBe(true);
      expect(needsBackgroundRemoval({}, { category: 'color_safe' })).toBe(true);
    });

    it('is false for any other model category (text_to_image, try_on, upscale, video)', () => {
      expect(needsBackgroundRemoval({}, { category: 'text_to_image' })).toBe(false);
      expect(needsBackgroundRemoval({}, { category: 'try_on' })).toBe(false);
      expect(needsBackgroundRemoval({}, { category: 'video' })).toBe(false);
    });

    it('is false when reuseProcessedImageFrom is set, even for a scene model', () => {
      expect(needsBackgroundRemoval({ reuseProcessedImageFrom: 'job-1' }, { category: 'scene' })).toBe(false);
    });

    it('is false when processedImageUrl is already set', () => {
      expect(needsBackgroundRemoval({ processedImageUrl: 'https://x/y.png' }, { category: 'scene' })).toBe(false);
    });
  });

  describe('runGenerationJob', () => {
    it('throws PersonaGuardError for a ugc job with a non-adult persona, before any model call', async () => {
      const deps = makeDeps();
      const dispatchSpy = vi.spyOn(modelDispatch, 'generateSingle');

      await expect(
        runGenerationJob({ contentType: 'ugc', personaAttributes: { ageRange: 'minor' } }, deps),
      ).rejects.toBeInstanceOf(PersonaGuardError);
      expect(dispatchSpy).not.toHaveBeenCalled();
    });

    it('reuses a prior job\'s processedImageUrl and skips background removal entirely', async () => {
      const deps = makeDeps();
      deps.jobsRepo.getById.mockResolvedValue({ processedImageUrl: 'https://cdn/reused-clean.png' });
      const removeBgSpy = vi.spyOn(backgroundRemoval, 'removeBackground');
      const dispatchSpy = vi.spyOn(modelDispatch, 'generateSingle').mockResolvedValue('https://cdn/video.mp4');

      await runGenerationJob(
        { id: 'job-1', contentType: 'video', videoTier: 'fast', reuseProcessedImageFrom: 'job-0', numImages: 1 },
        deps,
      );

      expect(removeBgSpy).not.toHaveBeenCalled();
      expect(dispatchSpy).toHaveBeenCalledWith(
        VIDEO_MODELS.video_fast,
        expect.objectContaining({ imageUrl: 'https://cdn/reused-clean.png' }),
      );
    });

    it('runs background removal first for a scene job, heartbeats the result, then generates from the clean image', async () => {
      const deps = makeDeps();
      deps.templatesRepo.getTemplate.mockResolvedValue({ category: 'scene', modelRole: 'default_scene' });
      vi.spyOn(backgroundRemoval, 'removeBackground').mockResolvedValue({ url: 'https://cdn/clean.png' });
      const dispatchSpy = vi.spyOn(modelDispatch, 'generateSingle').mockResolvedValue('https://cdn/scene.png');

      const result = await runGenerationJob(
        { id: 'job-1', templateId: 'tpl-1', sourceImageUrl: 'https://cdn/raw.png', numImages: 1, prompt: 'p' },
        deps,
      );

      expect(deps.jobsRepo.heartbeat).toHaveBeenCalledWith(
        'job-1',
        expect.objectContaining({ stage: 'background_removed', extraFields: { processedImageUrl: 'https://cdn/clean.png' } }),
      );
      expect(dispatchSpy).toHaveBeenCalledWith(fal.CUSTOM_SCENE_MODELS.default_scene, expect.objectContaining({ imageUrl: 'https://cdn/clean.png' }));
      expect(result).toEqual([{ url: 'https://cdn/scene.png' }]);
    });

    it('skips background removal for a text-to-image custom job', async () => {
      const deps = makeDeps();
      const t2iModel = { id: 't2i', category: 'text_to_image', supportsBatch: true };
      deps.allowedModelsRepo.getModel.mockResolvedValue(t2iModel);
      const removeBgSpy = vi.spyOn(backgroundRemoval, 'removeBackground');
      vi.spyOn(modelDispatch, 'generateSingle').mockResolvedValue('https://cdn/1.png');

      await runGenerationJob({ id: 'job-1', contentType: 'custom', modelId: 't2i', prompt: 'a cat', numImages: 1 }, deps);

      expect(removeBgSpy).not.toHaveBeenCalled();
    });

    it('loops per-image with a heartbeat between iterations for a non-batch multi-image job', async () => {
      const deps = makeDeps();
      const model = { id: 'no-batch', category: 'upscale', supportsBatch: false, endpoint: 'x', imageParam: 'image_url' };
      deps.allowedModelsRepo.getModel.mockResolvedValue(model);
      const dispatchSpy = vi
        .spyOn(modelDispatch, 'generateSingle')
        .mockResolvedValueOnce('https://cdn/1.png')
        .mockResolvedValueOnce('https://cdn/2.png')
        .mockResolvedValueOnce('https://cdn/3.png');

      const result = await runGenerationJob(
        { id: 'job-1', contentType: 'custom', modelId: 'no-batch', sourceImageUrl: 'https://cdn/raw.png', numImages: 3 },
        deps,
      );

      expect(dispatchSpy).toHaveBeenCalledTimes(3);
      // heartbeat is called once before iteration 2 and once before iteration 3 (not before iteration 1)
      expect(deps.jobsRepo.heartbeat).toHaveBeenCalledTimes(2);
      expect(deps.jobsRepo.heartbeat).toHaveBeenCalledWith('job-1', expect.objectContaining({ stage: 'generating_2_of_3' }));
      expect(deps.jobsRepo.heartbeat).toHaveBeenCalledWith('job-1', expect.objectContaining({ stage: 'generating_3_of_3' }));
      expect(result).toEqual([{ url: 'https://cdn/1.png' }, { url: 'https://cdn/2.png' }, { url: 'https://cdn/3.png' }]);
    });

    it('uses a single native-batch dispatch call (no per-image heartbeats) for a batch-capable multi-image job', async () => {
      const deps = makeDeps();
      const model = { id: 'batchable', category: 'text_to_image', supportsBatch: true };
      deps.allowedModelsRepo.getModel.mockResolvedValue(model);
      const batchSpy = vi
        .spyOn(modelDispatch, 'generateNativeBatch')
        .mockResolvedValue(['https://cdn/1.png', 'https://cdn/2.png']);
      const singleSpy = vi.spyOn(modelDispatch, 'generateSingle');

      const result = await runGenerationJob({ id: 'job-1', contentType: 'custom', modelId: 'batchable', prompt: 'p', numImages: 2 }, deps);

      expect(batchSpy).toHaveBeenCalledTimes(1);
      expect(singleSpy).not.toHaveBeenCalled();
      expect(deps.jobsRepo.heartbeat).not.toHaveBeenCalled();
      expect(result).toEqual([{ url: 'https://cdn/1.png' }, { url: 'https://cdn/2.png' }]);
    });
  });
});
