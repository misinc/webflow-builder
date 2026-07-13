# Webflow Clipboard Format (`@webflow/XscpData`)

Reverse-engineered notes on Webflow's Designer copy/paste payload — the JSON the
Designer writes to the clipboard on copy, and the mechanism third-party tools
(Relume, etc.) use to inject fully-styled, client-first components with one paste.

Pasting this payload builds an entire element tree in one gesture: structure,
styles, combo classes, and real inline-SVG embeds — **none of the Designer API's
element restrictions apply** (no "Buttons can't hold children", no text-element
limits). This makes it dramatically more capable than the `webflow.createElement`
Designer API for bulk insertion.

> ⚠️ The format is **unofficial and undocumented**. It was reverse-engineered
> from real Designer copy payloads. Treat a paste rejection ("the clipboard is
> empty") as a *payload-shape bug to iterate on*, not a dead end. When in doubt,
> copy a real element in the Designer and diff its clipboard JSON against yours —
> ground-truth captures beat guessing.

Reference implementation in this repo:
[`packages/shared/src/webflow-clipboard.ts`](packages/shared/src/webflow-clipboard.ts)
(serializer) and [`test/webflow-clipboard.test.ts`](test/webflow-clipboard.test.ts).

> **Companion doc:** [`webflow-client-first-naming.md`](webflow-client-first-naming.md)
> covers *how to name classes and structure the section tree* (the client-first
> scaffold, shared-vs-combo classes) that feeds into this wire format.

---

## 1. The envelope

```jsonc
{
  "type": "@webflow/XscpData",
  "payload": {
    "nodes":  [ /* element + text nodes, flat array, referenced by _id */ ],
    "styles": [ /* class definitions, referenced by _id */ ],
    "assets": [],
    "ix1":    [],
    "ix2":    { "interactions": [], "events": [], "actionLists": [] }
  },
  "meta": {
    "droppedLinks": 0,
    "dynBindRemovedCount": 0,
    "dynListBindRemovedCount": 0,
    "paginationRemovedCount": 0,
    "universalBindingsRemovedCount": 0,
    "unlinkedSymbolCount": 0,
    "codeComponentsRemovedCount": 0,
    "richTextComponentsStripped": false
  }
}
```

- `nodes` and `styles` are **flat arrays**; the tree is expressed by id
  references (`children: [_id, ...]`, `classes: [_id, ...]`), not by nesting.
- The **first node in `nodes`** is treated as the paste root.
- `ix1`/`ix2` carry interactions/animations. Empty is fine — you're not pasting
  motion.
- `meta` is bookkeeping about what Webflow stripped when *it* copied. When
  synthesizing a payload, all-zero / `false` is correct and safe.

### Getting it onto the clipboard

The Designer only reads the **`application/json`** clipboard flavor, and that
flavor can *only* be set from a real copy event — `navigator.clipboard.writeText`
does **not** work. You must hook a `copy` event during a user gesture:

```ts
function copyWebflowPayloadToClipboard(json: string): void {
  const onCopy = (e: ClipboardEvent) => {
    e.preventDefault();
    e.clipboardData?.setData("application/json", json); // the one that matters
    e.clipboardData?.setData("text/plain", json);       // fallback
  };
  document.addEventListener("copy", onCopy);
  try {
    if (!document.execCommand("copy")) throw new Error("Browser blocked the write.");
  } finally {
    document.removeEventListener("copy", onCopy);
  }
}
```

Must run inside a click handler; the browser blocks clipboard writes outside a
user gesture. Then the user pastes with **Cmd/Ctrl+V** onto the canvas.

---

## 2. Node shapes

Every node has a UUID-shaped `_id`. Two kinds: **element nodes** (have a `type`)
and **text nodes** (have `text: true` and `v`).

### Ids

Real Designer ids look like `427898cf-0a73-a315-e37a-b551abe161da`. Any
UUID-shaped string works. For reproducible payloads, derive ids deterministically
from a stable seed (this repo uses an FNV-1a hash of a path key) so repeat pastes
produce identical ids instead of colliding randomly.

### Element node

```jsonc
{
  "_id": "…uuid…",
  "type": "Block",              // Webflow element type (see table)
  "tag": "div",                 // real HTML tag
  "classes": ["<styleId>", …],  // ids into the styles array, ORDER = base→combo
  "children": ["<nodeId>", …],  // ids into the nodes array
  "data": { "tag": "div", "text": false }
}
```

### Text node

Direct text is **its own child node**, not an attribute of the parent:

```jsonc
{ "_id": "…uuid…", "text": true, "v": "Websites That Convert" }
```

A heading with text has one text-node child. A `Block` that holds *only* text
(no element children) also sets `data.text: true` on itself.

### `type` → `tag` map (what's been validated)

| HTML tag              | `type`       | Notes |
|-----------------------|--------------|-------|
| `div`,`section`,`article`,`aside`,`header`,`footer`,`nav`,`main`,`figure`,`address`,`span` | `Block` | `data:{ tag, text }`. **Only these tags are safe on a Block.** |
| `h1`–`h6`             | `Heading`    | `data:{ tag }` |
| `p`                   | `Paragraph`  | `data:{ tag:"p" }` |
| `blockquote`          | `Blockquote` | `data:{ tag:"blockquote" }` |
| `a`                   | `Link`       | `data:{ button:false, block:"block"\|"inline", link:{ url } }` |
| `img`                 | `Image`      | `data:{ attr:{ src, alt }, img:{} }` |
| inline SVG / raw HTML | `HtmlEmbed`  | see below |

**Anything not in this list (`ul`,`li`,`form`,`fieldset`,`picture`,`table`, …)
must fall back to `tag:"div"` on a `Block`**, keeping its classes. Guessing a
node shape for an unsupported type is the #1 cause of a wholesale payload
rejection. The tag is cosmetic-ish; the classes carry the real fidelity.

**Semantic block types seen in real copies:** Webflow's own copies use richer
types for structural `div`s — `Section` (`data.grid.type:"section"`, often with
`data.attr.id`), `Container` (`data.grid.type:"container"`). A plain `Block`
works in their place and pastes fine; these just give the Navigator nicer labels
and the section/container grid affordances. Use them if you want the output to
read like a hand-built Webflow section.

**Extra `data` fields in real copies are optional.** Native nodes carry more
bookkeeping — `devlink`, `xattr:[]`, `search:{exclude:false}`,
`visibility:{conditions:[],keepInHtml:{…}}`, `attr:{id:""}`. Synthesized
payloads that omit all of these still paste correctly; include them only if you
need the specific behavior (e.g. `attr.id` to set an element id anchor). Style
entries can likewise carry an optional `createdBy` field — safe to omit.

**Webflow component types ride as first-class types too.** Real copies preserve
built-in components under their own `type` rather than flattening to `Block`:

- **Navbar:** `NavbarWrapper`, `NavbarBrand`, `NavbarMenu`, `NavbarLink`,
  `NavbarButton`
- **Dropdown:** `DropdownWrapper`, `DropdownToggle`, `DropdownList`
- **Form:** `FormWrapper`, `FormForm`, `FormBlockLabel`, `FormInlineLabel`,
  `FormTextInput`, `FormTextarea`, `FormSelect`, `FormButton`,
  `FormCheckboxInput`/`FormCheckboxWrapper`, `FormRadioInput`/`FormRadioWrapper`,
  `FormErrorMessage`, `FormSuccessMessage`
- **Layout:** `Grid`

Emitting these makes a pasted navbar/form behave like the real Webflow component
(dropdown interactions, form submit). When synthesizing from arbitrary HTML you
can fall back to `Block`/`div`, but a form built as plain divs won't *function*
as a Webflow form — decide per case whether behavior or just appearance matters.

### HtmlEmbed (inline SVG icons, raw markup)

The escape hatch — arbitrary HTML that survives paste intact. This is how you get
crisp inline-SVG icons instead of Designer div placeholders:

```jsonc
{
  "_id": "…",
  "type": "HtmlEmbed",
  "tag": "div",
  "v": "<svg viewBox=\"0 0 24 24\"><path d=\"M5 12h14\"/></svg>",
  "data": {
    "insideRTE": false,
    "embed": {
      "type": "html",
      "meta": { "html": "<svg …>", "div": false, "iframe": false, "script": false }
    }
  }
}
```

The SVG string appears **both** as top-level `v` and inside `data.embed.meta.html`.
An embed node has no element children (its content is the raw string).

### Links / CTAs

Webflow's `Button`/`LinkBlock` are effectively text-only and hoist icon+label
children out — so build CTAs as **`<a>` (`type:"Link"`)**, which holds children
fine. Set `data.block:"block"` when it has element children, `"inline"` when it's
a plain text link. `data.link.url` defaults to `"#"`.

### Navigator display name

`data.displayName` sets the label shown in the Designer's Navigator panel. Handy
for a wrapper node, e.g. `"Pasted sections — unwrap me"`.

---

## 3. Style (class) entries

Each entry in `payload.styles`:

```jsonc
{
  "_id": "…uuid…",
  "fake": false,
  "type": "class",
  "name": "services_card",   // class name — matched to project BY NAME
  "namespace": "",
  "comb": "",                // "" = base class, "&" = combo class
  "styleLess": "display: grid; border-left: 8px solid #ff9902;",
  "variants": {},            // breakpoint/state overrides (empty = base only)
  "children": ["<comboStyleId>", …], // combos layered on top of THIS base
  "origin": null,
  "selector": null
}
```

Key rules learned:

- **Every class a node references needs a style entry** — even ones with no
  styling of their own.
- **Webflow matches pasted styles to existing project classes BY NAME.** A style
  entry with **empty `styleLess`** reuses the project's existing class as-is
  (e.g. `heading-style-h2` pastes empty → adopts the project's definition). This
  is how you ride shared client-first classes without redefining them.
- **Combo classes**: `comb: "&"`. The base class lists its combos in `children`
  (array of combo style ids). On a node, `classes` is ordered **base first, then
  combos**. Combo entries carry only the *delta* styling.
- `styleLess` is a plain CSS declaration string (`"prop: value; prop: value;"`).
- `variants` holds breakpoint and state overrides — the responsive layer.
  Fully decoded below (§3a).

### 3a. Responsive & state variants (`variants`)

Confirmed from ground-truth Designer copies. `variants` is an object keyed by a
**breakpoint/state id**, each value carrying its own `styleLess` string of *only
the declarations that differ from the cascade above it* — the delta, not the
full style:

```jsonc
"variants": {
  "medium": { "styleLess": "padding-top: 60px; padding-bottom: 100px;" },
  "small":  { "styleLess": "flex-direction: column; text-align: center;" },
  "tiny":   { "styleLess": "padding-right: 16px; padding-left: 16px;" }
}
```

**The model is desktop-first, exactly like CSS `max-width` media queries.** Base
`styleLess` is the desktop value and applies everywhere; each smaller breakpoint
stores only what changes from the next size up. So a value that changes at every
breakpoint is restated at each; a value set once at desktop and never changed
appears in **no** variant.

**There are no per-breakpoint *classes* in Webflow.** A class exists once and
applies at every breakpoint — you never make a separate class per screen size.
Only the *values* differ per breakpoint, which is exactly what `variants`
encodes: one style entry, a base `styleLess`, plus per-breakpoint value
overrides. (This is what makes the style-guide-first strategy in §6 work: set a
class's values once — across all breakpoints — and every element using it
inherits them.)

Variant keys seen in ground-truth copies — **breakpoints**, **states**, and
**breakpoint+state combos** (`{breakpoint}_{state}`):

| Key                       | Kind             | Meaning |
|---------------------------|------------------|---------|
| *(base)*                  | breakpoint       | desktop — the top-level `styleLess` (992px+) |
| `medium`                  | breakpoint       | tablet (≤ 991px) |
| `small`                   | breakpoint       | mobile landscape (≤ 767px) |
| `tiny`                    | breakpoint       | mobile portrait (≤ 479px) |
| `main_hover`              | state            | hover (base breakpoint) |
| `main_focus`              | state            | focus |
| `main_placeholder`        | state            | `::placeholder` styling |
| `main_current`            | state            | current-page (nav link on the active page) |
| `main_open`               | state            | open (e.g. dropdown expanded) |
| `main_redirected-checked` | state            | checked state of a custom checkbox/radio proxy |
| `main_redirected-focus`   | state            | focus state of a custom checkbox/radio proxy |
| `medium_open`             | breakpoint+state | confirmed real combo — proves the `{breakpoint}_{state}` pattern |

Larger-than-desktop keys (`large`/`xl`/`xxl` for 1280/1440/1920) follow the same
scheme but weren't in the samples. `main_` is the base-breakpoint namespace; a
state at a smaller breakpoint combines as `{breakpoint}_{state}` (`medium_open`).

Worked cascade from a real copy — a two-column contact split that shrinks then
stacks:

```jsonc
{ "name": "Contact Split Image",
  "styleLess": "width: 50%; min-height: 600px;",
  "variants": {
    "medium": { "styleLess": "width: 33.33%;" },
    "small":  { "styleLess": "display: none; width: 100%; height: 240px;" } } }

{ "name": "Contact Section",
  "styleLess": "display: flex; flex-direction: row;",
  "variants": { "small": { "styleLess": "flex-direction: column;" } } }
```

Notes for synthesizing variants:
- Each variant's `styleLess` obeys **all the same §4 normalization rules** (no
  `gap`/logical/shorthand/`calc()`; drop the same unsafe props). Run breakpoint
  deltas through the identical serializer path as the base.
- Compute deltas **desktop-first and cumulatively**: diff `medium` against base,
  `small` against the base+`medium` result, `tiny` against base+`medium`+`small`.
  Emit a key only when its delta is non-empty.
- Omit the `variants` object's keys entirely rather than emitting empty ones; an
  all-empty `variants: {}` is correct for a desktop-only class.
- Deriving variants by **capturing computed styles at each breakpoint width**
  (headless Chrome resized to 991/767/479) reproduces this encoding almost
  exactly — the one difference is literal units (Webflow may author `7%`, a
  computed capture yields the equivalent `px`).

### Avoiding `name 2` duplicates

If a pasted class name already exists in the project but you give it a **fresh
random id**, Webflow creates a duplicate named `"services_card 2"`. To reuse the
real class, read the destination project's styles via the Designer API and emit
the style entry with the **real style id** (and empty `styleLess`, since paste
never restyles an existing class). This is the reconciliation Relume's extension
does. See §5 for the post-paste cleanup that fixes dupes when you *can't*
pre-resolve ids.

---

## 4. `styleLess` — what Webflow's paste parser silently drops

Webflow's paste validator **silently drops declarations it doesn't recognize** —
the paste "succeeds" but the style is quietly missing. Native Designer copies
never contain these forms, so neither should yours. Normalize before serializing:

| Don't emit                      | Emit instead                                             |
|---------------------------------|----------------------------------------------------------|
| `gap: 1.5rem`                   | `grid-row-gap: 1.5rem; grid-column-gap: 1.5rem` (legacy names, even for flex) |
| `row-gap` / `column-gap`        | `grid-row-gap` / `grid-column-gap`                       |
| `padding-inline`/`-block` etc.  | physical sides: `padding-left`/`-right`/`-top`/`-bottom` (logical props are dropped) |
| `margin-inline`/`-block`        | physical `margin-*` sides                                |
| `inset: …`                      | expand to `top`/`right`/`bottom`/`left`                  |
| `flex: 1 0 0`                   | longhands: `flex-grow: 1; flex-shrink: 0; flex-basis: 0` |
| `calc(...)`                     | **evaluate it** to a concrete value before emitting      |

**Transitions are SAFE — correction from ground truth.** Real Designer copies
*do* carry `transition-*` in `styleLess` (e.g. an `Input` with
`transition-property: border-color; transition-duration: 300ms;
transition-timing-function: ease;`, and a `Button` whose `main_hover` variant
holds `box-shadow` + `transform: translate(0px, -1px)`). Since Webflow's own
copy emits them and paste is the inverse, they are accepted. Earlier notes here
claimed the opposite — that was wrong. This repo's serializer still drops them
conservatively (pending a synthesized-payload paste test); once verified, they
can be kept, and hover/focus effects belong in `main_hover`/`main_focus`
variants (§3a).

**Drop entirely** (not seen in any ground-truth copy; unverified, so still
risky to emit): `isolation`, `content-visibility`, `will-change`, `contain`.

Rule of thumb: **when styling silently vanishes after a paste, suspect a dropped
declaration first** — a modern/logical/shorthand property Webflow didn't parse.

### Things that never ride the clipboard at all

- **Variables / design tokens** — in the `application/json` flavor (the one paste
  consumes) variables **flatten to literal values** (hex, px), even when the
  element clearly has a variable bound in the Designer. Confirmed airtight: a
  button bound to *Primary warm accent* / *Neutral Darkest* pasted as
  `background-color: #FF9902; color: #0D0800` with **zero** variable references
  anywhere in the JSON. Restore the binding after paste (§5b) — or, better, put
  it on the *class* before paste (§6). The one exception is the Relume `text/html`
  companion flavor, which preserves variable **names** (§6).
- **Components / symbols** — flattened to literal elements on copy.
- **Media assets** — an `<img>` `Image` node carries the live CDN `src`
  (+`width`/`height`/`alt`/`img.id`/`sizes`), so it renders immediately.
  **Background images ride differently** — as an asset-id reference,
  `background-image: @raw<|@img_<assetId>|>` in `styleLess`. That id resolves only
  if the asset already exists in the destination project, so a background image
  generally won't render when pasted into a *different* site. Either way,
  registering the asset in the destination Assets panel is a separate step.
- `<br>`, `<source>`, nested `<p>` inside `<p>` — can **crash the canvas**. Avoid.

**The `@raw<|…|>` wrapper.** Webflow wraps certain `styleLess` values in a
`@raw<|…|>` sentinel — seen around an asset reference (`@raw<|@img_66b1979…|>`)
and a bare size literal (`@raw<|999px|>`). Its exact trigger isn't pinned down
(definitely asset refs; sometimes size values), but two things are clear: it is
**not** a variable marker (bound color variables flatten to plain hex, never
`@raw`), and a synthesized payload doesn't need to produce it — plain values
work. Strip/ignore it when reading real copies.

---

## 5. Post-paste cleanup (Designer API)

Paste gets you 90% there with literal values and possibly duplicated class names.
Two Designer-API passes over the pasted selection finish the job. Both walk the
selected element tree (`getSelectedElement` → recurse `getChildren`).

### a) Class dedupe — swap `"name 2"` back to the real class

For each element style whose name matches `/^(.+?) (\d+)$/`, look up the base
name in the project's styles. If it exists and isn't the same id, swap the
element onto the real class (`element.setStyles([...])`).

- **Shared client-first classes** the project owns (`heading-style-*`,
  `text-size-*`, `padding-global`, `container-*`, `button`, …) are **swapped but
  never restyled** — you adopt the project's definition.
- **Section-scoped classes** (e.g. `services_card`): before swapping, copy the
  freshly-pasted properties onto the existing class (`base.setProperties(fresh)`)
  so re-pasting an improved section *updates* the class instead of reverting.

### b) Variable binding — relink literals to design tokens

Build a map of the project's variables keyed by **normalized value**
(color/size/font). Then for each pasted style property whose value is a plain
string literal:

- normalize it, skip trivial values (`0`, `transparent`, …),
- if a variable has that exact value **and its kind matches the property**
  (color-var → color prop, size-var → dimension prop), rebind:
  `style.setProperty(property, variable)`.
- A value that's *already* a variable reference comes back as an **object**, not
  a string — skip it (already bound).

Net effect the user sees: *"N classes fixed · M tokens bound."*

**Prefer name-based matching when you have names.** Value-matching is ambiguous
when two variables share a value. Two sources hand you the variable *name*
directly: **(a)** the source site's own authored CSS, where a property reads
`color: var(--_primitives---colors--primary-warm-accent)` — the CSSOM preserves
that raw `var()` on the matched rule (`getComputedStyle` resolves it away, so
read `rule.style.getPropertyValue(prop)` instead); **(b)** the Relume `text/html`
flavor's `data-relumestylelesswithvariables`, keyed by style id, giving each
bound property `{cssProperty, name, value}`. Match those names to the destination
project's variables (unambiguous); fall back to value-matching only when no name
is available.

> The extension only **uses** existing variables/styles — it never creates
> tokens. Tokens are authored beforehand (via MCP). Binding is name-match first,
> value-match as fallback.

---

## 6. Variables & the style-guide-first strategy

The clipboard can't carry a variable binding, but the **Designer API can** — the
extension already binds variables to styles in post-paste cleanup (§5b). That
opens a cleaner ordering than "paste literals, then rebind."

**Style-guide-first.** Build/adjust the variable-bound *classes* first, then paste
sections that merely *reference* those classes by name with empty `styleLess`
(§3). Each pasted element adopts the fully-styled, variable-bound class — no lossy
post-paste rebinding. This fits a Relume-cloneable workflow, where the project
already ships a **Style Guide** of client-first classes (`heading-style-*`,
`text-size-*`, `button`, …):

1. **Update the Style Guide to the source site.** For each style-guide class, set
   its properties — including per-breakpoint values via the Designer API's
   breakpoint option (Webflow has no per-breakpoint classes; you set per-breakpoint
   *values* on the one class, §3a) — to the source's **canonical** value for that
   role, and bind variables by name where the source uses them. Create the class
   only if it doesn't already exist.
2. **Paste sections** whose elements reference those class names with empty
   `styleLess` (and the real style ids, see "Avoiding name 2"). They inherit the
   updated Style Guide → the section looks like the source site, responsive
   values and variable bindings included.

**Guardrail — canonical, not per-node.** A shared client-first class must be set
from the site's *design-system* value (its style guide, or the dominant value
across instances), **never** from one arbitrary node's CSS — otherwise one card's
font size pollutes every heading. Per-instance deviations still ride **combo
classes** (§3). And note: restyling a shared class updates *every* element using
it project-wide — intended when migrating into a fresh clone, but a conscious,
destructive-ish act otherwise.

