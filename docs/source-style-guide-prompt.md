# Prompt: generate a Style Guide **spec (JSON)** for a source site

Use this to produce a machine-readable JSON spec of a **source site's** design
tokens — typography, buttons, colors/schemes, spacing, radius, shadows — in the
client-first / Relume vocabulary. The migration tool then updates the destination
Relume-clone's Style Guide **classes and variables** from this JSON via the
Designer API.

No HTML style-guide page is produced: once the JSON is applied, Webflow's own
Relume Style Guide page **is** the visual style guide, updated to match the
source. The JSON is the interface the Designer-API step needs, it keeps variable
**names** explicit (so we can bind by name, not just value), and it constrains the
AI to exactly the fields we consume.

The output must validate against
[`packages/shared/src/style-guide.ts`](../packages/shared/src/style-guide.ts)
(`styleGuideSpecSchema`).

Feed the AI the source as context: its **compiled CSS** (best), plus a URL and a
full-page screenshot. Then use the prompt below verbatim.

---

## The prompt

> You are producing a **Style Guide spec** for the website at **[SOURCE URL /
> paste the source site's CSS and a screenshot]**. Analyze that site's real
> typography, buttons, colors, spacing, radius, and shadows, and output **one JSON
> object** (only JSON, no prose, no code fence) matching the schema below, using
> the source's **actual values** (read them from the CSS if provided; otherwise
> infer from the rendered appearance).
>
> Model every design token as a **variable** in `variables`, and have class
> properties reference tokens as `var(--name)` — never hardcode a hex/px/font on a
> class property. Give each variable a `label` (a human name we can match to the
> destination project's variable, e.g. "Primary warm accent", "Neutral Darkest").
> Where the source visibly changes a value at tablet/mobile, add the delta under
> the class's `breakpoints` (`medium` ≤991px, `small` ≤767px, `tiny` ≤479px) —
> only the properties that change, desktop-first.
>
> **Shape** (`styleGuideSpecSchema`):
> ```
> {
>   "version": 1,
>   "source": { "url": "…", "name": "…" },
>   "variables": {
>     "--token-name": { "value": "<resolved literal>", "type": "color|size|font|number|other", "label": "<human name>" }
>   },
>   "classes": {
>     "<client-first class name>": {
>       "base": { "<css-prop>": "<value or var(--token)>" },
>       "breakpoints": { "medium": { "<css-prop>": "<value>" }, "small": {…}, "tiny": {…} },
>       "variants": { "is-secondary": { "<css-prop>": "<delta value>" } }
>     }
>   },
>   "colorSchemes": {
>     "color-scheme-1": { "label": "<where it's used>", "vars": { "--background-color": "var(--…)", "--text-color": "var(--…)", "--border-color": "var(--…)" } }
>   }
> }
> ```
>
> **Classes to include** (client-first names, exactly):
> - `heading-style-h1` … `heading-style-h6` — font-family, font-size, font-weight,
>   line-height, letter-spacing.
> - `text-size-large`, `text-size-medium`, `text-size-regular`, `text-size-small`,
>   `text-size-tiny`.
> - `text-weight-light`, `text-weight-normal`, `text-weight-medium`,
>   `text-weight-semibold`, `text-weight-bold`, `text-weight-xbold` (each just its
>   `font-weight`, referencing a `--weight-*` variable).
> - `text-style-*` — only the ones the source actually uses (`text-style-tagline`,
>   `text-style-link`, `text-style-muted`, `text-style-quote`, `text-style-allcaps`,
>   `text-style-italic`, `text-style-strikethrough`, `text-style-nowrap`).
> - `button` — its `base`, plus a `variants` entry for each variant the source has:
>   `is-secondary`, `is-small`, `is-link`, `is-alternate` (dark-scheme version),
>   `is-icon`. Each variant holds only the properties that differ from `base`.
> - `padding-section-small`, `padding-section-medium`, `padding-section-large` —
>   the source's section vertical padding (top/bottom), referencing `--spacing-*`.
>
> **Also capture as `variables`** (with `type`): the full color palette; font
> families (`--font-heading`, `--font-body`); the font-weight steps; the spacing
> scale (`--spacing-1` … or the source's own steps); radius steps
> (`--radius-small/medium/large`); shadow steps (`--shadow-small/medium/large`,
> `type: "other"`). And define the `colorSchemes` from the source's distinct
> section treatments (light, cream, dark, …); each scheme has a `label` (where it's
> used, e.g. "Dark navy — Challenge section") and a `vars` map assigning
> `--background-color`, `--text-color`, and `--border-color`.
>
> **Rules:**
> - **Concrete values only** — evaluate any `calc()`/`clamp()` to a number.
> - **Physical** properties (`padding-left`, not `padding-inline`); no `gap`; write
>   zero widths as `"0px"` (not `"0"`).
> - **Variants are deltas.** Each `variants` entry contains ONLY the properties that
>   differ from `base` — never repeat a base value, and **omit a variant entirely
>   if it wouldn't change anything** (don't emit a variant equal to `base`).
> - **Keep scale steps distinct.** For stepped families
>   (`padding-section-small`/`medium`/`large`, the text sizes, the radii), give each
>   step the source's own value; don't emit two identical steps unless the source
>   genuinely uses the same value.
> - **Don't hardcode a color that assumes a background.** For text/link styles that
>   can appear on different color schemes, omit `color` (so it inherits the scheme's
>   `--text-color`) or reference a variable; only bake in a color when that element
>   always sits on one specific scheme.
> - **Per-source, not uniform.** Set `letter-spacing`, `line-height`, `font-weight`,
>   etc. to each class's real value from the source; only apply one value across a
>   whole family if the source actually does.
> - **Fonts:** use one consistent `font-family` across a family like `text-size-*`
>   unless the source clearly renders a size in a different font. If the source uses
>   a distinct font for a specific role (e.g. a contact/address font), give that
>   role its own `text-style-*` class that references the font variable — don't
>   leave a font as an unused token.
> - **No non-CSS keys in declaration maps or `vars`.** Descriptions belong only in a
>   `label` field (on a variable or a color scheme), never as a fake property.
> - **Reference what you intend to apply.** A variable no class uses will not be
>   applied — either reference it from a class or keep it only as a deliberate
>   palette/reference token.
> - Build buttons as link styling (they'll become `<a>`); ignore Webflow's auto
>   classes (`w-button`, `w-inline-block`).
> - Do **not** invent tokens or classes the source doesn't have — omit them.
> - Do **not** include fixed client-first scaffolding/utilities
>   (`padding-global`, `container-*`, `page-wrapper`, hide/show, the icon grid):
>   those are identical in every clone. Capture **values**, not structure.
> - Output only the JSON object.

---

## Worked fragment (what good output looks like)

```json
{
  "version": 1,
  "variables": {
    "--color-primary": { "value": "#FF9902", "type": "color", "label": "Primary warm accent" },
    "--color-neutral-darkest": { "value": "#0D0800", "type": "color", "label": "Neutral Darkest" },
    "--font-heading": { "value": "Lato, sans-serif", "type": "font", "label": "Font / Heading" },
    "--weight-bold": { "value": "700", "type": "number", "label": "Weight / Bold" },
    "--radius-medium": { "value": "6px", "type": "size", "label": "Radius / Medium" }
  },
  "classes": {
    "heading-style-h1": {
      "base": { "font-family": "var(--font-heading)", "font-size": "3.5rem", "font-weight": "var(--weight-bold)", "line-height": "1.1" },
      "breakpoints": { "medium": { "font-size": "2.75rem" }, "small": { "font-size": "2.25rem" } }
    },
    "button": {
      "base": { "background-color": "var(--color-primary)", "color": "var(--color-neutral-darkest)", "border-top-left-radius": "var(--radius-medium)", "padding-top": "0.75rem", "padding-left": "1.75rem" },
      "variants": { "is-secondary": { "background-color": "transparent", "border-top-color": "var(--color-primary)" } }
    }
  },
  "colorSchemes": {
    "color-scheme-1": {
      "label": "Light surface — Philosophy, Services, Workshops",
      "vars": { "--background-color": "var(--color-white)", "--text-color": "var(--color-neutral-darkest)" }
    }
  }
}
```

## Why JSON (not an HTML page)

- **It's the interface the apply-step needs.** Each class maps 1:1 onto Designer-API
  calls: `style.setProperties(base)` + one per breakpoint, and
  `style.setProperty(prop, variable)` wherever a value is `var(--token)`.
- **Variable names stay explicit.** `getComputedStyle` on an HTML page resolves
  `var()` down to a literal; JSON keeps the token + `label`, so we bind the
  destination classes to variables **by name** (unambiguous), value-matching only
  as fallback. This mirrors the destination — Relume classes are variable-bound,
  and re-theming means updating variable *values*.
- **A schema constrains the AI** far better than free-form HTML, and we
  zod-validate the result against `styleGuideSpecSchema` before applying it.
- **No visual is lost** — once applied, the Relume Style Guide page in Webflow is
  the rendered style guide.
- **Buttons/schemes carry structure the migration reuses**: button variants are
  combo deltas; schemes theme whole sections. Both map straight onto the
  destination.
