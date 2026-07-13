# Client-First Naming & Section Structure (for Webflow clipboard payloads)

Companion to [`webflow-clipboard.md`](webflow-clipboard.md). That doc covers the
`@webflow/XscpData` *wire format*; this one covers **how to name classes and
structure the element tree** so a pasted section behaves like a hand-built
client-first project — the naming layer that decides what goes in each node's
`classes` array before serialization.

"Client-first" is Finsweet's naming convention. The goal here: emit class names
and a wrapper structure indistinguishable from a designer who built the section
by hand, so pasted sections drop into an existing client-first project and reuse
its global classes.

Reference implementation:
[`packages/backend-core/src/planner/html-planner.ts`](packages/backend-core/src/planner/html-planner.ts)
(structure + naming), [`resolved-styling.ts`](packages/backend-core/src/planner/resolved-styling.ts)
(shared-vs-combo styling), and [`packages/shared/src/client-first.ts`](packages/shared/src/client-first.ts).

---

## 1. The two class families

Every class a node wears is one of two kinds. **This split is the whole game** —
get it wrong and you either restyle the project's globals or lose per-instance
fidelity.

### a) Shared / global base classes — REUSE, never restyle

Project-owned, multi-role classes that already exist in the destination site.
You **reference them by name with empty `styleLess`** so paste adopts the
project's definition (see clipboard doc §3). You must **never** write one node's
resolved CSS into these — they belong to the whole site.

The reused-base vocabulary (matched by this regex in both the planner and the
post-paste dedupe):

```
heading-style-*    text-size-*     text-weight-*    text-style-*    text-color-*
container-*        padding-global   padding-section-*   page-wrapper    page-padding
main-wrapper       spacer-*        margin-*         max-width-*      background-color-*
color-scheme-*     button   button-*
```

- Headings map to **their own level only** — `<h3>` → `heading-style-h3`, never
  cross-fall to `heading-style-h2` (or an h3 inherits the big section-heading
  size).
- Body text (`p`/`blockquote`/`span`/`label`) → `text-size-medium` (or the
  project's `body`/`text-medium` if present).
- **Color schemes** — Relume applies section color via a `color-scheme-1..N` class
  (each a background/text/border set bound to variables), not per-element color.
  A migrated section's background should reference the matching `color-scheme-*`
  rather than carry a literal `background-color`. Buttons themselves vary by combo
  (`button is-secondary`/`is-small`/`is-link`/`is-alternate`/`is-icon`), where
  `is-alternate` is the variant used on dark scheme backgrounds.

### b) Section-scoped functional classes — CREATE and style

Named `{sectionKey}_{role}` (snake/underscore). These carry the section's real
layout + fidelity and *are* defined from resolved CSS. On re-paste they **update**
in place (the dedupe pass copies fresh props onto the existing class), so an
improved section overwrites the stale class instead of reverting.

`sectionKey` = the section name slugified and **capped at its first 3 words**
(long heading-derived names would make unwieldy prefixes). Only the section
**root** gets `section_{sectionKey}`; everything else is `{sectionKey}_{role}`.

---

## 2. The section scaffold (the important part)

Every section slice is wrapped in the canonical client-first nesting **unless the
source already carries `padding-global`**. Structure injected around the parsed
content:

```
section_{sectionKey}                 ← the <section> root (only the root gets section_)
  └─ padding-global                  ← shared, reused
      └─ container-large             ← shared, reused (width constraint)
          └─ padding-section-medium  ← shared, reused (vertical rhythm)
              └─ {sectionKey}_component   ← the section's own top wrapper
                  └─ …parsed content…
```

Rules baked into `wrapSectionWithClientFirstScaffold`:

- If the parsed root already has a single top-level `{sectionKey}_component`
  child, **reuse it** — don't inject a second `_component` (two nested grids
  fight over width).
- A `<div>`-rooted slice still becomes `section_{sectionKey}` (tag forced to
  `section`), so the scaffold and styling targets line up.
