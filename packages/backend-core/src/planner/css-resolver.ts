import postcss from "postcss";
import valueParser from "postcss-value-parser";

/**
 * Parsed view of a compiled stylesheet:
 * - `classes`: single-class selectors -> their (base, non-media) declarations.
 * - `variables`: :root custom-property values.
 * - `descendantRules`: class-scoped element/descendant rules (".A tag" / ".A .B"),
 *   which is where sites commonly put typography (e.g. `.cbs-section h3`).
 *
 * This is the deterministic alternative to guessing CSS from class-name
 * suffixes — the real declarations are looked up by the exact source class.
 */
export interface DescendantRule {
  ancestorClass: string;
  matchTag?: string;
  matchClass?: string;
  declarations: Record<string, string>;
}

export interface ParsedCss {
  classes: Map<string, Record<string, string>>;
  /** `#id` selector rules, keyed by id (sections often set their background here). */
  idRules: Map<string, Record<string, string>>;
  variables: Map<string, string>;
  descendantRules: DescendantRule[];
  /**
   * The site's inherited text color, taken from `body`/`html { color }`. Text
   * that doesn't set its own color inherits this in the browser; it is usually a
   * design token (e.g. `var(--foreground)`), so we keep the token binding.
   */
  defaultTextColor?: { value: string; variableName?: string };
}

// Match class selectors that may contain CSS-escaped characters, e.g. the
// Tailwind arbitrary-value class `.gap-\[48px\]` (class name "gap-[48px]").
const SIMPLE_CLASS_SELECTOR = /^\.((?:\\.|[\w-])+)$/;
// A selector whose rightmost target is `#id` — bare (`#services`) or scoped under
// a global theme wrapper (`.theme #services`). The theme class lives on <body>,
// outside the section, so we key purely by id and let source order (active theme
// last) win. Excludes rules that target a descendant of the id (`#services h2`).
const ID_TARGET_SELECTOR = /(?:^|[\s>+~])#([\w-]+)$/;
const DESCENDANT_TAG_SELECTOR = /^\.((?:\\.|[\w-])+)(?:\s*>\s*|\s+)([a-z][a-z0-9]*)$/;
const DESCENDANT_CLASS_SELECTOR = /^\.((?:\\.|[\w-])+)(?:\s*>\s*|\s+)\.((?:\\.|[\w-])+)$/;

function unescapeClassName(name: string): string {
  return name.replace(/\\(.)/g, "$1");
}

/**
 * Merge order for a rule: 0 = base (desktop-first). A positive number is a
 * min-width breakpoint (larger wins → desktop). null = skip (max-width mobile
 * override, @supports, keyframes) so desktop values always take precedence.
 */
function ruleBreakpointOrder(rule: postcss.Rule): number | null {
  let order = 0;
  let parent: postcss.Container | postcss.Document | undefined = rule.parent;
  while (parent) {
    if (parent.type === "atrule") {
      const atRule = parent as postcss.AtRule;
      const name = atRule.name.toLowerCase();
      if (name === "media") {
        if (/max-width/i.test(atRule.params)) {
          return null;
        }
        const min = /min-width:\s*([\d.]+)(px|rem|em)?/i.exec(atRule.params);
        if (!min) {
          return null;
        }
        order = Math.max(order, /rem|em/i.test(min[2] ?? "") ? Number(min[1]) * 16 : Number(min[1]));
      } else if (name !== "layer" && name !== "scope") {
        // @layer / @scope are transparent (Tailwind v4 nests utilities in
        // @layer); @supports / @keyframes / @container / @property are skipped.
        return null;
      }
    }
    parent = parent.parent;
  }
  return order;
}

// A page payload resolves every section against the SAME compiled stylesheet —
// re-parsing ~500KB of CSS per section dominates the request time. Cache the
// last parse (result is treated as read-only by all consumers).
let parseCache: { cssText: string; parsed: ParsedCss } | null = null;

