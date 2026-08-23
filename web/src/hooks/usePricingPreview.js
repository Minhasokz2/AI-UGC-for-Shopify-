import { useQuery, useMutation } from '@tanstack/react-query';
import { apiGet, apiPost } from '../lib/apiClient.js';

export function useBillingStatus() {
  return useQuery({
    queryKey: ['shopStatus'],
    queryFn: () => apiGet('/api/billing/status'),
  });
}

export function useBillingPacks() {
  return useQuery({
    queryKey: ['billingPacks'],
    queryFn: () => apiGet('/api/billing/packs'),
  });
}

/**
 * Called once the merchant returns from Shopify's hosted pricing page with a
 * `plan_handle` query param — see pages/Billing.jsx. Never trusts that param
 * client-side; this just relays it so the server can verify it against the
 * Partner API before granting anything.
 */
export function useConfirmAppPricingPlan() {
  return useMutation({
    mutationFn: ({ planHandle }) => apiPost('/api/billing/confirm-app-pricing-plan', { planHandle }),
  });
}

/**
 * Redirects the top-level browsing context to a Shopify-hosted page (the
 * App Pricing plan picker). These pages must NOT load inside the embedded
 * iframe.
 *
 * Verified against the installed @shopify/app-bridge-types@0.7.2 d.ts:
 * the v4 `ShopifyGlobal` returned by useAppBridge() has no `redirect`
 * property (that was a v1/v2-era `Redirect.dispatch` API bridge object
 * that no longer exists). window.top.location.href is the documented,
 * simplest way to break out of the iframe at the top level for this
 * version, so that's what we use here.
 */
export function redirectTopLevel(url) {
  window.top.location.href = url;
}
