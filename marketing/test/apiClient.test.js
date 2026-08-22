import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPricing, fetchPricingPreview } from '../src/lib/apiClient.js';

describe('apiClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetchPricing calls the public pricing endpoint and returns parsed JSON', async () => {
    const payload = {
      packs: [{ id: 'starter', label: 'Starter', monthlyPriceCents: 1900, monthlyCredits: 50, annualPriceCents: 19000, annualCredits: 600 }],
      unlimitedPlan: { id: 'unlimited', label: 'Unlimited', monthlyPriceCents: 9900 },
    };
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => payload,
    });

    const result = await fetchPricing();

    expect(fetch).toHaveBeenCalledWith('/api/public/pricing');
    expect(result).toEqual(payload);
  });

  it('fetchPricing throws when the response is not ok', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });

    await expect(fetchPricing()).rejects.toThrow();
  });

  it('fetchPricingPreview calls the preview endpoint with the amount', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ credits: 42 }) });

    const result = await fetchPricingPreview(500);

    expect(fetch).toHaveBeenCalledWith('/api/public/pricing/preview?amountCents=500');
    expect(result).toEqual({ credits: 42 });
  });
});