- **Child-layout properties on the section root are dropped** (`display`, `flex`,
  `grid-template-*`, `gap`, `align/justify`, …). Once the scaffold is inserted,
  those would act on `padding-global`/`container-large` — width-less shared
  classes that shrink to fit-content, wrapping headings into a narrow column.
  Put layout on `{sectionKey}_component` or an inner wrapper, never the section.

### Page mode vs section mode vs chrome

- **Section mode** — payload root is the bare `section_{sectionKey}` tree.
- **Page mode** — many sections rooted under a single **`main-wrapper`** (`<main>`,
  a payload needs one root). The user owns `page-wrapper` + navbar/footer
  components; the pasted `main-wrapper` slots between them as a real page element.
  No unwrap step.
- **Chrome (navbar/footer)** — keeps its own tag, gets **NO section scaffold**
  (lives outside `main-wrapper`), and is pasted as a bare labeled div the user
  unwraps (`data.displayName: "Pasted chrome — unwrap me"`). Componentized after.

---

## 3. Role naming — how a wrapper `<div>` gets its `_role`

The planner infers a semantic role from **element structure**, not source class
names (the extension stays site-agnostic — mechanisms only). Priority order for a
generic wrapper `div`/`article`/…:

| Condition                                             | Class                        |
|-------------------------------------------------------|------------------------------|
| tag `ul`/`ol`                                         | `{key}_list`                 |
| tag `li`                                              | `{key}_item`                 |
| tag `img`                                             | `{key}_image`                |
| `<a>`/`<button>` with content children                | `{key}_card`                 |
| `<a>`/`<button>`, leaf (or icon only)                 | `{key}_link`                 |
| div wrapping only a decorative icon embed             | `{key}_icon`                 |
| div whose children are all images                     | `{key}_image-wrapper`        |
| >1 link/card children, all links are icon+label pills | `{key}_pill_list`            |
| >1 card-wrapping children                             | `{key}_card_list`            |
| >1 link/card children (generic)                       | `{key}_list`                 |
| icon + `h3`, no body copy                             | `{key}_card_title`           |
| `h3` + `p` children                                   | `{key}_item`                 |
| image-half + text-half                                | `{key}_card`                 |
| only heading/text children                            | `{key}_heading-wrapper`      |
| single top-level wrapper (depth ≤2, no siblings)      | `{key}_component`            |
| a named source class / `data-name` (BEM-ish, rare)    | `{key}_{semanticSuffix}`     |
| decorative layer (no readable content in subtree)     | `{key}_layer`                |
| fallback                                              | `{key}_content`              |

Then descendants of role wrappers get **decorated**:

- inside `_pill_list`: each `<a>`/`<button>` → `{key}_pill`
- inside `_feature`: headings → `{key}_feature_heading`, `<p>` → `{key}_feature_text`
- inside `_card`: headings → `{key}_card_heading`, `<p>` → `{key}_card_text` (recursive)

`semanticSuffix` (deriving a role from the source's own BEM class or Figma
`data-name`) only fires for a **singular** named wrapper (source class used on ≤2
elements), and it strips tokens the `sectionKey` already carries and refuses to
claim `_component`. Utility classes (Tailwind-style — see `isUtilityClassName`)
never qualify.

---

## 4. Per-instance fidelity → combo classes (never restyle a shared class)

A shared base class is multi-role and project-owned, so a node's own resolved CSS
can't be written into it. Instead, per-node fidelity rides in a **content-hashed
combo class** layered on top:

- Combo name: **`{targetClass}_v{hash5}`** where `hash5` is an FNV-1a hash of the
  target + the override declarations. Same styles → **same combo name**, even
  across separately copied sections. Deterministic, dedup-friendly.
- In the payload the combo has `comb: "&"`, is listed in the base's `children`,
  and comes **after** the base in the node's `classes` array (clipboard doc §3).
