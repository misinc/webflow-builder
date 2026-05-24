# Webflow Builder Extension V2 Roadmap

## Summary
Ship V2 in phases, starting with a clickable prototype inside the real extension rather than attempting the full UI, auth, backend, and Webflow-runtime rewrite in one pass.

The immediate goal is to replace the current extension shell with the new 16-screen HyperAgent flow, backed by realistic mock state and in-extension navigation. After the UX is stable in the real 800×600 extension surface, progressively wire it to live data and then to mutating workflows.

This file is the canonical continuation plan for future threads.

## Delivery Strategy
### Phase 1: clickable V2 shell in the real extension
- Port the `new-ui/` design system, primitives, and screen structure into `extension/src`.
- Replace the current `settings | mappings | workspace` shell with the V2 route/state model.
- Implement all 16 screens as a clickable in-extension prototype:
  - onboarding: screens `01–04`
  - section flow: screens `05–11`
  - settings and progress: screens `12–13`
  - edge cases: screens `14–15`
  - component opportunities: screen `16`
- Keep state local for this phase, but shape it like the final product:
  - signed-in user
  - selected GitHub account/org
  - selected repo
  - page mappings
  - current Webflow page
  - section statuses and progress
  - component-opportunities banner visibility and dismiss state
  - selected detected component opportunities
- Use realistic mock data derived from the current product model, not placeholder lorem states.
- Preserve the actual extension size and runtime entrypoint so the UI can be validated inside the Webflow extension surface.

### Phase 2: read-only dynamic data
- Keep the V2 shell and replace static demo state with live read paths incrementally.
- Wire session bootstrap and signed-in account state first.
- Wire repo list and repo metadata next.
- Wire Designer context and current page detection next.
- Wire page mappings, section queue, progress rollups, and unmapped-page behavior after that.
- Add read-only component-opportunity detection so the Section List banner and screen 16 are driven by real codebase analysis.
- Keep this phase non-destructive where possible: users should be able to inspect real data before any new mutating workflows are turned on.

#### Phase 2 task breakdown
- Session and identity
  - Replace mock signed-in user/account data with real session bootstrap.
  - Surface the authenticated GitHub/App identity in onboarding and settings.
  - Remove prototype-only identity assumptions from the V2 state store.
- Repository selection
  - Load real org/account choices for the repo picker.
  - Load real repositories, search/filter them, and show actual metadata such as default branch, language, and updated-at values.
  - Keep repo selection read-only in this phase aside from choosing which already-available repo to inspect.
- Webflow Designer context
  - Read the active site/page from the real bridge.
  - Subscribe to page changes so the V2 shell reacts when the user navigates in Designer.
  - Load the real site page list for mapping and site progress screens.
- Page mappings
  - Replace mocked mapping rows with persisted mapping data.
  - Drive screens `03`, `12`, `13`, and `14` from real mapping state.
  - Show accurate mapped/unmapped counts and real current-page unmapped behavior.
- Section queue and progress
  - Replace mocked section rows and counts with the real workflow queue.
  - Drive Section List, Section Complete, Page Complete, and Site Progress from persisted workflow state.
  - Preserve the UI-only shell behavior for now: no new write paths from the V2 shell in this phase.
- Component opportunities, read-only
  - Add a detection/read model for repeated patterns in the repo/codebase.
  - Drive the Section List banner from real detected opportunities.
  - Populate screen `16` with real candidate patterns, confidence, file counts, instance counts, and inferred props where available.
  - Keep component creation disabled or non-mutating until Phase 3.
- Out of scope for Phase 2
  - No page creation write path from screen `04`.
  - No skeleton insertion/styling mutations from the new shell.
  - No approve/skip persistence triggered from the new shell.
  - No Webflow Component creation from screen `16`.

### Phase 3: mutating workflows
- Turn on write paths after the V2 shell and read models are stable.
- Implement page creation from screen `04`.
- Implement section actions in the V2 flow:
  - generate skeleton
  - edit and save/discard skeleton changes
  - insert into Webflow
  - apply styles
  - approve
  - skip
- Implement component creation from screen `16` so promoted opportunities become real Webflow Components used by later builds.
- Add cancellation and rollback behavior for skeleton/style runs.
- Keep approval final for V2 unless a later roadmap explicitly adds rebuild/undo affordances.

## Product Flow
### Core UX
- The extension opens into the new V2 shell, not the old utility workspace.
- On first run, the user moves through:
  - `01 Welcome`
  - `02 Choose repository`
  - `03 Map Webflow pages to repo pages`
  - optional `04 Create a new Webflow page`
