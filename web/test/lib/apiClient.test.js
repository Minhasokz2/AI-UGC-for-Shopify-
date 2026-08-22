import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  apiFetch,
  apiGet,
  apiPost,
  ApiError,
  getToastMessageForError,
  toQueryString,
  generateIdempotencyKey,
  __setReloadPage,
} from '../../src/lib/apiClient.js';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe('apiClient', () => {
  const originalFetch = global.fetch;
  let reloadMock;
  let restoreReloadPage;

  beforeEach(() => {
    global.fetch = vi.fn();
    // jsdom's window.location.reload is non-configurable and can't be
    // redefined/spied on directly — apiClient.js exposes an overridable
    // seam (reloadPage/__setReloadPage) for exactly this reason.
    reloadMock = vi.fn();
    restoreReloadPage = __setReloadPage(reloadMock);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    restoreReloadPage();
    vi.restoreAllMocks();
  });

  it('returns parsed JSON on a 2xx response', async () => {
    global.fetch.mockResolvedValue(jsonResponse(200, { job: { id: '1' } }));
    const result = await apiGet('/api/jobs/1');
    expect(result).toEqual({ job: { id: '1' } });
  });

  it('attaches the Idempotency-Key header when provided', async () => {
    global.fetch.mockResolvedValue(jsonResponse(201, { job: { id: '1' } }));
    await apiPost('/api/jobs', { contentType: 'scene' }, { idempotencyKey: 'abc-123' });
    const [, init] = global.fetch.mock.calls[0];
    expect(init.headers['Idempotency-Key']).toBe('abc-123');
  });

  it('throws an ApiError with the parsed error body on a 4xx response', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse(422, { error: { code: 'PERSONA_NOT_ADULT', message: 'Persona must be an adult.' } }),
    );
    await expect(apiGet('/api/jobs')).rejects.toMatchObject({
      status: 422,
      code: 'PERSONA_NOT_ADULT',
      message: 'Persona must be an adult.',
    });
  });

  it('reloads the page and throws on a 401', async () => {
    global.fetch.mockResolvedValue(jsonResponse(401, {}));
    await expect(apiFetch('/api/jobs')).rejects.toBeInstanceOf(ApiError);
    expect(reloadMock).toHaveBeenCalled();
  });

  it('propagates shopifyErrors from a 502 publish failure', async () => {
    global.fetch.mockResolvedValue(
      jsonResponse(502, {
        error: {
          code: 'SHOPIFY_PUBLISH_FAILED',
          message: 'Something went wrong.',
          shopifyErrors: [{ field: 'media', message: 'Unsupported media type' }],
        },
      }),
    );
    await expect(apiPost('/api/publish', {})).rejects.toMatchObject({
      status: 502,
      shopifyErrors: [{ field: 'media', message: 'Unsupported media type' }],
    });
  });
});

describe('getToastMessageForError', () => {
  it('trusts error.message for a non-5xx ApiError', () => {
    const error = new ApiError({ status: 402, code: 'INSUFFICIENT_CREDITS', message: 'Not enough credits.' });
    expect(getToastMessageForError(error)).toBe('Not enough credits.');
  });

  it('masks a 5xx ApiError with a generic message', () => {
    const error = new ApiError({ status: 500, code: 'INTERNAL', message: 'some internal detail leaked' });
    expect(getToastMessageForError(error)).toBe('Something went wrong. Please try again.');
  });

  it('masks a non-ApiError (e.g. a network failure) with a generic message', () => {
    expect(getToastMessageForError(new Error('Failed to fetch'))).toBe(
      'Something went wrong. Please try again.',
    );
  });
});

describe('toQueryString', () => {
  it('skips undefined, null, and empty-string values', () => {
    expect(toQueryString({ status: undefined, batchId: null, contentType: '' })).toBe('');
  });

  it('builds a query string from present values', () => {
    expect(toQueryString({ status: 'succeeded', limit: 10 })).toBe('?status=succeeded&limit=10');
  });
});

describe('generateIdempotencyKey', () => {
  it('returns a non-empty string', () => {
    const key = generateIdempotencyKey();
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });

  it('returns a fresh value on each call', () => {
    // With the crypto.randomUUID polyfill stubbed to a constant in
    // test/setup.js this would collide; verify the function at least
    // calls through when a real randomUUID is available.
    const realUUID = () => `${Math.random()}`;
    const original = globalThis.crypto.randomUUID;
    globalThis.crypto.randomUUID = realUUID;
    const a = generateIdempotencyKey();
    const b = generateIdempotencyKey();
    expect(a).not.toBe(b);
    globalThis.crypto.randomUUID = original;
  });
});
