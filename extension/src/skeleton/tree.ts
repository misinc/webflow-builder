import { isBuilderClassName } from "@wfb/shared/client-first.js";
import { BuildNode, SiteStylePlan, SkeletonPlan } from "@wfb/shared/contracts.js";

const LEAF_TAGS = new Set(["img", "source", "br", "hr", "input", "meta", "link"]);
const REMOVED_TAGS = new Set([
  "source",
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
const WRAPPER_TO_DIV_TAGS = new Set(["article", "aside", "figure", "header", "nav", "main"]);
const NON_CONTAINER_TAGS = new Set([
  "p",
  "blockquote",
  "span",
  "label",
  "button",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6"
]);
const ICON_IMAGE_CLASS_PATTERN = /^icon-embed(?:-|$)/;
const MEDIA_WRAPPER_CLASS_PATTERN = /(background|media|video|image|scrim|visual|canvas)/i;
const PADDING_WRAPPER_CLASS_PATTERN = /^padding-(?!global$)/;
const TEXT_BLOCK_CLASS_PATTERN = /(tagline|eyebrow|mini-label|item_value|stat|metric)/i;
const TEXT_WRAPPER_CLASS_PATTERN = /(?:^|[-_])(tag|badge|chip|pill)(?:$|[-_])/i;
const TEXTBLOCK_PSEUDO_TAG = "textblock";

function looksLikeStatText(value: string | null | undefined): boolean {
  const normalized = value?.trim() ?? "";
  if (!normalized || normalized.length > 40) {
    return false;
  }
  return /^\d[\d+.,:%xX°/-]*$/.test(normalized);
}

function normalizeTagToken(token: string): string {
  return token.replace(/^<\/?/, "").replace(/\/?>$/, "").trim().toLowerCase();
}

function actualTagFromToken(token: string): string {
  const normalized = normalizeTagToken(token);
  return normalized === TEXTBLOCK_PSEUDO_TAG ? "div" : normalized;
}

function inferNodeType(tag: string): BuildNode["type"] {
  if (tag === "img") return "image";
  if (tag === "button" || tag === "a") return "button";
  if (tag === "ul" || tag === "ol") return "list";
  if (tag === "li") return "listItem";
  if (/^h[1-6]$/i.test(tag)) return "heading";
  if (tag === "p" || tag === "blockquote" || tag === "span" || tag === "label") return "text";
  return "box";
}

function isTextBlockNode(node: BuildNode): boolean {
  return (
    normalizeTagToken(node.tag) === "div" &&
    Boolean(node.textContent?.trim()) &&
    node.children.length === 0 &&
    (
      node.classNames.some((className) => TEXT_BLOCK_CLASS_PATTERN.test(className)) ||
      looksLikeStatText(node.textContent)
      || node.classNames.length === 0
    )
  );
}

export function getSkeletonDisplayTag(node: BuildNode): string {
  return isTextBlockNode(node) ? TEXTBLOCK_PSEUDO_TAG : normalizeTagToken(node.tag);
}

function extractQuotedText(content: string): { content: string; textContent?: string } {
  const textMatch = content.match(/\s+("(?:\\.|[^"])*")$/);
  if (textMatch?.index === undefined) {
    return { content };
  }

  const encoded = textMatch[1];
  try {
    return {
      content: content.slice(0, textMatch.index).trim(),
      textContent: JSON.parse(encoded) as string
    };
  } catch {
    return {
      content: content.slice(0, textMatch.index).trim(),
      textContent: encoded.slice(1, -1)
    };
  }
}

function serializeSkeletonTreeNode(node: BuildNode, depth: number): string[] {
  const indent = "  ".repeat(depth);
  const displayTag = getSkeletonDisplayTag(node);
  const classSuffix = node.classNames.map((className) => `.${className}`).join("");
  const textSuffix = node.textContent?.trim() ? ` ${JSON.stringify(node.textContent.trim())}` : "";
  return [
    `${indent}${displayTag}${classSuffix}${textSuffix}`,
    ...node.children.flatMap((child) => serializeSkeletonTreeNode(child, depth + 1))
  ];
}

export function serializeSkeletonTree(node: BuildNode): string {
  return serializeSkeletonTreeNode(node, 0).join("\n");
}

function expandInlineChain(treeText: string): string {
  const compact = treeText.trim();
  if (compact.includes("\n") || !compact.includes("->")) {
    return treeText;
  }

  return compact
    .split(/\s*->\s*/)
    .map((part, index) => `${"  ".repeat(index)}${part.trim()}`)
    .join("\n");
}

function splitInlineSiblingLine(rawLine: string): string[] {
  const indent = rawLine.match(/^\s*/)?.[0] ?? "";
  const content = rawLine.slice(indent.length);
  const segments: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const previous = content[index - 1] ?? " ";
    const next = content[index + 1] ?? " ";

    if ((char === '"' || char === "'")) {
      if (quote === char) {
        quote = null;
      } else if (!quote) {
        quote = char;
      }
      current += char;
      continue;
    }

    const isSiblingSeparator =
      !quote &&
      (char === "+" || char === "|") &&
      /\s/.test(previous) &&
      /\s/.test(next);

    if (isSiblingSeparator) {
      const normalized = current.trim();
      if (normalized) {
        segments.push(`${indent}${normalized}`);
      }
      current = "";
      continue;
    }

    current += char;
  }

  const trailing = current.trim();
  if (trailing) {
    segments.push(`${indent}${trailing}`);
  }

  return segments.length > 0 ? segments : [rawLine];
}

function normalizeLines(treeText: string): string[] {
  return expandInlineChain(treeText)
    .split("\n")
    .map((line) => line.replace(/\t/g, "  "))
    .flatMap(splitInlineSiblingLine)
    .filter((line) => line.trim().length > 0);
}

function lineContent(rawLine: string): string {
  return rawLine.replace(/^[\s│]*[├└]─\s*/, "").trim();
}

function lineIndent(rawLine: string): number {
  const indentProbe = rawLine
    .replace(/│/g, " ")
    .replace(/[├└]─\s*/g, "");
  return indentProbe.match(/^ */)?.[0].length ?? 0;
}

function collectClassNames(node: BuildNode): string[] {
  return [node.classNames, ...node.children.map(collectClassNames)].flat();
}

function collectImageNodeIds(node: BuildNode): string[] {
  return [
    ...(normalizeTagToken(node.tag) === "img" ? [node.id] : []),
    ...node.children.flatMap(collectImageNodeIds)
  ];
}

function remapAssetBindings(
  assetBindings: SkeletonPlan["assetBindings"],
  root: BuildNode
): SkeletonPlan["assetBindings"] {
  if (assetBindings.length === 0) {
    return assetBindings;
  }

  const imageNodeIds = collectImageNodeIds(root);
  return assetBindings
    .slice(0, imageNodeIds.length)
    .map((binding, index) => ({
      ...binding,
      nodeId: imageNodeIds[index]!
    }));
}

function countInvalidClassNames(node: BuildNode): number {
  return (
    node.classNames.filter((className) => !isBuilderClassName(className)).length +
    node.children.reduce((total, child) => total + countInvalidClassNames(child), 0)
  );
}

function mapHtmlClassNames(
  classNames: string[],
  siteStylePlan: SiteStylePlan | null | undefined,
  warnings: SkeletonPlan["warnings"],
  tag: string
): string[] {
  const confirmedPlan = siteStylePlan?.status === "confirmed" ? siteStylePlan : null;
  const decisionMap = new Map(
    confirmedPlan?.classDecisions
      .filter((decision) => decision.source === "repo")
      .map((decision) => [decision.sourceClassName, decision.targetClassName]) ?? []
  );
  const mapped: string[] = [];
  for (const className of classNames) {
    const planned = decisionMap.get(className);
    if (planned) {
      mapped.push(planned);
      continue;
    }
    if (confirmedPlan && !isBuilderClassName(className)) {
      warnings.push({
        code: "html-unmapped-class-dropped",
        message: `Dropped unmapped HTML class "${className}" from <${tag}> because the confirmed site style plan has no mapping for it.`,
        level: "warning"
      });
      continue;
    }
    mapped.push(className);
    if (!isBuilderClassName(className)) {
      warnings.push({
        code: "html-unmapped-class-preserved",
        message: `Preserved unmapped HTML class "${className}" on <${tag}> until the site style plan is confirmed.`,
        level: "info"
      });
    }
  }
  return [...new Set(mapped)];
}

function hasClass(node: BuildNode | undefined, className: string): boolean {
  return Boolean(node?.classNames.includes(className));
}

function looksLikeContainerWrapper(node: BuildNode | undefined): boolean {
  return Boolean(
    node?.tag === "div" &&
      node.classNames.some((className) => /(?:^|-)container(?:-|$)|^container-large$/.test(className))
  );
}

function looksLikeSpacingWrapper(node: BuildNode | undefined): boolean {
  return Boolean(
    node?.tag === "div" &&
      node.classNames.some((className) => PADDING_WRAPPER_CLASS_PATTERN.test(className))
  );
}

function isTopLevelContentNode(node: BuildNode): boolean {
  return (
    /^h[1-6]$/i.test(node.tag) ||
    node.tag === "p" ||
    node.tag === "blockquote" ||
    node.tag === "ul" ||
    node.tag === "ol"
  );
}

function wrapChildren(
  children: BuildNode[],
  wrapper: BuildNode
): BuildNode[] {
  return [{ ...wrapper, children }];
}

function patchTopLevelSectionWrapper(node: BuildNode, warnings: SkeletonPlan["warnings"]): BuildNode {
  if (node.tag !== "section" || node.children.length === 0) {
    return node;
  }

  const firstChild = node.children[0];
  const alreadyHasPaddingGlobal = node.children.some((child) =>
    child.classNames.includes("padding-global")
  );
  if (alreadyHasPaddingGlobal) {
    return node;
  }

  if (firstChild.tag === "div") {
    const hasSpacingWrapperClass = firstChild.classNames.some((className) =>
      PADDING_WRAPPER_CLASS_PATTERN.test(className)
    );
    const looksLikeMediaWrapper = firstChild.classNames.some((className) =>
      MEDIA_WRAPPER_CLASS_PATTERN.test(className)
    );

    if (hasSpacingWrapperClass && !looksLikeMediaWrapper) {
      const nextClassNames = [
        "padding-global",
        ...firstChild.classNames.filter((className) => !PADDING_WRAPPER_CLASS_PATTERN.test(className))
      ];

      warnings.push({
        code: "normalized-section-wrapper",
        message: "Normalized the first section wrapper to .padding-global for Client-First consistency.",
        level: "warning"
      });

      return {
        ...node,
        children: [
          {
            ...firstChild,
            classNames: nextClassNames
          },
          ...node.children.slice(1)
        ]
      };
    }
  }

  const paddingGlobalWrapper: BuildNode = {
    id: `${node.id}-padding-global`,
    type: "box",
    tag: "div",
    classNames: ["padding-global"],
    children: []
  };
  const containerWrapper: BuildNode = {
    id: `${node.id}-container-large`,
    type: "box",
    tag: "div",
    classNames: ["container-large"],
    children: []
  };
  const sectionPaddingWrapper: BuildNode = {
    id: `${node.id}-section-padding`,
    type: "box",
    tag: "div",
    classNames: ["padding-section-medium"],
    children: []
  };

  let nextChildren = node.children;
  let insertedPaddingGlobal = false;
  let insertedContainer = false;
  let insertedSectionPadding = false;
  const shouldWrapSparseContent =
    looksLikeContainerWrapper(firstChild) ||
    (node.children.length >= 2 && node.children.every(isTopLevelContentNode));

  if (!shouldWrapSparseContent) {
    return node;
  }

  if (!hasClass(nextChildren[0], "padding-global")) {
    nextChildren = wrapChildren(nextChildren, paddingGlobalWrapper);
    insertedPaddingGlobal = true;
  }

  const paddingGlobalChild = nextChildren[0];
  if (!looksLikeContainerWrapper(paddingGlobalChild?.children[0])) {
    paddingGlobalChild.children = wrapChildren(paddingGlobalChild.children, containerWrapper);
    insertedContainer = true;
  }

  const containerChild = paddingGlobalChild.children[0];
  if (!looksLikeSpacingWrapper(containerChild?.children[0])) {
    containerChild.children = wrapChildren(containerChild.children, sectionPaddingWrapper);
    insertedSectionPadding = true;
  }

  if (!insertedPaddingGlobal && !insertedContainer && !insertedSectionPadding) {
    return node;
  }

  warnings.push({
    code: "inserted-client-first-wrappers",
    message:
      "Inserted missing Client-First wrappers so the section uses padding-global, container-large, and padding-section-medium.",
    level: "warning"
  });

  return {
    ...node,
    children: nextChildren
  };
}

export function parseSkeletonTreeText(
  plan: SkeletonPlan,
  treeText: string
): SkeletonPlan {
  const lines = normalizeLines(treeText);

  if (!lines.length) {
    throw new Error("Skeleton is empty.");
  }

  const indentUnit =
    Math.min(
      ...lines
        .map(lineIndent)
        .filter((indent) => indent > 0)
    ) || 2;

  const stack: Array<{ depth: number; node: BuildNode }> = [];
  let root: BuildNode | null = null;

  lines.forEach((rawLine, index) => {
    let content = lineContent(rawLine);
    const depth = Math.floor(lineIndent(rawLine) / indentUnit);
    const extractedText = extractQuotedText(content);
    content = extractedText.content;
    const textContent = extractedText.textContent;

    const tokens = content.split(/\s+/).filter(Boolean);
    const structureToken = tokens[0];
    if (!structureToken) {
      throw new Error(`Invalid skeleton line ${index + 1}.`);
    }

    const parts = structureToken.split(".").filter(Boolean);
    const tag = actualTagFromToken(parts[0] ?? "");
    const classNames = [
      ...parts.slice(1),
      ...tokens
        .slice(1)
        .map((token) => token.replace(/^\./, "").trim())
        .filter(
          (token) =>
            Boolean(token) &&
            token !== "/" &&
            token !== "->" &&
            token !== "+" &&
            token !== "|"
        )
    ].filter((className) => isBuilderClassName(className));
    if (!tag) {
      throw new Error(`Missing element tag on line ${index + 1}.`);
    }

    const node: BuildNode = {
      id: `${plan.sectionMetadata.sectionId}-edited-${index}`,
      type: inferNodeType(tag),
      tag,
      classNames,
      textContent,
      children: []
    };

    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }

    if (!stack.length) {
      if (root) {
        throw new Error("Skeleton must contain a single root node.");
      }
      root = node;
    } else {
      stack[stack.length - 1].node.children.push(node);
    }

    stack.push({ depth, node });
  });

  if (!root) {
    throw new Error("Skeleton root is missing.");
  }

  return {
    ...plan,
    treeText,
    elementTree: root,
    assetBindings: remapAssetBindings(plan.assetBindings, root)
  };
}

