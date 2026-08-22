import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, toQueryString } from '../lib/apiClient.js';
import { getJobListRefetchInterval } from '../lib/pollingIntervals.js';

export function useOptimizerJobs(filters = {}) {
  return useQuery({
    queryKey: ['optimizerJobs', filters],
    queryFn: () => apiGet(`/api/image-optimizer${toQueryString(filters)}`),
    refetchInterval: (query) => getJobListRefetchInterval(query.state.data?.jobs),
  });
}

export function useOptimizerJob(jobId) {
  return useQuery({
    queryKey: ['optimizerJob', jobId],
    queryFn: () => apiGet(`/api/image-optimizer/${jobId}`),
    enabled: Boolean(jobId),
  });
}

export function useCreateOptimizerJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) => apiPost('/api/image-optimizer', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['optimizerJobs'] });
    },
  });
}
