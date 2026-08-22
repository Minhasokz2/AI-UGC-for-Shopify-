/**
 * Pure gate used to enable/disable the Generate button against a model's
 * image-count constraint.
 *
 * @param {number} count
 * @param {{ min: number, max: number }} constraint
 * @returns {boolean}
 */
export function isSelectionValid(count, constraint) {
  return count >= constraint.min && count <= constraint.max;
}
