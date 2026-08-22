import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, generateIdempotencyKey } from '../lib/apiClient.js';
import { getBatchRefetchInterval } from '../lib/pollingIntervals.js';

export function useBatch(batchId) {
  return useQuery({
    queryKey: ['batch', batchId],
    queryFn: () => apiGet(`/api/batches/${batchId}`),
    enabled: Boolean(batchId),
    refetchInterval: (query) => getBatchRefetchInterval(query.state.data?.batch),
  });
}

export function useCreateBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ idempotencyKey, ...body }) =>
      apiPost('/api/batches', body, { idempotencyKey: idempotencyKey ?? generateIdempotencyKey() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}
