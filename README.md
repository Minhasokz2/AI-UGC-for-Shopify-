# MotionArt

MotionArt is a Shopify embedded app that generates AI product photography, UGC-style on-model
lifestyle images, and short product videos from a merchant's existing catalog images. It uses a
two-step pipeline (background removal → routed AI model) designed to preserve exact product
color, logo, label text, shape, and proportions.

## Monorepo layout

```
server/     Node/Express backend — serves its own API AND the built web/admin SPAs
web/        Vite + React + Polaris + App Bridge — the embedded merchant-facing app
admin/      Vite + React + Polaris — internal admin tool for the shared Templates/Models catalog
marketing/  Vite + React — public marketing site
scripts/    seedTemplates.js, seedAllowedModels.js, sweepNurture.js, sweepBillingReconciliation.js
```

Deployment target is a **single Render web service**: `server/` serves its own API and the built
`web/dist` (at `/`) and `admin/dist` (at `/admin`) static bundles from the same Express app and
domain — see `server/src/app.js` for the exact route/middleware ordering, and `render.yaml` /
`build.sh` for the deploy wiring. `marketing/` is deliberately NOT served by this same app —
a public marketing site belongs on the plain root domain (e.g. `motionart.app`), while
`SHOPIFY_APP_URL`/the Render service's domain is the *embedded app's* URL (typically a subdomain).
Deploy `marketing/dist` to its own static host (a second free Render Static Site, Vercel, Netlify,
or similar) — this is a manual step `build.sh`/`render.yaml` don't perform.

## Getting started

```bash
npm install
cp .env.example .env   # fill in real values — see server/src/config/env.js for what's required
npm run dev             # starts the backend on PORT (default 3000)
npm run dev:web          # in another terminal, for local frontend iteration with HMR
npm run dev:admin
npm run dev:marketing
```

```bash
npm test                # full Vitest suite (server unit + integration, then web)
npm run build            # builds web, marketing, admin (in that order) for production
npm run seed:templates   # upserts the Templates catalog into Firestore
npm run seed:models      # upserts the Allowed Models catalog (also available as
                          #   POST /admin/api/seed-models for environments without shell access)
```

## Architecture notes

- **Auth**: Shopify-managed installation (scopes declared in `shopify.app.toml`, not requested via
  OAuth) + token exchange (not the classic OAuth redirect) for embedded session handling. See
  `server/src/config/shopify.js` and `server/src/middleware/auth.js`.
- **Data**: Firestore, via `firebase-admin`. See `server/docs/createFirestoreIndexes.md` for the
  composite indexes the query patterns require.
- **Job processing**: an in-process worker (`server/src/workers/jobWorker.js`) using `p-limit` for
  per-shop and global concurrency caps — no Redis/BullMQ. Jobs are claimed via a Firestore-
  transaction lease (`server/src/repos/jobsRepo.js`) so a Render rolling deploy can't double-charge
  a provider call.
- **AI providers**: fal.ai (images, background removal, upscaling, try-on), WaveSpeed (video),
  OpenAI/Anthropic (brand style extraction), Cloudinary (image hosting).

## Required manual steps this build cannot perform

This build environment has no live credentials for fal.ai, OpenAI, Anthropic, WaveSpeed, Firebase,
Cloudinary, Resend, or Sentry, and no real Shopify dev store. "Done" here means: the server boots
against placeholder env values, all three frontends build cleanly with Vite, and every unit of
business logic is verified against mocked SDKs / an in-memory fake Firestore. Before shipping:

1. **Live end-to-end testing** against real provider credentials and a real Shopify dev store is
   required and has not been performed by this build — install the app on a real dev store, run
   through every generation flow (templates, custom studio, persona, video, try-on, bulk), publish
   to a real product, and verify webhooks/billing against Shopify's test-mode billing APIs.
2. **Model catalog verification**: `server/src/services/allowedModelsSeedData.js` was seeded from
   research against fal.ai's live model pages at build time, but fal.ai's endpoint IDs and pricing
   change frequently (several were unconfirmed or inconsistent across sources during research —
   flagged with a `needsPriceReview: true` field). Re-verify every endpoint's exact request/
   response schema and current price directly against `fal.ai/models/{id}/api` before real spend
   is at risk, and re-check them periodically thereafter.
3. **Single-instance assumption**: the in-process job worker's concurrency caps and in-memory
   lease-claim de-duplication assume a single running server instance. The Firestore lease-claim
   transaction is what keeps a *rolling redeploy* safe (old and new instance briefly overlapping);
   it does **not** make the app safe to horizontally scale to multiple steady-state instances
   without further work (a distributed queue or a shared concurrency limiter).
4. **Shopify API version**: pinned to a specific `ApiVersion` constant in
   `server/src/config/shopify.js` rather than `LATEST_API_VERSION` (which no longer exists in the
   SDK). Bump it deliberately each quarter as Shopify ships new stable versions — check the SDK's
   actual current export before bumping.
5. **`marketing/` hosting**: `build.sh` builds `marketing/dist` but nothing deploys it — it isn't
   served by the Render web service (see "Monorepo layout" above for why). Point a separate static
   host at `marketing/dist` and update the Shopify App Store listing / any "learn more" links to
   that domain once it exists.
