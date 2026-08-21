const { PersonaGuardError } = require('../errors/AppError');

/**
 * Hard trust-and-safety allowlist for UGC/on-model generation — EXACTLY
 * `ageRange === "adult"` passes; undefined, missing, wrong-case, or any other
 * value is rejected. This is not a configurable setting.
 * @param {{ ageRange?: string } | null | undefined} persona
 * @returns {boolean}
 */
function isAdultPersona(persona) {
  return !!persona && persona.ageRange === 'adult';
}

/**
 * Throws PersonaGuardError (422) unless `isAdultPersona` passes. Called inline in
 * the job-creation route (so a bad request never reaches `pending` status) AND
 * again in generationPipeline.js immediately before any UGC/on-model model call
 * (covers retry/re-run paths that don't go through the creation route). The
 * client-side age-confirmation UI is defense-in-depth only — this is the real gate.
 * @param {{ ageRange?: string } | null | undefined} persona
 */
function assertAdultPersona(persona) {
  if (!isAdultPersona(persona)) {
    throw new PersonaGuardError();
  }
}

module.exports = { isAdultPersona, assertAdultPersona };
