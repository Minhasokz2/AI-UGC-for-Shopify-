// Thin wrapper around @fal-ai/client for the scene/UGC/color-safe image-editing
// catalog that backs the auto-routed TEMPLATE flow. No business logic (credits,
// persona checks, pipeline orchestration) belongs here — that's a layer built
// later that calls into generateOne/generateBatch with a model descriptor it
// already resolved via services/modelRouter.js + this file's CUSTOM_SCENE_MODELS.
//
// --- @fal-ai/client shape, verified against the installed package (v1.10.1) ---
// `createFalClient(config)` returns a client exposing `.subscribe(endpointId,
// {input})`, which submits to the queue, waits for completion, and resolves to
// `{ data, requestId }` — the actual model output lives under `.data`, NOT at
// the top level of the resolved value (see node_modules/@fal-ai/client/src/
// response.js's `resultResponseHandler` and client.js's `subscribe`). Every
// unwrap below reads `result.data[model.outputField]` accordingly.
//
// Credentials: the client's default `credentialsFromEnv` reads `FAL_KEY` (or
// `FAL_KEY_ID`/`FAL_KEY_SECRET`), NOT `FAL_API_KEY` — this repo's env schema
// uses `FAL_API_KEY`, so the lazy client below passes `credentials:
// env.FAL_API_KEY` explicitly rather than relying on the SDK's env autodetect.

const { createFalClient } = require('@fal-ai/client');
const { env } = require('../config/env');
const { ALLOWED_MODELS } = require('./allowedModelsSeedData');
const { buildRequestInput } = require('./extendedModels');

const SCENE_CATALOG_CATEGORIES = new Set(['scene', 'ugc', 'color_safe']);

/**
 * Scene/UGC/color-safe models, keyed by their own `role` field — derived from
 * ALLOWED_MODELS, never hand-duplicated. Includes every catalog entry whose
 * `category` is 'scene', 'ugc', or 'color_safe' (this also covers
 * background-removal-adjacent roles referenced by services/modelRouter.js:
 * `default_scene`, `scene_mid`, `scene_multi_budget`, `image_editing_ugc`,
 * `scene_premium`, `photorealistic_color_safe`).
 */
const CUSTOM_SCENE_MODELS = ALLOWED_MODELS.filter((model) => SCENE_CATALOG_CATEGORIES.has(model.category)).reduce(
  (acc, model) => {
    acc[model.role] = model;
    return acc;
  },
  {},
);

let realClient;
/** Lazily-constructed real @fal-ai/client instance, configured with FAL_API_KEY. */
function getClient() {
  if (!realClient) {
    realClient = createFalClient({ credentials: env.FAL_API_KEY });
  }
  return realClient;
}

/**
 * Delegates to extendedModels.buildRequestInput so a model whose inputShape
 * is 'image_urls_prompt' (e.g. the UGC image-editing model, multi-image
 * scene edits) actually gets its images sent as an array — this file
 * previously always built `{ [imageParam]: imageUrl }` (a bare string),
 * which fal.ai rejects for any model expecting a plural `image_urls` field.
 * @param {object} model a CUSTOM_SCENE_MODELS entry
 * @param {{ imageUrl?: string, imageUrls?: string[], prompt?: string }} params
 */
function buildInput(model, { imageUrl, imageUrls, prompt } = {}) {
  return buildRequestInput(model, { imageUrl, imageUrls, prompt });
}

/**
 * Unwraps a completed queue result's `.data` payload per the model's
 * `outputField`, returning a single `{ url }`.
 */
function unwrapSingle(model, data) {
  if (model.outputField === 'image') {
    return { url: data.image.url };
  }
  if (model.outputField === 'images') {
    return { url: data.images[0].url };
  }
  throw new Error(`fal.js: unrecognized outputField "${model.outputField}" for model "${model.id}"`);
}

/**
 * Runs one scene/UGC/color-safe model for a single image or an image set,
 * returning `{ url }`.
 * @param {{ model: object, imageUrl?: string, imageUrls?: string[], prompt?: string, client?: object }} params
 */
async function generateOne({ model, imageUrl, imageUrls, prompt, client = getClient() }) {
  const input = buildInput(model, { imageUrl, imageUrls, prompt });
  const result = await client.subscribe(model.endpoint, { input });
  return unwrapSingle(model, result.data);
}

/**
 * Runs a batch-capable model, returning an array of `{ url }`. Only valid for
 * models with `supportsBatch: true` AND a plural `outputField` — a singular
 * `outputField: 'image'` model has no batch mode by construction, so calling
 * generateBatch on one is a caller bug and throws rather than being handled
 * gracefully.
 * @param {{ model: object, imageUrl?: string, imageUrls?: string[], prompt?: string, numImages: number, client?: object }} params
 */
async function generateBatch({ model, imageUrl, imageUrls, prompt, numImages, client = getClient() }) {
  if (model.outputField === 'image') {
    throw new Error(
      `fal.js: model "${model.id}" has a singular outputField ("image") — it has no batch mode, generateBatch is a caller bug here`,
    );
  }
  if (!model.supportsBatch) {
    throw new Error(`fal.js: model "${model.id}" does not support batch generation (supportsBatch is false)`);
  }
  const input = { ...buildInput(model, { imageUrl, imageUrls, prompt }), num_images: numImages };
  const result = await client.subscribe(model.endpoint, { input });
  return result.data.images.map((image) => ({ url: image.url }));
}

module.exports = { CUSTOM_SCENE_MODELS, generateOne, generateBatch, getClient };
