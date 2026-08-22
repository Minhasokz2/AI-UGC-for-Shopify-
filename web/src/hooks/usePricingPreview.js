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
 * Live "$X gets you Y credits" preview as the merchant types a custom
 * dollar amount. Call with the current amountCents; disabled until a
 * positive integer amount is present.
 */
export function useCustomPurchasePreview(amountCents) {
  return useQuery({
    queryKey: ['customPurchasePreview', amountCents],
    queryFn: () => apiGet(`/api/billing/custom-purchase/preview?amountCents=${amountCents}`),
    enabled: Number.isInteger(amountCents) && amountCents > 0,
  });
}

export function useSubscribeToPack() {
  return useMutation({
    mutationFn: ({ packId, period }) => apiPost('/api/billing/subscribe', { packId, period }),
  });
}

export function useSubscribeUnlimited() {
  return useMutation({
    mutationFn: () => apiPost('/api/billing/subscribe-unlimited'),
  });
}

export function useCustomPurchase() {
  return useMutation({
    mutationFn: ({ amountCents }) => apiPost('/api/billing/custom-purchase', { amountCents }),
  });
}

export function useConfirmCharge() {
  return useMutation({
    mutationFn: ({ chargeId }) => apiPost('/api/billing/confirm', { chargeId }),
  });
}

/**
 * Redirects the top-level browsing context to a Shopify-hosted billing
 * confirmation URL. Shopify billing confirmation pages must NOT load
 * inside the embedded iframe.
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
