import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/apiClient.js';

/**
 * Holds the shop's credit balance / verification status. This is the query
 * keyed ['shopStatus'] that the Google Sign-In popup flow invalidates on a
 * successful sign-in postMessage.
 */
export function useShopStatus() {
  return useQuery({
    queryKey: ['shopStatus'],
    queryFn: () => apiGet('/api/billing/status'),
  });
}
