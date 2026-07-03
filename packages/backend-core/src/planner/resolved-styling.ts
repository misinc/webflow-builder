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
  // No scoped class: fall back to the node's shared base class (heading-style-*,
  // text-size-*, …). Shared bases are never DEFINED from one node's CSS — they
  // are multi-role and belong to the project — so the caller attaches the
  // node's resolved styles as a content-hashed combo on top instead.
  return node.classNames.find((name) => isBuilderClassName(name) && isReusableBaseClass(name)) ?? null;
}

/** Short stable hash so combo names are deterministic across separate copies. */
function contentHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(i), 0x01000193) >>> 0;
  }
  return hash.toString(36).slice(0, 5);
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
  const comboByKey = new Map<string, string>();
  const variableBindings: Array<{
    nodeId: string;
    property: string;
    variableName: string;
    value: string;
  }> = [];

  // Get (or create) the combo class for a target + override, deduped by content
  // so instances with the same override (e.g. two same-colored icons) share a
  // class. The suffix is a content hash, so the same styles always produce the
  // same combo name even across separately copied sections/pages.
  const comboClassFor = (target: string, props: Record<string, string>): string => {
    const key = `${target}|${JSON.stringify(Object.entries(props).sort())}`;
    const existing = comboByKey.get(key);
    if (existing) {
      return existing;
    }
    const name = `${target}_v${contentHash(key)}`;
    comboByKey.set(key, name);
    comboClasses.add(name);
    styleDefinitions.set(name, props);
    return name;
  };

  // Nearest ancestor's resolved color, for heading ink inheritance.
  const inheritedColorByNode = new Map<BuildNode, string>();
  // Nodes that resolved NO styles of their own but share a scoped class name —
  // if that class ends up styled by another node, these must not wear it (they
  // would inherit e.g. an absolute bg layer's positioning with no combo to
  // neutralize it). They paste as bare divs instead.
  const styleLessNodesByTarget = new Map<string, BuildNode[]>();

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
    // Record this node's resolved color so descendants can inherit it.
    if (typeof properties.color === "string") {
      for (const child of node.children ?? []) {
        inheritedColorByNode.set(child, properties.color);
      }
    } else {
      const inherited = inheritedColorByNode.get(node);
      if (inherited) {
        for (const child of node.children ?? []) {
          inheritedColorByNode.set(child, inherited);
        }
      }
    }
    // A heading with NO color of its own inherits ink in the browser — from the
    // nearest colored ancestor when the section defines one, else the body ink.
    // Carry it explicitly, since Webflow's default heading color differs.
    if (
      node.type === "heading" &&
      properties.color === undefined &&
      Object.keys(properties).length > 0
    ) {
      const ancestorInk = inheritedColorByNode.get(node);
      if (ancestorInk) {
        properties.color = ancestorInk;
      } else if (parsed.defaultTextColor) {
        properties.color = parsed.defaultTextColor.value;
        if (parsed.defaultTextColor.variableName) {
          bindings.push({
            property: "color",
            variableName: parsed.defaultTextColor.variableName,
            value: parsed.defaultTextColor.value
          });
        }
      }
    }
    if (
      target &&
      !isReservedStyleGuideClassName(target) &&
      !isReusableBaseClass(target) &&
      Object.keys(properties).length === 0 &&
      modifiers.length === 0 &&
      !node.inlineStyles
    ) {
      const list = styleLessNodesByTarget.get(target) ?? [];
      list.push(node);
      styleLessNodesByTarget.set(target, list);
    }
    if (target && !isReservedStyleGuideClassName(target) && Object.keys(properties).length > 0) {
      if (isReusableBaseClass(target)) {
        // Shared base class (heading-style-h1, text-size-medium, …): never
        // define it from one node's CSS — the project owns it. Attach the
        // node's resolved styles as a content-hashed combo on top, so the
        // paste matches the source (e.g. a 48px h1 on a 56px project base, or
        // an uppercase orange eyebrow on plain body text).
        const comboClass = comboClassFor(target, properties);
        if (!node.classNames.includes(comboClass)) {
          node.classNames.push(comboClass);
        }
        for (const binding of bindings) {
          variableBindings.push({ nodeId: node.id, ...binding });
        }
      } else if (!styleDefinitions.has(target)) {
        // First node to claim a scoped class wins — avoids merging semantically
        // different elements (e.g. a <section> and its <header>) onto one class.
        styleDefinitions.set(target, properties);
        for (const binding of bindings) {
          variableBindings.push({ nodeId: node.id, ...binding });
        }
      } else {
        // A LATER node sharing the scoped class (e.g. hero background layers
        // and the content wrapper all named hero_content) must not lose its
        // styles to first-wins — its differing declarations ride in a
        // content-hashed combo on top of the shared class.
        const existing = styleDefinitions.get(target)!;
        const overrides: Record<string, string> = {};
        for (const [property, value] of Object.entries(properties)) {
          if (existing[property] !== value) {
            overrides[property] = value;
          }
        }
        // A combo can only ADD declarations — it cannot unset the base. If the
        // base carries positioning this node does not define (e.g. the base was
        // claimed by an absolute bg layer while this node is a normal in-flow
        // wrapper), neutralize it explicitly or the node inherits the overlay
        // positioning and everything stacks at the top-left.
        const POSITION_NEUTRAL: Record<string, string> = {
          position: "static",
          top: "auto",
          right: "auto",
          bottom: "auto",
          left: "auto",
          inset: "auto",
          "z-index": "auto"
        };
        for (const [key, neutral] of Object.entries(POSITION_NEUTRAL)) {
          if (existing[key] !== undefined && properties[key] === undefined) {
            overrides[key] = neutral;
          }
        }
        if (Object.keys(overrides).length > 0) {
          const comboClass = comboClassFor(target, overrides);
          if (!node.classNames.includes(comboClass)) {
            node.classNames.push(comboClass);
          }
          for (const binding of bindings) {
            if (overrides[binding.property] !== undefined) {
              variableBindings.push({ nodeId: node.id, ...binding });
            }
          }
        }
      }
    }

    // COMBO → a per-instance override applied on top of the shared base class,
    // from BEM `--modifier` classes and/or safelisted inline styles (e.g. a card's
    // accent border, or an icon's inline color that drives a currentColor ring).
    const overrideRaw: Record<string, string> = {};
    for (const modifier of modifiers) {
      Object.assign(overrideRaw, parsed.classes.get(modifier) ?? {});
    }
    Object.assign(overrideRaw, node.inlineStyles ?? {});
    if (target && Object.keys(overrideRaw).length > 0) {
      const comboResolved = resolveDeclarationsWithBindings(overrideRaw, parsed.variables);
      const comboProps = normalizeResolvedLayout(comboResolved.properties);
      for (const key of SCAFFOLD_KEYS) {
        delete comboProps[key];
      }
      if (Object.keys(comboProps).length > 0) {
        const comboClass = comboClassFor(target, comboProps);
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

  // Strip styled scoped classes from the nodes that contributed nothing to them.
  for (const [target, nodes] of styleLessNodesByTarget) {
    const definition = styleDefinitions.get(target);
    if (definition && Object.keys(definition).length > 0) {
      for (const node of nodes) {
        node.classNames = node.classNames.filter((name) => name !== target);
      }
    }
  }

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