export function parseCompiledCss(cssText: string): ParsedCss {
  if (parseCache && parseCache.cssText === cssText) {
    return parseCache.parsed;
  }
  const classes = new Map<string, Record<string, string>>();
  const variables = new Map<string, string>();
  const descendantRules: DescendantRule[] = [];
  const idRules = new Map<string, Record<string, string>>();
  const scopedVars = new Map<string, string>();
  let rawBodyColor: string | undefined;
  let rawHtmlColor: string | undefined;
  if (!cssText.trim()) {
    return { classes, idRules, variables, descendantRules };
  }

  let root: postcss.Root;
  try {
    root = postcss.parse(cssText);
  } catch {
    return { classes, idRules, variables, descendantRules };
  }

  // Apply base rules first, then min-width breakpoints ascending, so desktop
  // values win for both desktop-first CSS and mobile-first Tailwind.
  const ordered: Array<{ order: number; rule: postcss.Rule }> = [];
  root.walkRules((rule) => {
    const order = ruleBreakpointOrder(rule);
    if (order !== null) {
      ordered.push({ order, rule });
    }
  });
  ordered.sort((a, b) => a.order - b.order);

  for (const { rule } of ordered) {
    const declarations: Record<string, string> = {};
    rule.walkDecls((decl) => {
      declarations[decl.prop] = decl.value;
    });

    for (const selector of rule.selector.split(",").map((value) => value.trim())) {
      if (selector === ":root") {
        for (const [prop, value] of Object.entries(declarations)) {
          if (prop.startsWith("--")) {
            variables.set(prop, value);
          }
        }
        continue;
      }

      // Custom properties defined outside :root (theme variant classes) — kept
      // as fallbacks, used only to fill vars that :root doesn't define. Tailwind's
      // internal cascade variables (--tw-*) are per-utility mechanics with many
      // conflicting values (e.g. --tw-leading: 0) — never treat them as tokens.
      for (const [prop, value] of Object.entries(declarations)) {
        if (prop.startsWith("--") && !prop.startsWith("--tw-") && !scopedVars.has(prop)) {
          scopedVars.set(prop, value);
        }
      }

      const idMatch = ID_TARGET_SELECTOR.exec(selector);
      if (idMatch) {
        idRules.set(idMatch[1], { ...(idRules.get(idMatch[1]) ?? {}), ...declarations });
        continue;
      }

      if (selector === "body" || selector === "html") {
        if (declarations.color) {
          if (selector === "body") rawBodyColor = declarations.color;
          else rawHtmlColor = declarations.color;
        }
        continue;
      }

      const simple = SIMPLE_CLASS_SELECTOR.exec(selector);
      if (simple) {
        const name = unescapeClassName(simple[1]);
        classes.set(name, { ...(classes.get(name) ?? {}), ...declarations });
        continue;
      }

      const descendantClass = DESCENDANT_CLASS_SELECTOR.exec(selector);
      if (descendantClass) {
        descendantRules.push({
          ancestorClass: unescapeClassName(descendantClass[1]),
          matchClass: unescapeClassName(descendantClass[2]),
          declarations
        });
        continue;
      }

      const descendantTag = DESCENDANT_TAG_SELECTOR.exec(selector);
      if (descendantTag) {
        descendantRules.push({
          ancestorClass: unescapeClassName(descendantTag[1]),
          matchTag: descendantTag[2],
          declarations
        });
      }
    }
  }

  for (const [prop, value] of scopedVars) {
    if (!variables.has(prop)) {
      variables.set(prop, value);
    }
  }

  const rawDefaultTextColor = rawBodyColor ?? rawHtmlColor;
  let defaultTextColor: ParsedCss["defaultTextColor"];
  if (rawDefaultTextColor) {
    const pure = PURE_VAR_VALUE.exec(rawDefaultTextColor.trim());
    const chain = pure ? resolveVarChain(pure[1], variables) : null;
    if (chain?.value) {
      defaultTextColor = { value: chain.value, variableName: chain.token };
    } else {
      const value = resolveValue(rawDefaultTextColor, variables).trim();
      if (value) {
        defaultTextColor = { value };
      }
    }
  }

  const parsed: ParsedCss = { classes, idRules, variables, descendantRules, defaultTextColor };
  parseCache = { cssText, parsed };
  return parsed;
}