export function sanitizeSkeletonPlan(
  plan: SkeletonPlan,
  options: { siteStylePlan?: SiteStylePlan | null; htmlMode?: boolean } = {}
): SkeletonPlan {
  const htmlMode = options.htmlMode ?? plan.sectionMetadata.repoType === "html";
  const warnings = [...plan.warnings];
  const seenIds = new Set<string>();

  function sanitizeNode(node: BuildNode): {
    node: BuildNode | null;
    hoistedChildren: BuildNode[];
  } {
    const normalizedTag = normalizeTagToken(node.tag);
    const fallbackId = `${plan.sectionMetadata.sectionId}-node-${seenIds.size}`;
    let nextId = node.id?.trim() || fallbackId;
    if (seenIds.has(nextId)) {
      nextId = `${fallbackId}-dup`;
      warnings.push({
        code: "duplicate-node-id",
        message: `Reassigned a duplicate skeleton node id for <${node.tag}>.`,
        level: "warning"
      });
    }
    seenIds.add(nextId);

    if (REMOVED_TAGS.has(normalizedTag)) {
      const normalizedChildren: BuildNode[] = [];
      for (const child of node.children) {
        const sanitizedChild = sanitizeNode(child);
        if (sanitizedChild.node) {
          normalizedChildren.push(sanitizedChild.node);
        }
        normalizedChildren.push(...sanitizedChild.hoistedChildren);
      }
      warnings.push({
        code: "removed-unsupported-tag",
        message: `Removed <${normalizedTag}> from the Webflow skeleton because it should not be inserted into Webflow.`,
        level: "warning"
      });
      return {
        node: null,
        hoistedChildren: normalizedChildren
      };
    }

    const normalizedChildren: BuildNode[] = [];
    for (const child of node.children) {
      const sanitizedChild = sanitizeNode(child);
      if (sanitizedChild.node) {
        normalizedChildren.push(sanitizedChild.node);
      }
      normalizedChildren.push(...sanitizedChild.hoistedChildren);
    }

    const filteredClassNames = htmlMode
      ? mapHtmlClassNames(node.classNames, options.siteStylePlan, warnings, normalizedTag)
      : node.classNames.filter((className) => isBuilderClassName(className));
    const safeTag = WRAPPER_TO_DIV_TAGS.has(normalizedTag) ? "div" : normalizedTag;
    let retagged = safeTag !== normalizedTag;
    let nextTag = safeTag;

    if (nextTag === "span") {
      if (!node.textContent?.trim() && filteredClassNames.length === 0 && normalizedChildren.length === 0) {
        warnings.push({
          code: "removed-empty-span",
          message: "Removed an empty <span> wrapper from the Webflow skeleton.",
          level: "warning"
        });
        return {
          node: null,
          hoistedChildren: []
        };
      }
      nextTag = "div";
      retagged = true;
    }

    if (
      (nextTag === "p" || nextTag === "div") &&
      filteredClassNames.includes("blockquote")
    ) {
      nextTag = "blockquote";
      retagged = true;
    }

    if (
      nextTag === "p" &&
      (
        filteredClassNames.some((className) => TEXT_BLOCK_CLASS_PATTERN.test(className)) ||
        looksLikeStatText(node.textContent)
      )
    ) {
      nextTag = "div";
      retagged = true;
    }

    if (filteredClassNames.some((className) => ICON_IMAGE_CLASS_PATTERN.test(className))) {
      retagged = retagged || nextTag !== "img";
      nextTag = "img";
    }

    if (retagged) {
      warnings.push({
        code: "converted-unsupported-wrapper",
        message: `Converted <${normalizedTag}> to <${nextTag}> for safer Webflow insertion.`,
        level: "warning"
      });
    }

    if (!htmlMode && filteredClassNames.length !== node.classNames.length) {
      warnings.push({
        code: "removed-invalid-class-name",
        message: `Removed invalid class tokens from <${nextTag}> before Webflow insertion.`,
        level: "warning"
      });
    }

    if (
      nextTag === "div" &&
      typeof node.textContent === "string" &&
      node.textContent.trim().length > 0 &&
      filteredClassNames.some((className) => TEXT_WRAPPER_CLASS_PATTERN.test(className))
    ) {
      warnings.push({
        code: "split-text-wrapper",
        message: `Split <div> text content into an inner Text Block for Webflow-safe tag/badge structure.`,
        level: "warning"
      });
      return {
        node: {
          ...node,
          id: nextId,
          type: inferNodeType(nextTag),
          tag: nextTag,
          classNames: filteredClassNames,
          textContent: undefined,
          children: [
            {
              id: `${nextId}-text`,
              type: "text",
              tag: "div",
              classNames: [],
              textContent: node.textContent,
              children: []
            },
            ...normalizedChildren
          ]
        },
        hoistedChildren: []
      };
    }

    if (
      nextTag === "li" &&
      typeof node.textContent === "string" &&
      node.textContent.trim().length > 0 &&
      normalizedChildren.length === 0
    ) {
      warnings.push({
        code: "split-list-item-text",
        message: "Split list item text into an inner paragraph so Webflow preserves the content during insertion.",
        level: "warning"
      });
      return {
        node: {
          ...node,
          id: nextId,
          type: inferNodeType(nextTag),
          tag: nextTag,
          classNames: filteredClassNames,
          textContent: undefined,
          children: [
            {
              id: `${nextId}-text`,
              type: "text",
              tag: "p",
              classNames: [],
              textContent: node.textContent,
              children: []
            }
          ]
        },
        hoistedChildren: []
      };
    }

    if ((LEAF_TAGS.has(nextTag) || NON_CONTAINER_TAGS.has(nextTag)) && normalizedChildren.length > 0) {
      warnings.push({
        code: "invalid-noncontainer-children",
        message: `Moved children out of <${nextTag}> because it should not contain nested elements in the Webflow skeleton.`,
        level: "warning"
      });
      return {
        node: {
          ...node,
          id: nextId,
          type: inferNodeType(nextTag),
          tag: nextTag,
          classNames: filteredClassNames,
          children: []
        },
        hoistedChildren: normalizedChildren
      };
    }

    return {
      node: {
        ...node,
        id: nextId,
        type: inferNodeType(nextTag),
        tag: nextTag,
        classNames: filteredClassNames,
        children: normalizedChildren
      },
      hoistedChildren: []
    };
  }

  const sanitizedRoot = sanitizeNode(plan.elementTree);
  if (!sanitizedRoot.node) {
    throw new Error("Skeleton root cannot be removed.");
  }

  return {
    ...plan,
    elementTree: patchTopLevelSectionWrapper(sanitizedRoot.node, warnings),
    warnings
  };
}

