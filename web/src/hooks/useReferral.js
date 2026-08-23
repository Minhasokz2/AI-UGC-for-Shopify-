import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../lib/apiClient.js';

export function useReferral() {
  return useQuery({
    queryKey: ['referrals'],
    queryFn: () => apiGet('/api/referrals'),
  });
}

export function useApplyReferralCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code) => apiPost('/api/referrals/apply', { code }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['referrals'] }),
  });
}
