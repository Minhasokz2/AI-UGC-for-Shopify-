import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, toQueryString } from '../lib/apiClient.js';

export function useProducts(filters = {}) {
  return useQuery({
    queryKey: ['products', filters],
    queryFn: () => apiGet(`/api/products${toQueryString(filters)}`),
  });
}

export function useSyncProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost('/api/products/sync'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
