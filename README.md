# Repo Section Builder v1

Netlify-hosted TypeScript backend plus a React-based Webflow Designer Extension for compiling MIS repo sections into an active Webflow page.

## What is implemented

- Repo connection, sync, and page/section tree APIs.
- MIS-specific extractor for `src/app/pages/*`, `src/app/components/sections/*`, and `src/styles/*`.
- Shared contracts for `SectionContext`, `ProjectContext`, `BuildPlan`, and build result records.
- Deterministic heuristic planner plus strict build-plan validation.
- Webflow site binding and build job tracking APIs.
- React extension UI with repo sync, site binding, placement controls, and build summary.
- Execution bridge with best-effort rollback and a local mock bridge for development.
- Fixture-backed tests for extraction, validation, and rollback behavior.

## Current integration assumptions

- GitHub access prefers GitHub App credentials and falls back to `GITHUB_ACCESS_TOKEN` when present.
- Local repo development can use `LOCAL_MIS_REPO_PATH` instead of GitHub.
- The extension currently uses an explicit `x-user-id` header as a session placeholder. GitHub OAuth UI and session exchange still need production wiring.
- Live Webflow inspection and mutation are abstracted behind `window.__WEBFLOW_SECTION_BUILDER_BRIDGE__`. If that bridge is absent, the extension falls back to a local mock.

## Environment

Set any needed variables in `.env.local` before running:

```bash
GITHUB_APP_ID=...
GITHUB_APP_CLIENT_ID=...
GITHUB_APP_CLIENT_SECRET=...
GITHUB_APP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
GITHUB_APP_INSTALLATION_ID=...
GITHUB_ACCESS_TOKEN=...
DATABASE_URL=postgresql://...
DATABASE_URL_UNPOOLED=postgresql://...
LOCAL_MIS_REPO_PATH=/absolute/path/to/mis-repo
CANONICAL_WEBFLOW_SITE_ID=6a10876cde32438bc9f52304
```

## Commands

```bash
npm install
npm run typecheck
npm run test
npm run build
```
