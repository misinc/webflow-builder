# Webflow Builder

Webflow Designer Extension + Webflow Cloud backend that migrates websites from a
GitHub repo (pre-rendered HTML) into Webflow with clean **client-first** naming.

## The workflow the app implements (paste-first)

1. Backend indexes the repo (`html-extractor`), slicing pages into sections.
2. Per section/page: deterministic skeleton (`html-planner`) + styling resolved
   from the repo's compiled CSS (`css-resolver`, `resolved-styling`) — no LLM in
   the primary path.
3. The plan is serialized to Webflow's clipboard paste format
   (`@wfb/shared/webflow-clipboard.ts`, `@webflow/XscpData`) — the user pastes it
   onto the Designer canvas (Cmd+V), then runs **Clean up paste** (class dedupe +
   variable binding via the Designer API) and marks the section built.
4. The old Designer-API insert/style path still exists but is retired from the
   UI (dormant fallback — do not resurface it without asking).

## Commands (run from repo root)

- `npm run typecheck` — both tsconfigs; must be 0 before committing.
- `npx vitest run` — full suite; must be green before committing.
- `npm run build --prefix cloud` — REQUIRED check whenever backend-core/shared/
  cloud change (the worker bundles its own deps; missing deps fail only here).
- `npm run build:extension && webflow extension bundle` — rebuilds `bundle.zip`.
  Must run from the ROOT (webflow.json's publicDir is `extension/dist`).

## Two deploy channels — never confuse them

- **Backend** (`packages/*`, `cloud/`): auto-deploys to Webflow Cloud on push to
  `main`. No user action needed.
- **Extension UI** (`extension/`): ships ONLY via `bundle.zip`, uploaded
  manually in Webflow. Every bundle rebuild must (1) bump `BUNDLE_VERSION` in
  `extension/src/main.tsx` (console banner verifies which bundle is loaded) and
  (2) hand the user a ≤500-character version text for the upload form.

## Architecture

- `packages/shared` — contracts (zod), client-first helpers, the XscpData
  clipboard serializer. TS-source workspace (exports map `*.js` → `src/*.ts`).
- `packages/backend-core` — extractor (repo → pages/sections), planner
  (HTML → client-first skeleton), css-resolver (compiled CSS → resolved styles;
  handles @layer, breakpoints, #id rules, var() chains, simple calc()),
  resolved-styling (per-node style targets + content-hashed fidelity combos),
  workflow-service (queue, clipboard payload endpoint).
- `cloud/` — Astro/Cloudflare Worker hosting the HTTP API
  (`cloud/src/pages/api/[...path].ts` is a plain if-chain router).
- `extension/` — Vite React Designer Extension. `webflow/bridge.ts` wraps the
  Designer API (also mock bridge for tests/dev); v2/screens is the UI.
- Tests live in `test/` at the root; fixtures preferred over site-specific
  assertions.

## Hard-won invariants (regression-tested — keep them true)

- The extension must stay **site-agnostic**: mechanisms only (CSS features, tag
  semantics, BEM patterns) — never site-specific class names or colors in src.
- The extension only USES existing Webflow variables/styles; it never creates
  design tokens (the user creates tokens via MCP beforehand).
- Webflow's paste parser silently drops what it doesn't know: no `calc()`
  (evaluate it), no modern `gap:` (emit `grid-row-gap`/`grid-column-gap`), no
  logical properties (emit physical sides). Silent style loss on paste ⇒
  suspect a dropped declaration first.
- Webflow text elements (headings/paragraphs) are text-only; Buttons/LinkBlocks
  can't hold children (build CTAs as `<a>`). `<br>/<source>` blocks and nested
  paragraphs crash the canvas. Media tags become div placeholders.
- Components/variables never ride the clipboard (flattened/literal on copy) —
  both are re-linked post-paste via the Designer API.
- Shared client-first classes (`heading-style-*`, `text-size-*`,
  `padding-global`, …) are never defined/restyled from one node's CSS —
  per-node fidelity rides in content-hashed combo classes.
- After changing the extractor's slicing, bump `HTML_REPO_INDEX_VERSION` and
  tell the user to Re-scan the repo.
