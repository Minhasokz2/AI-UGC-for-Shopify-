import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
  ApiError,
  getAdminApiKey,
  setAdminApiKey,
  clearAdminApiKey,
  verifyAdminApiKey,
  __setRedirectToLogin,
} from '../../src/lib/apiClient';
import { ADMIN_API_KEY_STORAGE_KEY } from '../../src/lib/constants';

function mockFetchOnce(status, body) {
  return vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  });
}

describe('apiClient — admin key storage', () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it('stores and retrieves the admin API key from sessionStorage', () => {
    expect(getAdminApiKey()).toBe('');
    setAdminApiKey('secret-123');
    expect(getAdminApiKey()).toBe('secret-123');
    expect(sessionStorage.getItem(ADMIN_API_KEY_STORAGE_KEY)).toBe('secret-123');
  });

  it('clears the stored key', () => {
    setAdminApiKey('secret-123');
    clearAdminApiKey();
    expect(getAdminApiKey()).toBe('');
  });
});

describe('apiClient — attaches X-Admin-Api-Key on every request', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    sessionStorage.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    sessionStorage.clear();
  });

  it('sends the stored key as X-Admin-Api-Key on GET', async () => {
    setAdminApiKey('my-key');
    global.fetch = mockFetchOnce(200, { templates: [] });
    await apiGet('/admin/api/templates');
    expect(global.fetch).toHaveBeenCalledWith(
      '/admin/api/templates',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ 'X-Admin-Api-Key': 'my-key' }),
      }),
    );
  });

  it('sends the header on POST/PUT/DELETE too', async () => {
    setAdminApiKey('my-key');
    global.fetch = mockFetchOnce(200, { ok: true });
    await apiPost('/admin/api/seed-models', {});
    expect(global.fetch.mock.calls[0][1].headers['X-Admin-Api-Key']).toBe('my-key');

    global.fetch = mockFetchOnce(200, { template: {} });
    await apiPut('/admin/api/templates/foo', { label: 'Foo' });
    expect(global.fetch.mock.calls[0][1].headers['X-Admin-Api-Key']).toBe('my-key');

    global.fetch = vi.fn().mockResolvedValue({ status: 204, ok: true });
    const result = await apiDelete('/admin/api/templates/foo');
    expect(global.fetch.mock.calls[0][1].headers['X-Admin-Api-Key']).toBe('my-key');
    expect(result).toBeNull();
  });
});

describe('apiClient — 401/403 handling', () => {
  let originalFetch;
  let restoreRedirect;
  let redirectSpy;

  beforeEach(() => {
    originalFetch = global.fetch;
    sessionStorage.clear();
    redirectSpy = vi.fn();
    restoreRedirect = __setRedirectToLogin(redirectSpy);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    restoreRedirect();
    sessionStorage.clear();
  });

  it('on 401: clears the stored key, redirects to login, and throws', async () => {
    setAdminApiKey('bad-key');
    global.fetch = mockFetchOnce(401, { error: { code: 'UNAUTHORIZED', message: 'nope' } });

    await expect(apiGet('/admin/api/templates')).rejects.toThrow(ApiError);
    expect(getAdminApiKey()).toBe('');
    expect(redirectSpy).toHaveBeenCalledTimes(1);
  });

  it('on 403: clears the stored key, redirects to login, and throws', async () => {
    setAdminApiKey('bad-key');
    global.fetch = mockFetchOnce(403, { error: { code: 'FORBIDDEN', message: 'nope' } });

    await expect(apiGet('/admin/api/templates')).rejects.toThrow(ApiError);
    expect(getAdminApiKey()).toBe('');
    expect(redirectSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT redirect on a normal 200 response', async () => {
    setAdminApiKey('good-key');
    global.fetch = mockFetchOnce(200, { templates: [] });
    await apiGet('/admin/api/templates');
    expect(redirectSpy).not.toHaveBeenCalled();
    expect(getAdminApiKey()).toBe('good-key');
  });

  it('surfaces the server error message on a non-401/403 error response (e.g. 404)', async () => {
    global.fetch = mockFetchOnce(404, { error: { code: 'NOT_FOUND', message: 'Template not found' } });
    await expect(apiGet('/admin/api/templates/missing')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Template not found',
    });
    expect(redirectSpy).not.toHaveBeenCalled();
  });
});

describe('verifyAdminApiKey', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns true for a key the backend accepts', async () => {
    global.fetch = mockFetchOnce(200, { templates: [] });
    await expect(verifyAdminApiKey('good-key')).resolves.toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      '/admin/api/templates',
      expect.objectContaining({ headers: { 'X-Admin-Api-Key': 'good-key' } }),
    );
  });

  it('returns false for a 401', async () => {
    global.fetch = mockFetchOnce(401, { error: { code: 'UNAUTHORIZED', message: 'nope' } });
    await expect(verifyAdminApiKey('bad-key')).resolves.toBe(false);
  });

  it('returns false for a 403', async () => {
    global.fetch = mockFetchOnce(403, { error: { code: 'FORBIDDEN', message: 'nope' } });
    await expect(verifyAdminApiKey('bad-key')).resolves.toBe(false);
  });
});
