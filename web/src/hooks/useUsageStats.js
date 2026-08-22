import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/apiClient.js';

export function useUsageStats() {
  return useQuery({
    queryKey: ['usageStats'],
    queryFn: () => apiGet('/api/usage-stats'),
  });
}
