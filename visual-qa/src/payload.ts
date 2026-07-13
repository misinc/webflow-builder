import { buildWebflowClipboardPayload } from "@wfb/shared/webflow-clipboard.js";
import type { XscpData } from "@wfb/shared/webflow-clipboard.js";
import type { BuildNode } from "@wfb/shared/contracts.js";

/**
 * Trial pipeline ("paste from URL" playground): a DOM subtree captured from a
 * real Chrome render — with per-node browser-computed styles already filtered
 * to authored-only values — is mapped straight to a Webflow clipboard payload.
 *
 * Responsive: per-node styles captured at each breakpoint width are diffed,
 * desktop-first, into `variants` deltas (medium/small/tiny) — the exact shape
 * real Designer copies use. No client-first naming, no token binding yet.
 */

export interface CapturedNode {
  tag: string;
  /** Stable path key ("0", "0.1", …) aligning this node with breakpoint captures. */
  key?: string;
  /** Direct text content (element's own text nodes, whitespace-collapsed). */
  text?: string;
  /** Inline SVG markup captured verbatim (rendered as a Webflow Embed). */
  embedHtml?: string;
  /** Authored-only computed styles at the base (desktop) width. */
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
    /** Client-first Style Guide classes referenced by name (empty styleLess). */
    styleGuideRefs: number;
    droppedLinkUrls: number;
    placeholderImages: number;
  };
  warnings: string[];
}

/** Tags Webflow renders as text-only elements — children must be flattened. */
const TEXT_ONLY_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "blockquote"]);

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

function collectText(node: CapturedNode): string {
  const parts: string[] = [];
  if (node.text) {
    parts.push(node.text);
  }
  for (const child of node.children) {
    const text = collectText(child);
    if (text) {
      parts.push(text);
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function hasStyledDescendant(node: CapturedNode): boolean {
  return node.children.some(
    (child) => Object.keys(child.styles).length > 0 || hasStyledDescendant(child)
  );
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

export function capturedTreeToClipboardPayload(
  tree: CapturedNode,
  options: {
    sectionLabel?: string;
    breakpointStyles?: BreakpointStyles;
    breakpointKeys?: string[];
    /** Style-guide-first: headings/body/buttons reference client-first Style
     *  Guide classes by name (empty styleLess) so they adopt the project's
     *  Style Guide, instead of carrying captured literal styles. */
    styleGuideMode?: boolean;
  } = {}
): PlaygroundPayloadResult {
  const warnings = new Set<string>();
  const breakpointStyles = options.breakpointStyles ?? {};
  const breakpointKeys = options.breakpointKeys ?? Object.keys(breakpointStyles);
  const styleGuideMode = options.styleGuideMode ?? false;
  const classNameByStyleKey = new Map<string, string>();
  const styleDefinitions: Array<{
    className: string;
    properties: Record<string, string>;
    variants?: Record<string, Record<string, string>>;
  }> = [];
  const stats = {
    nodeCount: 0,
    classCount: 0,
    responsiveClassCount: 0,
    styleGuideRefs: 0,
    droppedLinkUrls: 0,
    placeholderImages: 0
  };

  const variantsFor = (nodeKey: string | undefined, baseStyles: Record<string, string>) => {
    if (!nodeKey || breakpointKeys.length === 0) {
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

  // Style-guide-first: map a typography/button node to the client-first Style
  // Guide class it should adopt (referenced by name, empty styleLess).
  const looksLikeButton = (node: CapturedNode): boolean => {
    if (!("background-color" in node.styles)) {
      return false;
    }
    const keys = Object.keys(node.styles);
    return keys.some((k) => k.startsWith("padding")) || keys.some((k) => k.includes("radius"));
  };
  const styleGuideNameFor = (node: CapturedNode): string | null => {
    if (!styleGuideMode) {
      return null;
    }
    if (/^h[1-6]$/.test(node.tag)) {
      return `heading-style-${node.tag}`;
    }
    if (node.tag === "p" || node.tag === "blockquote") {
      return "text-size-medium";
    }
    if ((node.tag === "a" || node.tag === "button") && looksLikeButton(node)) {
      return "button";
    }
    return null;
  };
  const registerShared = (className: string): string[] => {
    const key = `shared:${className}`;
    if (!classNameByStyleKey.has(key)) {
      classNameByStyleKey.set(key, className);
      styleDefinitions.push({ className, properties: {} }); // empty → reuse by name
      stats.styleGuideRefs += 1;
    }
    return [className];
  };

  const classFor = (node: CapturedNode): string[] => {
    const shared = styleGuideNameFor(node);
    if (shared) {
      return registerShared(shared);
    }
    if (Object.keys(node.styles).length === 0) {
      return [];
    }
    const variants = variantsFor(node.key, node.styles);
    // Dedup on base + variants: two nodes identical on desktop but different on
    // mobile must not share a class.
    const key = `${styleKey(node.styles)}||${variants ? JSON.stringify(variants) : ""}`;
    let className = classNameByStyleKey.get(key);
    if (!className) {
      className = `pw-${node.tag}-${fnvHash(key)}`;
      classNameByStyleKey.set(key, className);
      styleDefinitions.push({ className, properties: node.styles, variants });
      if (variants) {
        stats.responsiveClassCount += 1;
      }
    }
    return [className];
  };

  const toBuildNode = (node: CapturedNode, path: string): BuildNode => {
    stats.nodeCount += 1;
    const base: BuildNode = {
      id: `pw${path}`,
      type: node.embedHtml ? "embed" : "element",
      tag: node.tag,
      classNames: classFor(node),
      children: []
    };
    if (node.embedHtml) {
      base.embedHtml = node.embedHtml;
      return base;
    }
    if (node.tag === "img") {
      stats.placeholderImages += 1;
      base.label = node.attrs.alt ?? "";
      return base;
    }
    if (node.tag === "a" && node.attrs.href) {
      stats.droppedLinkUrls += 1;
    }
    if (TEXT_ONLY_TAGS.has(node.tag)) {
      if (hasStyledDescendant(node)) {
        warnings.add(
          `Styled inline content inside <${node.tag}> was flattened to plain text (Webflow text elements are text-only).`
        );
      }
      base.textContent = collectText(node);
      return base;
    }
    if (node.text) {
      base.textContent = node.text;
    }
    base.children = node.children.map((child, index) => toBuildNode(child, `${path}.${index}`));
    return base;
  };

  const elementTree = toBuildNode(tree, "0");
  if (options.sectionLabel) {
    elementTree.label = options.sectionLabel;
  }
  stats.classCount = styleDefinitions.length;
  if (stats.placeholderImages > 0) {
    warnings.add(
      `${stats.placeholderImages} image(s) paste as empty placeholders sized by their captured width/height — upload assets and relink after paste.`
    );
  }
  if (stats.droppedLinkUrls > 0) {
    warnings.add(
      `${stats.droppedLinkUrls} link URL(s) reset to "#" (the paste format does not carry them) — relink after paste.`
    );
  }

  const payload = buildWebflowClipboardPayload({
    elementTree,
    styleDefinitions,
    existingStyles: []
  });

  return { payload, stats, warnings: [...warnings] };
}
