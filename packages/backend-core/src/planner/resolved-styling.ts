import {
  BuildNode,
  PlannerWarning,
  SectionMetadata,
  SkeletonPlan,
  StylingPlan,
  WorkflowMode,
  stylingPlanSchema
} from "@wfb/shared/contracts.js";
import { isBuilderClassName, isReservedStyleGuideClassName } from "@wfb/shared/client-first.js";
import {
  collectRawDeclarations,
  normalizeResolvedLayout,
  parseCompiledCss,
  resolveDeclarationsWithBindings,
  splitLayoutVisual
} from "./css-resolver.js";

// Client-first global utilities that are meant to be REUSED from the bound
// site. Section-scoped, functional classes are preferred as the styling target,
// but these base classes are used as a fallback so element/descendant
// typography (e.g. `.cbs-header h2` -> heading-style-h2) still gets defined.
const REUSABLE_BASE_CLASS =
  /^(heading-style-|text-size-|text-weight-|text-style-|text-color-|container-|padding-global$|padding-section-|page-wrapper$|page-padding$|spacer-|margin-|max-width-|background-color-)/;

function isReusableBaseClass(name: string): boolean {
  return REUSABLE_BASE_CLASS.test(name);
}

/** Perceived luminance (0 = black, 1 = white) for a hex/rgb color, or null. */
function perceivedLuminance(color: string): number | null {
  const hex = color.trim().replace(/^#/, "");
  let r: number;
  let g: number;
  let b: number;
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  } else if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else {
    const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(color.trim());
    if (!rgb) return null;
    [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** A dark, near-neutral literal reads as "default ink" rather than an intentional accent. */
function isDarkInkLiteral(color: string): boolean {
  const luminance = perceivedLuminance(color);
  return luminance !== null && luminance < 0.5;
}

// Positioning/stacking scaffolding is inert once we drop the base's absolute
// positioning — never carry it onto a combo class.
const SCAFFOLD_KEYS = ["position", "top", "right", "bottom", "left", "inset", "z-index"];

/**
 * Split a node's source classes into base classes and BEM `--modifier` classes
 * (a modifier is `X--suffix` where `X` is also one of the node's classes). The
 * modifier carries the per-instance override (e.g. a card's accent color).
 */
function splitBaseAndModifiers(sourceClasses: string[]): { base: string[]; modifiers: string[] } {
  const modifiers = sourceClasses.filter((candidate) =>
    sourceClasses.some((other) => other !== candidate && candidate.startsWith(`${other}--`))
  );
  return {
    base: sourceClasses.filter((name) => !modifiers.includes(name)),
    modifiers
  };
}

function classSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Pick the client-first class a node's resolved CSS should attach to: prefer a
 * section-scoped functional class; fall back to a reusable base class so
 * typography still lands somewhere renderable.
 */
function targetClassFor(node: BuildNode): string | null {
  const scoped = node.classNames.find(
    (name) => isBuilderClassName(name) && !isReusableBaseClass(name)
  );
  if (scoped) {
    return scoped;
  }
  // Only headings are safe to define on a shared base class (one heading level
  // per section). Other base classes (text-size-*, container-*) are multi-role —
  // merging different elements' CSS onto them corrupts, so we skip them.
  return (
    node.classNames.find((name) => isBuilderClassName(name) && /^heading-style-/.test(name)) ?? null
  );
}

function walk(
  node: BuildNode,
  ancestorSourceClasses: Set<string>,
  visit: (node: BuildNode, ancestors: Set<string>) => void
): void {
  visit(node, ancestorSourceClasses);
  const childAncestors = new Set(ancestorSourceClasses);
  (node.sourceClassNames ?? []).forEach((name) => childAncestors.add(name));
  (node.children ?? []).forEach((child) => walk(child, childAncestors, visit));
}

/**
 * Build a styling plan by resolving each node's ORIGINAL source classes AND the
 * class-scoped element/descendant rules that apply to it against the compiled
 * stylesheet, then attaching the real declarations to the node's client-first
 * class. Deterministic — no suffix guessing.
 */
export function buildResolvedStylingFromSkeleton(input: {
  metadata: SectionMetadata;
  mode: WorkflowMode;
  skeleton: SkeletonPlan;
  cssText: string;
  inheritedWarnings?: PlannerWarning[];
}): StylingPlan {
  const parsed = parseCompiledCss(input.cssText);
  const styleDefinitions = new Map<string, Record<string, string>>();
  const comboClasses = new Set<string>();
  const variableBindings: Array<{
    nodeId: string;
    property: string;
    variableName: string;
    value: string;
  }> = [];

  walk(input.skeleton.elementTree, new Set<string>(), (node, ancestors) => {
    const { base, modifiers } = splitBaseAndModifiers(node.sourceClassNames ?? []);
    const target = targetClassFor(node);

    // BASE → the shared target class. Resolve from base classes only so per-
    // instance modifiers don't leak into the shared class.
    const raw = collectRawDeclarations({ ...node, sourceClassNames: base }, ancestors, parsed);
    const resolved = resolveDeclarationsWithBindings(raw, parsed.variables);
    // Strip scroll-animation positioning scaffolding so decked/absolute items
    // flow instead of piling up (see normalizeResolvedLayout).
    const properties = normalizeResolvedLayout(resolved.properties);
    const bindings = resolved.bindings.filter((binding) => properties[binding.property] !== undefined);
    // Headings often hardcode a one-off dark ink (a Figma-export artifact) instead
    // of the design text token. Normalize them to the site's inherited text color
    // (usually a var), so headings match the rest of the type system. Intentional
    // non-dark heading colors (e.g. light text on a dark section) are left alone.
    if (
      node.type === "heading" &&
      parsed.defaultTextColor &&
      typeof properties.color === "string" &&
      !bindings.some((binding) => binding.property === "color") &&
      isDarkInkLiteral(properties.color)
    ) {
      properties.color = parsed.defaultTextColor.value;
      if (parsed.defaultTextColor.variableName) {
        bindings.push({
          property: "color",
          variableName: parsed.defaultTextColor.variableName,
          value: parsed.defaultTextColor.value
        });
      }
    }
    // First node to claim a class wins — avoids merging semantically different
    // elements (e.g. a <section> and its <header>) onto one class.
    if (
      target &&
      !isReservedStyleGuideClassName(target) &&
      !styleDefinitions.has(target) &&
      Object.keys(properties).length > 0
    ) {
      styleDefinitions.set(target, properties);
      for (const binding of bindings) {
        variableBindings.push({ nodeId: node.id, ...binding });
      }
    }

    // COMBO → a per-instance modifier class (e.g. this card's accent) applied on
    // top of the shared base class. Resolved from the modifier classes alone.
    if (target && modifiers.length > 0) {
      const modifierRaw: Record<string, string> = {};
      for (const modifier of modifiers) {
        Object.assign(modifierRaw, parsed.classes.get(modifier) ?? {});
      }
      const comboResolved = resolveDeclarationsWithBindings(modifierRaw, parsed.variables);
      const comboProps = normalizeResolvedLayout(comboResolved.properties);
      for (const key of SCAFFOLD_KEYS) {
        delete comboProps[key];
      }
      if (Object.keys(comboProps).length > 0) {
        const suffix = classSlug(modifiers[0].split("--").pop() ?? "") || String(comboClasses.size + 1);
        const comboClass = `${target}_v${suffix}`;
        if (!styleDefinitions.has(comboClass)) {
          styleDefinitions.set(comboClass, comboProps);
          comboClasses.add(comboClass);
        }
        if (!node.classNames.includes(comboClass)) {
          node.classNames.push(comboClass);
        }
        for (const binding of comboResolved.bindings) {
          if (comboProps[binding.property] !== undefined) {
            variableBindings.push({ nodeId: node.id, ...binding });
          }
        }
      }
    }
  });

  const suggestedNewClasses = [...styleDefinitions.keys()];

  return stylingPlanSchema.parse({
    sectionMetadata: input.metadata,
    mode: input.mode,
    styleDefinitions: suggestedNewClasses.map((className) => {
      const properties = styleDefinitions.get(className) ?? {};
      const { layout, visual } = splitLayoutVisual(properties);
      // Layout first (skeleton gate), then visual (styling gate) — order only.
      return {
        className,
        properties: { ...layout, ...visual },
        shared: false,
        combo: comboClasses.has(className)
      };
    }),
    variableBindings,
    reusableClasses: [],
    suggestedNewClasses,
    requiredClassNames: [],
    notes: [
      "Styling resolved deterministically from the source compiled CSS, including class-scoped element/descendant typography (looked up, not guessed)."
    ],
    warnings: [...(input.inheritedWarnings ?? [])]
  });
}
