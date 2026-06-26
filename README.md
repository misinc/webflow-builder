# Repo Section Builder v1

Webflow Cloud-backed API plus a React-based Webflow Designer Extension for compiling MIS repo sections into an active Webflow page.

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
- The extension currently uses an explicit `x-user-id` header as a session placeholder. GitHub OAuth UI and session exchange still need production wiring.
- Live Webflow inspection and mutation are abstracted behind `window.__WEBFLOW_SECTION_BUILDER_BRIDGE__`. If that bridge is absent, the extension falls back to a local mock.
- The extension is locked to the Webflow Cloud API host and no longer supports Netlify runtime routing.

## Environment

Set any needed variables in `.env.local` before running:

```bash
GITHUB_APP_ID=...
GITHUB_APP_CLIENT_ID=...
GITHUB_APP_CLIENT_SECRET=...
GITHUB_APP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
GITHUB_APP_INSTALLATION_ID=...
GITHUB_APP_INSTALLATION_TOKEN=...
GITHUB_ACCESS_TOKEN=...
LOCAL_MIS_REPO_PATH=/absolute/path/to/mis-repo
CANONICAL_WEBFLOW_SITE_ID=6a2db2a041dabacd48068930
VITE_API_BASE_URL=https://misinc-ai-builder.webflow.io/api
VITE_API_RUNTIME=cloud
```

## Commands

```bash
npm install
npm run typecheck
npm run test
npm run build
webflow extension bundle
```

## Paired release runbook

The Webflow Cloud backend and Designer Extension are one release unit. Always
build and upload them from the same commit so the extension does not talk to a
stale backend contract.

```bash
export BUILD_SHA=$(git rev-parse --short HEAD)
export VITE_BUILD_SHA=$BUILD_SHA

cd cloud
npm run build
# Deploy through Webflow Cloud from this same commit.
cd ..

npm run build:extension
webflow extension bundle
# Upload the generated extension bundle from this same commit.
```

After deployment, open `/api/debug-env-status` on the Cloud backend and confirm
`buildSha` matches `git rev-parse --short HEAD`. The extension checks this value
on boot and shows a non-blocking warning if its `VITE_BUILD_SHA` differs from
the backend `BUILD_SHA`.

## Cloud cutover

The production runtime lives under [`cloud/`](./cloud). After the extension smoke test passes against the live Cloud host:

```bash
cd cloud
npm run db:apply:remote
DATABASE_URL=postgresql://... npm run db:import:remote
DATABASE_URL=postgresql://... npm run db:verify:remote
```