/**
 * Resolve `var(--x, fallback)` references against the :root variable map,
 * handling nested fallbacks like `var(--a, var(--b))`. Uses a real value
 * parser so parentheses in functions such as `color-mix(...)` stay balanced.
 */
export function resolveValue(value: string, variables: Map<string, string>, depth = 0): string {
  if (depth > 8 || !value.includes("var(")) {
    return value;
  }
  const parsed = valueParser(value);
  parsed.walk((node) => {
    if (node.type !== "function" || node.value !== "var") {
      return undefined;
    }
    const nameNode = node.nodes.find((n) => n.type === "word" && n.value.startsWith("--"));
    const name = nameNode ? nameNode.value : null;
    let replacement = "";
    if (name && variables.has(name)) {
      replacement = resolveValue(variables.get(name) ?? "", variables, depth + 1);
    } else {
      const commaIndex = node.nodes.findIndex((n) => n.type === "div" && n.value === ",");
      if (commaIndex >= 0) {
        const fallback = valueParser.stringify(node.nodes.slice(commaIndex + 1)).trim();
        replacement = resolveValue(fallback, variables, depth + 1);
      }
    }
    const writable = node as unknown as { type: string; value: string; nodes: unknown[] };
    writable.type = "word";
    writable.value = replacement;
    writable.nodes = [];
    return false;
  });
  return parsed.toString();
}

/**
 * Evaluate simple two-operand calc() expressions to literal values. Tailwind v4
 * emits ALL spacing as `calc(var(--spacing) * N)` and line-heights as ratios
 * like `calc(1.75/1.125)` — Webflow silently drops calc() on paste, so gaps and
 * paddings vanish unless we compute them. Anything more complex passes through.
 */
export function evaluateSimpleCalc(value: string): string {
  if (!/calc\(/i.test(value)) {
    return value;
  }
  return value.replace(/calc\(([^()]*)\)/gi, (whole, inner: string) => {
    const match = /^\s*(-?[\d.]+)([a-z%]*)\s*([*/])\s*(-?[\d.]+)([a-z%]*)\s*$/i.exec(inner);
    if (!match) {
      return whole;
    }
    const a = Number(match[1]);
    const b = Number(match[4]);
    const aUnit = match[2];
    const bUnit = match[5];
    const op = match[3];
    // Only one operand may carry a unit, and division by a unit or zero is out.
    if (!Number.isFinite(a) || !Number.isFinite(b) || (aUnit && bUnit)) {
      return whole;
    }
    if (op === "/" && (b === 0 || bUnit)) {
      return whole;
    }
    const result = op === "*" ? a * b : a / b;
    return `${Math.round(result * 10000) / 10000}${aUnit || bUnit}`;
  });
}


/** Assign a resolved declaration, expanding the `inset` shorthand to physical
 *  offsets so positioning logic downstream sees uniform keys. */
function assignResolved(target: Record<string, string>, prop: string, value: string): void {
  if (prop === "inset") {
    const parts = value.trim().split(/\s+/);
    const [t, r = t, b = t, l = r] = parts;
    target.top = t;
    target.right = r;
    target.bottom = b;
    target.left = l;
    return;
  }
  target[prop] = value;
}

/** Resolve a raw declaration map (substitute vars, drop empties). */
export function resolveDeclarations(
  raw: Record<string, string>,
  variables: Map<string, string>
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [prop, rawValue] of Object.entries(raw)) {
    // Skip custom-property definitions (--x) and vendor-prefixed properties
    // (-webkit-*, -moz-*, …). Webflow rejects both as invalid style properties
    // and applies its own vendor prefixes for the standard property.
    if (prop.startsWith("-")) {
      continue;
    }
    const value = evaluateSimpleCalc(resolveValue(rawValue, variables).trim());
    if (value) {
      assignResolved(resolved, prop.toLowerCase(), value);
    }
  }
  return resolved;
}

