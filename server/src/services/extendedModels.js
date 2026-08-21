// Custom-prompt-only catalog (upscale, retouch, object extraction, try-on) for
// the Custom Prompt Studio flow. Pure request/response shaping helpers only —
// no client, no I/O. The orchestration layer built later imports
// EXTENDED_ALLOWED_MODELS to resolve a model by role/id, calls
// buildRequestInput to shape the fal.ai `input` payload, dispatches the call
// itself (reusing services/fal.js's `getClient()` for the actual @fal-ai/client
// instance), and calls extractOutput on the resolved `.data` payload (see
// services/fal.js's header comment for why fal.ai's `subscribe()` result must
// be unwrapped through `.data` before it reaches extractOutput here).

const { ALLOWED_MODELS } = require('./allowedModelsSeedData');

const EXTENDED_CATALOG_CATEGORIES = new Set(['upscale', 'retouch', 'object_extraction', 'try_on']);

/** Extended (custom-prompt-only) models, keyed by their own `role` field. */
const EXTENDED_ALLOWED_MODELS = ALLOWED_MODELS.filter((model) => EXTENDED_CATALOG_CATEGORIES.has(model.category)).reduce(
  (acc, model) => {
    acc[model.role] = model;
    return acc;
  },
  {},
);

/**
 * Shapes the fal.ai `input` payload for a model, switching on `model.inputShape`.
 * @param {object} model
 * @param {{ imageUrl?: string, imageUrls?: string[], personImageUrl?: string, garmentImageUrl?: string, prompt?: string, angles?: string[] }} params
 * @returns {object} the input object to send as the fal.ai call's `input`
 */
function buildRequestInput(model, { imageUrl, imageUrls, personImageUrl, garmentImageUrl, prompt, angles } = {}) {
  switch (model.inputShape) {
    case 'image_only':
      return { [model.imageParam]: imageUrl };
    case 'image_and_prompt':
      return { [model.imageParam]: imageUrl, prompt };
    case 'image_urls_prompt':
      return { [model.imageParam]: imageUrls, prompt };
    case 'dual_image':
      return {
        [model.imageParam.person]: personImageUrl,
        [model.imageParam.garment]: garmentImageUrl,
      };
    case 'image_urls_angles':
      return { [model.imageParam]: imageUrls, angles };
    default:
      throw new Error(`extendedModels.js: unrecognized inputShape "${model.inputShape}" for model "${model.id}"`);
  }
}

/**
 * Extracts the normalized output from an already-unwrapped fal.ai result
 * payload (i.e. the `.data` of `subscribe()`'s `{data, requestId}` result),
 * switching on `model.outputField`. Deliberately has NO defensive fallback for
 * an unrecognized field or a shape mismatch (e.g. treating a singular response
 * as an array) — that's a genuine model-metadata bug in allowedModelsSeedData.js
 * and should throw loudly rather than silently return garbage.
 * @param {object} model
 * @param {object} rawResult the unwrapped result payload
 * @returns {string|string[]}
 */
function extractOutput(model, rawResult) {
  switch (model.outputField) {
    case 'image':
      return rawResult.image.url;
    case 'images':
      return rawResult.images.map((image) => image.url);
    case 'video':
      return rawResult.video.url;
    default:
      throw new Error(`extendedModels.js: unrecognized outputField "${model.outputField}" for model "${model.id}"`);
  }
}

module.exports = { EXTENDED_ALLOWED_MODELS, buildRequestInput, extractOutput };
