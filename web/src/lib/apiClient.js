/**
 * Thin fetch wrapper for the AI UGC Generator backend.
 *
 * Auth: App Bridge's own `fetch` interceptor auto-attaches the session
 * token to same-origin requests once the App Bridge script tag has
 * initialized (see index.html) — we deliberately do NOT hand-roll a
 * token-fetch-and-attach wrapper here.
 *
 * Error contract: every error response is
 *   { error: { code, message, details?, shopifyErrors? } }
 * with the HTTP status carrying the semantic. On any non-2xx response we
 * throw an ApiError carrying the parsed body so callers/toasts can inspect
 * `.status`, `.code`, `.message`, `.shopifyErrors`.
 *
 * 401: the simplest safe fallback is a full page reload so App Bridge can
 * re-establish a session token from scratch — no retry-header-sniffing.
 */

/**
 * Overridable seam for the 401 fallback (jsdom's window.location.reload is
 * non-configurable, so tests can't spy on it directly — this mirrors
 * admin/'s apiClient.js redirect seam for the same reason).
 */
export let reloadPage = () => {
  if (typeof window !== 'undefined' && window.location) {
    window.location.reload();
  }
};

/** Test-only seam: swap the reload behavior, returning a restore function. */
export function __setReloadPage(fn) {
  const previous = reloadPage;
  reloadPage = fn;
  return () => {
    reloadPage = previous;
  };
}

export class ApiError extends Error {
  constructor({ status, code, message, details, shopifyErrors }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.shopifyErrors = shopifyErrors;
  }
}

const GENERIC_SERVER_ERROR_MESSAGE = 'Something went wrong. Please try again.';

/**
 * Message to surface in a toast for a given ApiError, per contract #10:
 * trust error.message on any non-5xx response; mask 5xx with a generic
 * string (the server already only sends safe messages for 4xx and a fixed
 * generic string for 5xx, so this is a defense-in-depth mirror of that
 * rule on the client).
 */
export function getToastMessageForError(error) {
  if (error instanceof ApiError && error.status >= 500) {
    return GENERIC_SERVER_ERROR_MESSAGE;
  }
  if (error instanceof ApiError) {
    return error.message || GENERIC_SERVER_ERROR_MESSAGE;
  }
  return GENERIC_SERVER_ERROR_MESSAGE;
}

async function parseJsonSafely(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * @param {string} path - e.g. '/api/jobs'
 * @param {RequestInit & { idempotencyKey?: string }} [options]
 */
export async function apiFetch(path, options = {}) {
  const { idempotencyKey, headers, ...rest } = options;

  const finalHeaders = {
    'Content-Type': 'application/json',
    ...headers,
  };
  if (idempotencyKey) {
    finalHeaders['Idempotency-Key'] = idempotencyKey;
  }

  const response = await fetch(path, {
    ...rest,
    headers: finalHeaders,
  });

  if (response.status === 401) {
    reloadPage();
    // Reload is async; throw so callers' promise chains stop here too.
    throw new ApiError({ status: 401, code: 'UNAUTHORIZED', message: 'Session expired. Reloading…' });
  }

  if (!response.ok) {
    const body = await parseJsonSafely(response);
    const errorBody = body?.error ?? {};
    throw new ApiError({
      status: response.status,
      code: errorBody.code,
      message: errorBody.message ?? GENERIC_SERVER_ERROR_MESSAGE,
      details: errorBody.details,
      shopifyErrors: errorBody.shopifyErrors,
    });
  }

  if (response.status === 204) return null;
  return parseJsonSafely(response);
}

export function apiGet(path) {
  return apiFetch(path, { method: 'GET' });
}

export function apiPost(path, body, options = {}) {
  return apiFetch(path, { ...options, method: 'POST', body: JSON.stringify(body ?? {}) });
}

export function apiPut(path, body, options = {}) {
  return apiFetch(path, { ...options, method: 'PUT', body: JSON.stringify(body ?? {}) });
}

/**
 * Build a query string from a filters object, skipping undefined/null/''.
 */
export function toQueryString(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Generate one fresh Idempotency-Key per logical submit action. Callers
 * must reuse the SAME key across network-level retries of the SAME
 * logical request, and generate a new one per user-initiated click.
 */
export function generateIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID (older test runners).
  return `idem_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
