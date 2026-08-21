// Single source of truth for the AI model catalog. `scripts/seedAllowedModels.js`
// (CLI) and `routes/admin/seedModels.js` (POST /admin/api/seed-models, for
// environments without shell access) both import ONLY from this file — never
// duplicate the model list elsewhere.
//
// Endpoint IDs and prices were verified against fal.ai's live model pages during
// research (2026-08-21); fal.ai's catalog changes frequently and several pages
// either 404'd or had conflicting prices across sources during that research —
// every such entry below is marked `needsPriceReview: true` and/or
// `paramNamesUnconfirmed: true`. Re-verify against `fal.ai/models/{endpoint}/api`
// before real spend is at risk (see README's "Required manual steps" section).
//
// `services/fal.js`, `services/extendedModels.js`, and `services/textToImageModels.js`
// derive their exported catalogs (CUSTOM_SCENE_MODELS, EXTENDED_ALLOWED_MODELS,
// TEXT_TO_IMAGE_MODELS) by filtering THIS array by `role`/`category` rather than
// duplicating model definitions — this file is the only place a model is authored.

/**
 * Precomputes the `{min, max}` image-attachment constraint from a model's
 * `inputShape`, exactly mirroring the plan's contract: the frontend's
 * `getImageCountConstraint(model)` is a trivial passthrough of this precomputed
 * field, so the two layers can never drift apart. Exported for reuse by the admin
 * panel's "add/edit model" flow when an admin defines a new model interactively.
 * @param {'prompt_only'|'image_only'|'image_and_prompt'|'image_urls_prompt'|'image_urls_angles'|'dual_image'} inputShape
 * @param {number} [maxImages]
 * @returns {{ min: number, max: number }}
 */
function computeImageCountConstraint(inputShape, maxImages = 1) {
  switch (inputShape) {
    case 'prompt_only':
      return { min: 0, max: 0 };
    case 'image_only':
    case 'image_and_prompt':
      return { min: 1, max: 1 };
    case 'dual_image':
      return { min: 2, max: 2 };
    case 'image_urls_prompt':
    case 'image_urls_angles':
      return { min: 1, max: maxImages };
    default:
      return { min: 0, max: 0 };
  }
}

/** @param {object} model everything except imageCountConstraint, which is derived */
function defineModel(model) {
  return { ...model, imageCountConstraint: computeImageCountConstraint(model.inputShape, model.maxImages) };
}

