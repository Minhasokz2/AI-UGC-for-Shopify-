const { parseEnv } = require('../../../src/config/env');

function baseEnv(overrides = {}) {
  return {
    SHOPIFY_API_KEY: 'k',
    SHOPIFY_API_SECRET: 's',
    SHOPIFY_APP_URL: 'https://example.com',
    FIREBASE_PROJECT_ID: 'p',
    FIREBASE_CLIENT_EMAIL: 'a@b.com',
    FIREBASE_PRIVATE_KEY: 'line1\\nline2',
    FAL_API_KEY: 'fal',
    ANTHROPIC_API_KEY: 'anthropic',
    WAVESPEED_API_KEY: 'wave',
    CLOUDINARY_CLOUD_NAME: 'cloud',
    CLOUDINARY_API_KEY: 'ck',
    CLOUDINARY_API_SECRET: 'cs',
    RESEND_API_KEY: 'r',
    RESEND_FROM_EMAIL: 'from@example.com',
    ADMIN_API_KEY: 'a-very-long-admin-key',
    GOOGLE_OAUTH_CLIENT_ID: 'g',
    GOOGLE_OAUTH_CLIENT_SECRET: 'gs',
    GOOGLE_OAUTH_REDIRECT_URI: 'https://example.com/cb',
    ...overrides,
  };
}

describe('config/env', () => {
  it('parses a fully-populated valid env', () => {
    const env = parseEnv(baseEnv());
    expect(env.SHOPIFY_API_KEY).toBe('k');
    expect(env.NODE_ENV).toBe('development');
  });

  it('unescapes literal \\n sequences in FIREBASE_PRIVATE_KEY', () => {
    const env = parseEnv(baseEnv());
    expect(env.FIREBASE_PRIVATE_KEY).toBe('line1\nline2');
  });

  it('throws when a required var is missing', () => {
    const { SHOPIFY_API_KEY, ...rest } = baseEnv();
    expect(() => parseEnv(rest)).toThrow();
  });

  it('throws when the brand-style provider key is missing for the selected provider', () => {
    const { ANTHROPIC_API_KEY, ...rest } = baseEnv();
    expect(() => parseEnv({ ...rest, BRAND_STYLE_LLM_PROVIDER: 'anthropic' })).toThrow();
  });

  it('accepts openai as the brand-style provider when OPENAI_API_KEY is set', () => {
    const env = parseEnv(baseEnv({ BRAND_STYLE_LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'oai', ANTHROPIC_API_KEY: undefined }));
    expect(env.BRAND_STYLE_LLM_PROVIDER).toBe('openai');
  });

  it('requires SENTRY_DSN in production', () => {
    expect(() => parseEnv(baseEnv({ NODE_ENV: 'production' }))).toThrow();
    expect(() => parseEnv(baseEnv({ NODE_ENV: 'production', SENTRY_DSN: 'https://sentry.example.com/1' }))).not.toThrow();
  });

  it('applies defaults for worker/runtime tuning vars', () => {
    const env = parseEnv(baseEnv());
    expect(env.JOB_WORKER_PER_SHOP_CONCURRENCY).toBe(20);
    expect(env.JOB_WORKER_GLOBAL_CONCURRENCY).toBe(40);
    expect(env.JOB_LEASE_TIMEOUT_MS).toBe(600_000);
    expect(env.RATE_LIMIT_PER_SHOP_PER_MIN).toBe(100);
    expect(env.IMAGE_OPTIMIZER_FREE_DAILY_QUOTA).toBe(10);
    expect(env.SHOPIFY_WEBHOOK_PATH).toBe('/api/webhooks');
  });

  it('rejects a malformed URL field', () => {
    expect(() => parseEnv(baseEnv({ SHOPIFY_APP_URL: 'not-a-url' }))).toThrow();
  });
});
