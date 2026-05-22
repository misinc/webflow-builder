# Architecture: Repo-Based Webflow Section Builder v1

## Summary
This system should be built as:

**a deterministic repo extraction pipeline plus an LLM planning brain plus a validated Webflow execution layer**

The correct high-level architecture is:
- `GitHub Repo`
- `Repo Ingestion Service`
- `Deterministic Extraction Layer`
- `LLM Planning Layer`
- `Plan Validator`
- `Webflow Designer Extension`
- `Webflow Designer APIs`

The backend should be hosted on Netlify.

Recommended platform:
- `Netlify` for backend hosting
- `Postgres` via `Neon` or `Netlify Database` for structured data
- `Netlify Blobs` for cached artifacts and generated build outputs
- `Webflow Designer Extension` as the in-Webflow UI and execution surface

---

## High-Level Architecture

```text
GitHub Repo
   ↓
Repo Ingestion Service
   ↓
Deterministic Extraction Layer
   ├─ page discovery
   ├─ section discovery
   ├─ stylesheet loading
   ├─ asset extraction
   └─ source context packaging
   ↓
LLM Planning Layer
   ├─ section interpretation
   ├─ skeleton tree generation
   ├─ class reuse decisions
   ├─ new class decisions
   └─ Webflow build-plan generation
   ↓
Plan Validator
   ├─ schema validation
   ├─ naming rules validation
   ├─ shared-class policy validation
   ├─ variable usage validation
   └─ unsupported-action detection
   ↓
Webflow Designer Extension
   ├─ Webflow auth + context binding
   ├─ placement selection
   ├─ build execution
   └─ result reporting
   ↓
Webflow Designer APIs
```

---

## Core Responsibilities

## 1. Repo Ingestion Service
Responsibilities:
- connect to GitHub
- fetch repo metadata and source files
- read target branches/commits
- cache repo sync state by branch and commit SHA

Outputs:
- raw repo files
- sync metadata
- file graph metadata

This layer is deterministic.

## 2. Deterministic Extraction Layer
Responsibilities:
- identify page entrypoints
- identify section components used by a page
- locate relevant stylesheets
- locate asset references
- extract content and props when possible
- package all relevant context for a single section

Outputs:
- `SectionContext`
- `ProjectContext`
- `SharedStyleContext`

This layer is deterministic.

## 3. LLM Planning Layer
The "brain" of the product.

Responsibilities:
- interpret `SectionContext`
- decide the best skeleton tree
- assign Client-First class names
- choose shared class reuse vs new classes
- map design intent to variables and utility classes
- produce a machine-readable `BuildPlan`
- flag ambiguity or unsupported behavior

Outputs:
- `BuildPlan`
- `PlannerWarnings`

This layer is probabilistic and must be bounded by schema and rules.

## 4. Plan Validator
Responsibilities:
- validate planner output against JSON schema
- reject invalid element structures
- reject disallowed class names
- reject plans that ignore required shared classes
- reject plans that use unsupported mutations
- normalize safe defaults when possible

Outputs:
- `ValidatedBuildPlan`
- validation errors or warnings

This layer is deterministic.

## 5. Webflow Designer Extension
Responsibilities:
- authenticate to backend
- read current Webflow site/page context
- let user choose placement
- request a build plan
- execute the validated plan through Webflow APIs
- show build results and warnings
- record build result back to backend

This layer is deterministic at execution time.

---

## Webflow Authentication and Site Binding

## Principle
The active Webflow Designer Extension instance is the source of truth for which Webflow site and page are being targeted.

## Required flow
1. User opens the Designer Extension inside the target Webflow site.
2. Extension reads active Webflow context:
   - `siteId`
   - `pageId`
   - current Designer mode
   - selected element id, when needed for placement
3. User authenticates the extension to the backend.
4. Backend associates the current user with:
   - repo
   - Webflow site id
   - project ruleset