/** Merge the resolved declarations for a list of class names (later wins). */
export function resolveClasses(classNames: string[], parsed: ParsedCss): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const className of classNames) {
    const declarations = parsed.classes.get(className);
    if (declarations) {
      Object.assign(resolved, resolveDeclarations(declarations, parsed.variables));
    }
  }
  return resolved;
}

/**
 * Resolve class-scoped element/descendant rules that apply to a node, given the
 * set of source class names on its ancestors (e.g. `.cbs-section h3`).
 */
export function resolveDescendantRules(
  node: { tag: string; sourceClassNames?: string[] },
  ancestorSourceClasses: Set<string>,
  parsed: ParsedCss
): Record<string, string> {
  const resolved: Record<string, string> = {};
  const ownClasses = node.sourceClassNames ?? [];
  for (const rule of parsed.descendantRules) {
    if (!ancestorSourceClasses.has(rule.ancestorClass)) {
      continue;
    }
    const matches = rule.matchTag
      ? node.tag === rule.matchTag
      : rule.matchClass
        ? ownClasses.includes(rule.matchClass)
        : false;
    if (matches) {
      Object.assign(resolved, resolveDeclarations(rule.declarations, parsed.variables));
    }
  }
  return resolved;
}

const PURE_VAR_VALUE = /^var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,[^()]*)?\)$/;

/** Follow a var() chain to the token that actually holds a literal value. */
function resolveVarChain(
  name: string,
  variables: Map<string, string>,
  depth = 0
): { token: string; value: string } | null {
  if (depth > 8) {
    return null;
  }
  const raw = variables.get(name);
  if (raw === undefined) {
    return null;
  }
  const nested = PURE_VAR_VALUE.exec(raw.trim());
  if (nested) {
    return resolveVarChain(nested[1], variables, depth + 1);
  }
  return { token: name.replace(/^--/, ""), value: resolveValue(raw, variables).trim() };
}

export interface ResolvedDeclarations {
  properties: Record<string, string>;
  bindings: Array<{ property: string; variableName: string; value: string }>;
}

/**
 * Resolve declarations AND, for any property whose whole value is a single
 * var() reference, record a binding to the underlying design token (with the
 * resolved literal kept as a fallback value).
 */
export function resolveDeclarationsWithBindings(
  raw: Record<string, string>,
  variables: Map<string, string>
): ResolvedDeclarations {
  const properties: Record<string, string> = {};
  const bindings: ResolvedDeclarations["bindings"] = [];
  for (const [prop, rawValue] of Object.entries(raw)) {
    // Custom-property definitions (--x) and vendor-prefixed properties
    // (-webkit-*, …) are not valid Webflow style properties — skip them. A
    // custom prop's usage via var(--x) is resolved/bound separately, and Webflow
    // applies its own vendor prefixes for the standard property.
    if (prop.startsWith("-")) {
      continue;
    }
    const property = prop.toLowerCase();
    const pure = PURE_VAR_VALUE.exec(rawValue.trim());
    if (pure) {
      const chain = resolveVarChain(pure[1], variables);
      if (chain && chain.value) {
        properties[property] = chain.value;
        bindings.push({ property, variableName: chain.token, value: chain.value });
        continue;
      }
    }
    const value = evaluateSimpleCalc(resolveValue(rawValue, variables).trim());
    if (value) {
      assignResolved(properties, property, value);
    }
  }
  return { properties, bindings };
}

/** Merge the raw (unresolved) declarations that apply to a node. */
export function collectRawDeclarations(
  node: { tag: string; sourceClassNames?: string[]; sourceId?: string },
  ancestorSourceClasses: Set<string>,
  parsed: ParsedCss
): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const className of node.sourceClassNames ?? []) {
    const declarations = parsed.classes.get(className);
    if (declarations) {
      Object.assign(raw, declarations);
    }
  }
  // `#id` rules win over class rules (higher specificity) — e.g. a section that
  // sets its own background by id.
  if (node.sourceId) {
    const idDeclarations = parsed.idRules.get(node.sourceId);
    if (idDeclarations) {
      Object.assign(raw, idDeclarations);
    }
  }
  const ownClasses = node.sourceClassNames ?? [];
  for (const rule of parsed.descendantRules) {
    if (!ancestorSourceClasses.has(rule.ancestorClass)) {
      continue;
    }
    const matches = rule.matchTag
      ? node.tag === rule.matchTag
      : rule.matchClass
        ? ownClasses.includes(rule.matchClass)
        : false;
    if (matches) {
      Object.assign(raw, rule.declarations);
    }
  }
  return raw;
}

