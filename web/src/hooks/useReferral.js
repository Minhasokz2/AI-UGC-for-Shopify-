import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/apiClient.js';

export function useReferral() {
  return useQuery({
    queryKey: ['referrals'],
    queryFn: () => apiGet('/api/referrals'),
  });
}
