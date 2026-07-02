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
  children: string[];
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
    unlinkedSymbolCount: number;
  };
}

/**
 * Deterministic 24-hex-char id (Webflow uses Mongo-style ids). FNV-1a over the
 * seed, expanded to 24 chars — stable across runs so repeat pastes of the same
 * section produce identical style ids.
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
  return (
    h1.toString(16).padStart(8, "0") +
    h2.toString(16).padStart(8, "0") +
    h3.toString(16).padStart(8, "0")
  );
}

function stylePropertiesToStyleLess(properties: Record<string, string>): string {
  return Object.entries(properties)
    .map(([prop, value]) => `${prop}: ${value};`)
    .join(" ");
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
  if (tag === "ul" || tag === "ol") {
    return { type: "List", tag, data: { tag, unstyled: false } };
  }
  if (tag === "li") {
    return { type: "ListItem", tag: "li", data: { tag: "li" } };
  }
  if (tag === "img") {
    return {
      type: "Image",
      tag: "img",
      data: { attr: { src: "", alt: node.label ?? "" }, img: {} }
    };
  }
  // div/section/article/header/footer/aside/figure/span/… — a Block carrying the tag.
  return { type: "Block", tag, data: { tag, text: false } };
}

export function buildWebflowClipboardPayload(input: WebflowClipboardInput): XscpData {
  const nodes: XscpNode[] = [];
  const styleIdByName = new Map<string, string>();
  const usedClassNames = new Set<string>();

  const styleIdFor = (className: string): string => {
    const existing = styleIdByName.get(className);
    if (existing) {
      return existing;
    }
    const id = stableHexId(`style:${className}`);
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

    node.classNames.forEach((name) => usedClassNames.add(name));
    nodes.push({
      _id: id,
      ...shape,
      classes: node.classNames.map(styleIdFor),
      children: childIds
    });
    return id;
  };

  walk(input.elementTree, "0");

  const definitionByName = new Map(
    input.styleDefinitions.map((definition) => [definition.className, definition])
  );
  // Every class referenced by a node needs a style entry. Classes without our own
  // definition get empty styleLess — Webflow reuses the project's class by name.
  const styles: XscpStyle[] = [...usedClassNames].map((name) => {
    const definition = definitionByName.get(name);
    return {
      _id: styleIdFor(name),
      fake: false,
      type: "class",
      name,
      namespace: "",
      comb: definition?.combo ? "&" : "",
      styleLess: definition ? stylePropertiesToStyleLess(definition.properties) : "",
      variants: {},
      children: []
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
      unlinkedSymbolCount: 0
    }
  };
}
