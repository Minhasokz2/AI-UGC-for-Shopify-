import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPut } from '../lib/apiClient.js';

export function useBrandSettings() {
  return useQuery({
    queryKey: ['brandSettings'],
    queryFn: () => apiGet('/api/brand-settings'),
  });
}

export function useSaveBrandSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (brandStyleProfile) => apiPut('/api/brand-settings', { brandStyleProfile }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brandSettings'] });
    },
  });
}

/**
 * An LLM analyzes the given images and returns a color palette + tone
 * descriptor. This can take several seconds — callers should show a
 * loading state while `isPending` is true.
 */
export function useExtractBrandSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (imageUrls) => apiPost('/api/brand-settings/extract', { imageUrls }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brandSettings'] });
    },
  });
}
