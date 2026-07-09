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
- `variants` holds breakpoint/state overrides; empty means "base breakpoint
  only". (Responsive variants are a known gap — not yet reverse-engineered here.)

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

**Drop entirely** (native copies of even hover-styled elements contain none of
these in `styleLess`; including them can reject the whole payload):

`transition`, `transition-property`, `transition-duration`,
`transition-timing-function`, `transition-delay`, `isolation`,
`content-visibility`, `will-change`, `contain`.

Rule of thumb: **when styling silently vanishes after a paste, suspect a dropped
declaration first** — a modern/logical/shorthand property Webflow didn't parse.

### Things that never ride the clipboard at all

- **Variables / design tokens** — the clipboard references variables by
  site-internal ids that mean nothing in another project. Styles paste as
  **literal values** (hex, px). Re-link to variables *after* paste via the
  Designer API (§5).
- **Components / symbols** — flattened to literal elements on copy.
- **Media assets** — images come in as placeholders; real `src` upload is
  separate.
- `<br>`, `<source>`, nested `<p>` inside `<p>` — can **crash the canvas**. Avoid.

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

> The extension only **uses** existing variables/styles — it never creates
> tokens. Tokens are authored beforehand (via MCP). Binding is pure value-match.

---

## 6. Minimal working example

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

## 7. Checklist for a new payload

- [ ] Root element is first in `nodes`.
- [ ] Every `children`/`classes` id resolves to an existing node/style.
- [ ] Text is a separate `text:true` node, not a parent attribute.
- [ ] Unsupported tags fell back to `Block`/`div` (didn't guess a `type`).
- [ ] Icons are `HtmlEmbed` with SVG in both `v` and `data.embed.meta.html`.
- [ ] `styleLess` has no `gap`/logical/shorthand/`calc()`/`transition` — all
      normalized or dropped (§4).
- [ ] Combos have `comb:"&"`, are listed in the base's `children`, and come after
      the base in the node's `classes`.
- [ ] Classes meant to reuse project styles have **empty `styleLess`** (and, if
      you can read them, the **real project style id**).
- [ ] Clipboard written via a real `copy` event, `application/json` flavor.
- [ ] Rejected wholesale? Copy a real Designer element and diff the JSON.
