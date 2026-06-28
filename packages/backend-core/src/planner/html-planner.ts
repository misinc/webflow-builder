import { HTMLElement, Node, NodeType, TextNode, parse } from "node-html-parser";
import {
  BuildNode,
  PlannerWarning,
  SectionMetadata,
  SharedStyleContext,
  SkeletonPlan,
  skeletonPlanSchema
} from "@wfb/shared/contracts.js";
import { dedupe, isReservedStyleGuideClassName } from "@wfb/shared/client-first.js";
import { slugify } from "@wfb/shared/text.js";

export interface HtmlOutlineNode {
  tag: string;
  id?: string;
  classNames: string[];
  textContent?: string;
  children: HtmlOutlineNode[];
}

export interface HtmlBuildResult {
  root: BuildNode;
  assetBindings: SkeletonPlan["assetBindings"];
  warnings: PlannerWarning[];
  sourceClassNames: string[];
  classMappingDecisions: Array<{
    sourceClassName: string;
    targetClassName: string;
    action: "reuse" | "create" | "unmapped";
  }>;
}

const SKIPPED_TAGS = new Set(["script", "style", "noscript", "template"]);
const SVG_INTERNAL_TAGS = new Set([
  "svg",
  "path",
  "circle",
  "rect",
  "line",
  "polyline",
  "polygon",
  "ellipse",
  "g",
  "defs",
  "clippath"
]);
const INLINE_PHRASING_TAGS = new Set([
  "a",
  "abbr",
  "b",
  "code",
  "em",
  "i",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "time",
  "u"
]);
const TEXT_TAGS = new Set([
  "a",
  "button",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "label",
  "li",
  "p",
  "span"
]);

