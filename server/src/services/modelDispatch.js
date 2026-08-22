// Single dispatch point: given an already-RESOLVED catalog model descriptor
// (from allowedModelsSeedData.ALLOWED_MODELS, however it was looked up) plus
// generation params, calls the right underlying client and returns a
// normalized url or url[]. This is where the three dedicated, fully-wrapped
// catalog modules (fal.js's scene/ugc/color-safe, textToImageModels.js,
// wavespeed.js) and extendedModels.js's generic request/response shaping (for
// upscale/retouch/object_extraction/try_on, and — see below — fal-hosted video)
// get unified behind one call shape for services/generationPipeline.js.
//
// Why fal-hosted video needs extendedModels' generic shaping rather than
// fal.js's own generateOne/generateBatch: fal.js's unwrap logic only handles
// outputField 'image'/'images' (the scene/ugc/color-safe catalog it's scoped
// to) — every current `category:'video'` catalog entry has `provider:'fal'`
// (research found solid fal.ai endpoints/pricing for video; no wavespeed-
// provider entries exist yet) and `outputField:'video'`, `inputShape:
// 'image_and_prompt'`, which extendedModels.buildRequestInput/extractOutput
// already handle generically. wavespeed.js stays wired in for the
// `provider:'wavespeed'` branch below so adding a wavespeed-hosted video tier
// later is a catalog-data change, not a code change here.

const fal = require('./fal');
const extendedModels = require('./extendedModels');
const textToImageModels = require('./textToImageModels');
const wavespeed = require('./wavespeed');

const SCENE_CATEGORIES = new Set(['scene', 'ugc', 'color_safe']);
const EXTENDED_SHAPE_CATEGORIES = new Set(['upscale', 'retouch', 'object_extraction', 'try_on']);

/** Calls a fal.ai model via extendedModels' generic request/response shaping. */
async function callViaExtendedShape(model, params) {
  const input = extendedModels.buildRequestInput(model, params);
  const client = fal.getClient();
  const result = await client.subscribe(model.endpoint, { input });
  return extendedModels.extractOutput(model, result.data);
}

/**
 * Generates exactly ONE output url, regardless of model category. This is
 * what generationPipeline.js's per-image loop calls repeatedly for a
 * non-batch-capable multi-image job — looping (and the lease-heartbeat refresh
 * between iterations) is the caller's responsibility, not this function's.
 * @param {object} model a resolved ALLOWED_MODELS entry
 * @param {{ imageUrl?, imageUrls?, personImageUrl?, garmentImageUrl?, prompt?, angles? }} params
 * @returns {Promise<string>}
 */
async function generateSingle(model, params = {}) {
  const { imageUrl, imageUrls, personImageUrl, garmentImageUrl, prompt, angles } = params;

  if (SCENE_CATEGORIES.has(model.category)) {
    const result = await fal.generateOne({ model, imageUrl, prompt });
    return result.url;
  }
  if (model.category === 'text_to_image') {
    const [result] = await textToImageModels.generateTextToImage({ model, prompt, numImages: 1 });
    return result.url;
  }
  if (model.category === 'video') {
    if (model.provider === 'wavespeed') {
      const result = await wavespeed.generateVideo({ model, imageUrl, prompt });
      return result.url;
    }
    const output = await callViaExtendedShape(model, { imageUrl, prompt });
    return Array.isArray(output) ? output[0] : output;
  }
  if (EXTENDED_SHAPE_CATEGORIES.has(model.category)) {
    const output = await callViaExtendedShape(model, { imageUrl, imageUrls, personImageUrl, garmentImageUrl, prompt, angles });
    return Array.isArray(output) ? output[0] : output;
  }
  throw new Error(`modelDispatch.js: no dispatch rule for category "${model.category}" (model "${model.id}")`);
}

/**
 * Generates every output of a batch-capable model in ONE call. Only scene and
 * text-to-image categories currently have any `supportsBatch: true` entries;
 * throws for anything else so a caller bug (asking for a native batch from a
 * model that can't do one) surfaces immediately rather than silently
 * generating just one image.
 * @param {object} model a resolved ALLOWED_MODELS entry with supportsBatch: true
 * @param {{ imageUrl?: string, prompt?: string, numImages: number }} params
 * @returns {Promise<string[]>}
 */
async function generateNativeBatch(model, params = {}) {
  if (!model.supportsBatch) {
    throw new Error(`modelDispatch.js: model "${model.id}" does not support native batch generation`);
  }
  const { imageUrl, prompt, numImages } = params;

  if (SCENE_CATEGORIES.has(model.category)) {
    const results = await fal.generateBatch({ model, imageUrl, prompt, numImages });
    return results.map((r) => r.url);
  }
  if (model.category === 'text_to_image') {
    const results = await textToImageModels.generateTextToImage({ model, prompt, numImages });
    return results.map((r) => r.url);
  }
  throw new Error(`modelDispatch.js: native batch dispatch not implemented for category "${model.category}"`);
}

module.exports = { generateSingle, generateNativeBatch };