- A combo can only **add** declarations, never unset the base. Scaffolding keys
  (`position`, `top/right/bottom/left`, `inset`, `z-index`) are stripped from
  combos — inert once the base's absolute positioning is dropped.

Styling target selection (`targetClassFor`): prefer the **section-scoped**
functional class; only fall back to a reused base class (so typography lands
somewhere) — and when it does, the resolved CSS becomes a combo on top of that
shared base, not a redefinition of it.

BEM `X--modifier` source classes are read as per-instance overrides and become
combos on the base `X`'s target.

---

## 5. Naming rules & gotchas

- **Case**: shared globals use `kebab-case` (`heading-style-h2`,
  `padding-global`). Section-scoped classes use `snake_case` with `_` between
  role tokens (`services_card`, `get-in-touch_content`) — the sectionKey itself
  is kebab, joined to the role by `_`. A valid client-first name matches
  `^[a-z0-9]+(?:[-_][a-z0-9]+)*$`.
- **Only the root is `section_`** — nested `<section>`/`<header>`/`<footer>`/
  `<main>` route through the div heuristics so they don't collide.
- **`rl-styleguide*`** classes are reserved (Relume styleguide) — never emit or
  reuse them (`isReservedStyleGuideClassName`).
- **Source class names are ignored for output** — the skeleton is parsed
  deterministically from structure; the site's original `class` attributes never
  become Webflow class names (they're only read to infer a rare semantic suffix).
- **`_component` is scaffold-reserved** — a source name can never claim it.
- Section names that are long/heading-derived get capped to 3 words for the key —
  keep prefixes short.
- **Never invent design tokens** — the naming layer only *uses* existing shared
  classes and creates section-scoped ones; variable/token binding is a separate
  post-paste Designer-API pass (clipboard doc §5).

---

## 6. Worked example

Source: a services section with a heading, two cards, and a pill row.

```
section_services                          (shared scaffold below is injected)
└─ padding-global
   └─ container-large
      └─ padding-section-medium
         └─ services_component
            ├─ h2.heading-style-h2         "Services That Convert"
            ├─ services_card_list
            │  ├─ services_card
            │  │  ├─ h3.services_card_heading  "Design"
            │  │  └─ p.services_card_text      "…"
            │  └─ services_card.services_card_v1a2b   ← combo = this card's accent
            │     ├─ h3.services_card_heading
            │     └─ p.services_card_text
            └─ services_pill_list
               ├─ a.services_pill  (icon-embed + text)
               └─ a.services_pill
```

- `heading-style-h2`, `padding-global`, `container-large`,
  `padding-section-medium` → **shared, empty `styleLess`, reused by name**.
- `services_component`, `services_card_list`, `services_card`, `_card_heading`,
  `_card_text`, `_pill_list`, `_pill` → **section-scoped, defined from resolved
  CSS**.
- `services_card_v1a2b` → **combo** (`comb:"&"`, in `services_card`'s `children`,
  second in that node's `classes`) carrying only the second card's accent delta.

---

## 7. Checklist

- [ ] Section root is `section_{key}`; only the root, not nested semantic tags.
- [ ] Canonical scaffold present: `padding-global > container-large >
      padding-section-medium > {key}_component`.
- [ ] Shared/global classes carry **empty `styleLess`** (reused by name).
- [ ] Section-scoped classes carry resolved CSS; roles named by structure.
- [ ] No child-layout props on the section root (they'd hit the width-less
      scaffold wrappers).
- [ ] Per-instance fidelity is a `{target}_v{hash}` combo, `comb:"&"`, listed in
      the base's `children`, after the base in `classes`.
- [ ] Headings map to their own level; body → `text-size-medium`.
- [ ] Page mode roots at `main-wrapper`; chrome pastes as an unwrap-me div.
- [ ] Names match `^[a-z0-9]+(?:[-_][a-z0-9]+)*$`; no `rl-styleguide*`; source
      class names not leaked into output.
