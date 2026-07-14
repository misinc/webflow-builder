import { buildWebflowClipboardPayload } from "@wfb/shared/webflow-clipboard.js";
import type { XscpData } from "@wfb/shared/webflow-clipboard.js";
import type { BuildNode } from "@wfb/shared/contracts.js";
import { slugify } from "@wfb/shared/text.js";

/**
 * URL-first capture → client-first payload, FIDELITY-FIRST.
 *
 * The captured DOM subtree is preserved 1:1 with its browser-computed styles, so
 * the paste looks like the source. Client-first NAMES are layered on the parts
 * that map cleanly — `section_{key}`, `heading-style-h*`, `text-size-*`, `button`,
 * `container-*`, `padding-section-*` — without reshaping the structure (no
 * scaffold injection, which would break custom / absolute layouts).
 *
 * Shared Style-Guide classes are referenced by name so they adopt the project;
 * per-node fidelity rides in content-hashed combo classes on top. Containers and
 * section padding are matched to the nearest client-first size by their measured
 * value, or minted as a custom class when nothing fits. Full-bleed images become
 * CSS `background-image` so heroes render instead of pasting blank.
 *
 * Responsive: per-node styles captured at each breakpoint width are diffed,
 * desktop-first, into `variants` deltas (medium/small/tiny).
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
    /** Shared client-first classes referenced by name (adopt the Style Guide). */
    styleGuideRefs: number;
    droppedLinkUrls: number;
    placeholderImages: number;
    backgroundImages: number;
  };
  warnings: string[];
}

type StyleDefinitionInput = {
  className: string;
  properties: Record<string, string>;
  variants?: Record<string, Record<string, string>>;
  combo?: boolean;
};

export interface SectionCaptureInput {
  /** The captured section subtree (source structure preserved). */
  tree: CapturedNode;
  breakpointStyles?: BreakpointStyles;
  breakpointKeys?: string[];
  /** Human name → the client-first class prefix (`section_{slug}`). */
  sectionName?: string;
  /** Scan kind (Navbar/Header/Footer/Bar/Section) — chrome keeps its own root. */
  kind?: string;
  /** Human label for the section root node in the Webflow Navigator. */
  label?: string;
}

interface SectionBuild {
  elementTree: BuildNode;
  styleDefinitions: StyleDefinitionInput[];
  stats: PlaygroundPayloadResult["stats"];
  warnings: string[];
}

/** Tags Webflow renders as text-only elements — children must be flattened. */
const TEXT_ONLY_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "blockquote"]);
const CHROME_KINDS = /^(navbar|header|footer|bar)$/i;

// Canonical client-first sizes (px). A measured wrapper snaps to the nearest of
// these (small / medium / large) and references it bare, adopting the project's
// own values. The section's content width decides the size — not a fixed default.
const CONTAINERS: Array<{ name: string; px: number }> = [
  { name: "container-small", px: 768 },
  { name: "container-medium", px: 1024 },
  { name: "container-large", px: 1280 }
];
const SECTION_PADDINGS: Array<{ name: string; px: number }> = [
  { name: "padding-section-small", px: 48 },
  { name: "padding-section-medium", px: 80 },
  { name: "padding-section-large", px: 128 },
  { name: "padding-section-xlarge", px: 192 }
];

// text-size-* by font size (px). Bare reference adopts the project's scale; the
// exact size still rides in the combo.
function textSizeFor(styles: Record<string, string>): string {
  const px = parseFloat(styles["font-size"] ?? "");
  if (!Number.isFinite(px)) return "text-size-medium";
  if (px < 13) return "text-size-tiny";
  if (px < 15) return "text-size-small";
  if (px < 17.5) return "text-size-regular";
  if (px <= 20.5) return "text-size-medium";
  return "text-size-large";
}

// Which client-first family a shared class belongs to — decides which captured
// properties are a genuine per-node delta vs. owned by the Style-Guide class.
function familyOf(shared: string): "typography" | "button" | "layout" {
  if (shared.startsWith("heading-style-") || shared.startsWith("text-size-")) return "typography";
  if (shared === "button" || shared.startsWith("button-")) return "button";
  return "layout";
}

// Properties the shared class does NOT own, so they ride in a combo on top. Font
// size/line-height/weight/family, margins, and sizing are OWNED by the shared
// typography class (adopt the project's scale) and dropped — only real visual
// deltas the base can't carry survive. Empty result ⇒ reference the base bare.
const TYPOGRAPHY_DELTA_PROPS = new Set([
  "color",
  "text-transform",
  "letter-spacing",
  "text-align",
  "text-decoration",
  "text-decoration-line",
  "text-decoration-color",
  "font-style",
  // Gradient / clipped text (kept so gradient headings survive).
  "background-image",
  "background-clip",
  "-webkit-background-clip",
  "-webkit-text-fill-color"
]);
// A button's shape (padding, radius, font) is owned by the shared `button` class;
// only the paint distinguishes primary / secondary / ghost variants.
const BUTTON_DELTA_PROPS = new Set([
  "background-color",
  "background-image",
  "color",
  "border",
  "border-color",
  "border-style",
  "border-width",
  "border-top-width",
  "border-bottom-width",
  "border-left-width",
  "border-right-width"
]);