- After setup, the default home base is `05 Section list`.
- The section build loop remains:
  - `06 Generating skeleton`
  - `07 Skeleton review`
  - `08 Skeleton edit`
  - `09 Applying styles`
  - `10 Section complete`
  - `11 Page complete`
- Settings and bird’s-eye progress remain separate destinations:
  - `12 Site progress`
  - `13 Settings`
- Edge states remain first-class:
  - `14 Not mapped`
  - `15 Error`

### Component opportunities
- The V2 flow now includes screen `16 Component opportunities`.
- Screen `05 Section list` shows a dismissible banner between the page header and the section list when repeated patterns are detected in the repo/codebase.
- The banner is the entry point to screen `16`.
- Screen `16` is an optional pre-build setup step across pages:
  - detected reusable patterns on the left
  - selected pattern detail on the right
  - confidence, occurrence counts, and inferred props
  - multi-select via checkboxes
  - create-selected-components action
- The intended product behavior is:
  - if a pattern is promoted to a Webflow Component before build, later section builds should instance that component instead of inserting duplicated raw structures
  - if the user skips or dismisses the banner, normal section building still works
- Banner dismiss state should be local in Phase 1 and then tied to persisted workflow/setup state in later phases.

## Implementation Changes
### Frontend architecture
- Introduce a V2 app state/store dedicated to the new flow instead of extending the current monolithic `App.tsx` state tree further.
- Separate:
  - navigation state
  - session/repo state
  - mapping state
  - queue/progress state
  - active section-run state
  - component-opportunity state
- Reuse the prototype’s component decomposition where practical:
  - panel chrome
  - headers
  - buttons
  - badges
  - stepper
  - loading states
- Keep Tailwind as the styling system for V2 so the shipped UI stays close to `new-ui/`.

### Backend and contracts
- Do not block Phase 1 on backend/auth completion.
- Backend changes still needed for later phases:
  - session/auth bootstrap for GitHub App sign-in
  - repo listing for the signed-in user/installations
  - existing repo connect/sync/tree reuse after selection
  - mapping, queue, section-run, and progress endpoints remain part of the final shape
  - component-opportunity analysis endpoint(s) and component-creation workflow will be needed for screen `16`
- Existing workflow persistence remains the source of truth once dynamic wiring begins.

### Webflow bridge
- Do not block Phase 1 on full Designer API coverage.
- Later phases still need bridge support for:
  - current page detection
  - page-change subscription
  - page enumeration
  - page creation
  - page switching
  - component creation/instancing hooks for promoted opportunities
- The production bridge should continue to wrap raw Webflow APIs instead of letting screens call `window.webflow` directly.

## Public Interfaces and Types
- V2 frontend state should explicitly model:
  - `currentScreen`
  - `session`
  - `selectedRepo`
  - `pageMappings`
  - `workflowQueue`
  - `pageProgress`
  - `siteProgress`
  - `componentOpportunities`
  - `componentBanner`
- `componentOpportunities` should support:
  - detected pattern id
  - label/name
  - confidence
  - instance count
  - file count
  - inferred props
  - selected state
  - promoted/created state
- Final backend-facing contracts should still preserve the earlier V2 workflow types:
  - `SectionAnalysis`
  - `SkeletonPlan`
  - `StylingPlan`
  - `SectionVerification`
  - `WorkflowQueueItem`
  - `PageMapping`
  - `SectionWorkflowState`
  - plus new component-opportunity analysis/result types

## Test Plan
- Phase 1:
  - all 16 screens render inside the real extension
  - screen-to-screen navigation matches the prototype
  - section header, list, footer, and status states match the spec visually
  - the component-opportunities banner appears on Section List when enabled
  - the banner dismisses correctly
  - the Review button reaches screen `16`
  - screen `16` supports selection and back/skip/create CTA flows at the prototype level
- Phase 2:
  - signed-in session state loads correctly
  - repo listing, page mappings, queue, progress, and unmapped states render from live data
  - component-opportunity detection drives the Section List banner and screen `16`
- Phase 3:
  - page creation works
  - section build flow works end-to-end
  - component creation works and later builds use promoted components
  - cancellation and rollback behave correctly

## Assumptions and Defaults
- The recommended path is UI-first, then read-only data, then mutating workflows.
- V2 remains the active naming for this rewrite in branches, PRs, and roadmap references.
- Tailwind is adopted for the V2 extension UI.
- Phase 1 is intentionally allowed to use mock data, but the mock state must mirror the final product shape closely enough that later wiring is mostly data substitution rather than UI redesign.
- The new component-opportunities flow is part of V2, not a post-V2 enhancement.
- The current end-to-end rewrite plan is superseded by this phased delivery strategy.
