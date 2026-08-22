// Two-step generation pipeline: resolve which model a job should use, run
// background removal first when the resolved model is a scene/UGC/color-safe
// editor (unless a prior job's already-processed image is being reused), then
// run the main generation call — looping per-image (refreshing the job's lease
// via heartbeat between iterations) for models with no native batch parameter.
//
// This module is deliberately just "given a job, produce resultVariations, or
// throw" — it does NOT claim the job or call jobsRepo.settleJobSuccess/Failure
// itself. That claim→run→settle orchestration belongs to workers/jobWorker.js
// (built later), which is what lets this module be tested as plain
// input→output logic instead of needing a lease already held.
//
// Model resolution reconciles two facts from the spec that would otherwise
// conflict: (1) admin-curated Templates carry their OWN fixed, admin-assigned
// model (not auto-routed) — so a templated job just reads `template.modelRole`
// directly; (2) services/modelRouter.js's role-key routing is for the
// template-LESS auto flows where the merchant doesn't pick a specific model —
// Persona Builder (always the UGC image-editing role) and Video Studio (a
// fast/standard/premium TIER the merchant picks, not a model). Custom Prompt
// Studio and Virtual Try-On bypass routing entirely: the merchant explicitly
// chose `job.modelId`, or the model is simply fixed (try-on).

const { NotFoundError } = require('../errors/AppError');
const { ALLOWED_MODELS } = require('./allowedModelsSeedData');
const fal = require('./fal');
const { EXTENDED_ALLOWED_MODELS } = require('./extendedModels');
const backgroundRemoval = require('./backgroundRemoval');
const modelDispatch = require('./modelDispatch');
const modelRouter = require('./modelRouter');
const personaGuard = require('./personaGuard');

const BACKGROUND_REMOVAL_CATEGORIES = new Set(['scene', 'ugc', 'color_safe']);

/** Video models, keyed by role — derived here since no other module needs this grouping. */
const VIDEO_MODELS = ALLOWED_MODELS.filter((model) => model.category === 'video').reduce((acc, model) => {
  acc[model.role] = model;
  return acc;
}, {});

/**
 * @param {object} job
 * @param {{ templatesRepo: object, allowedModelsRepo: object }} deps
 * @returns {Promise<object>} a resolved ALLOWED_MODELS entry
 */
async function resolveModelForJob(job, { templatesRepo, allowedModelsRepo }) {
  if (job.templateId) {
    const template = await templatesRepo.getTemplate(job.templateId);
    if (!template) throw new NotFoundError(`Template ${job.templateId} not found`);
    const catalog = template.category === 'video' ? VIDEO_MODELS : fal.CUSTOM_SCENE_MODELS;
    const model = catalog[template.modelRole];
    if (!model) {
      throw new Error(
        `generationPipeline.js: template "${job.templateId}" references unknown modelRole "${template.modelRole}"`,
      );
    }
    return model;
  }

  if (job.contentType === 'tryOn') {
    return EXTENDED_ALLOWED_MODELS.try_on;
  }

  if (job.contentType === 'custom') {
    if (!job.modelId) throw new Error('generationPipeline.js: a "custom" job must carry a modelId');
    const model = await allowedModelsRepo.getModel(job.modelId);
    if (!model) throw new NotFoundError(`Model ${job.modelId} not found`);
    return model;
  }

  if (job.contentType === 'video') {
    const role = modelRouter.selectVideoModelRoleKey({ tier: job.videoTier });
    return VIDEO_MODELS[role];
  }

  if (job.contentType === 'ugc') {
    const role = modelRouter.selectSceneModelRoleKey({ contentType: 'ugc' });
    return fal.CUSTOM_SCENE_MODELS[role];
  }

  // Template-less 'scene' content — a "quick generate" auto-scene case.
  const role = modelRouter.selectSceneModelRoleKey({ productCategory: job.productCategory, contentType: job.contentType });
  return fal.CUSTOM_SCENE_MODELS[role];
}

/**
 * @param {object} job
 * @param {object} model the resolved model for this job
 * @returns {boolean}
 */
function needsBackgroundRemoval(job, model) {
  if (job.reuseProcessedImageFrom) return false;
  if (job.processedImageUrl) return false;
  return BACKGROUND_REMOVAL_CATEGORIES.has(model.category);
}

/**
 * @param {object} job
 * @param {{ workerId: string, jobsRepo: object, templatesRepo: object, allowedModelsRepo: object }} deps
 * @returns {Promise<Array<{ url: string }>>}
 */
async function runGenerationJob(job, { workerId, jobsRepo, templatesRepo, allowedModelsRepo }) {
  // Belt-and-suspenders: the job-creation route already checked this before the
  // job ever reached `pending`, but retry/resume paths re-enter this function
  // without going back through that route, so the gate is re-asserted here too.
  if (job.contentType === 'ugc') {
    personaGuard.assertAdultPersona(job.personaAttributes);
  }

  const model = await resolveModelForJob(job, { templatesRepo, allowedModelsRepo });

  let processedImageUrl = job.processedImageUrl;
  if (job.reuseProcessedImageFrom) {
    const sourceJob = await jobsRepo.getById(job.reuseProcessedImageFrom);
    processedImageUrl = sourceJob?.processedImageUrl;
  } else if (needsBackgroundRemoval(job, model)) {
    const removed = await backgroundRemoval.removeBackground({ imageUrl: job.sourceImageUrl });
    processedImageUrl = removed.url;
    await jobsRepo.heartbeat(job.id, {
      workerId,
      stage: 'background_removed',
      extraFields: { processedImageUrl },
    });
  }

  const imageUrl = processedImageUrl ?? job.sourceImageUrl;
  const numImages = job.numImages ?? 1;
  const genParams = {
    imageUrl,
    imageUrls: job.imageUrls,
    personImageUrl: job.personImageUrl,
    garmentImageUrl: job.garmentImageUrl,
    prompt: job.prompt,
  };

  let urls;
  if (model.supportsBatch && numImages > 1) {
    urls = await modelDispatch.generateNativeBatch(model, { ...genParams, numImages });
  } else {
    urls = [];
    for (let i = 0; i < numImages; i += 1) {
      // Refresh the lease before every generation call after the first — a
      // slow multi-image loop must not let the lease go stale mid-job.
      if (i > 0) {
        await jobsRepo.heartbeat(job.id, { workerId, stage: `generating_${i + 1}_of_${numImages}` });
      }
      // eslint-disable-next-line no-await-in-loop
      urls.push(await modelDispatch.generateSingle(model, genParams));
    }
  }

  return urls.map((url) => ({ url }));
}

module.exports = { resolveModelForJob, needsBackgroundRemoval, runGenerationJob, VIDEO_MODELS };
