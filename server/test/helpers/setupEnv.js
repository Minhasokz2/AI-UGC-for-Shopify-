// Loaded by vitest before any test file. Populates every required env var with a
// harmless placeholder so `config/env.js`'s zod validation passes during tests —
// individual tests that care about env parsing import and call the schema directly
// rather than relying on process.env mutation ordering.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SHOPIFY_API_KEY ||= 'test-shopify-api-key';
process.env.SHOPIFY_API_SECRET ||= 'test-shopify-api-secret';
process.env.SHOPIFY_APP_URL ||= 'https://test-app.example.com';
process.env.FIREBASE_PROJECT_ID ||= 'test-project';
process.env.FIREBASE_CLIENT_EMAIL ||= 'test@test-project.iam.gserviceaccount.com';
process.env.FIREBASE_PRIVATE_KEY ||= '-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----\\n';
process.env.FAL_API_KEY ||= 'test-fal-key';
process.env.BRAND_STYLE_LLM_PROVIDER ||= 'anthropic';
process.env.ANTHROPIC_API_KEY ||= 'test-anthropic-key';
process.env.WAVESPEED_API_KEY ||= 'test-wavespeed-key';
process.env.CLOUDINARY_CLOUD_NAME ||= 'test-cloud';
process.env.CLOUDINARY_API_KEY ||= 'test-cloudinary-key';
process.env.CLOUDINARY_API_SECRET ||= 'test-cloudinary-secret';
process.env.RESEND_API_KEY ||= 'test-resend-key';
process.env.RESEND_FROM_EMAIL ||= 'test@example.com';
process.env.ADMIN_API_KEY ||= 'test-admin-api-key-that-is-long-enough';
process.env.GOOGLE_OAUTH_CLIENT_ID ||= 'test-google-client-id';
process.env.GOOGLE_OAUTH_CLIENT_SECRET ||= 'test-google-client-secret';
process.env.GOOGLE_OAUTH_REDIRECT_URI ||= 'https://test-app.example.com/api/auth/google/callback';
