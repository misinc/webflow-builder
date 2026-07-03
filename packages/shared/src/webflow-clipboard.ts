import { BuildNode } from "./contracts.js";

/**
 * Serialize a build plan into Webflow's Designer paste format (@webflow/XscpData)
 * — the same clipboard payload the Designer writes on copy, and the mechanism
 * tools like Relume use to deliver fully-styled, client-first components.
 *
 * Pasting this payload into the Designer creates the whole element tree in one
 * gesture, with styles, combo classes, and real HTML embeds (inline SVG icons) —
 * none of the Designer API's element restrictions apply.
 *
 * The format is unofficial/undocumented (reverse-engineered from Designer copy
 * payloads and the ecosystem built on them), so treat paste rejections as a
 * payload-shape bug to iterate on, not a dead end.
 *
 * Notes:
 * - Styles paste as literal values (styleLess CSS). Variable bindings can't be
 *   carried: the clipboard references variables by site-internal ids.
 * - Webflow matches pasted styles to existing project styles BY NAME; a style
 *   entry with empty styleLess reuses the project's class (e.g. heading-style-h2).
 */

export interface WebflowClipboardStyleInput {
  className: string;
  properties: Record<string, string>;
  combo?: boolean;
}

export interface WebflowClipboardInput {
  elementTree: BuildNode;
  styleDefinitions: WebflowClipboardStyleInput[];
  /**
   * The destination project's real styles (name → style id), read via the
   * Designer API. Classes that already exist are referenced by their REAL id so
   * Webflow reuses them on paste instead of duplicating as "name 2" — the same
   * reconciliation Relume's Chrome extension performs. Without this, name
   * collisions duplicate.
   */
  existingStyles?: Array<{ className: string; styleId: string }>;
}

interface XscpNode {
  _id: string;
  type?: string;
  tag?: string;
  classes?: string[];
  children?: string[];
  v?: string;
  text?: boolean;
  data?: Record<string, unknown>;
}

interface XscpStyle {
  _id: string;
  fake: boolean;
  type: "class";
  name: string;
  namespace: "";
  comb: "" | "&";
  styleLess: string;
  variants: Record<string, unknown>;
  /** For a base class: the style ids of combo classes applied on top of it. */
  children: string[];
  origin: null;
  selector: null;
}

export interface XscpData {
  type: "@webflow/XscpData";
  payload: {
    nodes: XscpNode[];
    styles: XscpStyle[];
    assets: unknown[];
    ix1: unknown[];
    ix2: { interactions: unknown[]; events: unknown[]; actionLists: unknown[] };
  };
  meta: {
    droppedLinks: number;
    dynBindRemovedCount: number;
    dynListBindRemovedCount: number;
    paginationRemovedCount: number;
    universalBindingsRemovedCount: number;
    unlinkedSymbolCount: number;
    codeComponentsRemovedCount: number;
    richTextComponentsStripped: boolean;
  };
}

/**
 * Deterministic UUID-shaped id (matches the format in real Designer copy
 * payloads, e.g. "427898cf-0a73-a315-e37a-b551abe161da"). FNV-1a-derived over
 * the seed — stable across runs so repeat pastes produce identical ids.
 */
