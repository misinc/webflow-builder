# Webflow Builder — Codex Task: Support HTML repos (HTML → Webflow)

> **Goal.** Let the extension accept a GitHub repo of **rendered HTML** (downloaded site pages + CSS + assets) and build Webflow sites from it, in addition to the existing React/TSX repos. HTML is the final DOM, so structure + text + classes are explicit — this should produce **cleaner, more consistent results** and eliminate the "code/class names/line breaks leaking into element text" problem. **Keep the existing React path fully intact**; just detect the repo type and branch.

---

## 1. Context & what already exists (reuse this)

**Repo layout (post-refactor):** shared code lives in `packages/shared` (contracts, client-first) and `packages/backend-core` (extractor, planner, services). The Cloud backend (`cloud/`) and the Designer extension (`extension/`) both consume them.

**Pieces to reuse — do not reinvent:**
- `extension/src/v2/screens/DebugSkeletonScreen.tsx` — already has the `inputType: "html" | "jsx"` dropdown, a paste area, an "Insert content too" toggle, and calls `backend.generateDebugSkeleton({ code, inputType, ... })`. This is your proof the HTML→skeleton path works on a single section.
- `packages/shared/src/debug-skeleton.ts` — `decideDebugSkeletonRouting({ code, inputType })` (sync vs background job by size/complexity).
- `packages/backend-core/src/planner/section-serializer.ts` — **`parseHtmlOutline(sourceCode)` → `HtmlOutlineNode`** already parses HTML into a node tree. This is the seed of the deterministic HTML parser.
- `packages/backend-core/src/planner/openai-planning-provider.ts` — **`htmlFallbackSkeleton(input)`** already derives a skeleton from HTML via `parseHtmlOutline`. Promote this idea to a primary, deterministic HTML→`BuildNode` builder.
- `packages/backend-core/src/planner/heuristic-planner.ts` — `HeuristicBuildPlanner`, the deterministic skeleton planner used for React today.
- `packages/backend-core/src/extractor/mis-extractor.ts` — the React extractor whose **output contract you must mirror** (`RepoPageRecord` / `RepoSectionRecord` + snapshot).
- `packages/backend-core/src/services/repo-sync-service.ts` — where extraction is invoked (`extractor.extractRepoIndex` → `replaceRepoIndex`). This is where repo-type detection goes.

**Why HTML should give better results:** in HTML, text lives in text nodes and classes live in the `class` attribute — the format separates them for you, so none of the React-path content-sanitization heuristics (`looksLikeCodeFragment`, etc.) are needed, and the structure is the real, fully-expanded DOM (all list items, resolved conditionals, real content).

**Accepted limitation (by design):** dynamic/DB-driven sections come in as a **static snapshot**. The user will manually add Webflow CMS/Collection Lists afterward. That's fine.

---

## 2. Design

### 2.1 Repo-type detection (extractor stage)
Add a `detectRepoType(snapshot): "react" | "html"` used by `repo-sync-service.ts`:
- `html` if the repo contains `.html` files as pages (e.g., top-level or in a `pages/` or `public/` dir) and no React app entry.
- `react` otherwise (existing behavior — `package.json` + `.tsx/.jsx` under `src/app/pages`).
- Optional override: honor a `webflow-builder.json` marker with `{ "type": "html" | "react" }` if present.
Pick the extractor based on the detected type. Persist the type on the repo record (add a `repoType` column or stash in existing metadata) so later stages don't re-detect.

### 2.2 `HtmlExtractor` (new — mirrors `MisRepoExtractor`'s output)
- **Pages:** each `.html` file → one `RepoPageRecord` (name + route from the file path/name; `sourceFile` = the path).
- **Sections:** detect section boundaries within each page's `<body>` (or `<main>`): direct children that are `<section>`, or top-level block wrappers, or heading-delimited blocks. Each → a `RepoSectionRecord` with `metadata.inlineSourceCode` = that section's outerHTML (so the deterministic planner can consume it, exactly like the React path stores section source).
- Produce the same **snapshot** shape and store it in the blob store like the React path. Downstream (`replaceRepoIndex`, page mapping, queue) is unchanged.

