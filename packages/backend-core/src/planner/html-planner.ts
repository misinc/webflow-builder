import { HTMLElement, Node, NodeType, TextNode, parse } from "node-html-parser";
import {
  BuildNode,
  PlannerWarning,
  SectionMetadata,
  SharedStyleContext,
  SiteStylePlan,
  SkeletonPlan,
  skeletonPlanSchema
} from "@wfb/shared/contracts.js";
import { dedupe, isBuilderClassName } from "@wfb/shared/client-first.js";

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

function sourceClassMap(siteStylePlan?: SiteStylePlan | null): Map<string, {
  targetClassName: string;
  action: "reuse" | "create";
}> {
  const map = new Map<string, { targetClassName: string; action: "reuse" | "create" }>();
  if (!siteStylePlan || siteStylePlan.status !== "confirmed") {
    return map;
  }
  for (const decision of siteStylePlan.classDecisions) {
    if (decision.source === "repo") {
      map.set(decision.sourceClassName, {
        targetClassName: decision.targetClassName,
        action: decision.action
      });
    }
  }
  return map;
}

function mapClassNames(input: {
  classNames: string[];
  siteStylePlan?: SiteStylePlan | null;
  sharedStyleContext?: SharedStyleContext;
  warnings: PlannerWarning[];
  decisions: HtmlBuildResult["classMappingDecisions"];
}): string[] {
  const planMap = sourceClassMap(input.siteStylePlan);
  const sharedClassNames = new Set(input.sharedStyleContext?.classes.map((item) => item.name) ?? []);
  const mapped: string[] = [];
  for (const className of input.classNames) {
    const planned = planMap.get(className);
    if (planned) {
      mapped.push(planned.targetClassName);
      input.decisions.push({
        sourceClassName: className,
        targetClassName: planned.targetClassName,
        action: planned.action
      });
      continue;
    }
    if (sharedClassNames.has(className) || isBuilderClassName(className)) {
      mapped.push(className);
      input.decisions.push({
        sourceClassName: className,
        targetClassName: className,
        action: sharedClassNames.has(className) ? "reuse" : "unmapped"
      });
      continue;
    }
    if (input.siteStylePlan?.status === "confirmed") {
      input.warnings.push(
        warning(
          "html-unmapped-class-dropped",
          `Dropped unmapped HTML class "${className}" because the confirmed site style plan has no decision for it.`
        )
      );
      input.decisions.push({
        sourceClassName: className,
        targetClassName: "",
        action: "unmapped"
      });
      continue;
    }
    mapped.push(className);
    input.warnings.push(
      warning(
        "html-unmapped-class-preserved",
        `Preserved unmapped HTML class "${className}" until the site style plan is confirmed.`,
        "info"
      )
    );
    input.decisions.push({
      sourceClassName: className,
      targetClassName: className,
      action: "unmapped"
    });
  }
  return dedupe(mapped);
}

function buildNodeFromElement(input: {
  element: HTMLElement;
  sectionId: string;
  path: number[];
  siteStylePlan?: SiteStylePlan | null;
  sharedStyleContext?: SharedStyleContext;
  warnings: PlannerWarning[];
  assetBindings: SkeletonPlan["assetBindings"];
  sourceClassNames: Set<string>;
  decisions: HtmlBuildResult["classMappingDecisions"];
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
  const classNames = mapClassNames({
    classNames: sourceClasses,
    siteStylePlan: input.siteStylePlan,
    sharedStyleContext: input.sharedStyleContext,
    warnings: input.warnings,
    decisions: input.decisions
  });
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

  const node: BuildNode = {
    id,
    type: inferNodeType(tag),
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
  siteStylePlan?: SiteStylePlan | null;
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
  const decisions: HtmlBuildResult["classMappingDecisions"] = [];
  const root = buildNodeFromElement({
    element: rootElement,
    sectionId: input.sectionId,
    path: [0],
    siteStylePlan: input.siteStylePlan,
    sharedStyleContext: input.sharedStyleContext,
    warnings,
    assetBindings,
    sourceClassNames,
    decisions
  });
  if (!root) {
    return null;
  }
  return {
    root,
    assetBindings,
    warnings,
    sourceClassNames: [...sourceClassNames].sort(),
    classMappingDecisions: dedupe(decisions.map((decision) => JSON.stringify(decision)))
      .map((value) => JSON.parse(value) as HtmlBuildResult["classMappingDecisions"][number])
  };
}

export function htmlToSkeletonPlan(input: {
  metadata: SectionMetadata;
  sourceCode: string;
  siteStylePlan?: SiteStylePlan | null;
  sharedStyleContext?: SharedStyleContext;
  inheritedWarnings?: PlannerWarning[];
}): SkeletonPlan | null {
  const parsed = htmlToBuildNode({
    sourceCode: input.sourceCode,
    sectionId: input.metadata.sectionId,
    siteStylePlan: input.siteStylePlan,
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
        "Skeleton structure, text, and classes were parsed deterministically from rendered HTML.",
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