**Getting the variable names** (for step 1's binding): the source site's authored
CSS exposes them directly — `color: var(--_primitives---colors--primary-warm-accent)`.
Read the raw `var()` off the matched rule (`rule.style.getPropertyValue`, since
`getComputedStyle` resolves it to a hex) and match the name to the destination
project's variable. When source and target share a design system the names line
up 1:1; otherwise fall back to value-matching. This generalizes beyond Webflow
sources — any site whose tokens are CSS custom properties (Tailwind v4's
`var(--color-…)`, etc.) exposes matchable names.

---

## 7. Minimal working example

Section → heading + `<a>` CTA (text + inline-SVG icon) → varied card (base+combo):

```jsonc
{
  "type": "@webflow/XscpData",
  "payload": {
    "nodes": [
      { "_id": "n-sec",  "type": "Block",   "tag": "section", "classes": ["s-sec"], "children": ["n-h","n-a","n-card"], "data": { "tag": "section", "text": false } },
      { "_id": "n-h",    "type": "Heading", "tag": "h2", "classes": ["s-h2"], "children": ["t-h"], "data": { "tag": "h2" } },
      { "_id": "t-h",    "text": true, "v": "Websites That Convert" },
      { "_id": "n-a",    "type": "Link", "tag": "a", "classes": ["s-link"], "children": ["t-a","n-svg"], "data": { "button": false, "block": "block", "link": { "url": "#" } } },
      { "_id": "t-a",    "text": true, "v": "Book a Call" },
      { "_id": "n-svg",  "type": "HtmlEmbed", "tag": "div", "v": "<svg viewBox=\"0 0 24 24\"><path d=\"M5 12h14\"/></svg>",
        "data": { "insideRTE": false, "embed": { "type": "html", "meta": { "html": "<svg viewBox=\"0 0 24 24\"><path d=\"M5 12h14\"/></svg>", "div": false, "iframe": false, "script": false } } } },
      { "_id": "n-card", "type": "Block", "tag": "div", "classes": ["s-card","s-card2"], "children": [], "data": { "tag": "div", "text": false } }
    ],
    "styles": [
      { "_id": "s-sec",  "fake": false, "type": "class", "name": "section_services", "namespace": "", "comb": "",  "styleLess": "background: #ffefcf; padding: 96px 20px;", "variants": {}, "children": [], "origin": null, "selector": null },
      { "_id": "s-h2",   "fake": false, "type": "class", "name": "heading-style-h2", "namespace": "", "comb": "",  "styleLess": "", "variants": {}, "children": [], "origin": null, "selector": null },
      { "_id": "s-link", "fake": false, "type": "class", "name": "services_link",    "namespace": "", "comb": "",  "styleLess": "", "variants": {}, "children": [], "origin": null, "selector": null },
      { "_id": "s-card", "fake": false, "type": "class", "name": "services_card",    "namespace": "", "comb": "",  "styleLess": "display: grid; border-left: 8px solid #ff9902;", "variants": {}, "children": ["s-card2"], "origin": null, "selector": null },
      { "_id": "s-card2","fake": false, "type": "class", "name": "services_card_v2", "namespace": "", "comb": "&", "styleLess": "border-left: 8px solid #a62025;", "variants": {}, "children": [], "origin": null, "selector": null }
    ],
    "assets": [], "ix1": [], "ix2": { "interactions": [], "events": [], "actionLists": [] }
  },
  "meta": { "droppedLinks": 0, "dynBindRemovedCount": 0, "dynListBindRemovedCount": 0, "paginationRemovedCount": 0, "universalBindingsRemovedCount": 0, "unlinkedSymbolCount": 0, "codeComponentsRemovedCount": 0, "richTextComponentsStripped": false }
}
```

Note: `heading-style-h2` and `services_link` paste with **empty `styleLess`** →
they adopt the project's existing classes by name. `services_card` carries real
styling; `services_card_v2` is its combo (`comb:"&"`, listed in the base's
`children`, and second in the card node's `classes`).

---

## 8. Checklist for a new payload

- [ ] Root element is first in `nodes`.
- [ ] Every `children`/`classes` id resolves to an existing node/style.
- [ ] Text is a separate `text:true` node, not a parent attribute.
- [ ] Unsupported tags fell back to `Block`/`div` (didn't guess a `type`).
- [ ] Icons are `HtmlEmbed` with SVG in both `v` and `data.embed.meta.html`.
- [ ] `styleLess` has no `gap`/logical/shorthand/`calc()` — all normalized (§4).
- [ ] Responsive overrides go in `variants` as desktop-first deltas
      (`medium`/`small`/`tiny`), each obeying the same §4 normalization; omit
      empty keys (§3a).
- [ ] Combos have `comb:"&"`, are listed in the base's `children`, and come after
      the base in the node's `classes`.
- [ ] Classes meant to reuse project styles have **empty `styleLess`** (and, if
      you can read them, the **real project style id**).
- [ ] Clipboard written via a real `copy` event, `application/json` flavor.
- [ ] Rejected wholesale? Copy a real Designer element and diff the JSON.
