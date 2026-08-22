/**
 * The backend is the single source of truth for how many images a given
 * model accepts as input. This helper is a deliberate, trivial passthrough —
 * it must NEVER independently re-derive the min/max from model category,
 * role, or any other heuristic. See the pinned frontend correctness
 * contracts: this is called out as the most important one to get right.
 *
 * @param {{ imageCountConstraint?: { min: number, max: number } } | null | undefined} model
 * @returns {{ min: number, max: number }}
 */
export function getImageCountConstraint(model) {
  return model?.imageCountConstraint ?? { min: 0, max: 0 };
}
