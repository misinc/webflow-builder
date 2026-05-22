# Guided Webflow Builder V2 Plan

## Summary
Replace the current one-shot `Build Section` extension with a guided, section-by-section workflow that mirrors the successful `webflow-site-builder` process and follows Webflow’s Designer App standards from the start. The extension becomes a native-feeling page workspace: configure once, map Webflow pages to repo pages site-wide, then for any current Webflow page automatically load the mapped repo page, walk its sections in order, build/style one section at a time, and advance through approve/skip actions.

This file is the canonical continuation plan for future threads.

## Implementation Changes
### Product workflow
- Replace the primary UI flow with a guided page workflow:
  - `Settings`: connect repo, sync repo, bind Webflow site, configure provider/model, choose default workflow mode.
  - `Page mappings`: show all Webflow pages for the bound site and a repo-page dropdown for each one.
  - `Section workspace`: show the ordered queue for the mapped repo page and focus the user on one current section.
  - `Review`: present skeleton/styling output, warnings, and actions to approve, skip, retry, or continue.
- Support three modes, with `Full Assist` as the default:
  - `Full Assist`: generate skeleton, insert/build it, style it, stop for approval.
  - `Skeleton Then Style`: propose skeleton first, then style after approval/build confirmation.
  - `Style Existing Section`: inspect an existing Webflow section and style only.
- Remove the current one-shot `Build Section` product surface entirely.
- Add section actions:
  - `Generate skeleton`
  - `Insert skeleton`
  - `Style current section`
  - `Refine styling`
  - `Approve and next`
  - `Skip section`
  - `Mark page complete`
- After approval or skip, automatically advance to the next section in source order.
- When all sections on a mapped page are complete, show a page-complete state and prompt for the next mapped Webflow page.

### Site-wide page mapping
- Move page mapping from an ad hoc per-page choice into a persistent site configuration screen.
- Show every Webflow page in the bound site in a table/list with:
  - Webflow page name
  - Webflow page ID or route
  - repo page dropdown
  - mapping status
- Allow pages to remain intentionally unmapped.
  - Unmapped pages are excluded from the guided workflow.
  - Mapped pages participate in section queues and page completion tracking.
- Auto-load the mapped repo page whenever the user opens the extension on a Webflow page that already has a saved mapping.
- Provide bulk actions:
  - save mappings
  - clear mapping for a page
  - filter to mapped/unmapped pages
- Treat the site-wide mapping screen as part of setup, but allow it to be revisited at any time.

### UI and Webflow design standards
- Redesign the extension UI to follow Webflow Designer App guidance:
  - vertical stacked layout
  - full-width controls and primary actions
  - sentence-case copy
  - no horizontal scrolling
  - consistent 4px-based spacing rhythm
  - Inter typography
  - Webflow-hosted CSS variables for colors so the app follows Designer appearance settings
- Replace the current branded landing-page aesthetic with a native-feeling utility UI.
- Use Webflow-style panels, grouped settings, compact status rows, helpful empty states, and actionable error banners.
- Keep the extension at Webflow’s large app size and design within that constraint.
- Add UI states for:
  - repo not connected
  - repo synced but site not bound
  - site bound but mappings incomplete
  - current Webflow page unmapped
  - no section selected
  - selected section ready for styling
  - section approved
  - section skipped
  - page complete
- Add app-intent-ready structure so the extension can later be launched contextually from relevant Designer workflows.

### Backend and persistence
- Introduce persistent workflow tables in Postgres:
  - `webflow_page_mappings`
    - `webflowSiteId`, `webflowPageId`, `repoId`, `repoPageId`, `userId`
  - `section_workflow_states`
    - `webflowPageId`, `repoPageId`, `repoSectionId`, `userId`, `status`, `sortOrder`, timestamps
  - `section_runs`
    - section analysis input snapshot, generated skeleton plan, styling plan, execution summary, approval outcome
- Keep repo sync, shared-style context, and repo snapshot persistence, but treat them as workflow inputs rather than the final build artifact.
- Add workflow endpoints:
  - `GET /api/workflow/site-pages`
  - `POST /api/workflow/page-mappings`
  - `GET /api/workflow/page-mappings`
  - `GET /api/workflow/queue`
  - `POST /api/workflow/section/analyze`
  - `POST /api/workflow/section/generate-skeleton`
  - `POST /api/workflow/section/style`
  - `POST /api/workflow/section/approve`
  - `POST /api/workflow/section/skip`
  - `POST /api/workflow/page/complete`
