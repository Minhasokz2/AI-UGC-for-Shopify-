const { z } = require('zod');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(3000),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

    // Shopify — this app uses Shopify-managed installation, so scopes are declared
    // in shopify.app.toml / the Partner Dashboard, never passed into shopifyApp()'s
    // config. SHOPIFY_SCOPES is deliberately absent from this schema.
    SHOPIFY_API_KEY: z.string().min(1),
    SHOPIFY_API_SECRET: z.string().min(1),
    SHOPIFY_APP_URL: z.string().url(),
    SHOPIFY_WEBHOOK_PATH: z.string().default('/api/webhooks'),

    // Firebase
    FIREBASE_PROJECT_ID: z.string().min(1),
    FIREBASE_CLIENT_EMAIL: z.string().email(),
    FIREBASE_PRIVATE_KEY: z.string().min(1),

    // fal.ai
    FAL_API_KEY: z.string().min(1),

    // Brand-style LLM (OpenAI or Anthropic) — cross-checked below
    BRAND_STYLE_LLM_PROVIDER: z.enum(['openai', 'anthropic']).default('anthropic'),
    OPENAI_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),

    // WaveSpeed (video)
    WAVESPEED_API_KEY: z.string().min(1),
    WAVESPEED_BASE_URL: z.string().url().optional().or(z.literal('')),

    // Cloudinary
    CLOUDINARY_CLOUD_NAME: z.string().min(1),
    CLOUDINARY_API_KEY: z.string().min(1),
    CLOUDINARY_API_SECRET: z.string().min(1),

    // Resend
    RESEND_API_KEY: z.string().min(1),
    RESEND_FROM_EMAIL: z.string().email(),

    // Sentry
    SENTRY_DSN: z.string().url().optional().or(z.literal('')),
    SENTRY_ENVIRONMENT: z.string().optional(),

    // Admin panel — shared-secret header, not a Shopify session
    ADMIN_API_KEY: z.string().min(16),

    // Google OAuth (popup flow, iframe-safe)
    GOOGLE_OAUTH_CLIENT_ID: z.string().min(1),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),
    GOOGLE_OAUTH_REDIRECT_URI: z.string().url(),

    // Worker / runtime tuning
    JOB_WORKER_PER_SHOP_CONCURRENCY: z.coerce.number().default(20),
    JOB_WORKER_GLOBAL_CONCURRENCY: z.coerce.number().default(40),
    JOB_LEASE_TIMEOUT_MS: z.coerce.number().default(600_000),
    RATE_LIMIT_PER_SHOP_PER_MIN: z.coerce.number().default(100),
    IMAGE_OPTIMIZER_FREE_DAILY_QUOTA: z.coerce.number().default(10),
  })
  .superRefine((val, ctx) => {
    const providerKey = val.BRAND_STYLE_LLM_PROVIDER === 'openai' ? val.OPENAI_API_KEY : val.ANTHROPIC_API_KEY;
    if (!providerKey) {
      ctx.addIssue({
        code: 'custom',
        path: [val.BRAND_STYLE_LLM_PROVIDER === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'],
        message: `Missing API key for BRAND_STYLE_LLM_PROVIDER=${val.BRAND_STYLE_LLM_PROVIDER}`,
      });
    }
    if (val.NODE_ENV === 'production' && !val.SENTRY_DSN) {
      ctx.addIssue({ code: 'custom', path: ['SENTRY_DSN'], message: 'SENTRY_DSN is required in production' });
    }
  });

/**
 * Parses and validates process.env, unescaping the Firebase private key's literal
 * \n sequences into real newlines. Throws (and should crash the boot process) on
 * any missing/malformed value rather than failing later at first use.
 * @param {NodeJS.ProcessEnv} rawEnv
 * @returns {z.infer<typeof schema>}
 */
function parseEnv(rawEnv) {
  const parsed = schema.parse(rawEnv);
  return {
    ...parsed,
    FIREBASE_PRIVATE_KEY: parsed.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  };
}

const env = parseEnv(process.env);

module.exports = { env, parseEnv, envSchema: schema };