function stableHexId(seed: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < seed.length; i += 1) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((c << 5) | (c >>> 3)), 0x85ebca6b) >>> 0;
  }
  const h3 = Math.imul(h1 ^ h2, 0xc2b2ae35) >>> 0;
  const h4 = Math.imul(h1 + h3, 0x27d4eb2f) >>> 0;
  const hex =
    h1.toString(16).padStart(8, "0") +
    h2.toString(16).padStart(8, "0") +
    h3.toString(16).padStart(8, "0") +
    h4.toString(16).padStart(8, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// Logical → physical property pairs (LTR). Webflow's parser drops logical
// properties like padding-inline, losing e.g. a pill's horizontal padding.
const LOGICAL_SIDES: Record<string, [string, string]> = {
  "padding-inline": ["padding-left", "padding-right"],
  "padding-block": ["padding-top", "padding-bottom"],
  "margin-inline": ["margin-left", "margin-right"],
  "margin-block": ["margin-top", "margin-bottom"]
};

// Declarations Webflow's paste validator is not known to accept — native
// Designer copies never contain them (e.g. a hover-styled button captures with
// NO transition-* in styleLess), and a payload carrying them can be rejected
// wholesale ("the clipboard is empty"). Dropped until ground-truth captures
// show Webflow's own encoding.
const UNSAFE_STYLE_PROPS = new Set([
  "transition",
  "transition-property",
  "transition-duration",
  "transition-timing-function",
  "transition-delay",
  "isolation",
  "content-visibility",
  "will-change",
  "contain"
]);

function stylePropertiesToStyleLess(properties: Record<string, string>): string {
  const declarations: string[] = [];
  for (const [prop, value] of Object.entries(properties)) {
    if (UNSAFE_STYLE_PROPS.has(prop)) {
      continue;
    }
    // Webflow stores flex as longhands; the `flex: 1 0 0` shorthand is not a
    // known-safe styleLess declaration.
    if (prop === "flex") {
      const parts = value.trim().split(/\s+/);
      if (parts.length === 3) {
        declarations.push(
          `flex-grow: ${parts[0]};`,
          `flex-shrink: ${parts[1]};`,
          `flex-basis: ${parts[2]};`
        );
        continue;
      }
      if (parts.length === 1 && /^[\d.]+$/.test(parts[0])) {
        declarations.push(`flex-grow: ${parts[0]};`, "flex-shrink: 1;", "flex-basis: 0%;");
        continue;
      }
      continue;
    }
    // Webflow doesn't know the `inset` shorthand — expand to physical offsets.
    if (prop === "inset") {
      const parts = value.trim().split(/\s+/);
      const [t, r = t, btm = t, l = r] = parts;
      declarations.push(`top: ${t};`, `right: ${r};`, `bottom: ${btm};`, `left: ${l};`);
      continue;
    }
    const logical = LOGICAL_SIDES[prop];
    if (logical) {
      const [start, end = start] = value.trim().split(/\s+/);
      declarations.push(`${logical[0]}: ${start};`, `${logical[1]}: ${end};`);
      continue;
    }
    // Webflow stores flex/grid gaps under the legacy grid-*-gap names and
    // silently drops a modern `gap:` declaration on paste.
    if (prop === "gap") {
      const [row, column = row] = value.trim().split(/\s+/);
      declarations.push(`grid-row-gap: ${row};`, `grid-column-gap: ${column};`);
      continue;
    }
    if (prop === "row-gap") {
      declarations.push(`grid-row-gap: ${value};`);
      continue;
    }
    if (prop === "column-gap") {
      declarations.push(`grid-column-gap: ${value};`);
      continue;
    }
    declarations.push(`${prop}: ${value};`);
  }
  return declarations.join(" ");
}

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

function isIconEmbed(node: BuildNode): boolean {
  return (
    node.type === "embed" ||
    typeof node.embedHtml === "string" ||
    node.classNames.some((name) => name.startsWith("icon-embed"))
  );
}

/** Map a BuildNode to its XscpData element node (children wired by caller). */
function nodeShapeFor(node: BuildNode, hasElementChildren: boolean): Omit<XscpNode, "_id" | "classes" | "children"> {
  const tag = node.tag || "div";
  if (isIconEmbed(node)) {
    const html = node.embedHtml ?? `<div data-icon="${node.label ?? "icon"}"></div>`;
    return {
      type: "HtmlEmbed",
      tag: "div",
      v: html,
      data: {
        insideRTE: false,
        embed: {
          type: "html",
          meta: { html, div: false, iframe: false, script: false }
        }
      }
    };
  }
  if (HEADING_TAGS.has(tag)) {
    return { type: "Heading", tag, data: { tag } };
  }
  if (tag === "p") {
    return { type: "Paragraph", tag: "p", data: { tag: "p" } };
  }
  if (tag === "blockquote") {
    return { type: "Blockquote", tag: "blockquote", data: { tag: "blockquote" } };
  }
  if (tag === "a") {
    return {
      type: "Link",
      tag: "a",
      data: {
        button: false,
        block: hasElementChildren ? "block" : "inline",
        link: { url: "#" }
      }
    };
  }
  if (tag === "img") {
    return {
      type: "Image",
      tag: "img",
      data: { attr: { src: "", alt: node.label ?? "" }, img: {} }
    };
  }
  // A Block may only carry tags Webflow's paste validator accepts — anything
  // exotic (ul/li/form/fieldset/picture/…) becomes a div, keeping its classes.
  // Guessed node shapes for unsupported types are exactly what gets a payload
  // rejected wholesale ("the clipboard is empty").
  const blockTag = SAFE_BLOCK_TAGS.has(tag) ? tag : "div";
  return { type: "Block", tag: blockTag, data: { tag: blockTag, text: false } };
}

const SAFE_BLOCK_TAGS = new Set([
  "div",
  "section",
  "article",
  "aside",
  "header",
  "footer",
  "nav",
  "main",
  "figure",
  "address",
  "span"
]);

export function buildWebflowClipboardPayload(input: WebflowClipboardInput): XscpData {
  const nodes: XscpNode[] = [];
  const styleIdByName = new Map<string, string>();
  const usedClassNames = new Set<string>();
  const projectStyleIdByName = new Map(
    (input.existingStyles ?? []).map((style) => [style.className, style.styleId])
  );
  const definitionByName = new Map(
    input.styleDefinitions.map((definition) => [definition.className, definition])
  );
  // Real Designer payloads link a base class to its combos via style.children.
  const comboIdsByBaseName = new Map<string, Set<string>>();

  const styleIdFor = (className: string): string => {
    const existing = styleIdByName.get(className);
    if (existing) {
      return existing;
    }
    // A class that already exists in the destination project is referenced by
    // its real id so Webflow reuses it instead of creating "name 2".
    const id = projectStyleIdByName.get(className) ?? stableHexId(`style:${className}`);
    styleIdByName.set(className, id);
    return id;
  };

  const walk = (node: BuildNode, path: string): string => {
    const id = stableHexId(`node:${path}:${node.id}`);
    const childIds: string[] = [];

    const hasElementChildren = (node.children ?? []).length > 0;
    const shape = nodeShapeFor(node, hasElementChildren);
    const isEmbed = shape.type === "HtmlEmbed";

    // Direct text becomes a text child node (Webflow's own copy format).
    if (!isEmbed && typeof node.textContent === "string" && node.textContent.trim()) {
      const textId = stableHexId(`text:${path}:${node.id}`);
      nodes.push({ _id: textId, text: true, v: node.textContent });
      childIds.push(textId);
      if (shape.type === "Block" && !hasElementChildren) {
        (shape.data as Record<string, unknown>).text = true;
      }
    }

    if (!isEmbed) {
      (node.children ?? []).forEach((child, index) => {
        childIds.push(walk(child, `${path}.${index}`));
      });
    }

    // A node label becomes the Designer's Navigator display name (e.g. the
    // page-mode wrapper announces itself as "Pasted sections — unwrap me").
    if (node.label && shape.data) {
      (shape.data as Record<string, unknown>).displayName = node.label;
    }

    node.classNames.forEach((name) => usedClassNames.add(name));
    const baseName = node.classNames.find((name) => !definitionByName.get(name)?.combo);
    if (baseName) {
      for (const name of node.classNames) {
        if (definitionByName.get(name)?.combo) {
          const set = comboIdsByBaseName.get(baseName) ?? new Set<string>();
          set.add(styleIdFor(name));
          comboIdsByBaseName.set(baseName, set);
        }
      }
    }
    nodes.push({
      _id: id,
      ...shape,
      classes: node.classNames.map(styleIdFor),
      children: childIds
    });
    return id;
  };

  walk(input.elementTree, "0");

  // Every class referenced by a node needs a style entry. Classes that already
  // exist in the project carry their real id and EMPTY styleLess — pasting never
  // restyles an existing class, it just references it. Unknown classes without a
  // definition also paste empty (created bare, name preserved).
  const styles: XscpStyle[] = [...usedClassNames].map((name) => {
    const definition = definitionByName.get(name);
    const existsInProject = projectStyleIdByName.has(name);
    return {
      _id: styleIdFor(name),
      fake: false,
      type: "class",
      name,
      namespace: "",
      comb: definition?.combo ? "&" : "",
      styleLess:
        !existsInProject && definition ? stylePropertiesToStyleLess(definition.properties) : "",
      variants: {},
      children: [...(comboIdsByBaseName.get(name) ?? [])].sort(),
      origin: null,
      selector: null
    };
  });

  return {
    type: "@webflow/XscpData",
    payload: {
      nodes,
      styles,
      assets: [],
      ix1: [],
      ix2: { interactions: [], events: [], actionLists: [] }
    },
    meta: {
      droppedLinks: 0,
      dynBindRemovedCount: 0,
      dynListBindRemovedCount: 0,
      paginationRemovedCount: 0,
      universalBindingsRemovedCount: 0,
      unlinkedSymbolCount: 0,
      codeComponentsRemovedCount: 0,
      richTextComponentsStripped: false
    }
  };
}