const ALLOWED_MODELS = [
  // --- Background removal (always runs first for scene/UGC content) ---------
  defineModel({
    id: 'birefnet-v2-budget-removal',
    label: 'BiRefNet v2 (Budget Background Removal)',
    category: 'background_removal',
    role: 'background_removal_budget',
    eligibleFlows: ['template', 'custom'],
    provider: 'fal',
    endpoint: 'fal-ai/birefnet/v2',
    inputShape: 'image_only',
    imageParam: 'image_url',
    outputField: 'image',
    supportsBatch: false,
    creditCost: 1,
    actualCostUsd: 0.002,
    needsPriceReview: true, // billed per compute-second on fal.ai, not a disclosed flat price
  }),
  defineModel({
    id: 'bria-rmbg-premium-removal',
    label: 'Bria RMBG 2.0 (Premium Background Removal)',
    category: 'background_removal',
    role: 'background_removal_premium',
    eligibleFlows: ['template', 'custom'],
    provider: 'fal',
    endpoint: 'fal-ai/bria/background/remove',
    inputShape: 'image_only',
    imageParam: 'image_url',
    outputField: 'image',
    supportsBatch: false,
    creditCost: 1,
    actualCostUsd: 0.018,
    needsPriceReview: false,
  }),

  // --- Scene / UGC image-editing models (feed both template AND custom flows) -
  defineModel({
    id: 'flux-kontext-dev-default-scene',
    label: 'FLUX.1 Kontext [dev] (Default Scene)',
    category: 'scene',
    role: 'default_scene',
    eligibleFlows: ['template', 'custom'],
    provider: 'fal',
    endpoint: 'fal-ai/flux-kontext/dev',
    inputShape: 'image_and_prompt',
    imageParam: 'image_url',
    outputField: 'images',
    supportsBatch: false,
    creditCost: 1,
    actualCostUsd: 0.025,
    needsPriceReview: false,
  }),
  defineModel({
    id: 'flux-kontext-pro-scene-mid',
    label: 'FLUX.1 Kontext [pro] (Mid-tier Scene)',
    category: 'scene',
    role: 'scene_mid',
    eligibleFlows: ['template', 'custom'],
    provider: 'fal',
    endpoint: 'fal-ai/flux-pro/kontext',
    inputShape: 'image_and_prompt',
    imageParam: 'image_url',
    outputField: 'images',
    supportsBatch: false,
    creditCost: 2,
    actualCostUsd: 0.04,
    needsPriceReview: false,
  }),
  defineModel({
    id: 'qwen-image-edit-2511-multi-budget',
    label: 'Qwen Image Edit 2511 (Budget Multi-Image Editor)',
    category: 'scene',
    role: 'scene_multi_budget',
    additionalRoles: ['multi_angle'], // no dedicated confirmed multi-angle endpoint found in research; served via prompting this general multi-image editor instead of an invented endpoint
    eligibleFlows: ['custom'], // templates only have one product-image slot
    provider: 'fal',
    endpoint: 'fal-ai/qwen-image-edit-2511',
    inputShape: 'image_urls_prompt',
    imageParam: 'image_urls',
    maxImages: 6,
    outputField: 'images',
    supportsBatch: false,
    creditCost: 2,
    actualCostUsd: 0.03,
    needsPriceReview: false,
  }),
  defineModel({
    id: 'nano-banana-edit-ugc',
    label: 'Nano Banana Edit (Gemini 2.5 Flash Image) — UGC/On-Model',
    category: 'ugc',
    role: 'image_editing_ugc',
    additionalRoles: ['banner_text_edit'], // no dedicated confirmed banner/text-edit endpoint found in research; served via prompting this general editor
    eligibleFlows: ['template', 'custom'],
    provider: 'fal',
    endpoint: 'fal-ai/nano-banana/edit',
    inputShape: 'image_urls_prompt',
    imageParam: 'image_urls',
    maxImages: 2,
    outputField: 'images',
    supportsBatch: false,
    creditCost: 2,
    actualCostUsd: 0.039,
    needsPriceReview: false,
  }),
  defineModel({
    id: 'nano-banana-pro-edit-premium',
    label: 'Nano Banana Pro Edit (Gemini 3 Pro Image) — Premium Scene',
    category: 'scene',
    role: 'scene_premium',
    additionalRoles: ['banner_text_edit'],
    eligibleFlows: ['template', 'custom'],
    provider: 'fal',
    endpoint: 'fal-ai/nano-banana-pro/edit',
    inputShape: 'image_urls_prompt',
    imageParam: 'image_urls',
    maxImages: 6, // API reportedly supports up to 14; capped in our UI for a manageable picker
    outputField: 'images',
    supportsBatch: false,
    creditCost: 6,
    actualCostUsd: 0.15, // base resolution; 4K variant is ~2x — re-verify before enabling 4K output
    needsPriceReview: false,
  }),

  // --- Color-critical photorealistic (skincare/cosmetics/makeup/beauty) ------
  defineModel({
    id: 'bria-product-shot-color-safe',
    label: 'Bria Product Shot (Color-Safe Photorealistic)',
    category: 'color_safe',
    role: 'photorealistic_color_safe',
    eligibleFlows: ['template', 'custom'],
    provider: 'fal',
    endpoint: 'fal-ai/bria/product-shot',
    inputShape: 'image_and_prompt',
    imageParam: 'image_url',
    outputField: 'image',
    supportsBatch: false,
    creditCost: 2,
    actualCostUsd: 0.04,
    needsPriceReview: false,
  }),

  // --- Extended models (custom-prompt flow only) -----------------------------
  defineModel({
    id: 'recraft-crisp-upscale-budget',
    label: 'Recraft Crisp Upscale (Budget)',
    category: 'upscale',
    role: 'upscale_budget',
    eligibleFlows: ['custom'],
    provider: 'fal',
    endpoint: 'fal-ai/recraft/upscale/crisp',
    inputShape: 'image_only',
    imageParam: 'image_url',
    outputField: 'image',
    supportsBatch: false,
    creditCost: 1,
    actualCostUsd: 0.004,
    needsPriceReview: false,
  }),
  defineModel({
    id: 'clarity-upscaler-premium',
    label: 'Clarity Upscaler (Premium)',
    category: 'upscale',
    role: 'upscale_premium',
    eligibleFlows: ['custom'],
    provider: 'fal',
    endpoint: 'fal-ai/clarity-upscaler',
    inputShape: 'image_only',
    imageParam: 'image_url',
    outputField: 'image',
    supportsBatch: false,
    creditCost: 2,
    actualCostUsd: 0.03,
    needsPriceReview: false,
  }),
  defineModel({
    id: 'retoucher-enhance',
    label: 'Retoucher (Auto Retouch/Enhance)',
    category: 'retouch',
    role: 'retouch',
    eligibleFlows: ['custom'],
    provider: 'fal',
    endpoint: 'fal-ai/retoucher',
    inputShape: 'image_only',
    imageParam: 'image_url',
    outputField: 'image',
    supportsBatch: false,
    creditCost: 2,
    actualCostUsd: 0.02, // placeholder — billed per compute-second on fal.ai, no disclosed flat price
    needsPriceReview: true,
  }),
  defineModel({
    id: 'object-removal-cutout',
    label: 'Object Removal (Product Cutout/Extraction)',
    category: 'object_extraction',
    role: 'object_extraction',
    eligibleFlows: ['custom'],
    provider: 'fal',
    endpoint: 'fal-ai/object-removal',
    inputShape: 'image_and_prompt', // prompt describes what to remove
    imageParam: 'image_url',
    outputField: 'image',
    supportsBatch: false,
    creditCost: 2,
    actualCostUsd: 0.03, // placeholder — no confirmed flat price found in research
    needsPriceReview: true,
  }),
  defineModel({
    id: 'fashn-tryon-v15',
    label: 'FASHN Try-On v1.5 (Virtual Try-On)',
    category: 'try_on',
    role: 'try_on',
    eligibleFlows: ['custom'], // driven by its own dedicated Virtual Try-On flow, not the generic studio
    provider: 'fal',
    endpoint: 'fal-ai/fashn/tryon/v1.5',
    inputShape: 'dual_image',
    imageParam: { person: 'model_image_url', garment: 'garment_image_url' },
    outputField: 'images',
    supportsBatch: false,
    creditCost: 4,
    actualCostUsd: 0.075,
    needsPriceReview: false,
    paramNamesUnconfirmed: true, // exact JSON keys inferred from UI labels, not a directly observed schema
  }),

  // --- Text-to-image (custom-prompt flow only, zero image-input parameter) ---
  defineModel({
    id: 'flux-schnell-t2i-budget',
    label: 'FLUX.1 [schnell] (Budget Text-to-Image)',
    category: 'text_to_image',
    role: 'text_to_image_budget',
    eligibleFlows: ['custom'],
    provider: 'fal',
    endpoint: 'fal-ai/flux/schnell',
    inputShape: 'prompt_only',
    outputField: 'images',
    supportsBatch: true,
    creditCost: 1,
    actualCostUsd: 0.003,
    needsPriceReview: false,
  }),
  defineModel({
    id: 'flux-dev-t2i-mid',
    label: 'FLUX.1 [dev] (Mid-tier Text-to-Image)',
    category: 'text_to_image',
    role: 'text_to_image_mid',
    eligibleFlows: ['custom'],
    provider: 'fal',
    endpoint: 'fal-ai/flux/dev',
    inputShape: 'prompt_only',
    outputField: 'images',
    supportsBatch: true,
    creditCost: 1,
    actualCostUsd: 0.025,
    needsPriceReview: false,
  }),
  defineModel({
    id: 'recraft-v3-t2i-premium',
    label: 'Recraft V3 (Premium Text-to-Image)',
    category: 'text_to_image',
    role: 'text_to_image_premium',
    eligibleFlows: ['custom'],
    provider: 'fal',
    endpoint: 'fal-ai/recraft/v3/text-to-image',
    inputShape: 'prompt_only',
    outputField: 'images',
    supportsBatch: true,
    creditCost: 2,
    actualCostUsd: 0.04,
    needsPriceReview: false,
  }),
  defineModel({
    id: 'ideogram-v3-t2i-highest-fidelity',
    label: 'Ideogram V3 Quality (Highest-Fidelity Text-to-Image)',
    category: 'text_to_image',
    role: 'text_to_image_highest_fidelity',
    eligibleFlows: ['custom'],
    provider: 'fal',
    endpoint: 'fal-ai/ideogram/v3',
    inputShape: 'prompt_only',
    outputField: 'images',
    supportsBatch: true,
    creditCost: 3,
    actualCostUsd: 0.09,
    needsPriceReview: false,
  }),

  // --- Video (own dedicated Video Studio flow, tiered fast/standard/premium) --
  defineModel({
    id: 'wan25-preview-video-fast',
    label: 'Wan 2.5 Preview (Fast/Cheap Video)',
    category: 'video',
    role: 'video_fast',
    eligibleFlows: ['template', 'custom'],
    provider: 'fal',
    endpoint: 'fal-ai/wan-25-preview/image-to-video',
    inputShape: 'image_and_prompt',
    imageParam: 'image_url',
    outputField: 'video',
    supportsBatch: false,
    creditCost: 8, // ~5s clip at 480p ($0.05/s)
    actualCostUsd: 0.25,
    needsPriceReview: false,
  }),
  defineModel({
    id: 'kling25-turbo-pro-video-standard',
    label: 'Kling 2.5 Turbo Pro (Standard Video)',
    category: 'video',
    role: 'video_standard',
    eligibleFlows: ['template', 'custom'],
    provider: 'fal',
    endpoint: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
    inputShape: 'image_and_prompt',
    imageParam: 'image_url',
    outputField: 'video',
    supportsBatch: false,
    creditCost: 12, // 5s clip flat price
    actualCostUsd: 0.35,
    needsPriceReview: false,
  }),
  defineModel({
    id: 'veo3-audio-video-premium',
    label: 'Veo 3 with Audio (Premium Video)',
    category: 'video',
    role: 'video_premium',
    eligibleFlows: ['template', 'custom'],
    provider: 'fal',
    endpoint: 'fal-ai/veo3/image-to-video',
    inputShape: 'image_and_prompt',
    imageParam: 'image_url',
    outputField: 'video',
    supportsBatch: false,
    creditCost: 40, // ~5s clip at $0.40/s with audio
    actualCostUsd: 2.0,
    needsPriceReview: false,
  }),
];

/**
 * Upserts every catalog entry into Firestore's `allowed_models` collection.
 * Insert-if-missing, never overwrite-if-present — so re-running this (via the
 * CLI script or the admin panel's "re-seed" button) is always safe and never
 * clobbers an admin's manual price/cost edit to an existing model. New models
 * added to ALLOWED_MODELS after a deploy DO get created on the next re-seed.
 * @param {{ db: object }} opts
 * @returns {Promise<{ created: number, skipped: number, total: number }>}
 */
async function seedAllowedModels({ db }) {
  const col = db.collection('allowed_models');
  let created = 0;
  let skipped = 0;
  for (const model of ALLOWED_MODELS) {
    const ref = col.doc(model.id);
    const snap = await ref.get();
    if (snap.exists) {
      skipped += 1;
      continue;
    }
    await ref.set(model);
    created += 1;
  }
  return { created, skipped, total: ALLOWED_MODELS.length };
}

module.exports = { ALLOWED_MODELS, computeImageCountConstraint, seedAllowedModels };
