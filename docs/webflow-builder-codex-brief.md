# Webflow Builder — Codex Build Brief
## Bug fixes + architecture redesign (deterministic-first, global class plan, section-by-section)

> **Purpose.** This is a self-contained brief for Codex to (A) fix concrete bugs found in a code review and (B) re-architect the build pipeline. It assumes no prior conversation. Read §1 for context, then execute Part A (§2) and Part B (§3) in the phased order in §4. Respect the guardrails in §5.

---

## 1. Context Codex must hold

### 1.1 What the app does
A user picks a GitHub repo (a coded site — React/TSX pages composed of section components), maps its pages to live Webflow pages, then builds each page **section by section** into native Webflow elements using **client-first** class naming, with human approval along the way.

### 1.2 Stack & runtime constraints
- **Backend:** Astro (`output: "server"`) on the **Cloudflare adapter** → deploys to **Cloudflare Workers**. Data in **Cloudflare D1** (SQLite) via **Drizzle ORM**. AI via OpenAI chat completions.
- **Extension:** React + Vite Designer Extension. Talks to the backend over HTTP. The Designer API ("bridge") creates nodes/styles/variables live in the canvas.
- **Hard limits that matter:**
  - **D1: max 100 bound parameters per query.** (This already caused a production bug — see B1.)
  - Workers bill **CPU time, not wall-clock**, so awaiting OpenAI is cheap on CPU — but a request still must finish under the platform's response ceiling. Long synchronous AI calls are risky (see B7).
  - Workers isolates are stateless/ephemeral; in-memory state does not persist across requests.

### 1.3 The goal (product intent — confirmed with the owner)
- **Deterministic-first, LLM-assist.** The repo's JSX already encodes structure; its CSS/Tailwind/client-first classes already encode styling. Parse them. Use the LLM only for fuzzy work (semantic naming, choosing which existing client-first class to reuse vs. create). *The app was originally deterministic-first; it was switched to LLM-first and results got worse. Revert the philosophy.*
- **Big-picture class planning first, then section-by-section build.** Compute the site-wide class/variable system once, then build pages one section at a time referencing that plan.
- **Two approval gates per section:** (1) skeleton is generated → user can **edit** it → **place** it on the canvas → **approve**; (2) **style** the placed section → user **approves**. Both gates must be real, persisted state — survive reloads.
- **Components are NOT part of the build.** The user componentizes manually in Webflow after the build. Automated component creation is explicitly removed from the critical path (it caused severe slowdowns).

### 1.4 Repo map (key files)
```
extension/src/
  api/client.ts                      # HTTP client; hardcoded backend URL (see B2)
  executor/buildExecutor.ts          # writes nodes/styles to the Designer (see B5)
  webflow/bridge.ts                  # Designer API wrapper
  skeleton/tree.ts                   # skeleton tree parse/normalize
  v2/context/AppStateContext.tsx     # the real client state machine (gates live here)
  v2/context/NavigationContext.tsx   # screen routing
  v2/screens/*                       # thin screens
cloud/src/
  pages/api/[...path].ts             # single API router (see B7, B8, B9)
  backend/extractor/mis-extractor.ts # repo → pages/sections index (DETERMINISTIC source)
  backend/planner/
    openai-planning-provider.ts      # LLM path (currently primary) (see B4)
    heuristic-planner.ts             # deterministic path (currently fallback)
    section-serializer.ts            # serializes a section for the LLM
    style-fallback.ts                # deterministic style fallback
    planning-provider.ts             # provider interface
  backend/services/
    workflow-service.ts              # per-section orchestration + status machine
    repo-sync-service.ts             # sync → extract → replaceRepoIndex
  lib/d1-app-repository.ts           # D1 persistence (see B1, B3)
  lib/cloud-services.ts              # DI wiring; OPENAI_MODEL default
  db/schema/index.ts                 # Drizzle schema
  wrangler.json / astro.config.mjs   # deploy config (see B9)
src/backend/** , src/shared/**       # DUPLICATE of cloud/src/** used by extension+tests (see B6)
```

### 1.5 A prepared patch exists
A reviewed patch — **`webflow-builder-fixes.patch`** — accompanies this brief. It already implements four safe fixes (atomic repo-index write, sanitized API errors + correlation id, graceful styling fallback, and a `buildSha` deploy probe). **Apply it first** (`git apply webflow-builder-fixes.patch`), run typecheck + tests, then continue. If it no longer applies cleanly, re-implement the equivalent changes described in B3, B8, B4, B2.

