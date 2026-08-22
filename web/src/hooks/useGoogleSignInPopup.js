import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiPost } from '../lib/apiClient.js';
import { useAppBridgeToast } from './useAppBridgeToast.js';
import { GOOGLE_AUTH_MESSAGE_SOURCE } from '../lib/constants.js';

/**
 * Google Sign-In cannot render inside Shopify's cross-origin embed iframe
 * (accounts.google.com sends X-Frame-Options that blocks the button, One
 * Tap, and ux_mode:'redirect' alike). This hook drives a genuine
 * top-level window.open() popup + postMessage handshake instead:
 *
 *   1. POST /api/auth/google-prepare (authenticated) FIRST -> { popupUrl }.
 *   2. THEN window.open(popupUrl) — never open the popup before step 1
 *      resolves (popup blockers aside, the URL doesn't exist yet).
 *   3. Listen for a 'message' event carrying
 *      { source: 'motionart-google-auth', type: 'success' | 'error' },
 *      filtered by event.origin === window.location.origin AND the source
 *      tag, before acting on it.
 *   4. On 'success', invalidate ['shopStatus'] and let the popup close
 *      itself.
 */
export function useGoogleSignInPopup() {
  const [isPending, setIsPending] = useState(false);
  const queryClient = useQueryClient();
  const { showApiError, showError } = useAppBridgeToast();
  const popupRef = useRef(null);

  useEffect(() => {
    function handleMessage(event) {
      if (event.origin !== window.location.origin) return;
      if (!event.data || event.data.source !== GOOGLE_AUTH_MESSAGE_SOURCE) return;

      setIsPending(false);

      if (event.data.type === 'success') {
        queryClient.invalidateQueries({ queryKey: ['shopStatus'] });
      } else if (event.data.type === 'error') {
        showError('Google sign-in failed. Please try again.');
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [queryClient, showError]);

  const startSignIn = useCallback(async () => {
    setIsPending(true);
    try {
      const { popupUrl } = await apiPost('/api/auth/google-prepare');
      popupRef.current = window.open(popupUrl, 'motionart-google-auth', 'width=480,height=640');
      if (!popupRef.current) {
        setIsPending(false);
        showError('Please allow popups for this site to sign in with Google.');
      }
    } catch (error) {
      setIsPending(false);
      showApiError(error);
    }
  }, [showApiError, showError]);

  return { startSignIn, isPending };
}