export function normalizeSkeletonPlan(
  plan: SkeletonPlan,
  options: { siteStylePlan?: SiteStylePlan | null } = {}
): SkeletonPlan {
  const htmlMode = plan.sectionMetadata.repoType === "html";
  const sanitized = sanitizeSkeletonPlan(plan, {
    siteStylePlan: options.siteStylePlan,
    htmlMode
  });
  if (htmlMode) {
    return {
      ...sanitized,
      treeText: serializeSkeletonTree(sanitized.elementTree)
    };
  }
  const existingClassCount = new Set(collectClassNames(sanitized.elementTree)).size;
  const existingInvalidClassCount = countInvalidClassNames(sanitized.elementTree);

  try {
    const reparsed = sanitizeSkeletonPlan(parseSkeletonTreeText(sanitized, sanitized.treeText));
    const reparsedClassCount = new Set(collectClassNames(reparsed.elementTree)).size;
    const reparsedInvalidClassCount = countInvalidClassNames(reparsed.elementTree);
    if (existingClassCount === 0 && reparsedClassCount > 0) {
      return {
        ...reparsed,
        treeText: serializeSkeletonTree(reparsed.elementTree)
      };
    }
    if (existingInvalidClassCount > reparsedInvalidClassCount) {
      return {
        ...reparsed,
        treeText: serializeSkeletonTree(reparsed.elementTree)
      };
    }
    return {
      ...sanitized,
      treeText: serializeSkeletonTree(sanitized.elementTree)
    };
  } catch {
    return {
      ...sanitized,
      treeText: serializeSkeletonTree(sanitized.elementTree)
    };
  }
}
