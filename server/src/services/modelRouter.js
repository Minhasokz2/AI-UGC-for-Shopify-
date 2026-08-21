// Pure, zero-I/O routing decisions for the auto-routed TEMPLATE flow (scene +
// video). The Custom Prompt Studio bypasses this entirely — the merchant picks an
// `allowedModelId` directly. This module returns ROLE KEYS, not model objects, so
// it has no dependency on the actual catalog (services/fal.js /
// services/extendedModels.js) — the caller (services/generationPipeline.js) looks
// up the real model descriptor for the returned key from whichever catalog it has
// loaded. That keeps this file trivially unit-testable with plain object fixtures.

const COLOR_CRITICAL_CATEGORIES = new Set(['skincare', 'cosmetics', 'makeup', 'beauty']);

const VIDEO_TIER_ROLE_KEYS = Object.freeze({
  fast: 'video_fast',
  standard: 'video_standard',
  premium: 'video_premium',
});
const DEFAULT_VIDEO_TIER = 'standard';

/** @param {string | undefined | null} productCategory */
function isColorCritical(productCategory) {
  return COLOR_CRITICAL_CATEGORIES.has(String(productCategory ?? '').toLowerCase());
}

/**
 * @param {{ productCategory?: string, contentType: 'scene'|'ugc'|string }} params
 * @returns {'image_editing_ugc'|'photorealistic_color_safe'|'default_scene'} role key
 */
function selectSceneModelRoleKey({ productCategory, contentType }) {
  if (contentType === 'ugc') return 'image_editing_ugc';
  return isColorCritical(productCategory) ? 'photorealistic_color_safe' : 'default_scene';
}

/**
 * @param {{ tier?: 'fast'|'standard'|'premium' }} [params]
 * @returns {'video_fast'|'video_standard'|'video_premium'} role key
 */
function selectVideoModelRoleKey({ tier } = {}) {
  return VIDEO_TIER_ROLE_KEYS[tier] || VIDEO_TIER_ROLE_KEYS[DEFAULT_VIDEO_TIER];
}

module.exports = {
  COLOR_CRITICAL_CATEGORIES,
  VIDEO_TIER_ROLE_KEYS,
  isColorCritical,
  selectSceneModelRoleKey,
  selectVideoModelRoleKey,
};
