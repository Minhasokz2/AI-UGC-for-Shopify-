import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ToastContext = createContext(null);

/**
 * App-shell-scoped toast state. Polaris's own <Toast> renders wherever it's
 * mounted inside a <Frame> (it registers/unregisters itself with Frame's
 * internal context), so this provider just tracks "what message is
 * currently showing" and hands pages a `showToast` callback — the actual
 * <Toast> element is rendered once, by the shell, near the <Frame>.
 */
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null); // { content, error } | null

  const showToast = useCallback((content, options = {}) => {
    setToast({ content, error: Boolean(options.error) });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  const value = useMemo(() => ({ toast, showToast, dismissToast }), [toast, showToast, dismissToast]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