5. Every build request includes:
   - user/session token
   - `webflowSiteId`
   - `webflowPageId`
   - placement mode
   - placement target
   - selected repo section
6. Before build execution, the extension confirms the active context still matches the request.
7. If site/page/mode context is invalid, execution is blocked.

## Fail-safe requirements
The system must reject execution if:
- no active site is detected
- no current page is detected
- the user is not in an editable Designer mode
- the extension context does not match the requested target

---

## Required Internal Interfaces

## SectionContext
Minimum structured input for the planner.

Recommended fields:
- `repoId`
- `pageName`
- `pageSourceFile`
- `sectionName`
- `sectionSourceFile`
- `componentName`
- `sectionOrder`
- `sourceCode`
- `relevantStylesheets`
- `assetReferences`
- `contentHints`
- `relatedSharedClasses`

## ProjectContext
Shared project rules and conventions.

Recommended fields:
- `namingRules`
- `sharedTextClasses`
- `sharedHeadingClasses`
- `sharedButtonClasses`
- `spacingVariableRules`
- `colorVariableRules`
- `forbiddenPatterns`
- `allowedNewClassPolicy`

## BuildPlan
Planner output executed by the extension.

Recommended fields:
- `sectionMetadata`
- `elementTree`
- `classAssignments`
- `styleDefinitions`
- `variableBindings`
- `assetBindings`
- `warnings`

This object must be schema-validated before execution.

---

## Data Model

## repos
Fields:
- `id`
- `name`
- `owner`
- `provider`
- `repo_url`
- `default_branch`
- `status`
- `created_at`
- `updated_at`

## repo_syncs
Fields:
- `id`
- `repo_id`
- `commit_sha`
- `branch`
- `status`
- `started_at`
- `completed_at`
- `error_message`

## repo_pages
Fields:
- `id`
- `repo_id`
- `name`
- `route`
- `source_file`
- `sort_order`
- `metadata_json`

## repo_sections
Fields:
- `id`
- `repo_id`
- `page_id`
- `name`
- `section_key`
- `source_file`
- `import_path`
- `sort_order`
- `component_name`
- `metadata_json`

## project_rulesets
Fields:
- `id`
- `repo_id`
- `name`
- `version`
- `rules_json`
- `created_at`
- `updated_at`

## webflow_site_bindings
Stores the backend association between a user, repo, and Webflow site.

Fields:
- `id`
- `user_id`
- `repo_id`
- `webflow_site_id`
- `ruleset_id`
- `created_at`
- `updated_at`

## build_jobs
Fields:
- `id`
- `repo_id`
- `page_id`
- `section_id`
- `webflow_site_id`
- `webflow_page_id`
- `placement_mode`
- `placement_target`
- `status`
- `requested_by`
- `started_at`
- `completed_at`
- `error_message`

## build_results
Fields:
- `id`
- `build_job_id`
- `result_json`
- `created_at`

---

## Storage Split

## Postgres
Use for:
- repos
- syncs
- pages
- sections
- build jobs
- build results
- project rulesets
- Webflow site bindings

## Netlify Blobs
Use for:
- cached extracted context
- serialized planner inputs
- serialized planner outputs
- debug artifacts
- future screenshots or visual QA artifacts

Suggested blob key shape:
- `repos/{repoId}/syncs/{commitSha}/tree.json`
- `repos/{repoId}/sections/{sectionId}/plan/{hash}.json`
- `build-jobs/{jobId}/result.json`

---

## API Endpoints

## Repo endpoints
### `POST /api/repos/connect`
Connect a GitHub repo.

### `POST /api/repos/:repoId/sync`
Re-index a repo.

### `GET /api/repos/:repoId/tree`
Return hierarchical page/section structure.

## Webflow binding endpoints
### `POST /api/webflow/bind-site`
Bind the authenticated user and repo to the active Webflow site.

Input:
- `repoId`
- `webflowSiteId`
- optional ruleset selection

### `GET /api/webflow/bindings/:repoId`
Return stored Webflow site binding for a repo.