/** Properties that determine structure/layout (the skeleton gate). */
export const LAYOUT_PROPERTIES = new Set([
  "display",
  "flex-direction",
  "flex-wrap",
  "flex",
  "grid-template-columns",
  "grid-template-rows",
  "grid-column",
  "grid-row",
  "grid-auto-flow",
  "gap",
  "row-gap",
  "column-gap",
  "align-items",
  "align-content",
  "justify-content",
  "justify-items",
  "justify-self",
  "align-self",
  "place-items",
  "place-content",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "inset",
  "width",
  "max-width",
  "min-width",
  "height",
  "max-height",
  "min-height",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "order"
]);

/**
 * Normalize resolved layout for a clean, JS-free rebuild.
 *
 * Scroll-animated decks position their items with `position: absolute` + per-item
 * `top` offsets (and a fixed-height, scroll-pinned container). Since every deck
 * item maps to ONE client-first class, they all collapse to the same offset and
 * pile up. Strip the out-of-flow scaffolding so items flow again:
 *  - drop `position: absolute|fixed` (and `sticky` when it's paired with a fixed
 *    pixel height — the scroll-pin signature) plus insets and z-index,
 *  - drop the fixed pixel height that pinned the container,
 *  - a `gap` on a `block` box does nothing, so a leftover gap means a flex/grid
 *    stack was intended (the block came from the animation override) — restore a
 *    flex column so items stretch to full width (absolute items were full-width
 *    via left:0/right:0, which we just removed).
 */
export function normalizeResolvedLayout(
  declarations: Record<string, string>
): Record<string, string> {
  const out = { ...declarations };
  const position = out.position?.toLowerCase();
  const hasFixedPxHeight = typeof out.height === "string" && /^\d+(\.\d+)?px$/.test(out.height.trim());
  // A full-cover overlay (all four offsets set, e.g. `absolute inset-0` hero
  // background layers) is legitimate positioning — keep it. Deck items have a
  // top offset but no bottom; those are the ones that pile up when shared.
  const isFullCoverOverlay =
    out.inset !== undefined ||
    (out.top !== undefined && out.right !== undefined && out.bottom !== undefined && out.left !== undefined);
  const stripPositioning =
    ((position === "absolute" || position === "fixed") && !isFullCoverOverlay) ||
    (position === "sticky" && hasFixedPxHeight);
  if (stripPositioning) {
    delete out.position;
    delete out.top;
    delete out.right;
    delete out.bottom;
    delete out.left;
    delete out.inset;
    delete out["z-index"];
    if (hasFixedPxHeight) {
      delete out.height;
    }
  }
  if (out.gap && (!out.display || out.display.toLowerCase() === "block")) {
    out.display = "flex";
    out["flex-direction"] = "column";
  }
  // `opacity: 0` (usually with pointer-events: none) is a JS reveal-animation's
  // initial state — pasted as-is the element would be permanently invisible.
  if (out.opacity !== undefined && Number(out.opacity) === 0) {
    delete out.opacity;
    if (out["pointer-events"]?.toLowerCase() === "none") {
      delete out["pointer-events"];
    }
  }
  return out;
}

/** Split resolved declarations into structural (layout) vs visual (skin). */
export function splitLayoutVisual(declarations: Record<string, string>): {
  layout: Record<string, string>;
  visual: Record<string, string>;
} {
  const layout: Record<string, string> = {};
  const visual: Record<string, string> = {};
  for (const [prop, value] of Object.entries(declarations)) {
    if (LAYOUT_PROPERTIES.has(prop)) {
      layout[prop] = value;
    } else {
      visual[prop] = value;
    }
  }
  return { layout, visual };
}
