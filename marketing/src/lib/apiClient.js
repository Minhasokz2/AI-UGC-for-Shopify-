/**
 * Thin fetch wrapper for the public, unauthenticated pricing endpoints.
 * These live on server/'s Express app, NOT on this site's own host — this
 * workspace is deliberately deployed to its own separate static host (see
 * the root README's "Monorepo layout" section), on the public root domain,
 * while the API server lives on the embedded app's domain (typically a
 * subdomain, from SHOPIFY_APP_URL). A same-origin relative fetch would hit
 * this site's own static host instead, which has no `/api/*` routes.
 *
 * `VITE_API_BASE_URL` (set at build time, e.g. `https://app.motionart.com`)
 * points at the real API server. It defaults to an empty string — a
 * relative fetch — only for the case where an operator deliberately serves
 * this site from behind the same reverse proxy/domain as the API; that is
 * NOT this project's default deployment shape, so the env var should
 * normally be set. No headers or credentials are needed either way — this
 * API is intentionally public.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function getJson(path) {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`Request to ${path} failed with status ${response.status}`);
  }
  return response.json();
}

/**
 * @returns {Promise<{
 *   packs: Array<{ id: string, label: string, monthlyPriceCents: number, monthlyCredits: number, annualPriceCents: number, annualCredits: number }>,
 *   unlimitedPlan: { id: string, label: string, monthlyPriceCents: number },
 * }>}
 */
export function fetchPricing() {
  return getJson('/api/public/pricing');
}

/**
 * Optional "how many credits would $X get me" calculator support.
 * @param {number} amountCents
 * @returns {Promise<{ credits: number }>}
 */
export function fetchPricingPreview(amountCents) {
  const amount = Math.round(Number(amountCents) || 0);
  return getJson(`/api/public/pricing/preview?amountCents=${amount}`);
}