function warning(
  code: string,
  message: string,
  level: PlannerWarning["level"] = "warning"
): PlannerWarning {
  return { code, message, level };
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function elementTag(node: HTMLElement): string {
  return node.rawTagName.toLowerCase();
}

function classNamesFor(node: HTMLElement): string[] {
  return dedupe(
    (node.getAttribute("class") ?? "")
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function inferNodeType(tag: string): BuildNode["type"] {
  if (tag === "img") return "image";
  if (tag === "button" || tag === "a") return "button";
  if (tag === "ul" || tag === "ol") return "list";
  if (tag === "li") return "listItem";
  if (/^h[1-6]$/.test(tag)) return "heading";
  if (tag === "p" || tag === "blockquote" || tag === "span" || tag === "label") return "text";
  return tag === "section" ? "section" : "box";
}

function textFromNode(node: Node): string {
  if (node.nodeType === NodeType.TEXT_NODE) {
    return (node as TextNode).text;
  }
  if (node.nodeType !== NodeType.ELEMENT_NODE) {
    return "";
  }
  const element = node as HTMLElement;
  const tag = elementTag(element);
  if (SKIPPED_TAGS.has(tag) || SVG_INTERNAL_TAGS.has(tag)) {
    return "";
  }
  if (!INLINE_PHRASING_TAGS.has(tag)) {
    return "";
  }
  return element.childNodes.map(textFromNode).join(" ");
}

function directTextFor(element: HTMLElement): string | undefined {
  const text = normalizeWhitespace(
    element.childNodes
      .map((child) => {
        if (child.nodeType === NodeType.TEXT_NODE) {
          return (child as TextNode).text;
        }
        if (child.nodeType === NodeType.ELEMENT_NODE) {
          return textFromNode(child);
        }
        return "";
      })
      .join(" ")
  );
  return text || undefined;
}

function outlineTextFor(element: HTMLElement): string | undefined {
  const text = directTextFor(element);
  if (!text || /[{}]/.test(text)) {
    return undefined;
  }
  return text;
}

function sharedOrFallback(
  sharedStyleContext: SharedStyleContext | undefined,
  category: string,
  preferred: string[],
  fallback: string
): string {
  const candidates = (sharedStyleContext?.classes ?? []).filter(
    (item) => item.category === category && !isReservedStyleGuideClassName(item.name)
  );
  const normalizedPreferred = preferred.map((value) => value.toLowerCase());
  return (
    candidates.find((item) => normalizedPreferred.includes(item.name.toLowerCase()))?.name ??
    candidates.find((item) =>
      normalizedPreferred.some((value) => item.name.toLowerCase().startsWith(value))
    )?.name ??
    candidates.find((item) =>
      normalizedPreferred.some((value) => item.name.toLowerCase().includes(value))
    )?.name ??
    fallback
  );
}

function generatedClassNames(input: {
  tag: string;
  type: BuildNode["type"];
  sectionKey: string;
  path: number[];
  textContent?: string;
  childCount: number;
  sharedStyleContext?: SharedStyleContext;
}): string[] {
  const { tag, type, sectionKey, path, textContent, childCount, sharedStyleContext } = input;
  if (tag === "section" || tag === "header" || tag === "footer" || tag === "main") {
    return [`section_${sectionKey}`];
  }
  if (tag === "article") {
    return [`${sectionKey}_card`];
  }
  if (tag === "ul" || tag === "ol") {
    return [`${sectionKey}_list`];
  }
  if (tag === "li") {
    return [`${sectionKey}_item`];
  }
  if (tag === "img") {
    return [`${sectionKey}_image`];
  }
  if (tag === "a" || tag === "button") {
    return [`${sectionKey}_link`];
  }
  if (/^h[1-6]$/.test(tag)) {
    return [
      sharedOrFallback(
        sharedStyleContext,
        "heading",
        [`heading-style-${tag}`, "heading-style-h2", "heading"],
        `heading-style-${tag}`
      )
    ];
  }
  if (tag === "p" || tag === "blockquote" || tag === "span" || tag === "label") {
    return [
      sharedOrFallback(
        sharedStyleContext,
        "text",
        ["text-size-medium", "body", "text-medium"],
        "text-size-medium"
      )
    ];
  }
  if (tag === "div") {
    if (textContent && childCount === 0) {
      return [
        sharedOrFallback(
          sharedStyleContext,
          "text",
          ["text-size-medium", "body", "text-medium"],
          "text-size-medium"
        )
      ];
    }
    if (path.length <= 2) {
      return [`${sectionKey}_component`];
    }
    if (type === "list") {
      return [`${sectionKey}_list`];
    }
    return [`${sectionKey}_content`];
  }
  return [];
}

function buildNodeFromElement(input: {
  element: HTMLElement;
  sectionId: string;
  sectionKey: string;
  path: number[];
  sharedStyleContext?: SharedStyleContext;
  warnings: PlannerWarning[];
  assetBindings: SkeletonPlan["assetBindings"];
  sourceClassNames: Set<string>;
}): BuildNode | null {
  const tag = elementTag(input.element);
  if (SKIPPED_TAGS.has(tag)) {
    input.warnings.push(warning("html-removed-cruft", `Removed <${tag}> from the HTML skeleton.`));
    return null;
  }
  if (SVG_INTERNAL_TAGS.has(tag)) {
    input.warnings.push(
      warning("html-removed-svg", `Removed <${tag}> from the HTML skeleton because SVG internals are not inserted directly.`)
    );
    return null;
  }

  const sourceClasses = classNamesFor(input.element);
  sourceClasses.forEach((className) => input.sourceClassNames.add(className));
  const id = `${input.sectionId}-html-${input.path.join("-") || "root"}`;
  const textContent = TEXT_TAGS.has(tag) || tag === "div" ? directTextFor(input.element) : undefined;
  const children: BuildNode[] = [];

  input.element.childNodes.forEach((child, index) => {
    if (child.nodeType !== NodeType.ELEMENT_NODE) {
      return;
    }
    const childElement = child as HTMLElement;
    const childTag = elementTag(childElement);
    if (INLINE_PHRASING_TAGS.has(childTag)) {
      const blockChildren = childElement.childNodes.filter(
        (grandchild) =>
          grandchild.nodeType === NodeType.ELEMENT_NODE &&
          !INLINE_PHRASING_TAGS.has(elementTag(grandchild as HTMLElement))
      );
      if (blockChildren.length === 0) {
        return;
      }
    }
    const childNode = buildNodeFromElement({
      ...input,
      element: childElement,
      path: [...input.path, index]
    });
    if (childNode) {
      children.push(childNode);
    }
  });

  const type = inferNodeType(tag);
  const classNames = generatedClassNames({
    tag,
    type,
    sectionKey: input.sectionKey,
    path: input.path,
    textContent,
    childCount: children.length,
    sharedStyleContext: input.sharedStyleContext
  });
  const node: BuildNode = {
    id,
    type,
    tag,
    classNames,
    textContent,
    children
  };

  if (tag === "img") {
    const source = input.element.getAttribute("src")?.trim();
    if (source) {
      input.assetBindings.push({
        nodeId: id,
        source,
        fallback: "placeholder"
      });
    }
  }

  return node;
}

function firstUsefulElement(root: HTMLElement): HTMLElement | null {
  const body = root.querySelector("body");
  const main = body?.querySelector("main") ?? root.querySelector("main");
  const scope = main ?? body ?? root;
  const semantic = scope.querySelector("section, header, footer, article, main");
  if (semantic) {
    return semantic;
  }
  return scope.childNodes.find((node): node is HTMLElement => node.nodeType === NodeType.ELEMENT_NODE) ?? scope;
}

function describeNodeTree(node: BuildNode, depth = 0): string[] {
  const indent = "  ".repeat(depth);
  const classSuffix = node.classNames.length ? `.${node.classNames.join(".")}` : "";
  const textSuffix = node.textContent?.trim() ? ` ${JSON.stringify(node.textContent.trim())}` : "";
  return [
    `${indent}${node.tag}${classSuffix}${textSuffix}`,
    ...node.children.flatMap((child) => describeNodeTree(child, depth + 1))
  ];
}

export function htmlToBuildNode(input: {
  sourceCode: string;
  sectionId: string;
  sectionName?: string;
  sharedStyleContext?: SharedStyleContext;
}): HtmlBuildResult | null {
  const document = parse(input.sourceCode, {
    comment: false,
    lowerCaseTagName: true,
    blockTextElements: {
      script: true,
      style: true,
      pre: false
    }
  });
  const rootElement = firstUsefulElement(document);
  if (!rootElement) {
    return null;
  }
  const warnings: PlannerWarning[] = [];
  const assetBindings: SkeletonPlan["assetBindings"] = [];
  const sourceClassNames = new Set<string>();
  const sectionKey = slugify(input.sectionName ?? input.sectionId) || "section";
  const root = buildNodeFromElement({
    element: rootElement,
    sectionId: input.sectionId,
    sectionKey,
    path: [0],
    sharedStyleContext: input.sharedStyleContext,
    warnings,
    assetBindings,
    sourceClassNames
  });
  if (!root) {
    return null;
  }
  return {
    root,
    assetBindings,
    warnings,
    sourceClassNames: [...sourceClassNames].sort(),
    classMappingDecisions: []
  };
}

export function htmlToSkeletonPlan(input: {
  metadata: SectionMetadata;
  sourceCode: string;
  sharedStyleContext?: SharedStyleContext;
  inheritedWarnings?: PlannerWarning[];
}): SkeletonPlan | null {
  const parsed = htmlToBuildNode({
    sourceCode: input.sourceCode,
    sectionId: input.metadata.sectionId,
    sectionName: input.metadata.sectionName,
    sharedStyleContext: input.sharedStyleContext
  });
  if (!parsed) {
    return null;
  }
  const reused = parsed.classMappingDecisions
    .filter((decision) => decision.action === "reuse")
    .map((decision) => decision.targetClassName);
  const created = parsed.classMappingDecisions
    .filter((decision) => decision.action === "create")
    .map((decision) => decision.targetClassName);

  return skeletonPlanSchema.parse({
    sectionMetadata: {
      ...input.metadata,
      repoType: "html"
    },
    treeText: describeNodeTree(parsed.root).join("\n"),
    elementTree: parsed.root,
    assetBindings: parsed.assetBindings,
    reusableClasses: dedupe(reused),
    suggestedNewClasses: dedupe(created),
    classMappingDecisions: parsed.classMappingDecisions,
    warnings: [
      warning(
        "html-deterministic-skeleton",
        "Skeleton structure and text were parsed deterministically from rendered HTML; source HTML class attributes were ignored for Webflow class output.",
        "info"
      ),
      ...(input.inheritedWarnings ?? []),
      ...parsed.warnings
    ]
  });
}

export function htmlToOutline(sourceCode: string): HtmlOutlineNode | null {
  const document = parse(sourceCode, {
    comment: false,
    lowerCaseTagName: true,
    blockTextElements: {
      script: true,
      style: true,
      pre: false
    }
  });
  const root = firstUsefulElement(document);
  if (!root) {
    return null;
  }

  function convert(element: HTMLElement): HtmlOutlineNode | null {
    const tag = elementTag(element);
    if (SKIPPED_TAGS.has(tag)) {
      return null;
    }
    if (tag === "svg") {
      return {
        tag: "img",
        classNames: dedupe([
          "icon-embed-xsmall",
          ...classNamesFor(element).filter((name) => /icon|embed/i.test(name))
        ]),
        children: []
      };
    }
    if (SVG_INTERNAL_TAGS.has(tag)) {
      return null;
    }
    const children = element.childNodes
      .filter((child): child is HTMLElement => child.nodeType === NodeType.ELEMENT_NODE)
      .map(convert)
      .filter((child): child is HtmlOutlineNode => Boolean(child));
    const textContent = tag === "img"
      ? element.getAttribute("alt") ?? undefined
      : outlineTextFor(element);
    return {
      tag,
      id: element.getAttribute("id") ?? undefined,
      classNames: classNamesFor(element),
      textContent,
      children
    };
  }

  return convert(root);
}
