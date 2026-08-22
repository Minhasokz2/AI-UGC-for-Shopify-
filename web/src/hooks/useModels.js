import { useQuery } from '@tanstack/react-query';
import { apiGet, toQueryString } from '../lib/apiClient.js';

export function useModels(filters = {}) {
  return useQuery({
    queryKey: ['models', filters],
    queryFn: () => apiGet(`/api/models${toQueryString(filters)}`),
  });
}
