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
  variables: Map<string, string>;
  descendantRules: DescendantRule[];
}

const SIMPLE_CLASS_SELECTOR = /^\.([A-Za-z0-9_-]+)$/;
const DESCENDANT_TAG_SELECTOR = /^\.([A-Za-z0-9_-]+)(?:\s*>\s*|\s+)([a-z][a-z0-9]*)$/;
const DESCENDANT_CLASS_SELECTOR = /^\.([A-Za-z0-9_-]+)(?:\s*>\s*|\s+)\.([A-Za-z0-9_-]+)$/;

export function parseCompiledCss(cssText: string): ParsedCss {
  const classes = new Map<string, Record<string, string>>();
  const variables = new Map<string, string>();
  const descendantRules: DescendantRule[] = [];
  if (!cssText.trim()) {
    return { classes, variables, descendantRules };
  }

  let root: postcss.Root;
  try {
    root = postcss.parse(cssText);
  } catch {
    return { classes, variables, descendantRules };
  }

  root.walkRules((rule) => {
    // Base (desktop) styles only — @media / @supports overrides are handled
    // separately when we map breakpoints. Skip any rule nested in an at-rule.
    let parent: postcss.Container | postcss.Document | undefined = rule.parent;
    while (parent) {
      if (parent.type === "atrule") {
        return;
      }
      parent = parent.parent;
    }

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

      const simple = SIMPLE_CLASS_SELECTOR.exec(selector);
      if (simple) {
        const current = classes.get(simple[1]) ?? {};
        classes.set(simple[1], { ...current, ...declarations });
        continue;
      }

      const descendantClass = DESCENDANT_CLASS_SELECTOR.exec(selector);
      if (descendantClass) {
        descendantRules.push({
          ancestorClass: descendantClass[1],
          matchClass: descendantClass[2],
          declarations
        });
        continue;
      }

      const descendantTag = DESCENDANT_TAG_SELECTOR.exec(selector);
      if (descendantTag) {
        descendantRules.push({
          ancestorClass: descendantTag[1],
          matchTag: descendantTag[2],
          declarations
        });
      }
    }
  });

  return { classes, variables, descendantRules };
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

/** Resolve a raw declaration map (substitute vars, drop empties). */
export function resolveDeclarations(
  raw: Record<string, string>,
  variables: Map<string, string>
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [prop, rawValue] of Object.entries(raw)) {
    const value = resolveValue(rawValue, variables).trim();
    if (value) {
      resolved[prop.toLowerCase()] = value;
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
