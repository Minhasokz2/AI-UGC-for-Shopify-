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

    // WaveSpeed (video) — optional: if unset, video generation fails per-job with a
    // clear "not configured" error rather than blocking boot (see services/wavespeed.js).
    WAVESPEED_API_KEY: z.string().optional(),
    WAVESPEED_BASE_URL: z.string().url().optional().or(z.literal('')),

    // Cloudinary
    CLOUDINARY_CLOUD_NAME: z.string().min(1),
    CLOUDINARY_API_KEY: z.string().min(1),
    CLOUDINARY_API_SECRET: z.string().min(1),

    // Resend — optional: if unset, sendEmail() fails per-call rather than blocking boot
    // (nurtureEmailService already treats a per-shop email failure as non-fatal).
    RESEND_API_KEY: z.string().optional(),
    RESEND_FROM_EMAIL: z.string().email().optional(),

    // Sentry
    SENTRY_DSN: z.string().url().optional().or(z.literal('')),
    SENTRY_ENVIRONMENT: z.string().optional(),

    // Admin panel — shared-secret header, not a Shopify session
    ADMIN_API_KEY: z.string().min(16),

    // Google OAuth (popup flow, iframe-safe)
    GOOGLE_OAUTH_CLIENT_ID: z.string().min(1),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),
    GOOGLE_OAUTH_REDIRECT_URI: z.string().url(),

    // Billing: whether appSubscriptionCreate/appPurchaseOneTimeCreate ask Shopify
    // for a TEST charge. Deliberately its OWN explicit flag, never inferred from
    // NODE_ENV — this server is "production" hosting regardless of whether the
    // shop currently testing against it is a real merchant or a Partner dev
    // store, and Shopify hard-rejects a real (test:false) charge against a dev
    // store. Defaults to true (never a real charge) until explicitly set to
    // "false" once ready to accept real payments from real merchants.
    BILLING_TEST_MODE: z.enum(['true', 'false']).default('true'),

    // Worker / runtime tuning
    JOB_WORKER_PER_SHOP_CONCURRENCY: z.coerce.number().default(20),
    JOB_WORKER_GLOBAL_CONCURRENCY: z.coerce.number().default(40),
    JOB_LEASE_TIMEOUT_MS: z.coerce.number().default(600_000),
    RATE_LIMIT_PER_SHOP_PER_MIN: z.coerce.number().default(100),
    IMAGE_OPTIMIZER_FREE_DAILY_QUOTA: z.coerce.number().default(10),
  });
// Both the brand-style LLM key (OPENAI_API_KEY/ANTHROPIC_API_KEY) and SENTRY_DSN are
// deliberately NOT enforced here even in production: an unset provider key means that
// one feature (brand-style extraction / error tracking) fails clearly at call time
// (see services/brandStyle.js, config/sentry.js) rather than the whole server refusing
// to boot when an operator chooses not to use that provider.

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
