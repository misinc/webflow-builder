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
  sourceClassNames: string[];
  textContent?: string;
  children: BuildNode[];
  sharedStyleContext?: SharedStyleContext;
}): string[] {
  const { tag, sectionKey, path, sourceClassNames, textContent, children, sharedStyleContext } = input;
  const childTags = new Set(children.map((child) => child.tag));
  const childClassNames = children.flatMap((child) => child.classNames);
  const linkChildren = children.filter((child) => child.tag === "a");
  const cardChildren = children.filter((child) =>
    child.classNames.some((className) => className.endsWith("_card") || className.endsWith("_item"))
  );
  // Decorative icon embeds (inline SVGs) are not real content — they must not
  // make an otherwise-leaf <a>/<button> look like a card.
  const contentChildren = children.filter(
    (child) =>
      !(child.type === "embed" && child.classNames.some((name) => name.startsWith("icon-embed")))
  );
  // Client-first names are inferred from element structure below (see the
  // tag/children heuristics), not from site-specific source-class patterns.
  const isDecorativeEmbed = (node: BuildNode): boolean =>
    node.type === "embed" && node.classNames.some((name) => name.startsWith("icon-embed"));
  const wrapsCard = (node: BuildNode): boolean =>
    node.classNames.some((name) => name.endsWith("_card")) ||
    (node.children ?? []).some((child) =>
      child.classNames.some((name) => name.endsWith("_card"))
    );

  // Only the section ROOT gets section_{key}. Nested semantic wrappers
  // (header/footer/main/nav/aside/figure/article) route through the structural
  // heuristics below like a <div>, so they don't collide with the section class.
  if (
    path.length <= 1 &&
    (tag === "section" || tag === "header" || tag === "footer" || tag === "main")
  ) {
    return [`section_${sectionKey}`];
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
    return contentChildren.length > 0 ? [`${sectionKey}_card`] : [`${sectionKey}_link`];
  }
  if (/^h[1-6]$/.test(tag)) {
    return [
      // Map each heading to its OWN level's class only. Never cross-fall to
      // heading-style-h2, or an <h3> inherits the big section-heading size.
      sharedOrFallback(
        sharedStyleContext,
        "heading",
        [`heading-style-${tag}`],
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
  if (
    tag === "div" ||
    tag === "article" ||
    tag === "section" ||
    tag === "header" ||
    tag === "footer" ||
    tag === "main" ||
    tag === "nav" ||
    tag === "aside" ||
    tag === "figure"
  ) {
    if (textContent && children.length === 0) {
      return [
        sharedOrFallback(
          sharedStyleContext,
          "text",
          ["text-size-medium", "body", "text-medium"],
          "text-size-medium"
        )
      ];
    }
    if (
      linkChildren.length > 1 ||
      cardChildren.length > 1 ||
      childClassNames.filter((className) => className.endsWith("_card")).length > 1
    ) {
      if (
        linkChildren.length > 1 &&
        linkChildren.every((child) =>
          (child.children ?? []).every(
            (grandchild) => isDecorativeEmbed(grandchild) || grandchild.type === "text"
          )
        )
      ) {
        return [`${sectionKey}_pill_list`];
      }
      if (children.filter(wrapsCard).length > 1) {
        return [`${sectionKey}_card_list`];
      }
      return [`${sectionKey}_list`];
    }
    if (
      childClassNames.some((className) => className.endsWith("_feature")) &&
      childClassNames.some((className) => className.endsWith("_card_list"))
    ) {
      return [`${sectionKey}_grid`];
    }
    if (
      childTags.has("h3") &&
      childTags.has("p") &&
      childClassNames.some((className) => className.endsWith("_pill_list"))
    ) {
      return [`${sectionKey}_feature`];
    }
    if (childTags.has("h3") && !childTags.has("p") && children.some(isDecorativeEmbed)) {
      // An icon + heading row (no body copy) reads as a card title.
      return [`${sectionKey}_card_title`];
    }
    if (childTags.has("h3") && childTags.has("p")) {
      return [`${sectionKey}_item`];
    }
    if (
      children.length === 1 &&
      children[0]?.classNames.some((className) => className.endsWith("_card"))
    ) {
      return [`${sectionKey}_item`];
    }
    if (tag === "article") {
      // A content-block <article> that matched no structural pattern is a card.
      return [`${sectionKey}_card`];
    }
    if (path.length <= 2) {
      return [`${sectionKey}_component`];
    }
    return [`${sectionKey}_content`];
  }
  return [];
}

function addClassNames(node: BuildNode, classNames: string[]): BuildNode {
  return {
    ...node,
    classNames: dedupe([...node.classNames, ...classNames])
  };
}

function decorateSemanticChildren(node: BuildNode, sectionKey: string): BuildNode {
  if (node.classNames.some((className) => className.endsWith("_pill_list"))) {
    return {
      ...node,
      children: node.children.map((child) =>
        child.tag === "a" || child.tag === "button"
          ? addClassNames(child, [`${sectionKey}_pill`])
          : child
      )
    };
  }

  if (node.classNames.some((className) => className.endsWith("_feature"))) {
    return {
      ...node,
      children: node.children.map((child) => {
        if (/^h[1-6]$/.test(child.tag)) {
          return addClassNames(child, [`${sectionKey}_feature_heading`]);
        }
        if (child.tag === "p") {
          return addClassNames(child, [`${sectionKey}_feature_text`]);
        }
        return child;
      })
    };
  }

  if (node.classNames.some((className) => className.endsWith("_card"))) {
    return {
      ...node,
      children: node.children.map((child) => decorateCardDescendants(child, sectionKey))
    };
  }

  return node;
}

function decorateCardDescendants(node: BuildNode, sectionKey: string): BuildNode {
  const classNames = /^h[1-6]$/.test(node.tag)
    ? [`${sectionKey}_card_heading`]
    : node.tag === "p"
      ? [`${sectionKey}_card_text`]
      : [];
  return {
    ...addClassNames(node, classNames),
    children: node.children.map((child) => decorateCardDescendants(child, sectionKey))
  };
}

function wrapSectionWithClientFirstScaffold(root: BuildNode, sectionKey: string): BuildNode {
  if (root.tag !== "section" || root.children.some((child) => child.classNames.includes("padding-global"))) {
    return root;
  }
  const componentClass = `${sectionKey}_component`;
  // If the section already has a single top-level container that the namer called
  // `_component`, use it directly instead of injecting a duplicate wrapper — a
  // second `_component` would double up (e.g. two nested grids fighting over width).
  const componentChildren =
    root.children.length === 1 && root.children[0].classNames.includes(componentClass)
      ? root.children
      : [
          {
            id: `${root.id}-component`,
            type: "group" as const,
            tag: "div",
            classNames: [componentClass],
            children: root.children
          }
        ];
  return {
    ...root,
    children: [
      {
        id: `${root.id}-padding-global`,
        type: "box",
        tag: "div",
        classNames: ["padding-global"],
        children: [
          {
            id: `${root.id}-container-large`,
            type: "box",
            tag: "div",
            classNames: ["container-large"],
            children: [
              {
                id: `${root.id}-section-padding`,
                type: "box",
                tag: "div",
                classNames: ["padding-section-medium"],
                children: componentChildren
              }
            ]
          }
        ]
      }
    ]
  };
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
  if (tag === "svg") {
    // Preserve inline icons as a client-first icon-embed carrying the raw SVG,
    // instead of dropping them. Becomes a Webflow Embed on build.
    const iconSourceClasses = classNamesFor(input.element);
    iconSourceClasses.forEach((className) => input.sourceClassNames.add(className));
    return {
      id: `${input.sectionId}-html-${input.path.join("-") || "root"}`,
      type: "embed",
      tag: "div",
      classNames: ["icon-embed-xsmall"],
      sourceClassNames: dedupe(iconSourceClasses),
      embedHtml: input.element.toString(),
      children: []
    };
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
  const hasElementChildren = input.element.childNodes.some(
    (child) => child.nodeType === NodeType.ELEMENT_NODE
  );
  const textContent =
    TEXT_TAGS.has(tag) || (tag === "div" && !hasElementChildren)
      ? directTextFor(input.element)
      : undefined;
  const children: BuildNode[] = [];

  input.element.childNodes.forEach((child, index) => {
    if (child.nodeType !== NodeType.ELEMENT_NODE) {
      return;
    }
    const childElement = child as HTMLElement;
    const childTag = elementTag(childElement);
    if (INLINE_PHRASING_TAGS.has(childTag) && (tag !== "div" || childTag !== "a")) {
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
    sourceClassNames: sourceClasses,
    textContent,
    children,
    sharedStyleContext: input.sharedStyleContext
  });
  const node: BuildNode = decorateSemanticChildren({
    id,
    type,
    tag,
    classNames,
    sourceClassNames: sourceClasses,
    textContent,
    children
  }, input.sectionKey);

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

  // Mixed content: an element with BOTH direct text and child elements (e.g. a
  // pill link with an icon + label, or a CTA button with a label + arrow icon).
  // Webflow can't hold direct text on a container that has children, so move the
  // text into a text child — placed before or after the element children to match
  // the source order (label-then-icon vs icon-then-label).
  if (node.textContent && node.textContent.trim().length > 0 && node.children.length > 0) {
    const firstElementIndex = input.element.childNodes.findIndex(
      (child) => child.nodeType === NodeType.ELEMENT_NODE
    );
    const leadingTextIndex = input.element.childNodes.findIndex(
      (child) => child.nodeType === NodeType.TEXT_NODE && (child as TextNode).text.trim().length > 0
    );
    const textIsLeading =
      leadingTextIndex >= 0 && (firstElementIndex < 0 || leadingTextIndex < firstElementIndex);
    const textNode: BuildNode = {
      id: `${node.id}-text`,
      type: "text",
      // Use a <p> — the same node shape as the card body text, which reliably
      // gets its text applied in Webflow. (A <span>/<div> preset does not.)
      tag: "p",
      classNames: [],
      textContent: node.textContent,
      children: []
    };
    if (textIsLeading) {
      node.children.unshift(textNode);
    } else {
      node.children.push(textNode);
    }
    node.textContent = undefined;
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
  const scaffoldedRoot = wrapSectionWithClientFirstScaffold(root, sectionKey);
  return {
    root: scaffoldedRoot,
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
