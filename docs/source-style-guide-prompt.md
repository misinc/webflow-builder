# Prompt: generate a Style Guide **spec (JSON)** for a source site

Produce a machine-readable JSON spec of a **source site's** design in the
client-first / **Relume** vocabulary. The migration tool then updates a
Relume-clone's Style Guide **classes and variables** from this JSON via the
Designer API. Once applied, Webflow's own Relume Style Guide page is the visual —
no HTML page is generated. Output must validate against
[`packages/shared/src/style-guide.ts`](../packages/shared/src/style-guide.ts)
(`styleGuideSpecSchema`).

**The core rule — match Relume:** Relume makes **only colors, font families,
radius, and stroke widths** into variables. Font **sizes, weights, line-heights,
letter-spacing, and spacing are literal values on the classes**, not variables.
Variables live in four collections — **Primitives, Color Schemes, Typography, UI
Styles** — with Relume-style names.

Feed the AI the source as context: its **compiled CSS** (best), a URL, and a
screenshot. Then use the prompt below verbatim.

---

## The prompt

> You are producing a **Style Guide spec** for the website at **[SOURCE URL /
> paste the source site's CSS + a screenshot]**. Output **one JSON object** (only
> JSON, no prose, no code fence) matching the schema below, using the source's
> **actual values**.
>
> **What is a variable vs a literal — match Relume exactly:**
> - **Variables** (go in `variables`): colors, font families, radius sizes, and
>   stroke/border widths. Nothing else.
> - **Literals** (written directly on classes): font-size, font-weight,
>   line-height, letter-spacing, padding, margin, and all spacing. Concrete values
>   (`3.5rem`, `600`, `1.2`) — never `var(...)` for these.
> - On classes, reference a variable with `var(--token)` **only** for: color,
>   background-color, border-color, font-family, border-radius, and border-width.
>
> **Variables** — each keyed by a `--token` (used by class `var(--token)`
> references) with a `collection`, `group`, Relume-style `name`, `type`, `value`:
> - **Colors** → `collection: "Primitives"`, `group: "Colors"` (or `"Opacity"` for
>   rgba-with-alpha values). `name` in Relume title-case: "Primary", "Primary
>   Light", "Neutral Darkest", "White". `type: "color"`.
> - **Font families** → `collection: "Typography"`, `group: "Font Styles"`,
>   names "Heading", "Body" (and "Contact" etc. if the source uses more).
>   `type: "font"`, `value` = the **bare family name** only (`"Sora"`, never
>   `"'Sora', sans-serif"`).
> - **Radius** → `collection: "UI Styles"`, `group: "Radius"`, names "Large",
>   "Medium", "Small" (add "Pill" / "Round" if the source uses one). `type: "size"`.
> - **Stroke** → `collection: "UI Styles"`, `group: "Stroke"`, names "Border
>   Width", "Divider Width". `type: "size"`.
>
> **Classes** to include (client-first names, exactly). Put the type scale as
> **literal** font-size/weight/line-height/letter-spacing; reference variables only
> for color and font-family:
> - `heading-style-h1`…`heading-style-h6` — literal font-size (+ per-breakpoint
>   deltas), literal font-weight/line-height/letter-spacing, `font-family:
>   var(--font-heading)`.
> - `text-size-large`/`medium`/`regular`/`small`/`tiny` — literal size, font-family
>   var.
> - `text-weight-light`/`normal`/`medium`/`semibold`/`bold`/`xbold` — literal
>   `font-weight` only.
> - `text-style-*` the source uses (tagline, link, muted, allcaps, quote, italic,
>   strikethrough, nowrap, contact) — literals, plus `color: var(--…)` where colored.
> - `button` — literal padding/size, `background-color`/`color`/`border-color:
>   var(--…)`, `border-radius: var(--…)`, `border-width: var(--…)` or a literal;
>   plus a `variants` entry (delta only) for each variant the source has
>   (`is-secondary`, `is-small`, `is-link`, `is-alternate`, `is-icon`).
> - `padding-section-small`/`medium`/`large` — literal top/bottom padding (+
>   per-breakpoint).
>
> **`colorSchemes`** — capture the source's distinct section treatments as
> `color-scheme-1..N`, each `{ label, vars: { "--background-color", "--text-color",
> "--border-color" } }` referencing color tokens. (Informational for now — schemes
> aren't applied yet, but keep them so we have them.)
>
> **Rules:**
> - Only colors/fonts/radius/stroke are variables; everything else is literal.
> - Concrete values only — evaluate `calc()`/`clamp()`. Physical properties
>   (`padding-left`, not `padding-inline`); no `gap`; zero widths as `"0px"`.
> - Font `value` is the bare family (`"Inter"`), never a stack.
> - Variants hold ONLY the delta from `base`; omit a variant that equals base.
> - Keep stepped families distinct (no two identical radius/padding steps unless
>   the source repeats them).
> - Don't hardcode a color that assumes a background — omit `color` to inherit, or
>   use a variable, unless the element always sits on one scheme.
> - Don't invent tokens/classes the source lacks; don't include fixed scaffolding
>   (`padding-global`, `container-*`, `page-wrapper`, hide/show).
> - Output only the JSON object.

---

## Worked fragment

```json
{
  "version": 1,
  "variables": {
    "--color-primary":  { "value": "#8EC441", "type": "color", "collection": "Primitives",  "group": "Colors",      "name": "Primary" },
    "--color-neutral-darkest": { "value": "#000C23", "type": "color", "collection": "Primitives", "group": "Colors", "name": "Neutral Darkest" },
    "--font-heading":   { "value": "Sora",    "type": "font",  "collection": "Typography",  "group": "Font Styles", "name": "Heading" },
    "--radius-pill":    { "value": "48px",    "type": "size",  "collection": "UI Styles",   "group": "Radius",      "name": "Pill" },
    "--stroke-border":  { "value": "1px",     "type": "size",  "collection": "UI Styles",   "group": "Stroke",      "name": "Border Width" }
  },
  "classes": {
    "heading-style-h1": {
      "base": { "font-family": "var(--font-heading)", "font-size": "3.5rem", "font-weight": "600", "line-height": "1.2" },
      "breakpoints": { "medium": { "font-size": "2.75rem" }, "small": { "font-size": "2.25rem" } }
    },
    "button": {
      "base": { "background-color": "var(--color-primary)", "color": "var(--color-neutral-darkest)", "border-radius": "var(--radius-pill)", "border-width": "var(--stroke-border)", "padding-top": "0.5rem", "padding-left": "1.125rem" },
      "variants": { "is-secondary": { "background-color": "transparent", "border-color": "var(--color-primary)" } }
    }
  },
  "colorSchemes": {
    "color-scheme-1": { "label": "Light", "vars": { "--background-color": "var(--color-white)", "--text-color": "var(--color-neutral-darkest)" } }
  }
}
```

## Why this shape

- **Mirrors Relume 1:1.** Variables land in the same collections (Primitives /
  Color Schemes / Typography / UI Styles) with the same names, and the migration
  updates Relume's existing defaults (Heading, Body, Radius Large/Medium/Small,
  Border Width, …) in place instead of creating duplicates.
- **Sizes as literals** matches how Relume authors its Style Guide (type scale and
  spacing live on the classes, not as variables), so the result reads like a
  hand-built Relume project.
- **Bare font families** are what Webflow font-family variables require.
- Still zod-validated against `styleGuideSpecSchema` before applying.
