#!/usr/bin/env bash
# Single build script for the one Render web service: installs every workspace's
# dependencies, then builds the three static frontends (web, marketing, admin) that
# server/src/app.js serves alongside its own API. `server` itself is plain Node and
# needs no build step.
set -euo pipefail

npm install --include=dev
npm run build
