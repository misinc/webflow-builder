import { htmlToBuildNode } from "@wfb/backend-core/planner/html-planner.js";
import { buildWebflowClipboardPayload } from "@wfb/shared/webflow-clipboard.js";
import type { XscpData } from "@wfb/shared/webflow-clipboard.js";
import type { BuildNode } from "@wfb/shared/contracts.js";

/**
 * URL-first capture → client-first payload.
 *
 * A section's real (annotated) HTML is run through the client-first planner
 * (`htmlToBuildNode`) for structure + naming — `section_{key}` → `padding-global`
 * → `container-large` → `padding-section-*`, `heading-style-h*`, `text-size-*`,
 * `{key}_card`, … — then the browser-computed styles captured per node are
 * attached as content-hashed combo classes, joined back by `data-pw-key`
 * (`BuildNode.sourceKey`). The planner's scaffold nodes carry no `sourceKey`, so
 * they stay styled by the project's Style Guide.
 *
 * Responsive: per-node styles captured at each breakpoint width are diffed,
 * desktop-first, into `variants` deltas (medium/small/tiny) — the shape real
 * Designer copies use.
 */

/** A DOM subtree captured from a real render (kept for extract.ts's flatten). */
export interface CapturedNode {
  tag: string;
  key?: string;
  text?: string;
  embedHtml?: string;
  styles: Record<string, string>;
  attrs: { href?: string; src?: string; alt?: string; id?: string };
  children: CapturedNode[];
}

/** breakpoint key → (node key → authored styles at that width). */
export type BreakpointStyles = Record<string, Record<string, Record<string, string>>>;

export interface PlaygroundPayloadResult {
  payload: XscpData;
  stats: {
    nodeCount: number;
    classCount: number;
    responsiveClassCount: number;
    /** Nodes styled purely by client-first Style Guide classes (no combo). */
    styleGuideRefs: number;
    droppedLinkUrls: number;
    placeholderImages: number;
  };
  warnings: string[];
}

type StyleDefinitionInput = {
  className: string;
  properties: Record<string, string>;
  variants?: Record<string, Record<string, string>>;
  combo?: boolean;
};

/** One captured section, ready to run through the planner + styling attach. */
export interface SectionCaptureInput {
  /** The section's real HTML, annotated with `data-pw-key` on every kept node. */
  html: string;
  /** node key → authored base (desktop) styles. */
  baseStylesByKey: Record<string, Record<string, string>>;
  breakpointStyles?: BreakpointStyles;
  breakpointKeys?: string[];
  /** Stable id for the section (drives node ids / fallback class prefix). */
  sectionId: string;
  /** Human name → the client-first class prefix (`section_{slug}`). */
  sectionName?: string;
  /** Navbar/header/footer: keep the root tag, no section scaffold. */
  chrome?: boolean;
  /** Human label for the section root node in the Webflow navigator. */
  label?: string;
}

/** One section's element tree + style definitions, before serialization. */
interface SectionBuild {
  elementTree: BuildNode;
  styleDefinitions: StyleDefinitionInput[];
  stats: PlaygroundPayloadResult["stats"];
  warnings: string[];
}

function emptyStats(): PlaygroundPayloadResult["stats"] {
  return {
    nodeCount: 0,
    classCount: 0,
    responsiveClassCount: 0,
    styleGuideRefs: 0,
    droppedLinkUrls: 0,
    placeholderImages: 0
  };
}

function fnvHash(seed: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(i), 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0").slice(0, 8);
}

function styleKey(styles: Record<string, string>): string {
  return Object.keys(styles)
    .sort()
    .map((prop) => `${prop}:${styles[prop]}`)
    .join(";");
}

/**
 * Desktop-first delta for one breakpoint: the properties whose value at this
 * width differs from the cascaded value above it. Mutates `effective` to carry
 * the cascade down to the next-smaller breakpoint.
 */
function breakpointDelta(
  effective: Record<string, string>,
  atWidth: Record<string, string>
): Record<string, string> {
  const delta: Record<string, string> = {};
  for (const [prop, value] of Object.entries(atWidth)) {
    if (effective[prop] !== value) {
      delta[prop] = value;
      effective[prop] = value;
    }
  }
  return delta;
}

// The client-first scaffold (padding-global / container-large / padding-section)
// owns section spacing and width. Strip these from the section root's own combo
// so it doesn't double up — the root combo carries only its background/visuals.
const SCAFFOLD_OWNED = new Set([
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "width",
  "min-width",
  "max-width"
]);

