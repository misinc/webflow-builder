# PRD: Repo-Based Webflow Section Builder v1

## Product Summary
The Repo-Based Webflow Section Builder is a tool that lets a user connect a GitHub repo, browse pages and sections from that repo, select a section, choose where it should be inserted on the active Webflow page, and automatically build and style that section inside Webflow using native Designer APIs.

The goal is to replace the current workflow of:
- asking for a skeleton tree
- manually creating elements in Webflow
- manually assigning classes
- asking for styling afterward

with:
- connect repo
- select section
- choose placement
- build and style
- review
- continue

V1 assumes GitHub repo access is always available.

---

## Problem
Building a coded site in Webflow is too slow because structure creation and styling are split across multiple manual steps. The biggest bottleneck is repetitive manual execution inside Webflow, not design judgment alone.

---

## Target User
Primary user:
- designer/developer migrating existing coded marketing sites into Webflow

Assumptions:
- GitHub repo access is always available
- the user is comfortable reviewing output manually in Webflow
- the user wants page-ready native sections, not reusable components yet

---

## Goals
Primary goals:
- reduce per-section build time by at least 50%
- build native Webflow sections directly from repo source
- reuse existing project styles, variables, and Client-First naming rules
- keep the workflow section-by-section with manual review after each build

Success metrics:
- simple sections built in 3-7 minutes total
- medium sections built in 8-18 minutes total
- 80%+ of selected sections build without manual element creation
- 80%+ of shared typography/button/spacing classes are reused instead of recreated

---

## Non-Goals for v1
- URL scraping mode
- full-page auto-generation
- conversion into reusable Webflow components
- reverse-engineered clipboard/Relume-like import
- multi-page batch generation
- advanced interaction recreation like GSAP timelines
- publishing workflows

---

## Core User Story
As a user, I want to select a section from my GitHub repo and have it built and styled in Webflow at a chosen location so I can review it and move to the next section without manually rebuilding structure.

---

## User Workflow
1. User opens the Webflow Designer for the target site.
2. User opens the Webflow Designer Extension.
3. User authenticates to the backend if not already signed in.
4. User connects or selects a GitHub repo.
5. System parses the repo and shows a hierarchical list of pages and sections.
6. User selects a target page position in Webflow.
7. User selects one repo section.
8. User clicks `Build Section`.
9. System creates the section in Webflow and applies styling.
10. System shows a summary:
   - reused classes
   - new classes created
   - variables used
   - warnings
11. User reviews the section in Webflow.
12. User proceeds to the next section.

---

## AI Brain
The product requires an explicit AI planning layer.

The correct mental model is:
- `Extractor` = gathers facts from the repo
- `LLM Planner` = makes section-building decisions
- `Executor` = builds the approved plan in Webflow

The AI layer is responsible for:
- interpreting the selected section from repo context
- generating the skeleton tree
- assigning Client-First class names
- deciding which existing shared classes to reuse
- deciding when a new class is necessary
- mapping styling intent into Webflow variables and shared utility classes
- returning a structured build plan

The AI layer must not:
- directly mutate Webflow
- bypass validation
- infer undocumented Webflow internals

---

## Functional Requirements

## 1. Repo Input
- Accept a GitHub repo as the source of truth.
- Read the repo structure and detect:
  - pages
  - section components
  - imported assets
  - relevant stylesheets
  - content dependencies
- Support the repo pattern used in the MIS codebase:
  - `src/app/pages/*`
  - `src/app/components/sections/*`
  - `src/styles/*`

## 2. Section Discovery
- Build a hierarchical browser:
  - Page
  - Sections used by that page
- Each section item should expose:
  - section name
  - source file
  - likely display order on the page
  - confidence / parse status

## 3. AI Build Planning
- The backend must include an LLM-backed planning layer.
- The planner must consume extracted repo context plus project rules.
- The planner must return a structured Webflow build plan for a single section.
- The planner must not directly mutate Webflow.
- Planner output must be validated before execution.

## 4. Build Flow
For a selected section, the system must generate:
- structure tree
- semantic element types
- Client-First class names
- shared class reuse decisions
- required new class definitions
- variable usage plan
- assets needed
- warnings for unsupported patterns

The system must then:
- build the section directly into Webflow
- apply existing shared styles where possible
- create new styles only when required
- reuse variables instead of hardcoded values where supported