### 2.3 Deterministic HTML → `BuildNode` parser (the core)
Promote `parseHtmlOutline` into a robust HTML→`BuildNode` builder (or add a thin layer on top). For real-world rendered HTML, the current lightweight parser may be too fragile — **prefer a Workers-safe DOM parser** (`node-html-parser` is pure-JS, fast, and runs on Cloudflare Workers; `parse5` also works). Rules:
- **Text from text nodes only.** Concatenate/trim a node's direct text-node children into `textContent`. Never read attributes, `<script>`, or `<style>` as text. (This is the content-pollution fix.)
- **Classes from the `class` attribute**, preserved into `classNames[]`. Do **not** run the React-path `isBuilderClassName` filter that drops non-client-first names — instead map them (see 2.4).
- **Tag → node type / Webflow element**: reuse the existing mapping (`inferNodeType`, and the tag normalization/`sanitizeSkeletonPlan` rules in `extension/src/skeleton/tree.ts`), but in a mode that **maps rather than strips** classes.
- **Drop** `<script>`, `<style>`, `<noscript>`, comments, and framework cruft (`data-*`, hydration markers). Collapse only wrappers with no layout-affecting role (conservative).
- Output a `BuildNode` tree → `SkeletonPlan` directly. **Do not serialize to the text-DSL** on this path.

### 2.4 Class mapping to client-first
HTML classes will be utility soup / hashed names. Feed them through the existing **site style plan** (`SiteStylePlanService`): each source class → `reuse` an existing Webflow class or `create` a client-first one. For HTML repos this is where the LLM-assist earns its keep (naming/consolidation), and the structure stays deterministic.

### 2.5 Wire into the existing flow
The HTML path produces the same `SkeletonPlan` the deterministic React path produces, so: page mapping, the two approval gates, the persisted node handles, the site style plan, and the build report all work **unchanged**. The only branch is at extraction + skeleton generation (react vs html source).

### 2.6 Playground as the HTML dev/debug harness
The debug playground (`DebugSkeletonScreen`) was built specifically to paste HTML and iterate on skeleton-generation quality and bugs. Make it the **canonical surface for hardening the HTML parser** — and make it share the real path so every fix lands in production, not a divergent code path.

1. **One path, no divergence.** The playground's `inputType: "html"` must call the **exact same `htmlToBuildNode()` + deterministic skeleton + class-mapping pipeline** the repo build uses (§2.3–2.4). No playground-only parsing. When `htmlToBuildNode` improves, the playground improves with it for free, and what you see is a faithful preview of what a repo build will produce.
2. **Render the full result, not just the tree.** Show three panels for a paste:
   - **BuildNode tree** — the parsed structure (tag, classNames, textContent, children) exactly as it will be inserted into Webflow.
   - **Warnings** — every transformation the parser/sanitizer applied: removed `<script>`/`<style>`/`<svg>`, retags, collapsed wrappers, split text wrappers, and dropped-vs-mapped classes. These already exist as `PlannerWarning`s (see the `sanitizeSkeletonPlan` codes like `removed-unsupported-tag`, `converted-unsupported-wrapper`, `split-text-wrapper`) — surface them instead of swallowing them.
   - **Class-mapping decisions** — for each source class, the site-style-plan verdict: `reuse <existing Webflow class>` or `create <client-first name>`. This makes class duplication/pollution visible at a glance.
