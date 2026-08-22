import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../lib/apiClient.js';
import { getJobRefetchInterval } from '../lib/pollingIntervals.js';

export function useJob(jobId) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: () => apiGet(`/api/jobs/${jobId}`),
    enabled: Boolean(jobId),
    refetchInterval: (query) => getJobRefetchInterval(query.state.data?.job, Date.now()),
  });
}

export function usePublishJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, shopifyProductId, approvedVariationIndices }) =>
      apiPost('/api/publish', { jobId, shopifyProductId, approvedVariationIndices }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['job', variables.jobId] });
    },
  });
}
