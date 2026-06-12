# Webflow Builder Cloud

This directory is the Webflow Cloud app that will replace the Netlify Function
surface used by the Webflow Designer extension in the repository root.

## Why Astro

Astro is a better fit than Next.js for this migration because the Cloud surface
is primarily API routes plus a minimal status page. The existing extension UI
remains separate and continues to live at the repo root.

## What this app does today

- Provides a deployable Astro Webflow Cloud app scaffold
- Defines Webflow Cloud config in [webflow.json](./webflow.json)
- Adds initial Wrangler and Drizzle SQLite config
- Exposes a simple health route at `/api/health`
- Exposes initial read routes at `/api/v2/bootstrap`,
  `/api/v2/component-opportunities`, and `/api/repos-tree/:repoId`

## What still needs to be migrated

The existing Netlify functions depend on:

- Postgres-specific Drizzle schema and repository code
- Node-only GitHub App signing and local file utilities
- Root-level app wiring that assumes the Netlify function runtime

The next migration step is to port the storage and integration layers to
Webflow Cloud-compatible implementations:

1. Replace the current Postgres repository with a SQLite/D1-backed repository.
2. Replace Node-only GitHub signing with an Edge-compatible implementation.
3. Add an Astro catch-all API route that maps current Netlify endpoints to the
   migrated handlers.
4. Repoint the extension `VITE_API_BASE_URL` to the Webflow Cloud app URL.

## Extension configuration

When the extension should call the Webflow Cloud app instead of Netlify, set:

- `VITE_API_BASE_URL=https://<your-cloud-app>/api`
- `VITE_API_RUNTIME=cloud`