## 5. Placement in Webflow
- User can choose placement in the tool before building.
- Supported placements in v1:
  - append to end of current page body
  - insert after selected section/element
- Tool must verify current Webflow page context before building.

## 6. Styling Rules
- Shared utilities must be preferred for:
  - heading styles
  - text sizes
  - text weights
  - text styles
  - text alignment
  - buttons
- Section-specific classes should retain only unique layout/visual rules that are not truly shared.

## 7. Review Summary
After build, show:
- success/failure
- inserted section name
- Webflow page and location
- reused classes
- new classes created
- missing assets
- unsupported interactions or fidelity warnings

---

## Webflow Authentication and Site Binding
V1 must explicitly define how the tool knows which Webflow site and page to build into.

### Source of truth
The active Webflow Designer Extension instance is the source of truth for the current target site.

### Required flow
1. User opens the Designer Extension inside the target Webflow site.
2. The extension reads the active Webflow context:
   - `siteId`
   - current page id
   - current Designer mode
   - selected element, if needed for placement
3. The extension authenticates the user to the backend.
4. The backend stores a connection record tying:
   - user
   - repo
   - Webflow site id
   - project ruleset
5. Every build request must include:
   - authenticated user/session
   - `webflowSiteId`
   - `webflowPageId`
   - placement target
   - selected repo section
6. Before execution, the extension must confirm the active Designer context still matches the intended target.
7. The extension must only build into the currently attached Webflow site and page, never a guessed one.

### Requirement
The system must fail safely if:
- the extension is not attached to a valid Webflow site
- the current page cannot be determined
- the user is in a non-editable mode
- the site/page context changes before build execution

---

## Non-Functional Requirements
- Build action should complete in under 30 seconds for most sections.
- Repo parsing results should be cached.
- Build operations should be safe to retry after failure.
- Extension UI should remain responsive during backend processing.
- System should fail with actionable messages, not silent partial output.

---

## UX Requirements
Main screens:
- repo connection screen
- page/section browser
- build panel with:
  - current Webflow page
  - insertion target
  - selected section
  - build button
- result panel with warnings and reuse summary

UX principles:
- one section at a time
- minimal required decisions
- no hidden mutation
- always show what was reused vs created

---

## Product Shape

## 1. Backend Compiler
Responsibilities:
- connect to GitHub
- fetch repo content
- parse pages and sections
- extract section structure and styling intent
- run the LLM planner
- validate planner output
- return a build plan for the selected section

## 2. Webflow Designer Extension
Responsibilities:
- show the section picker UI
- show current page and placement controls
- request a build plan from the backend
- insert the section into Webflow
- apply classes, variables, and styles
- report what was reused and what was created

## 3. Project Rules Layer
Responsibilities:
- define Client-First naming rules
- define shared heading/text/button class rules
- define spacing/variable usage rules
- define what counts as an allowed new class
- define section-specific mapping exceptions

---

## v1 Scope
Initial supported sections:
- Hero
- Strategic Services
- Solutions

Initial supported systems:
- existing MIS shared text/button/heading patterns
- current spacing variable system
- existing color/token usage already established in Webflow

---

## Acceptance Criteria
- user can connect a GitHub repo successfully
- user can browse pages and sections extracted from the repo
- user can select `Hero`, `Services`, or `Solutions`
- user can choose an insertion point in Webflow
- system builds the selected section in the correct location
- output uses functional Client-First naming
- shared text/button/heading classes are reused where applicable
- new classes are created only when necessary
- system stops after each section and waits for manual review
- user never has to manually create the section’s elements in Webflow
- the tool always builds into the active authenticated Webflow site/page context

---

## Risks
- imperfect code-to-section parsing for nonstandard page composition
- difficulty mapping all source styling patterns cleanly into Webflow styles
- unsupported interaction logic in source sections
- class duplication if reuse rules are not strict enough
- partial builds if Webflow mutation fails mid-run
- inconsistent AI plan quality if prompt/rules/context are weak
- invalid Webflow plans if AI output is not schema-validated

---

## Future Versions
v1.5:
- improved style inference
- broader section coverage
- better retry/rebuild behavior

v2:
- URL input mode
- reusable component generation
- component library indexing
- richer interaction support
