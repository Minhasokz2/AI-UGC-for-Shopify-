/**
 * Thin fetch wrapper for the MotionArt backend's /admin/api/* surface.
 *
 * Auth: there is no session/cookie auth here (this SPA is not
 * Shopify-embedded and has no merchant identity) — every request carries a
 * static shared-secret header, `X-Admin-Api-Key`, read fresh from
 * sessionStorage on every call so a key entered on /login takes effect
 * immediately with no reload.
 *
 * Error contract: every error response is `{ error: { code, message } }`
 * (server/src/middleware/adminAuth.js + the admin route error handlers). On
 * any non-2xx response we throw an ApiError carrying the parsed body.
 *
 * 401/403: the key is missing, wrong, or was revoked — clear it and send the
 * operator back to /login. A full navigation (rather than a router push) is
 * deliberate and mirrors web/'s apiClient 401 handling: it guarantees a
 * clean remount with no stale in-memory state, and this module has no
 * dependency on being called from inside a React/router context.
 */

import { ADMIN_API_KEY_STORAGE_KEY } from './constants';

export class ApiError extends Error {
  constructor({ status, code, message }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const GENERIC_SERVER_ERROR_MESSAGE = 'Something went wrong. Please try again.';

export function getAdminApiKey() {
  try {
    return sessionStorage.getItem(ADMIN_API_KEY_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setAdminApiKey(key) {
  try {
    sessionStorage.setItem(ADMIN_API_KEY_STORAGE_KEY, key);
  } catch {
    // sessionStorage unavailable (e.g. locked-down browser settings) — the
    // key just won't survive a reload; nothing else we can do here.
  }
}

export function clearAdminApiKey() {
  try {
    sessionStorage.removeItem(ADMIN_API_KEY_STORAGE_KEY);
  } catch {
    // no-op
  }
}

/** Overridable so tests can observe/replace the redirect without triggering jsdom navigation. */
export let redirectToLogin = () => {
  if (typeof window !== 'undefined' && window.location) {
    window.location.href = '/login';
  }
};

/** Test-only seam: swap the redirect behavior, returning a restore function. */
export function __setRedirectToLogin(fn) {
  const previous = redirectToLogin;
  redirectToLogin = fn;
  return () => {
    redirectToLogin = previous;
  };
}

async function parseJsonSafely(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * @param {string} path - e.g. '/admin/api/templates'
 * @param {RequestInit} [options]
 */
export async function apiFetch(path, options = {}) {
  const { headers, ...rest } = options;

  const finalHeaders = {
    'Content-Type': 'application/json',
    'X-Admin-Api-Key': getAdminApiKey(),
    ...headers,
  };

  const response = await fetch(path, {
    ...rest,
    headers: finalHeaders,
  });

  if (response.status === 401 || response.status === 403) {
    clearAdminApiKey();
    redirectToLogin();
    throw new ApiError({
      status: response.status,
      code: 'UNAUTHORIZED',
      message: 'Admin API key is invalid or missing. Please sign in again.',
    });
  }

  if (!response.ok) {
    const body = await parseJsonSafely(response);
    const errorBody = body?.error ?? {};
    throw new ApiError({
      status: response.status,
      code: errorBody.code,
      message: errorBody.message ?? GENERIC_SERVER_ERROR_MESSAGE,
    });
  }

  if (response.status === 204) return null;
  return parseJsonSafely(response);
}

export function apiGet(path) {
  return apiFetch(path, { method: 'GET' });
}

export function apiPost(path, body) {
  return apiFetch(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
}

export function apiPut(path, body) {
  return apiFetch(path, { method: 'PUT', body: JSON.stringify(body ?? {}) });
}

export function apiDelete(path) {
  return apiFetch(path, { method: 'DELETE' });
}

/**
 * Verify a candidate API key actually works, for the /login page: make one
 * real request and report whether it was rejected. Does NOT redirect on
 * failure (login is exactly the page a 401 should not bounce away from) —
 * it inspects the raw response instead of going through apiFetch.
 */
export async function verifyAdminApiKey(key) {
  const response = await fetch('/admin/api/templates', {
    headers: { 'X-Admin-Api-Key': key },
  });
  return response.status !== 401 && response.status !== 403;
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
