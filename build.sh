#!/usr/bin/env bash
# Single build script for the one Render web service: installs every workspace's
# dependencies, then builds the three static frontends (web, marketing, admin) that
# server/src/app.js serves alongside its own API. `server` itself is plain Node and
# needs no build step.
set -euo pipefail

# web/index.html's `<meta name="shopify-api-key">` tag (which App Bridge reads to
# initialize inside Shopify's iframe) is filled in by Vite's build-time %VAR%
# substitution, which requires this under the VITE_ prefix — reuse the
# already-configured SHOPIFY_API_KEY rather than requiring a second, driftable
# copy of the same value as a separate Render env var.
export VITE_SHOPIFY_API_KEY="${SHOPIFY_API_KEY:-}"

npm install --include=dev
npm run build
