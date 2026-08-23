import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGoogleSignOut } from '../../src/hooks/useGoogleSignOut.js';

const apiPostMock = vi.fn();

vi.mock('../../src/lib/apiClient.js', async () => {
  const actual = await vi.importActual('../../src/lib/apiClient.js');
  return { ...actual, apiPost: (...args) => apiPostMock(...args) };
});

function renderWithClient(hook) {
  const queryClient = new QueryClient();
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  const result = renderHook(hook, { wrapper });
  return { ...result, invalidateSpy };
}

describe('useGoogleSignOut', () => {
  beforeEach(() => {
    apiPostMock.mockReset();
  });

  it('posts to /api/auth/google-sign-out and invalidates shopStatus on success', async () => {
    apiPostMock.mockResolvedValue(null);
    const { result, invalidateSpy } = renderWithClient(() => useGoogleSignOut());

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(apiPostMock).toHaveBeenCalledWith('/api/auth/google-sign-out');
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['shopStatus'] });
    });
  });
});