- Keep build-job/result tracking only for concrete Webflow mutations. Analysis-only and skeleton-only passes should be stored as section runs.

### Planner and AI architecture
- Replace `HeuristicBuildPlanner` as the primary path with a pluggable provider interface.
- Implement only one provider initially:
  - `OpenAIPlanningProvider`
  - default model: `gpt-5.4`
- Use a provider abstraction from the start so OpenAI is the default implementation but not hardwired into the rest of the system.
- Split planning into distinct passes:
  - `SectionAnalysis`
  - `SkeletonPlan`
  - `StylingPlan`
  - `SectionVerification`
- Use OpenAI structured outputs for the OpenAI adapter, but keep provider-facing contracts provider-neutral.
- Stop relying on regex-only `contentHints` as the main section representation. Add a richer MIS serializer that extracts:
  - real headings and copy
  - card/list item structures
  - icon and asset references
  - CTA/button intent
  - layout groups and content hierarchy
- Keep validation and execution safeguards after model output. Invalid model output should be rejected or downgraded to warnings before mutation.
- Remove the heuristic planner from the user-facing flow rather than keeping it as an alternate mode.

### Webflow runtime behavior
- Extend the current real Designer bridge with better section-target inspection:
  - detect selected section wrapper
  - inspect selected subtree
  - inspect neighboring sections
  - inspect reusable classes and variables
- For `Style Existing Section`, require an explicit selected section root or a user-confirmed target wrapper.
- For `Full Assist`, insert only the approved skeleton before styling.
- Before every mutating step, verify editable mode, active site, active page, selected target, and user capability.
- Keep rollback, but scope it only to the current section action.

## Public Interfaces and Types
- Replace the single-plan mental model with separate contracts:
  - `SectionAnalysis`
  - `SkeletonPlan`
  - `StylingPlan`
  - `SectionVerification`
  - `WorkflowQueueItem`
  - `PageMapping`
  - `SectionWorkflowState`
  - `SitePageMappingRow`
- `SitePageMappingRow` should include:
  - `webflowPageId`
  - `webflowPageName`
  - `webflowPageRoute` when available
  - `repoPageId | null`
  - `repoPageName | null`
  - `mappingStatus`
- `WorkflowQueueItem` should include:
  - `repoSectionId`
  - `sectionName`
  - `sortOrder`
  - `status`
  - `recommendedMode`
  - `lastRunId`
- `SectionWorkflowState.status` values:
  - `not_started`
  - `in_progress`
  - `skeleton_ready`
  - `styled`
  - `approved`
  - `skipped`
- The extension should auto-load the next unfinished section for the mapped page.

## Test Plan
- Repo connection, sync, and site binding still work after the workflow refactor.
- Site-wide page mappings persist and reload for the same user + Webflow site.
- The mappings screen lists all Webflow pages and allows any page to remain unmapped.
- The current Webflow page automatically resolves to its mapped repo page when a mapping exists.
- Unmapped pages are excluded from the workflow and show a clear unmapped state instead of blocking the whole app.
- Section queue loads in repo order and auto-advances after `approve` and `skip`.
- `Style Existing Section` refuses to run without a valid selected section target.
- `Full Assist` generates skeleton first, then styles only after the approved sequence.
- OpenAI provider output parses into valid `SectionAnalysis`, `SkeletonPlan`, `StylingPlan`, and `SectionVerification` contracts.
- Invalid or partial model output fails safely and does not mutate Webflow.
- Existing shared classes and variables are preferred over new ones during styling.
- New classes remain Client-First and function-based, never page-prefixed.
- Approved and skipped sections remain persisted after reload and in a new browser session.
- Section-scoped rollback removes only nodes/styles created during the current action.
- The redesigned UI uses Webflow-native layout patterns, full-width controls, sentence-case copy, no horizontal scroll, and hosted CSS variables.
- Legacy one-shot `Build Section` UI is no longer exposed.

## Assumptions and Defaults
- Default workflow mode is `Full Assist`, but all three modes are supported.
- Persistent workflow state lives in Postgres, not local-only storage.
- OpenAI is the only provider implemented initially, via a pluggable provider interface, with `gpt-5.4` as the default model.
- The redesign targets Marketplace-grade Webflow app standards from the start.
- Page mappings are configured site-wide and can intentionally leave some Webflow pages unmapped.
- The current heuristic planner is removed from the user-facing flow.
- The extension remains section-scoped and preserves the site’s existing design system, variables, fonts, navbar, and footer.
