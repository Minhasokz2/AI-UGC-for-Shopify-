import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../lib/apiClient.js';

/**
 * Resets the Google Sign-In gate so a merchant can verify a different
 * account. Never re-grants the free trial — that's guarded server-side by
 * trialEligibilityLocked, which this never resets.
 */
export function useGoogleSignOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiPost('/api/auth/google-sign-out'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shopStatus'] }),
  });
}
