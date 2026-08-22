import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, generateIdempotencyKey, toQueryString } from '../lib/apiClient.js';
import { getJobListRefetchInterval } from '../lib/pollingIntervals.js';

export function useJobs(filters = {}) {
  return useQuery({
    queryKey: ['jobs', filters],
    queryFn: () => apiGet(`/api/jobs${toQueryString(filters)}`),
    refetchInterval: (query) => getJobListRefetchInterval(query.state.data?.jobs),
  });
}

/**
 * Creates a generation job. Generates a fresh Idempotency-Key per call by
 * default (one per logical submit / mutate() invocation) — pass
 * idempotencyKey explicitly if you need to reuse one across a manual retry
 * of the exact same logical submit.
 */
export function useCreateJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ idempotencyKey, ...body }) =>
      apiPost('/api/jobs', body, { idempotencyKey: idempotencyKey ?? generateIdempotencyKey() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}