// A near-black color is the site's default body ink — NOT a per-node delta the
// shared class needs to override, so it's dropped (a light or brand color on a
// dark section still counts and is kept). Prevents a redundant combo on every
// paragraph/heading of a light section (which was forking to "text-size-medium 2").
function isDefaultInk(color: string): boolean {
  const m = color.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (!m) return false;
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return r <= 60 && g <= 60 && b <= 60;
}

// Sub-pixel letter-spacing (e.g. 0.15px) is a browser-rounding artifact, not a
// design decision — dropping it keeps text bare instead of minting a combo.
function isNegligibleTracking(value: string): boolean {
  if (value === "normal") return true;
  const px = parseFloat(value);
  return Number.isFinite(px) && Math.abs(px) < 0.5;
}

/** Keep only the properties a shared class does not already own (its combo delta). */
function styleGuideDelta(shared: string, styles: Record<string, string>): Record<string, string> {
  const family = familyOf(shared);
  const allow =
    family === "typography" ? TYPOGRAPHY_DELTA_PROPS : family === "button" ? BUTTON_DELTA_PROPS : null;
  if (!allow) return {}; // layout shared classes (container/padding-*) adopt fully.
  const delta: Record<string, string> = {};
  for (const [prop, value] of Object.entries(styles)) {
    if (!allow.has(prop)) continue;
    // Typography: drop values that just restate the defaults, so plain text stays
    // a bare shared class (no combo → nothing for Webflow to fork).
    if (family === "typography") {
      if (prop === "color" && isDefaultInk(value)) continue;
      if (prop === "letter-spacing" && isNegligibleTracking(value)) continue;
    }
    delta[prop] = value;
  }
  return delta;
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

function px(value: string | undefined): number {
  const n = parseFloat(value ?? "");
  return Number.isFinite(n) ? n : NaN;
}

// Nearest named size to a measured px value. Always snaps to the closest step
// (small / medium / large, …) — we adopt the project's scale, so there's no
// "doesn't fit" case; a narrow content column becomes container-small, a wide
// one container-large, never everything forced to large.
function nearest(value: number, scale: Array<{ name: string; px: number }>): string {
  let best = scale[0];
  for (const step of scale) {
    if (Math.abs(value - step.px) < Math.abs(value - best.px)) best = step;
  }
  return best.name;
}

function collectText(node: CapturedNode): string {
  const parts: string[] = [];
  if (node.text) parts.push(node.text);
  for (const child of node.children) {
    const text = collectText(child);
    if (text) parts.push(text);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function hasStyledDescendant(node: CapturedNode): boolean {
  return node.children.some(
    (child) => Object.keys(child.styles).length > 0 || hasStyledDescendant(child)
  );
}

function looksLikeButton(node: CapturedNode): boolean {
  if (node.tag !== "a" && node.tag !== "button") return false;
  const keys = Object.keys(node.styles);
  const hasBg = "background-color" in node.styles;
  const hasPad = keys.some((k) => k.startsWith("padding"));
  const hasRadius = keys.some((k) => k.includes("radius"));
  return (hasBg && (hasPad || hasRadius)) || (hasPad && hasRadius);
}

// A full-bleed image (a hero backdrop) pastes as a blank placeholder because
// assets don't ride the clipboard. Rendered as a CSS background-image (hotlinked
// from the source) it shows immediately — the user swaps it for an uploaded
// asset later.
function isFullBleedImage(node: CapturedNode): boolean {
  if (node.tag !== "img" || !node.attrs.src) return false;
  const position = node.styles["position"];
  return (
    position === "absolute" ||
    position === "fixed" ||
    node.styles["object-fit"] === "cover"
  );
}

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

function collectNodes(node: CapturedNode, pred: (n: CapturedNode) => boolean, out: CapturedNode[] = []): CapturedNode[] {
  if (pred(node)) out.push(node);
  for (const child of node.children) collectNodes(child, pred, out);
  return out;
}

function collectBuildNodes(node: BuildNode): number {
  return 1 + (node.children ?? []).reduce((sum, child) => sum + collectBuildNodes(child), 0);
}

// Native Webflow Navbar element `data` templates (learned from Relume's clipboard
// — see docs/relume-navbar-structure.md). Emitting these node types makes the
// built-in responsive menu button + dropdowns work without any custom interaction.
const NAVBAR_WRAPPER_DATA = {
  attr: { id: "", "data-collapse": "medium", "data-animation": "default", "data-duration": "400" },
  navbar: {
    type: "wrapper",
    collapse: "medium",
    easing: "ease",
    easing2: "ease",
    duration: 400,
    docHeight: false,
    noScroll: false,
    animation: "default"
  },
  tag: "div"
};
const NAVBAR_BRAND_DATA = { attr: { id: "", href: "#" }, navbar: { type: "brand" }, link: { mode: "external" } };
const NAVBAR_MENU_DATA = { attr: { role: "navigation", id: "" }, navbar: { type: "menu" }, tag: "nav" };
const NAVBAR_LINK_DATA = { attr: { id: "", href: "#" }, navbar: { type: "link" }, link: { url: "#", mode: "external" } };
const NAVBAR_BUTTON_DATA = { attr: { id: "" }, navbar: { type: "button" }, tag: "div" };
const DROPDOWN_WRAPPER_DATA = { attr: { id: "", "data-delay": "200", "data-hover": true }, dropdown: { type: "wrapper" }, tag: "div" };
const DROPDOWN_TOGGLE_DATA = { attr: { id: "" }, dropdown: { type: "toggle" }, tag: "div" };
const DROPDOWN_LIST_DATA = { attr: { id: "" }, dropdown: { type: "list" }, tag: "nav" };
const DROPDOWN_LINK_DATA = { attr: { id: "", href: "#" }, dropdown: { type: "link" }, link: { url: "#", mode: "external" } };
const CHEVRON_SVG =
  '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>';

/** Build a parent lookup for a captured tree (dropdown grouping needs ancestry). */
function buildParentMap(root: CapturedNode): Map<CapturedNode, CapturedNode> {
  const parent = new Map<CapturedNode, CapturedNode>();
  const walk = (n: CapturedNode): void => {
    for (const child of n.children) {
      parent.set(child, n);
      walk(child);
    }
  };
  walk(root);
  return parent;
}

// A "special" section — one whose CONTENT is absolutely positioned (overlapping
// layers, a custom hero), which the client-first scaffold would break. These skip
// the scaffold and are preserved 1:1. A full-bleed background image alone does
// NOT make a section special: it's hoisted to the section background and the rest
// still gets the standard scaffold. Only genuine absolute/fixed CONTENT counts,
// and only at the top of the section (a decorative absolute badge deep inside a
// normal section must not strip its scaffold).
function isSpecialLayout(node: CapturedNode): boolean {
  const rootPos = node.styles["position"];
  if (rootPos === "absolute" || rootPos === "fixed") return true;
  return node.children.some((child) => {
    if (isFullBleedImage(child)) return false; // a backdrop image — hoisted, not "special"
    const pos = child.styles["position"];
    return pos === "absolute" || pos === "fixed";
  });
}

// Layout the injected scaffold (padding-global / container / padding-section)
// owns — stripped from the section_ root, and the only props a source wrapper may
// carry to still count as a pure structural wrapper we can peel.
const SCAFFOLD_OWNED_ROOT_KEYS = new Set([
  "max-width",
  "margin",
  "margin-left",
  "margin-right",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "display",
  "flex-direction",
  "justify-content",
  "align-items",
  "align-content",
  "justify-items",
  "gap",
  "row-gap",
  "column-gap",
  "grid-row-gap",
  "grid-column-gap",
  "grid-template-columns",
  "grid-template-rows"
]);
const PEELABLE_EXTRA_KEYS = new Set(["width", "box-sizing", "align-self"]);

/** True when every authored style is scaffold-owned layout (no paint/border/content). */
function isPureLayout(styles: Record<string, string>): boolean {
  return Object.keys(styles).every(
    (key) => SCAFFOLD_OWNED_ROOT_KEYS.has(key) || PEELABLE_EXTRA_KEYS.has(key)
  );
}

/** A single-child structural wrapper (source padding-global / container / padding-section). */
function isLayoutOnlyWrapper(node: CapturedNode): boolean {
  return (
    node.tag === "div" &&
    !node.text &&
    !node.embedHtml &&
    node.children.length === 1 &&
    isPureLayout(node.styles)
  );
}

/** A max-width wrapper that holds the content directly — absorbed as the container. */
function isContainerWrapper(node: CapturedNode): boolean {
  if (node.tag !== "div" || node.text || node.embedHtml) return false;
  const maxW = parseFloat(node.styles["max-width"] ?? "");
  if (!Number.isFinite(maxW) || maxW < 560 || maxW > 1700) return false;
  return isPureLayout(node.styles);
}

function buildSection(input: SectionCaptureInput): SectionBuild {
  const warnings = new Set<string>();
  const breakpointStyles = input.breakpointStyles ?? {};
  const breakpointKeys = input.breakpointKeys ?? Object.keys(breakpointStyles);
  const chrome = CHROME_KINDS.test(input.kind ?? "");
  const rawKey = slugify(input.sectionName ?? "section") || "section";
  const sectionKey = rawKey.split("-").slice(0, 3).join("-") || "section";
  // A "special" section (hero backdrop / absolute layout) is preserved 1:1; every
  // other non-chrome section gets the canonical client-first scaffold injected.
  const special = !chrome && isSpecialLayout(input.tree);

  const styleDefinitions: StyleDefinitionInput[] = [];
  const classNameByKey = new Map<string, string>(); // dedup unique classes by style
  const comboByKey = new Map<string, string>(); // dedup combos by base+style
  const roleCounts = new Map<string, number>();

  const stats = {
    nodeCount: 0,
    classCount: 0,
    responsiveClassCount: 0,
    styleGuideRefs: 0,
    droppedLinkUrls: 0,
    placeholderImages: 0,
    backgroundImages: 0
  };

  const variantsFor = (nodeKey: string | undefined, baseStyles: Record<string, string>) => {
    if (!nodeKey || breakpointKeys.length === 0) return undefined;
    const effective = { ...baseStyles };
    const variants: Record<string, Record<string, string>> = {};
    for (const key of breakpointKeys) {
      const atWidth = breakpointStyles[key]?.[nodeKey];
      if (!atWidth) continue;
      const delta = breakpointDelta(effective, atWidth);
      if (Object.keys(delta).length > 0) variants[key] = delta;
    }
    return Object.keys(variants).length > 0 ? variants : undefined;
  };

  // A unique (section-scoped or custom) class carrying its exact styles directly.
  const uniqueClass = (
    baseName: string,
    styles: Record<string, string>,
    nodeKey: string | undefined
  ): string => {
    const variants = variantsFor(nodeKey, styles);
    const dedupe = `${baseName}|${styleKey(styles)}|${variants ? JSON.stringify(variants) : ""}`;
    let name = classNameByKey.get(dedupe);
    if (!name) {
      name = baseName;
      // Disambiguate if the same base name already carries different styles.
      if (styleDefinitions.some((d) => d.className === name)) {
        name = `${baseName}-${fnvHash(dedupe)}`;
      }
      classNameByKey.set(dedupe, name);
      styleDefinitions.push({ className: name, properties: styles, variants });
      if (variants) stats.responsiveClassCount += 1;
    }
    return name;
  };

  // A shared client-first class referenced by name only (adopts the Style Guide).
  const sharedBare = (shared: string): string[] => {
    stats.styleGuideRefs += 1;
    return [shared];
  };

  // Per-breakpoint deltas of a shared class's combo — filtered to the same
  // delta-worthy props so the project's responsive type scale still owns size.
  const deltaVariantsFor = (
    shared: string,
    nodeKey: string | undefined,
    baseDelta: Record<string, string>
  ) => {
    if (!nodeKey || breakpointKeys.length === 0) return undefined;
    const effective = { ...baseDelta };
    const variants: Record<string, Record<string, string>> = {};
    for (const key of breakpointKeys) {
      const atWidth = breakpointStyles[key]?.[nodeKey];
      if (!atWidth) continue;
      const delta = breakpointDelta(effective, styleGuideDelta(shared, atWidth));
      if (Object.keys(delta).length > 0) variants[key] = delta;
    }
    return Object.keys(variants).length > 0 ? variants : undefined;
  };

  // A shared client-first class referenced by name (adopts the Style Guide) plus,
  // ONLY when the node carries a genuine visual delta the shared class can't
  // express (color, transform, gradient text, button paint …), a second class
  // holding that delta. Size/line-height/weight/spacing are owned by the shared
  // class and dropped, so ordinary text stays a single clean class.
  //
  // The delta rides a GLOBAL class (combo: false), NOT a scoped combo (comb "&").
  // A scoped combo forces Webflow to fork the base to "text-size-medium 2" on
  // paste (it can't attach a scoped combo to your existing shared class); a global
  // second class attaches to the real base with no fork — this is exactly how
  // Relume's `button is-icon` etc. paste cleanly.
  const sharedWithCombo = (
    shared: string,
    styles: Record<string, string>,
    nodeKey: string | undefined
  ): string[] => {
    stats.styleGuideRefs += 1;
    const delta = styleGuideDelta(shared, styles);
    if (Object.keys(delta).length === 0) return [shared];
    const variants = deltaVariantsFor(shared, nodeKey, delta);
    const dedupe = `${shared}|${styleKey(delta)}|${variants ? JSON.stringify(variants) : ""}`;
    let combo = comboByKey.get(dedupe);
    if (!combo) {
      combo = `${shared}_v${fnvHash(dedupe)}`;
      comboByKey.set(dedupe, combo);
      styleDefinitions.push({ className: combo, properties: delta, variants, combo: false });
      if (variants) stats.responsiveClassCount += 1;
    }
    return [shared, combo];
  };

  const roleName = (role: string): string => {
    const n = (roleCounts.get(role) ?? 0) + 1;
    roleCounts.set(role, n);
    return n === 1 ? `${sectionKey}_${role}` : `${sectionKey}_${role}-${n}`;
  };

  const classFor = (node: CapturedNode, isRoot: boolean): string[] => {
    const styles = node.styles;

    // Section / chrome root.
    if (isRoot) {
      const base = chrome
        ? /footer/i.test(input.kind ?? "")
          ? "footer_component"
          : "navbar_component"
        : `section_${sectionKey}`;
      return [uniqueClass(base, styles, node.key)];
    }

    // Typography.
    if (/^h[1-6]$/.test(node.tag)) {
      return sharedWithCombo(`heading-style-${node.tag}`, styles, node.key);
    }
    if (node.tag === "p" || node.tag === "blockquote") {
      return sharedWithCombo(textSizeFor(styles), styles, node.key);
    }
    if (looksLikeButton(node)) {
      return sharedWithCombo("button", styles, node.key);
    }

    if (Object.keys(styles).length === 0) return [];

    // Any other wrapper: a section-scoped class carrying its exact styles.
    const role = styles["display"] === "grid" || styles["display"] === "flex" ? "group" : "wrapper";
    return [uniqueClass(roleName(role), styles, node.key)];
  };

  const toBuildNode = (node: CapturedNode, path: string, isRoot: boolean): BuildNode => {
    stats.nodeCount += 1;

    // Full-bleed image → a div with a CSS background-image (renders on paste).
    if (isFullBleedImage(node)) {
      stats.backgroundImages += 1;
      const bg: Record<string, string> = { ...node.styles };
      delete bg["object-fit"];
      bg["background-image"] = `url("${node.attrs.src}")`;
      bg["background-size"] = "cover";
      bg["background-position"] = "50% 50%";
      bg["background-repeat"] = "no-repeat";
      return {
        id: `pw${path}`,
        type: "element",
        tag: "div",
        classNames: [uniqueClass(roleName("image"), bg, node.key)],
        children: []
      };
    }

    const base: BuildNode = {
      id: `pw${path}`,
      type: node.embedHtml ? "embed" : "element",
      tag: node.tag,
      classNames: classFor(node, isRoot),
      children: []
    };
    if (isRoot && input.label) base.label = input.label;

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
    base.children = node.children.map((child, index) => toBuildNode(child, `${path}.${index}`, false));
    return base;
  };

  // Register a class with fixed properties once (layout defaults for the native
  // navbar scaffold — first definition wins, later refs just reuse the name).
  const defineClass = (
    name: string,
    properties: Record<string, string>,
    variants?: Record<string, Record<string, string>>
  ): string => {
    if (!styleDefinitions.some((d) => d.className === name)) {
      styleDefinitions.push({ className: name, properties, variants });
    }
    return name;
  };

  // Rebuild the source navbar as Webflow's NATIVE Navbar element (generic
  // navbar_* classes, source styling) so the built-in responsive menu + dropdowns
  // work. Returns null if the source has no recognizable navbar parts.
  const buildNavbarTree = (): BuildNode | null => {
    let counter = 0;
    const nid = (): string => `nav-${sectionKey}-${counter++}`;
    const hasMedia = (n: CapturedNode): boolean =>
      collectNodes(n, (x) => x.tag === "img" || Boolean(x.embedHtml)).length > 0;

    const anchors = collectNodes(input.tree, (n) => n.tag === "a" || n.tag === "button");
    // The brand is a link carrying a graphic (img/svg) or a text-less link — never
    // steal a labeled nav link when there's no real logo.
    const logoAnchor =
      anchors.find(hasMedia) ?? anchors.find((a) => a.tag === "a" && !collectText(a) && a.children.length > 0);
    const buttons = anchors.filter((a) => a !== logoAnchor && looksLikeButton(a));
    const navLinks = anchors.filter(
      (a) => a !== logoAnchor && !buttons.includes(a) && Boolean(collectText(a))
    );
    if (navLinks.length === 0 && buttons.length === 0) {
      return null; // not enough to recognize — fall back to fidelity
    }

    const native = (tag: string, webflowType: string, webflowData: Record<string, unknown>, classNames: string[], children: BuildNode[]): BuildNode => ({
      id: nid(),
      type: "element",
      tag,
      webflowType,
      webflowData,
      classNames,
      children
    });
    const box = (className: string, styles: Record<string, string>, children: BuildNode[]): BuildNode => ({
      id: nid(),
      type: "element",
      tag: "div",
      classNames: [defineClass(className, styles)],
      children
    });

    // Logo: keep an SVG/img as the brand graphic; render an <img> logo via CSS
    // background-image so it shows; else preserve the brand's own content.
    let logoChildren: BuildNode[] = [];
    if (logoAnchor) {
      const media = collectNodes(logoAnchor, (x) => x.tag === "img" || Boolean(x.embedHtml))[0];
      if (media?.embedHtml) {
        logoChildren = [
          { id: nid(), type: "embed", tag: "div", classNames: [defineClass("navbar_logo", media.styles)], embedHtml: media.embedHtml, children: [] }
        ];
      } else if (media?.attrs.src) {
        const logoStyles: Record<string, string> = {
          ...media.styles,
          "background-image": `url("${media.attrs.src}")`,
          "background-size": "contain",
          "background-repeat": "no-repeat",
          "background-position": "50% 50%"
        };
        delete logoStyles["object-fit"];
        logoChildren = [{ id: nid(), type: "element", tag: "div", classNames: [defineClass("navbar_logo", logoStyles)], children: [] }];
      } else {
        logoChildren = logoAnchor.children.map((child, index) => toBuildNode(child, `logo.${index}`, false));
      }
    }
    const brand = native("a", "NavbarBrand", NAVBAR_BRAND_DATA, [defineClass("navbar_logo-link", logoAnchor?.styles ?? {})], logoChildren);

    const linkClass = defineClass("navbar_link", navLinks[0]?.styles ?? {});
    const navLink = (a: CapturedNode): BuildNode => ({
      ...native("a", "NavbarLink", NAVBAR_LINK_DATA, [linkClass], []),
      textContent: collectText(a)
    });

    // Group nav links into their top-level menu item (child of the links' common
    // ancestor). An item holding a toggle + a nested list of ≥2 links becomes a
    // native Dropdown; otherwise a plain NavbarLink.
    const buildMenuItems = (): BuildNode[] => {
      if (navLinks.length === 0) return [];
      const parent = buildParentMap(input.tree);
      const ancestorsOf = (n: CapturedNode): CapturedNode[] => {
        const arr: CapturedNode[] = [];
        let c: CapturedNode | undefined = n;
        while (c) {
          arr.push(c);
          c = parent.get(c);
        }
        return arr;
      };
      const lists = navLinks.map(ancestorsOf);
      let lca = input.tree;
      for (const cand of lists[0]) {
        if (lists.every((l) => l.includes(cand))) {
          lca = cand;
          break;
        }
      }
      const itemOf = (a: CapturedNode): CapturedNode => {
        let c = a;
        while (parent.get(c) && parent.get(c) !== lca) c = parent.get(c)!;
        return c;
      };
      // Ordered, de-duplicated items.
      const items: CapturedNode[] = [];
      const byItem = new Map<CapturedNode, CapturedNode[]>();
      for (const a of navLinks) {
        const item = itemOf(a);
        if (!byItem.has(item)) {
          byItem.set(item, []);
          items.push(item);
        }
        byItem.get(item)!.push(a);
      }

      const dropdownLinkClass = defineClass("navbar_dropdown-link", {});
      // A chevron/icon inside a nav link marks a dropdown toggle even when the
      // submenu wasn't built in the source (designed but unimplemented).
      const hasChevron = (a: CapturedNode): boolean =>
        collectNodes(a, (x) => Boolean(x.embedHtml) || x.tag === "svg" || x.tag === "img").length > 0;

      const makeDropdown = (toggleLabel: string, submenuLabels: string[]): BuildNode => {
        const toggleNode = native(
          "div",
          "DropdownToggle",
          DROPDOWN_TOGGLE_DATA,
          [defineClass("navbar_dropdown-toggle", { display: "flex", "align-items": "center", "grid-column-gap": "6px" })],
          [
            { id: nid(), type: "element", tag: "div", classNames: [defineClass("navbar_dropdown-label", {})], textContent: toggleLabel, children: [] },
            { id: nid(), type: "embed", tag: "div", classNames: [defineClass("dropdown-chevron", {})], embedHtml: CHEVRON_SVG, children: [] }
          ]
        );
        const listNode = native(
          "nav",
          "DropdownList",
          DROPDOWN_LIST_DATA,
          [defineClass("navbar_dropdown-list", {})],
          submenuLabels.map((label) => ({
            ...native("a", "DropdownLink", DROPDOWN_LINK_DATA, [dropdownLinkClass], []),
            textContent: label
          }))
        );
        return native("div", "DropdownWrapper", DROPDOWN_WRAPPER_DATA, [defineClass("navbar_menu-dropdown", {})], [toggleNode, listNode]);
      };

      return items.map((item) => {
        const group = byItem.get(item)!;
        const directAnchor = group.find((a) => parent.get(a) === item);
        const submenu = directAnchor ? group.filter((a) => a !== directAnchor) : group.slice(1);
        const toggle = directAnchor ?? group[0];
        if (submenu.length >= 1 && directAnchor) {
          return makeDropdown(collectText(toggle), submenu.map((a) => collectText(a)));
        }
        // Toggle with a chevron but no captured submenu → emit an empty dropdown
        // (designed-but-unimplemented, e.g. bАI "Services") for the user to fill in.
        if (group.length === 1 && hasChevron(toggle)) {
          warnings.add(
            'A nav item has a dropdown chevron but no submenu items in the source — added an empty dropdown ("Menu item"); add its links in Webflow.'
          );
          return makeDropdown(collectText(toggle), ["Menu item"]);
        }
        return navLink(toggle);
      });
    };
    const linkNodes = buildMenuItems();

    const buttonNodes = buttons.map((a) => ({
      id: nid(),
      type: "element",
      tag: "a",
      classNames: sharedWithCombo("button", a.styles, a.key),
      textContent: collectText(a),
      children: []
    } as BuildNode));

    const menuChildren: BuildNode[] = [
      box("navbar_menu-links", { display: "flex", "align-items": "center", "grid-column-gap": "2rem" }, linkNodes)
    ];
    if (buttonNodes.length > 0) {
      menuChildren.push(
        box("navbar_menu-buttons", { display: "flex", "align-items": "center", "grid-column-gap": "1rem" }, buttonNodes)
      );
    }
    const menu = native(
      "nav",
      "NavbarMenu",
      NAVBAR_MENU_DATA,
      [defineClass("navbar_menu", { display: "flex", "align-items": "center", "grid-column-gap": "2rem" })],
      menuChildren
    );

    const line = (name: string): BuildNode => ({
      id: nid(),
      type: "element",
      tag: "div",
      classNames: [defineClass(name, { width: "24px", height: "2px", "background-color": "currentColor" })],
      children: []
    });
    const menuIcon = box("menu-icon", { display: "flex", "flex-direction": "column", "grid-row-gap": "5px" }, [
      line("menu-icon_line-top"),
      box("menu-icon_line-middle", {}, [line("menu-icon_line-middle-inner")]),
      line("menu-icon_line-bottom")
    ]);
    const menuButton = native("div", "NavbarButton", NAVBAR_BUTTON_DATA, [defineClass("navbar_menu-button", {})], [menuIcon]);

    const container = box(
      "navbar_container",
      { display: "flex", "align-items": "center", "justify-content": "space-between", width: "100%" },
      [...(logoAnchor ? [brand] : []), menu, menuButton]
    );

    const wrapper = native("div", "NavbarWrapper", NAVBAR_WRAPPER_DATA, [defineClass("navbar_component", input.tree.styles)], [container]);
    if (input.label) wrapper.label = input.label;

    stats.droppedLinkUrls += navLinks.length + buttons.length + (logoAnchor ? 1 : 0);
    stats.nodeCount += collectBuildNodes(wrapper);
    return wrapper;
  };

  const isNavbar = /navbar|header/i.test(input.kind ?? "");

  // Build the section root explicitly so we can hoist a section-wide backdrop onto
  // it and inject the client-first scaffold, instead of preserving every source
  // wrapper (which produced the numbered-class mess).
  const buildChildren = (children: CapturedNode[], base: string): BuildNode[] =>
    children.map((child, index) => toBuildNode(child, `${base}.${index}`, false));

  const sectionRoot = (className: string, children: BuildNode[]): BuildNode => {
    stats.nodeCount += 1;
    const node: BuildNode = {
      id: "pw0",
      type: "element",
      tag: input.tree.tag,
      classNames: [className],
      children
    };
    if (input.label) node.label = input.label;
    return node;
  };

  const buildSectionTree = (): BuildNode => {
    // A section-wide backdrop (a full-bleed <img> DIRECT child) becomes a CSS
    // background on the section itself — not an inner div (issue #3).
    const rootStyles: Record<string, string> = { ...input.tree.styles };
    const backdrop = input.tree.children.find((child) => isFullBleedImage(child));
    if (backdrop?.attrs.src) {
      rootStyles["background-image"] = `url("${backdrop.attrs.src}")`;
      rootStyles["background-size"] = "cover";
      rootStyles["background-position"] = "50% 50%";
      rootStyles["background-repeat"] = "no-repeat";
      stats.backgroundImages += 1;
    }
    const topChildren = input.tree.children.filter((child) => child !== backdrop);

    // Special (hero / absolute) sections: preserve the source structure 1:1.
    if (special) {
      return sectionRoot(uniqueClass(`section_${sectionKey}`, rootStyles, input.tree.key), buildChildren(topChildren, "0"));
    }

    // Standard sections: peel the source's own padding/container wrappers (their
    // measured sizes pick the nearest client-first size) and inject the canonical
    // scaffold so every non-special section shares the same clean structure.
    // A measured wrapper snaps to the nearest client-first size (small / medium /
    // large); large is only the fallback when the section has no measurable width.
    let containerName = "container-large";
    let paddingName = "padding-section-large";
    const measure = (styles: Record<string, string>): void => {
      const mw = px(styles["max-width"]);
      if (Number.isFinite(mw) && mw >= 560 && mw <= 1700) {
        containerName = nearest(mw, CONTAINERS);
      }
      const pt = px(styles["padding-top"]);
      if (Number.isFinite(pt) && pt >= 40) {
        paddingName = nearest(pt, SECTION_PADDINGS);
      }
    };
    measure(rootStyles);

    let content = topChildren;
    while (content.length === 1 && isLayoutOnlyWrapper(content[0])) {
      measure(content[0].styles);
      content = content[0].children;
    }
    if (content.length === 1 && isContainerWrapper(content[0])) {
      measure(content[0].styles);
      content = content[0].children;
    }

    const scaffoldRootStyles = { ...rootStyles };
    for (const key of SCAFFOLD_OWNED_ROOT_KEYS) delete scaffoldRootStyles[key];

    const wrap = (cls: string, children: BuildNode[], id: string): BuildNode => {
      stats.nodeCount += 1;
      return { id: `pw-${id}`, type: "element", tag: "div", classNames: sharedBare(cls), children };
    };
    const paddingSection = wrap(paddingName, buildChildren(content, "0.c"), "padsec");
    const container = wrap(containerName, [paddingSection], "container");
    const paddingGlobal = wrap("padding-global", [container], "padglobal");
    return sectionRoot(uniqueClass(`section_${sectionKey}`, scaffoldRootStyles, input.tree.key), [paddingGlobal]);
  };

  let elementTree: BuildNode;
  if (isNavbar) {
    elementTree = buildNavbarTree() ?? toBuildNode(input.tree, "0", true);
  } else if (chrome) {
    elementTree = toBuildNode(input.tree, "0", true);
  } else {
    elementTree = buildSectionTree();
  }
  stats.classCount = styleDefinitions.length;

  if (stats.backgroundImages > 0) {
    warnings.add(
      `${stats.backgroundImages} full-bleed image(s) render as hotlinked CSS background-images — replace with uploaded assets after paste.`
    );
  }
  if (stats.placeholderImages > 0) {
    warnings.add(
      `${stats.placeholderImages} inline image(s) paste as empty placeholders — upload assets and relink after paste.`
    );
  }
  if (stats.droppedLinkUrls > 0) {
    warnings.add(
      `${stats.droppedLinkUrls} link URL(s) reset to "#" (the paste format does not carry them) — relink after paste.`
    );
  }

  return { elementTree, styleDefinitions, stats, warnings: [...warnings] };
}

/** Project's shared client-first classes → real style ids, so pasted shared
 *  classes bind by identity instead of forking to "name 2" (webflow-clipboard). */
type ExistingStyles = Array<{ className: string; styleId: string }>;

/** Single captured section → a complete, standalone clipboard payload. */
export function capturedSectionToClipboardPayload(
  input: SectionCaptureInput,
  existingStyles: ExistingStyles = []
): PlaygroundPayloadResult {
  const built = buildSection(input);
  const payload = buildWebflowClipboardPayload({
    elementTree: built.elementTree,
    styleDefinitions: built.styleDefinitions,
    existingStyles
  });
  return { payload, stats: built.stats, warnings: built.warnings };
}

/**
 * Combine several captured sections into ONE payload wrapped in a single
 * `main-wrapper` (client-first): paste it straight into `page-wrapper` and every
 * part lands in place. Styles are deduped by class name. A single section pastes
 * bare via `capturedSectionToClipboardPayload` (drop it into `main-wrapper`).
 */
export function combineSections(
  sections: SectionCaptureInput[],
  opts: { wrapperLabel?: string; existingStyles?: ExistingStyles } = {}
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
    id: "pw-main-wrapper",
    type: "element",
    tag: "main",
    label: "main-wrapper",
    classNames: ["main-wrapper"],
    children: builds.map((build) => build.elementTree)
  };

  const payload = buildWebflowClipboardPayload({
    elementTree: wrapper,
    styleDefinitions: [...stylesByName.values()],
    existingStyles: opts.existingStyles ?? []
  });

  const stats = {
    nodeCount: builds.reduce((sum, b) => sum + b.stats.nodeCount, 0),
    classCount: stylesByName.size,
    responsiveClassCount: builds.reduce((sum, b) => sum + b.stats.responsiveClassCount, 0),
    styleGuideRefs: builds.reduce((sum, b) => sum + b.stats.styleGuideRefs, 0),
    droppedLinkUrls: builds.reduce((sum, b) => sum + b.stats.droppedLinkUrls, 0),
    placeholderImages: builds.reduce((sum, b) => sum + b.stats.placeholderImages, 0),
    backgroundImages: builds.reduce((sum, b) => sum + b.stats.backgroundImages, 0)
  };
  const warnings = [...new Set(builds.flatMap((b) => b.warnings))];
  return { payload, stats, warnings };
}
