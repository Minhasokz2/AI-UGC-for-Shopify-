// Background removal — always runs first for scene/UGC content, before the
// scene/UGC model itself. Reuses services/fal.js's generateOne so the fal.ai
// `.data` unwrap logic (see fal.js's header comment) lives in exactly one place.

const { ALLOWED_MODELS } = require('./allowedModelsSeedData');
const { generateOne } = require('./fal');

const ROLE_BY_TIER = Object.freeze({
  budget: 'background_removal_budget',
  premium: 'background_removal_premium',
});

/** Background-removal models, keyed by their own `role` field. */
const BACKGROUND_REMOVAL_MODELS = ALLOWED_MODELS.filter((model) => model.category === 'background_removal').reduce(
  (acc, model) => {
    acc[model.role] = model;
    return acc;
  },
  {},
);

/**
 * @param {{ imageUrl: string, tier?: 'budget'|'premium', client?: object }} params
 * @returns {Promise<{ url: string }>}
 */
async function removeBackground({ imageUrl, tier = 'budget', client } = {}) {
  const role = ROLE_BY_TIER[tier];
  if (!role) {
    throw new Error(`backgroundRemoval.js: unknown tier "${tier}" (expected "budget" or "premium")`);
  }
  const model = BACKGROUND_REMOVAL_MODELS[role];
  if (!model) {
    throw new Error(`backgroundRemoval.js: no background-removal model found for role "${role}"`);
  }
  return generateOne({ model, imageUrl, client });
}

module.exports = { removeBackground, BACKGROUND_REMOVAL_MODELS };