---

## 2. Part A — Bug fixes

Each item: **where → symptom → root cause → fix → done-when.**

### B1 — D1 100-parameter overflow on repo load `Critical` (already fixed in HEAD; add a guard)
- **Where:** `cloud/src/lib/d1-app-repository.ts → replaceRepoIndex()`.
- **Symptom (historical):** `Failed query: insert into "repo_pages" … (25 value tuples)` when loading a repo with ~25 pages.
- **Root cause:** the page insert was chunked at a hardcoded 25 rows × 7 columns = **175 bound params**, over D1's 100 limit. Worked on the old Neon/Postgres backend (≈65k param limit); broke after the move to D1.
- **Fix:** HEAD already chunks via `insertBatchSize()` with `D1_SAFE_BOUND_PARAMETER_LIMIT = 90`. Keep it. **Add a regression guard:** a tiny dev assertion/test that fails if any multi-row insert would exceed 90 params, so future bulk inserts can't reintroduce this.
- **Done when:** loading the 25-page repo succeeds; a unit test asserts the page/section batch sizes stay ≤ 90 params; CI covers it.

### B2 — Extension ↔ backend version skew `High`
- **Where:** `extension/src/api/client.ts` (hardcoded `baseUrl` fallback `https://misinc-ai-builder.webflow.io/api`), `cloud/src/pages/api/[...path].ts` (`buildSha` added by the patch).
- **Symptom:** "works sometimes, throws weird/old errors other times." The extension bundle and the backend are two separately-deployed artifacts that drift.
- **Root cause:** Vite inlines `VITE_API_BASE_URL` at build time into `bundle.zip`. Rebuilding the backend without rebuilding/re-uploading the extension (or vice-versa) leaves a version gap. The migration off Netlify makes stale origins likely.
- **Fix:**
  1. Stamp the commit into both artifacts at build: backend `BUILD_SHA=$(git rev-parse --short HEAD)`, extension `VITE_BUILD_SHA=$(git rev-parse --short HEAD)`.
  2. On extension boot, fetch `/api/debug-env-status`, compare `buildSha` to `VITE_BUILD_SHA`, and show a **non-blocking banner** on mismatch ("extension and backend built from different commits — rebuild & re-upload").
  3. Document a single release runbook: build+deploy backend → build+upload extension, always together.
- **Done when:** a deliberate mismatch surfaces the banner; the runbook is in the repo README.

### B3 — Repo-index write is not atomic `High` (patched)
- **Where:** `replaceRepoIndex()`.
- **Symptom:** a failed insert could leave the repo index **empty or half-written** (deletes had already committed).
- **Fix (in patch):** build all delete+insert statements and run them in a single `db.batch()` (all-or-nothing).
- **Done when:** simulating a mid-write failure leaves the prior index intact.

### B4 — No retry on transient OpenAI failures; styling hard-failed `High` (styling patched; add retry)
- **Where:** `cloud/src/backend/planner/openai-planning-provider.ts`.
- **Symptom:** a single 429/5xx/timeout aborts a stage. `generateStylingPlan` built a fallback then `throw`-ed instead of using it — so any blip killed the whole "style" step.
- **Fix:** (a) styling now returns its review-only fallback with a warning (in patch). (b) **Add bounded retry/backoff** around the `fetch` in `requestJson` — retry only on AbortError(timeout)/network TypeError/HTTP 408,409,429,5xx; honor `Retry-After`; cap at ~3 attempts; re-throw on the last so existing per-stage fallbacks still apply.
  ```ts
  const OPENAI_MAX_ATTEMPTS = 3;
  function retryDelayMs(attempt: number, res?: Response) {
    const ra = Number(res?.headers.get("retry-after"));
    if (Number.isFinite(ra) && ra > 0) return Math.min(ra * 1000, 10000);
    return Math.min(1000 * 2 ** (attempt - 1), 8000) + Math.floor(Math.random() * 250);
  }
  ```
- **Also:** confirm `OPENAI_MODEL` (default in `cloud-services.ts`) resolves to a model the key can call — a wrong default fails every stage. Add a bounded `max_tokens`/`max_completion_tokens` to keep latency predictable.
- **Done when:** an injected 429 retries and succeeds; a hard failure degrades to the documented fallback, never an unhandled throw.

