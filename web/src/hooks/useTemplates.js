import { useQuery } from '@tanstack/react-query';
import { apiGet, toQueryString } from '../lib/apiClient.js';

export function useTemplates(filters = {}) {
  return useQuery({
    queryKey: ['templates', filters],
    queryFn: () => apiGet(`/api/templates${toQueryString(filters)}`),
  });
}