## Build endpoints
### `POST /api/build/plan`
Generate a build plan for a selected section.

Input:
- `repoId`
- `pageId`
- `sectionId`
- `webflowSiteId`
- `webflowPageId`
- placement metadata

Output:
- structure tree
- class assignments
- style plan
- variable bindings
- warnings

### `POST /api/build/jobs`
Create a build job record.

### `POST /api/build/jobs/:id/complete`
Record build result from extension.

### `GET /api/build/jobs/:id`
Return build status and result.

---

## Execution Flow

## Step 1: Repo sync
Backend indexes:
- pages
- sections
- styles
- assets

Parsed hierarchy is stored in DB.
Expensive intermediate output is cached in Blobs.

## Step 2: Site binding
Extension reads active Webflow site/page context.
Extension authenticates to backend.
Backend stores or verifies repo-to-Webflow site binding.

## Step 3: Section selection
Extension loads repo tree.
User selects:
- repo
- page
- section
- placement target

## Step 4: Extract
Backend loads repo files and produces deterministic context for the selected section.

## Step 5: Plan
LLM receives:
- section context
- project rules
- shared Webflow conventions

LLM returns:
- proposed section build plan

## Step 6: Validate
Backend validates:
- schema correctness
- naming rules
- style reuse policy
- variable usage policy

If invalid:
- return error
- do not execute in Webflow

## Step 7: Execute
Extension receives validated plan and builds:
- structure
- classes
- styles
- variable-backed values

## Step 8: Record
Backend stores:
- plan
- execution result
- warnings
- duration

## Step 9: Manual review
User reviews in Designer before continuing.

---

## Prompting and Guardrails
The LLM should not receive the whole repo blindly.

Backend should provide:
- only the selected section
- relevant page context
- relevant stylesheets
- explicit shared design-system rules
- explicit output schema

Guardrails:
- strict output schema
- required class reuse instructions
- explicit naming conventions
- explicit prohibition on page-scoped class names
- explicit variable reuse requirements

---

## Failure Modes
The architecture must explicitly handle:
- section parse failure
- missing stylesheet context
- unsupported interaction logic
- invalid planner output
- missing/invalid Webflow site context
- Webflow mutation failure
- partial build execution

For v1, failures should be surfaced as actionable messages.

---

## Recommended Tech Stack

## Backend
- TypeScript
- Netlify Functions
- Postgres via Neon or Netlify Database
- Drizzle ORM
- Netlify Blobs
- GitHub API or repo clone workflow
- LLM provider for build planning

## Extension
- React
- TypeScript
- Webflow Designer Extension SDK / APIs

---

## v1 Milestones

## Milestone 1: Repo indexing
- connect repo
- parse pages and sections
- store hierarchy
- expose repo tree API

## Milestone 2: Site binding
- read active Webflow context
- authenticate extension to backend
- store repo-to-site binding

## Milestone 3: Section planner
- generate validated build plan for Hero
- generate validated build plan for Services
- generate validated build plan for Solutions

## Milestone 4: Extension MVP
- load repo tree
- pick section
- choose placement
- call build-plan API
- execute plan in Webflow

## Milestone 5: Result tracking
- save build jobs
- save build results
- show summary and warnings

---

## Acceptance Criteria
- user can connect a GitHub repo
- backend can index repo pages and sections
- extension can show hierarchical page/section browser
- extension can detect active Webflow site and page
- backend can bind repo to current Webflow site
- user can choose insertion location
- Hero can be built into Webflow from repo source
- Services can be built into Webflow from repo source
- Solutions can be built into Webflow from repo source
- build result records reused classes and created classes
- workflow stops after each section for review

---

## Recommendation
For v1:
- `Netlify` should host the backend
- `Postgres` should store structured app state
- `Blobs` should cache compiler artifacts
- `Webflow Extension` should be the in-Designer control surface
- the active extension instance should be the source of truth for target Webflow site/page context
