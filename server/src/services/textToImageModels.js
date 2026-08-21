// Text-to-image-only catalog (no image input parameter at all) for the Custom
// Prompt Studio flow. All four current catalog entries (`prompt_only`
// inputShape, `images` outputField, `supportsBatch: true`) share one call
// shape, so there is deliberately no per-model branching here.
//
// See services/fal.js's header comment for why the @fal-ai/client `subscribe()`
// result must be unwrapped through `.data` before reading `images` — this
// module reuses fal.js's lazily-constructed client (`getClient()`) rather than
// instantiating a second @fal-ai/client for the same provider/credentials.

const { getClient } = require('./fal');
const { ALLOWED_MODELS } = require('./allowedModelsSeedData');

/** Text-to-image models, keyed by their own `role` field. */
const TEXT_TO_IMAGE_MODELS = ALLOWED_MODELS.filter((model) => model.category === 'text_to_image').reduce(
  (acc, model) => {
    acc[model.role] = model;
    return acc;
  },
  {},
);

/**
 * @param {{ model: object, prompt: string, numImages: number, client?: object }} params
 * @returns {Promise<Array<{ url: string }>>}
 */
async function generateTextToImage({ model, prompt, numImages, client = getClient() }) {
  const input = { prompt, num_images: numImages };
  const result = await client.subscribe(model.endpoint, { input });
  return result.data.images.map((image) => ({ url: image.url }));
}

module.exports = { TEXT_TO_IMAGE_MODELS, generateTextToImage };
