# Webflow Builder Cloud

This directory contains the Webflow Cloud backend used by the Webflow Designer
extension in the repository root.

## Why Astro

Astro is a better fit than Next.js for this migration because the Cloud surface
is primarily API routes plus a minimal status page. The existing extension UI
remains separate and continues to live at the repo root.

## What this app does today

- Uses Astro with Webflow Cloud SQLite/D1 storage
- Reuses the shared backend services and contracts from the repo root
- Exposes the full API surface expected by the extension under `/api/*`
- Includes Neon-to-SQLite export and verification scripts in `scripts/`
- Defines Webflow Cloud config in [webflow.json](./webflow.json)

## Remaining deployment work

1. Replace the placeholder `database_id` in `wrangler.json` with the real
   Webflow-generated database id after the first deploy.
2. Apply migrations locally with `npm run db:apply:local` and deploy so
   Webflow Cloud applies them remotely.
3. Run `npm run db:export:neon -- <output.sql>` and load that SQL into the
   Webflow Cloud SQLite database.
4. Verify the imported data with `npm run db:verify:sqlite`.
5. Confirm the required GitHub and OpenAI environment variables are set in the
   Webflow Cloud environment.

## Extension configuration

When the extension should call the Webflow Cloud app, set:

- `VITE_API_BASE_URL=https://<your-cloud-app>/api`
- `VITE_API_RUNTIME=cloud`
