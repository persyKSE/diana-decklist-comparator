#!/bin/bash
# Deploy the site to Cloudflare Pages from a clean dist/ directory.
#
# The repo root also holds the SQLite database, the Python scrapers and the
# experimental frontend/ app — none of which belong on a public host — so we
# assemble exactly the files the viewer needs and deploy that. Pages Functions
# are bundled automatically from ./functions (the /api/submissions endpoint,
# which also reads dist/field.json as its card catalogue via ASSETS).
#
# Auth: `npx wrangler login` locally, or CLOUDFLARE_API_TOKEN +
# CLOUDFLARE_ACCOUNT_ID environment variables in CI.
set -euo pipefail
cd "$(dirname "$0")"

rm -rf dist
mkdir -p dist/cache
cp index.html decks.js meta.js cards.js field.js \
   decks.json meta.json cards.json field.json \
   sw.js manifest.webmanifest icon.svg _headers dist/
cp -R cache/images dist/cache/images

npx wrangler pages deploy dist --project-name diana-decklist-comparator --branch main --commit-dirty=true
