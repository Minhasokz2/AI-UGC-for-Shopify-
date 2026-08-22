import { useAppBridge } from '@shopify/app-bridge-react';
import { getToastMessageForError } from '../lib/apiClient.js';

/**
 * Thin wrapper around the App Bridge v4 `shopify.toast` API.
 * There is no <Toast> component in v4 — toasts are imperative calls.
 */
export function useAppBridgeToast() {
  const shopify = useAppBridge();

  function showSuccess(message, options = {}) {
    shopify.toast.show(message, { ...options, isError: false });
  }

  function showError(message, options = {}) {
    shopify.toast.show(message, { ...options, isError: true });
  }

  function showApiError(error, options = {}) {
    showError(getToastMessageForError(error), options);
  }

  return { shopify, showSuccess, showError, showApiError };
}
