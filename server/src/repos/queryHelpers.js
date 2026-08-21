/**
 * Firestore only has composite indexes for `shopDomain` combined with ONE of
 * status/batchId/contentType (see scripts/createFirestoreIndexes.md) — sending two
 * of them as simultaneous equality filters would need a 4th, undocumented index.
 * This picks at most one field to push to Firestore (by priority, most-selective
 * first) and reports the rest for in-memory filtering over a wider candidate
 * window. Pure and I/O-free so it's testable without Firestore at all.
 *
 * @param {Record<string, any>} requestedFilters e.g. { status, batchId, contentType }
 * @param {string[]} priorityOrder e.g. ['status', 'batchId', 'contentType']
 * @returns {{ pushedField: string|null, inMemoryFields: string[] }}
 */
function pickPushedFilter(requestedFilters, priorityOrder) {
  const present = (field) => requestedFilters[field] !== undefined && requestedFilters[field] !== null;
  const pushedField = priorityOrder.find(present) ?? null;
  const inMemoryFields = priorityOrder.filter((field) => field !== pushedField && present(field));
  return { pushedField, inMemoryFields };
}

/**
 * @param {number} limit
 * @param {number} candidateWindowMin
 * @param {number} candidateWindowMultiplier
 */
function computeCandidateWindow(limit, candidateWindowMin, candidateWindowMultiplier) {
  return Math.max(limit * candidateWindowMultiplier, candidateWindowMin);
}

module.exports = { pickPushedFilter, computeCandidateWindow };