### B5 — Designer API executor has no transient-error resilience `Medium`
- **Where:** `extension/src/executor/buildExecutor.ts`.
- **Symptom:** one transient Designer API hiccup mid-tree rolls back the whole section.
- **Fix:** add a small retry/backoff wrapper around **idempotent** bridge ops only — `applyClasses`, `setNodeTextContent`, `ensureStyle`, `bindVariable`. **Do NOT auto-retry `createNode`** (a retry after a silently-succeeded create makes duplicate nodes); leave node creation to the existing rollback, or make it verify-before-retry.
- **Done when:** a simulated transient failure on an idempotent op retries instead of failing the section; `createNode` is not blindly retried.

### B6 — Duplicated, drifting backend trees `High`
- **Where:** root `src/backend/**` + `src/shared/**` (used by the extension build + tests) vs `cloud/src/backend/**` + `cloud/src/shared/**` (used by the deployed Worker). The `backend` copies have already drifted ~550 lines across 6 files (incl. the extractor and GitHub client). The `shared` copies are currently identical but unguarded.
- **Symptom:** a fix in one tree never reaches the other; Zod `contracts` drift will cause the extension to reject valid backend responses ("random" failures).
- **Fix (preferred):** extract `shared` and `backend` into workspace packages (npm/pnpm workspaces, e.g. `@wfb/shared`, `@wfb/backend-core`) imported by both the extension and `cloud/`. **Stopgap if packages are too invasive now:** generate the `cloud/src/{shared,backend}` copies from root in a prebuild step and add a CI check that fails on drift; never hand-edit the generated copy.
- **Done when:** there is exactly one canonical copy of each module (or a CI guard provably blocks drift).

### B7 — Main AI endpoints are synchronous on Workers `Medium-High`
- **Where:** `cloud/src/pages/api/[...path].ts`, `workflow-service.ts`. Only the **debug** skeleton route uses a background-job + poll pattern; `section/analyze|generate-skeleton|style|verify` block on a synchronous OpenAI round-trip.
- **Symptom:** long generations risk a gateway timeout → "backend error / timeout."
- **Fix:** promote the existing **start → background → poll** pattern (already proven for debug skeleton) to at least `section/generate-skeleton` and `section/style`. Until then keep `OPENAI_REQUEST_TIMEOUT_MS` (25s) comfortably under the platform ceiling and keep retry total time bounded.
- **Done when:** a slow section generation completes via polling without holding one long request open.

