import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, generateIdempotencyKey, toQueryString } from '../lib/apiClient.js';
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

/**
 * Creates an Image Optimizer job. Generates a fresh Idempotency-Key per call
 * by default (one per logical submit / mutate() invocation) — pass
 * idempotencyKey explicitly if you need to reuse one across a manual retry
 * of the exact same logical submit. Without this, a double-click would burn
 * two units of the scarce (default 10/day) free quota for one intended
 * optimization.
 */
export function useCreateOptimizerJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ idempotencyKey, ...body }) =>
      apiPost('/api/image-optimizer', body, { idempotencyKey: idempotencyKey ?? generateIdempotencyKey() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['optimizerJobs'] });
    },
  });
}