3. **Make text extraction inspectable.** For each node, show the `textContent` that was extracted. Flag any text that contains suspicious tokens (`<`, `>`, `className`, `{`, `}`, `--`, stray line breaks) so the content-pollution failure mode is impossible to miss while iterating.
4. **Save-as-fixture loop.** A button that writes the current paste **and** its produced `BuildNode`/`SkeletonPlan` to `test/fixtures/html/<name>.input.html` + `<name>.expected.json` (and/or appends a case to the HTML-parser test). Any HTML that exposes a bug becomes a permanent regression test, so fixes never silently regress. This is the bug-fixing workflow the playground exists for, made durable.
5. **Keep it debug-gated.** It already lives behind the debug-mode entry from Welcome — keep it out of the normal build flow; it's a developer tool.

---

## 3. Phased tasks (ship after each)

- **Phase 1 — Detection + HtmlExtractor.** Add `detectRepoType`, branch in `repo-sync-service.ts`, implement `HtmlExtractor` emitting the same `RepoPageRecord`/`RepoSectionRecord` + snapshot. Persist `repoType`. (No skeleton changes yet — verify pages/sections show up in "map pages" for an HTML repo.)
- **Phase 2 — Deterministic HTML → BuildNode.** Add the Workers-safe DOM parser; build `htmlToBuildNode()` (promoting `parseHtmlOutline`/`htmlFallbackSkeleton`), text-from-text-nodes, classes preserved, cruft stripped. Route `generateSkeleton` to it when `repoType === "html"`. Keep React's `HeuristicBuildPlanner` path as-is.
- **Phase 3 — Class mapping.** Run HTML classes through `SiteStylePlanService` (reuse/create) so styling references the global plan instead of inventing duplicates.
- **Phase 4 — Playground parity + dev harness + tests.** Make the debug playground's `inputType: "html"` use the exact same `htmlToBuildNode()` path, and build it out as the dev/debug harness in §2.6 (BuildNode tree + warnings + class-mapping panels, text-extraction inspector, and the save-as-fixture loop). Add fixtures + tests.

---

## 4. Acceptance criteria
- Selecting an HTML repo lists its pages/sections in "map pages" (Phase 1).
- For an HTML section, the generated skeleton's element **text contains only real content** — no tags, class names, attribute values, or line-break artifacts (Phase 2). Add a regression test asserting this on a fixture with messy class lists and multi-line text.
- HTML `class` attributes are **mapped** (not dropped); a section using existing Webflow classes resolves to `reuse`, novel ones to `create` (Phase 3).
- The React repo path is **unchanged** — existing planner/serializer/executor tests stay green.
- Same `SkeletonPlan` contract downstream: gates, node-handle persistence, site style plan, and build report all function for an HTML repo with no changes to those modules.
- The debug playground "HTML" mode produces the **same** skeleton as building that section from a repo.
- The playground surfaces the BuildNode tree, the parser **warnings**, and the **class-mapping** (reuse/create) decisions, flags suspicious text, and its **save-as-fixture** writes input + expected output that the test suite then runs (§2.6).

## 5. Guardrails
1. **Don't change React-path behavior.** Branch by `repoType`; the existing deterministic React planner stays.
2. **Text from text nodes only** — the whole point. No attributes/script/style as content.
3. **Map classes, don't strip them** on the HTML path. The `isBuilderClassName` filter is for LLM-emitted DSL, not real HTML.
4. **No text-DSL round-trip on the build path** — produce `BuildNode` directly; the DSL (`extension/src/skeleton/tree.ts`) stays only for the manual edit feature.
5. **Workers-safe parser only** (`node-html-parser`/`parse5`) — no headless browser, no DOM globals; runs in the Cloudflare Worker. Capture/rendering is done by the user offline.
6. **Same downstream contracts** (`RepoPageRecord`/`RepoSectionRecord`/`SkeletonPlan`) — reuse `replaceRepoIndex` and the existing tables; no schema change needed beyond an optional `repoType`.
7. **Mind D1 limits** if you add any bulk writes (≤ ~90 bound params per statement; keep the existing chunk helper).
8. **Scope:** structure + classes + content now. CSS-property styling from the repo's CSS files and responsive breakpoints are a **later phase** — not required for this task.