### B8 — API leaked raw internal errors `Medium` (patched)
- **Where:** `handleError()` in `cloud/src/pages/api/[...path].ts`.
- **Symptom:** raw SQL/driver errors surfaced in the extension UI (that's how the B1 error was seen).
- **Fix (in patch):** 5xx responses now log full detail to Workers observability with a `console.error([api-error <id>])` and return a generic message + `errorId`. 4xx validation messages still pass through.
- **Done when:** no internal/SQL text reaches the client; correlation id appears in logs.

### B9 — Config hygiene `Low`
- `cloud/wrangler.json`: `database_id` is still `"replace-after-first-webflow-cloud-deploy"`. Confirm the committed config points at the real D1 (or that Webflow Cloud injects the `DB` binding) so a clean checkout deploys correctly.
- `cloud/astro.config.mjs`: `session: { driver: "memory" }` does not persist on Workers. Remove it, or switch to a KV/D1 driver if sessions get used.
- `cloud/src/pages/api/[...path].ts`: `export const config = { runtime: "edge" }` is a Vercel/Next convention and a no-op under the Astro Cloudflare adapter — remove the leftover.
- **Done when:** config matches the real runtime; no dead config remains.

### B10 — In-flight build state is not durable (resumability) `High` — overlaps with redesign §3.4
- **Where:** `extension/src/v2/context/AppStateContext.tsx` (skeleton/styling/verification + `currentTargetNodeId` live only in React state), `cloud/src/lib/d1-app-repository.ts`, `cloud/src/shared/contracts.ts`, `workflow-service.ts`.
- **Symptom:** refresh/navigation mid-section loses the link to the just-placed nodes (they stay on canvas, but the extension forgets them) → cannot resume; styling has no target.
- **Fix:** persist a **durable handle** to placed nodes (the section's root Webflow node id + the plan→runtime node-id map) and the per-section status, then rehydrate on load. Implemented properly as part of the two-gate state machine in §3.4.
- **Done when:** closing and reopening the extension mid-build resumes the exact section/page with its placed nodes re-attached.

---

## 3. Part B — Redesign (target architecture)

### 3.0 Principles
1. **Deterministic-first, LLM-assist.** Source is truth; LLM only fills gaps.
2. **Plan globally, build locally.** Compute the class/variable system for the whole site first; build sections against it.
3. **Section is the unit of work** with two persisted approval gates and per-section rollback.
4. **Durable & resumable.** Build state lives in D1 with stable handles to Webflow nodes.
5. **No automated components.** Repeated sections are built inline; componentization is a manual post-build step.

### 3.1 Target end-to-end flow
```
Connect repo
  → DETERMINISTIC EXTRACTION (pages, sections, element tree from JSX, real classes/CSS, duplicate detection)
  → SITE BUILD PLAN overview (pages, sections, unique section types, class reuse-vs-create map)  ← big picture
  → confirm pages/mappings (repo-authoritative; auto-create/auto-map, manual override)
  → GLOBAL CLASS + VARIABLE PLAN (merge extracted repo classes + existing Webflow site shared styles; persist)
  → per page, per section:
        1. Generate skeleton  (deterministic from AST; LLM only for naming)
        2. User edits skeleton (optional)
        3. PLACE skeleton on canvas         → persist root node id + status `skeleton_placed`
        4. [GATE 1] Approve skeleton        → status `skeleton_approved`
        5. Apply styling to placed nodes    (deterministic from extracted CSS, referencing the GLOBAL class plan; LLM only to reconcile) → status `styled`
        6. [GATE 2] Approve styling/section → status `approved`; advance queue
  → page complete → next page
  → site complete → BUILD REPORT (succeeded / failed / skipped, with per-item retry)
```

### 3.2 Deterministic-first pipeline (the core change)
- **Make the deterministic planners primary.** `mis-extractor.ts` + `heuristic-planner.ts` + `style-fallback.ts` should produce the skeleton (element tree + class names) and the style definitions directly from the parsed JSX/AST and the source CSS. The LLM (`openai-planning-provider.ts`) becomes a **refinement pass**, not the generator.
- **Contract for the skeleton step:**
  - Structure (element nesting, tags) is derived **deterministically** from JSX. Map HTML tags → Webflow element types in a fixed table.
  - Class **names** come from the source (existing client-first classes used in the JSX/CSS). The LLM may only (a) propose semantic names for unnamed wrappers, and (b) choose which *existing* shared class to reuse. It must not invent a different structure.
- **Contract for the styling step:**
  - Style **properties** come from the source CSS/Tailwind resolved to concrete declarations. The LLM may only reconcile/disambiguate (e.g., map a Tailwind utility cluster to an existing client-first class, or decide reuse-vs-create) — constrained to the global class plan (§3.3).
  - The styling call **receives the approved skeleton's class list as a hard constraint** so styling can't target classes the structure doesn't use.
- **LLM determinism settings:** `temperature: 0`, forced JSON, bounded tokens. Keep the existing normalization/repair as a safety net.
- **Done when:** building the same section twice produces the same tree and classes; output matches the repo's actual structure and class usage.

### 3.3 Global class + variable plan (the "big picture")
- After extraction and before building, compute a **site style plan**: the union of classes/variables the site needs, built from (a) classes extracted from the repo CSS and (b) the existing Webflow site's shared client-first styles (already captured via `bridge.inspectSharedStyles` / `sharedStyleContextsTable`).
- Produce a **reuse-vs-create map**: for each class, "reuse existing Webflow class X" or "create new class Y." Persist it (extend `sharedStyleContextsTable` or add a `site_style_plans` table).
- Every section's styling step **references this plan** rather than independently inventing classes → true client-first consistency and far less drift.
- Surface it in the **Site Build Plan overview** so the user can steer before building.
- **Done when:** section styling never creates a class that the global plan says should be reused; the overview shows counts before any build starts.

### 3.4 Two persisted approval gates + durable handles (replaces the fused "apply")
- Today `applyCurrentSection()` fuses insert + style + verify into one action with a single approval. **Split it** into two persisted gates driven by the existing status enum (`skeleton_ready/skeleton_placed → skeleton_approved → styled → approved`):
  - **`placeSkeleton`** — insert nodes; persist the **root node id + plan→runtime node-id map** and status `skeleton_placed`.
  - **`approveSkeleton`** — [GATE 1] persist `skeleton_approved`.
  - **`applyStyling`** — ensure classes/properties/variables on the **persisted** root node (re-attach via the stored handle, so it works after a reload); status `styled`.
  - **`approveSection`** — [GATE 2] persist `approved`; advance the queue.
- Persist enough to **rehydrate** on load (fixes B10): the section's status, root node id, and node map. On reopen, re-attach to the placed nodes and resume at the correct gate.
- Keep per-step rollback; a styling failure must not discard an already-approved skeleton — just retry styling against the placed nodes.
- **Done when:** the two gates are independent, persisted, and resumable across reloads; rejecting styling preserves the approved skeleton.

### 3.5 Components: explicitly out of the pipeline
- **Remove automated Webflow Component creation from the build path** (`createComponentsFromOpportunities` and any component-canvas seeding in the critical flow). It caused severe slowdowns.
- Repeated sections are built **inline** per page during the automated build.
- Component detection may remain only as an **optional, informational, user-triggered** post-build report — never automatic, never blocking. The user componentizes manually in Webflow afterward.
- **Done when:** a full site build performs zero automated component operations; no component step sits on the critical path.

### 3.6 Build report + resumable job
- Treat the site build as a durable job: persisted per-page/per-section status, plus a **build report** screen listing succeeded / failed / skipped with the failure reason and **one-click retry per item**. Partial success accumulates instead of "start over."
- **Done when:** after a run with some failures, the user can retry only the failed sections without redoing approved ones.

---

## 4. Part C — Phased implementation plan (ship after each phase)

- **Phase 0 — Stabilize & deploy hygiene.** Apply `webflow-builder-fixes.patch` (B3, B8, B4-styling, B2-probe). Resolve config hygiene (B9). Wire `BUILD_SHA`/`VITE_BUILD_SHA` + the boot banner (B2). Add the B1 param-limit regression test. Redeploy backend **and** re-upload the extension together; confirm `/api/debug-env-status` shows the new `buildSha`. *Biggest immediate reliability win; no architecture change.*
- **Phase 1 — Single source of truth.** Collapse the duplicated `backend`/`shared` trees into workspace packages (or a generate-+-CI-guard stopgap) (B6). Prevents future drift before you start changing pipeline code.
- **Phase 2 — Deterministic-first pipeline.** Invert planner priority: deterministic skeleton + styles from AST/CSS primary, LLM as refinement with `temperature: 0` and the skeleton class-list constraint (§3.2). Add OpenAI retry (B4) and executor retry (B5).
- **Phase 3 — Global class plan + Site Build Plan overview.** Compute and persist the site style plan; show the overview; make section styling reference it (§3.3).
- **Phase 4 — Two persisted gates + resumability.** Split the fused apply into `placeSkeleton / approveSkeleton / applyStyling / approveSection`; persist node handles + statuses; rehydrate on load (§3.4, B10).
- **Phase 5 — Background jobs + build report.** Extend the background-job pattern to skeleton/style (B7); add the resumable build report with per-item retry (§3.6).
- **Out of scope:** automated components (§3.5) — remove from the critical path in Phase 0 or 2, do not re-add.

---

## 5. Guardrails — must not break
1. **D1 100-param ceiling.** No bulk insert/update may exceed it; keep the chunk helper + regression test.
2. **Determinism.** Structure and class names come from source, not the model. `temperature: 0`. Same input → same output.
3. **Two gates stay.** Never re-fuse skeleton placement and styling into one approval.
4. **No automated components.** Do not put component creation on the build path.
5. **One source of truth.** Do not hand-edit a generated/duplicated copy.
6. **Don't leak internals.** 5xx responses stay sanitized + logged with a correlation id.
7. **Workers reality.** No reliance on in-memory cross-request state; keep long AI work off synchronous request paths.
8. **Release as a pair.** Backend + extension are one release; never ship one without the other.
9. **Ask before destructive migrations** on existing D1 data.

## 6. Validation per phase
- `npm test` (existing suites under `test/`) + typecheck must pass after every phase.
- Add tests: B1 param-limit guard; deterministic skeleton/style snapshot (same input → same tree); gate state transitions; resumability (rehydrate after reload).
- Manual: build the 25-page MIS repo end to end; confirm no timeouts, no raw errors in the UI, both gates persist across a reload, and the build report retries only failed sections.
- Deploy check: `/api/debug-env-status` `buildSha` matches HEAD on both artifacts.
