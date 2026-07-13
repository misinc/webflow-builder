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

// Canonical client-first sizes (px) used to pick the nearest named class. The
// project's own values may differ slightly — a bare reference adopts them; only
// when nothing is within tolerance do we mint a custom class carrying the exact
// measured value.
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
const CONTAINER_TOLERANCE = 0.12;
const PADDING_TOLERANCE = 0.2;

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

/** Nearest named size within tolerance, else null (→ mint a custom class). */
function nearest(
  value: number,
  scale: Array<{ name: string; px: number }>,
  tolerance: number
): string | null {
  let best: { name: string; diff: number } | null = null;
  for (const step of scale) {
    const diff = Math.abs(value - step.px) / step.px;
    if (diff <= tolerance && (!best || diff < best.diff)) {
      best = { name: step.name, diff };
    }
  }
  return best?.name ?? null;
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

// A "special" section — a full-bleed image backdrop or an absolutely-positioned
// layout (heroes, overlays). These don't use the client-first container/padding
// scaffold, so we skip container/padding-section naming and preserve them exactly.
function isSpecialLayout(node: CapturedNode, depth = 0): boolean {
  if (isFullBleedImage(node)) return true;
  if (depth > 0) {
    const position = node.styles["position"];
    if (position === "absolute" || position === "fixed") return true;
  }
  return node.children.some((child) => isSpecialLayout(child, depth + 1));
}

function buildSection(input: SectionCaptureInput): SectionBuild {
  const warnings = new Set<string>();
  const breakpointStyles = input.breakpointStyles ?? {};
  const breakpointKeys = input.breakpointKeys ?? Object.keys(breakpointStyles);
  const chrome = CHROME_KINDS.test(input.kind ?? "");
  const rawKey = slugify(input.sectionName ?? "section") || "section";
  const sectionKey = rawKey.split("-").slice(0, 3).join("-") || "section";
  // Special sections (hero backdrops, absolute layouts) skip the container /
  // padding-section scaffold naming — kept as pure fidelity.
  const scaffoldNaming = !chrome && !isSpecialLayout(input.tree);

  const styleDefinitions: StyleDefinitionInput[] = [];
  const classNameByKey = new Map<string, string>(); // dedup unique classes by style
  const comboByKey = new Map<string, string>(); // dedup combos by base+style
  const roleCounts = new Map<string, number>();
  let containerAssigned = false;

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

  // A shared client-first class (referenced by name, adopts the Style Guide) with
  // a content-hashed combo carrying this node's captured fidelity on top.
  const sharedWithCombo = (
    shared: string,
    styles: Record<string, string>,
    nodeKey: string | undefined
  ): string[] => {
    stats.styleGuideRefs += 1;
    if (Object.keys(styles).length === 0) return [shared];
    const variants = variantsFor(nodeKey, styles);
    const dedupe = `${shared}|${styleKey(styles)}|${variants ? JSON.stringify(variants) : ""}`;
    let combo = comboByKey.get(dedupe);
    if (!combo) {
      combo = `${shared}_v${fnvHash(dedupe)}`;
      comboByKey.set(dedupe, combo);
      styleDefinitions.push({ className: combo, properties: styles, variants, combo: true });
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

    // Container: the first max-width wrapper in the section.
    const maxW = px(styles["max-width"]);
    if (scaffoldNaming && !containerAssigned && Number.isFinite(maxW) && maxW >= 560 && maxW <= 1700) {
      containerAssigned = true;
      const match = nearest(maxW, CONTAINERS, CONTAINER_TOLERANCE);
      if (match) {
        // Adopt the project container width; keep any other styles as a combo.
        const rest = { ...styles };
        delete rest["max-width"];
        delete rest["margin-left"];
        delete rest["margin-right"];
        return Object.keys(rest).length > 0 ? sharedWithCombo(match, rest, node.key) : sharedBare(match);
      }
      // Nothing fits → a custom container carrying the exact width.
      return [uniqueClass(`container-${sectionKey}`, styles, node.key)];
    }

    // Section padding: a wrapper carrying substantial symmetric vertical padding.
    const padTop = px(styles["padding-top"]);
    const padBottom = px(styles["padding-bottom"]);
    if (scaffoldNaming && Number.isFinite(padTop) && padTop >= 40 && Math.abs(padTop - (padBottom || padTop)) < 8) {
      const match = nearest(padTop, SECTION_PADDINGS, PADDING_TOLERANCE);
      if (match) {
        const rest = { ...styles };
        delete rest["padding-top"];
        delete rest["padding-bottom"];
        return Object.keys(rest).length > 0 ? sharedWithCombo(match, rest, node.key) : sharedBare(match);
      }
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
    const logoAnchor =
      anchors.find(hasMedia) ?? anchors.find((a) => !collectText(a)) ?? anchors[0];
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
    const linkNodes = navLinks.map((a) =>
      native("a", "NavbarLink", NAVBAR_LINK_DATA, [linkClass], [
        // NavbarLink text rides as a text child (added by the serializer).
      ]) as BuildNode
    ).map((node, i) => ({ ...node, textContent: collectText(navLinks[i]) }));

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
      [brand, menu, menuButton]
    );

    const wrapper = native("div", "NavbarWrapper", NAVBAR_WRAPPER_DATA, [defineClass("navbar_component", input.tree.styles)], [container]);
    if (input.label) wrapper.label = input.label;

    stats.droppedLinkUrls += navLinks.length + buttons.length + (logoAnchor ? 1 : 0);
    stats.nodeCount += collectBuildNodes(wrapper);
    return wrapper;
  };

  const isNavbar = /navbar|header/i.test(input.kind ?? "");
  const elementTree = (isNavbar && buildNavbarTree()) || toBuildNode(input.tree, "0", true);
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
 * Combine several captured sections into ONE payload wrapped in a single
 * `main-wrapper` (client-first): paste it straight into `page-wrapper` and every
 * part lands in place. Styles are deduped by class name. A single section pastes
 * bare via `capturedSectionToClipboardPayload` (drop it into `main-wrapper`).
 */
export function combineSections(
  sections: SectionCaptureInput[],
  _opts: { wrapperLabel?: string } = {}
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
    existingStyles: []
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
