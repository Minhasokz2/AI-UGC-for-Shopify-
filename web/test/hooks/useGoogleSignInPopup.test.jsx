import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGoogleSignInPopup } from '../../src/hooks/useGoogleSignInPopup.js';

const showErrorMock = vi.fn();
const apiPostMock = vi.fn();

vi.mock('@shopify/app-bridge-react', () => ({
  useAppBridge: () => ({ toast: { show: showErrorMock } }),
}));

vi.mock('../../src/lib/apiClient.js', async () => {
  const actual = await vi.importActual('../../src/lib/apiClient.js');
  return { ...actual, apiPost: (...args) => apiPostMock(...args) };
});

function renderWithClient(hook) {
  const queryClient = new QueryClient();
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const result = renderHook(hook, { wrapper });
  return { ...result, invalidateSpy };
}

describe('useGoogleSignInPopup', () => {
  let openSpy;

  beforeEach(() => {
    showErrorMock.mockClear();
    apiPostMock.mockReset();
    openSpy = vi.spyOn(window, 'open').mockReturnValue({});
  });

  afterEach(() => {
    openSpy.mockRestore();
  });

  it('calls google-prepare BEFORE opening the popup, using the returned popupUrl', async () => {
    apiPostMock.mockResolvedValue({ popupUrl: '/api/auth/google/start?state=abc' });
    const { result } = renderWithClient(() => useGoogleSignInPopup());

    await act(async () => {
      await result.current.startSignIn();
    });

    expect(apiPostMock).toHaveBeenCalledWith('/api/auth/google-prepare');
    expect(openSpy).toHaveBeenCalledWith(
      '/api/auth/google/start?state=abc',
      'motionart-google-auth',
      expect.any(String),
    );
    // prepare must have resolved before open was called
    expect(apiPostMock.mock.invocationCallOrder[0]).toBeLessThan(openSpy.mock.invocationCallOrder[0]);
  });

  it('invalidates the shopStatus query on a same-origin success postMessage', async () => {
    apiPostMock.mockResolvedValue({ popupUrl: '/api/auth/google/start?state=abc' });
    const { result, invalidateSpy } = renderWithClient(() => useGoogleSignInPopup());

    await act(async () => {
      await result.current.startSignIn();
    });

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          data: { source: 'motionart-google-auth', type: 'success' },
        }),
      );
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['shopStatus'] });
    });
  });

  it('ignores a message from a different origin', async () => {
    const { result, invalidateSpy } = renderWithClient(() => useGoogleSignInPopup());
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://evil.example.com',
          data: { source: 'motionart-google-auth', type: 'success' },
        }),
      );
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('ignores a same-origin message with an unrelated source tag', async () => {
    const { invalidateSpy } = renderWithClient(() => useGoogleSignInPopup());
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          data: { source: 'some-other-widget', type: 'success' },
        }),
      );
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('shows an error toast on an error postMessage', async () => {
    apiPostMock.mockResolvedValue({ popupUrl: '/api/auth/google/start?state=abc' });
    const { result } = renderWithClient(() => useGoogleSignInPopup());

    await act(async () => {
      await result.current.startSignIn();
    });

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: window.location.origin,
          data: { source: 'motionart-google-auth', type: 'error' },
        }),
      );
    });

    expect(showErrorMock).toHaveBeenCalledWith(
      expect.stringContaining('Google sign-in failed'),
      expect.objectContaining({ isError: true }),
    );
  });
});
