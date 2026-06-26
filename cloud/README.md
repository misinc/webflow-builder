# Webflow Builder Cloud

This directory contains the Webflow Cloud backend used by the Webflow Designer
extension in the repository root.

## Why Astro

Astro is a better fit than Next.js for this migration because the Cloud surface
is primarily API routes plus a minimal status page. The existing extension UI
remains separate and continues to live at the repo root.

## What this app does today

- Uses Astro with Webflow Cloud SQLite/D1 storage
- Uses a Cloud-local backend/runtime implementation that builds entirely from `cloud/`
- Exposes the full API surface expected by the extension under `/api/*`
- Includes Neon-to-SQLite export, import, and verification scripts in `scripts/`
- Defines Webflow Cloud config in [webflow.json](./webflow.json)

## Remaining deployment work

1. Confirm the required GitHub and OpenAI environment variables are set in the
   Webflow Cloud environment.
2. Confirm Webflow Cloud provides the `DB` D1 binding. The committed
   `wrangler.json` keeps the placeholder `database_id` for local Wrangler
   compatibility; production Webflow Cloud deploys must bind the real
   `webflow-builder` D1 database as `DB`.
3. Build with `BUILD_SHA=$(git rev-parse --short HEAD)` and confirm
   `/api/debug-env-status` returns that value after deploy.
4. Confirm `/api/health` returns all readiness checks as `true`.
5. After the extension smoke test passes, run the one-time data cutover:

   ```bash
   npm run db:apply:remote
   DATABASE_URL=postgresql://... npm run db:import:remote
   DATABASE_URL=postgresql://... npm run db:verify:remote
   ```

## Extension configuration

When the extension should call the Webflow Cloud app, set:

- `VITE_API_BASE_URL=https://<your-cloud-app>/api`
- `VITE_API_RUNTIME=cloud`