function attachCapturedStyling(
  root: BuildNode,
  input: SectionCaptureInput,
  stats: PlaygroundPayloadResult["stats"]
): StyleDefinitionInput[] {
  const definitions: StyleDefinitionInput[] = [];
  const comboByKey = new Map<string, string>();
  const breakpointStyles = input.breakpointStyles ?? {};
  const breakpointKeys = input.breakpointKeys ?? Object.keys(breakpointStyles);

  const variantsFor = (nodeKey: string, baseStyles: Record<string, string>) => {
    if (breakpointKeys.length === 0) {
      return undefined;
    }
    const effective = { ...baseStyles };
    const variants: Record<string, Record<string, string>> = {};
    for (const key of breakpointKeys) {
      const atWidth = breakpointStyles[key]?.[nodeKey];
      if (!atWidth) {
        continue;
      }
      const delta = breakpointDelta(effective, atWidth);
      if (Object.keys(delta).length > 0) {
        variants[key] = delta;
      }
    }
    return Object.keys(variants).length > 0 ? variants : undefined;
  };

  // A per-node combo carrying its captured fidelity, named after the node's most
  // specific client-first class so the Navigator reads sensibly. Deduped by
  // (base class + declarations) so identical nodes share one combo.
  const registerCombo = (
    node: BuildNode,
    props: Record<string, string>,
    variants: Record<string, Record<string, string>> | undefined
  ): string => {
    const primary = node.classNames[node.classNames.length - 1] ?? node.tag;
    const dedupeKey = `${primary}|${styleKey(props)}|${variants ? JSON.stringify(variants) : ""}`;
    let name = comboByKey.get(dedupeKey);
    if (!name) {
      name = `${primary}_v${fnvHash(dedupeKey)}`;
      comboByKey.set(dedupeKey, name);
      definitions.push({ className: name, properties: props, variants, combo: true });
      if (variants) {
        stats.responsiveClassCount += 1;
      }
    }
    return name;
  };

  const walk = (node: BuildNode, isRoot: boolean): void => {
    stats.nodeCount += 1;
    if (node.tag === "img") {
      stats.placeholderImages += 1;
    }
    const key = node.sourceKey;
    if (key) {
      const base = input.baseStylesByKey[key];
      if (base) {
        let props = { ...base };
        if (isRoot && !input.chrome) {
          for (const prop of SCAFFOLD_OWNED) {
            delete props[prop];
          }
        }
        if (Object.keys(props).length > 0) {
          const variants = variantsFor(key, props);
          node.classNames.push(registerCombo(node, props, variants));
        } else {
          stats.styleGuideRefs += 1;
        }
      } else {
        stats.styleGuideRefs += 1;
      }
    } else {
      // Scaffold node (padding-global, container-large, …) — Style Guide styles it.
      stats.styleGuideRefs += 1;
    }
    for (const child of node.children) {
      walk(child, false);
    }
  };

  walk(root, true);
  return definitions;
}

function buildSection(input: SectionCaptureInput): SectionBuild {
  const stats = emptyStats();
  const warnings = new Set<string>();

  const built = htmlToBuildNode({
    sourceCode: input.html,
    sectionId: input.sectionId,
    sectionName: input.sectionName,
    chrome: input.chrome
  });
  if (!built) {
    throw new Error("The planner could not build a client-first tree for this section.");
  }
  for (const warning of built.warnings) {
    warnings.add(warning.message);
  }

  const root = built.root;
  if (input.label) {
    root.label = input.label;
  }
  const styleDefinitions = attachCapturedStyling(root, input, stats);
  stats.classCount = styleDefinitions.length;

  return { elementTree: root, styleDefinitions, stats, warnings: [...warnings] };
}

/** Single captured section → a complete, standalone clipboard payload. */
export function capturedSectionToClipboardPayload(
  input: SectionCaptureInput
): PlaygroundPayloadResult {
  const built = buildSection(input);
  const payload = buildWebflowClipboardPayload({
    elementTree: built.elementTree,
    styleDefinitions: built.styleDefinitions,
    existingStyles: []
  });
  return { payload, stats: built.stats, warnings: built.warnings };
}

/**
 * Combine several captured sections into ONE payload: each section's client-first
 * tree becomes a child of a single labeled wrapper ("Pasted sections — unwrap
 * me"), with style definitions deduped by class name — so a multi-select paste
 * drops every part in one gesture. A single section pastes bare via
 * `capturedSectionToClipboardPayload` (no wrapper).
 */
export function combineSections(
  sections: SectionCaptureInput[],
  opts: { wrapperLabel?: string } = {}
): PlaygroundPayloadResult {
  const builds = sections.map((section) => buildSection(section));

  const stylesByName = new Map<string, StyleDefinitionInput>();
  for (const build of builds) {
    for (const definition of build.styleDefinitions) {
      if (!stylesByName.has(definition.className)) {
        stylesByName.set(definition.className, definition);
      }
    }
  }

  const wrapper: BuildNode = {
    id: "pw-wrapper",
    type: "element",
    tag: "div",
    label: opts.wrapperLabel ?? "Pasted sections — unwrap me",
    classNames: [],
    children: builds.map((build) => build.elementTree)
  };

  const payload = buildWebflowClipboardPayload({
    elementTree: wrapper,
    styleDefinitions: [...stylesByName.values()],
    existingStyles: []
  });

  const stats = {
    nodeCount: builds.reduce((sum, b) => sum + b.stats.nodeCount, 0),
    classCount: stylesByName.size,
    responsiveClassCount: builds.reduce((sum, b) => sum + b.stats.responsiveClassCount, 0),
    styleGuideRefs: builds.reduce((sum, b) => sum + b.stats.styleGuideRefs, 0),
    droppedLinkUrls: builds.reduce((sum, b) => sum + b.stats.droppedLinkUrls, 0),
    placeholderImages: builds.reduce((sum, b) => sum + b.stats.placeholderImages, 0)
  };
  const warnings = [...new Set(builds.flatMap((b) => b.warnings))];
  return { payload, stats, warnings };
}
