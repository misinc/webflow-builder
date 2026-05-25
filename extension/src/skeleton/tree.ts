import { isClientFirstName } from "../../../src/shared/client-first.js";
import { BuildNode, SkeletonPlan } from "../../../src/shared/contracts.js";

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
const WRAPPER_TO_DIV_TAGS = new Set(["article", "aside", "figure", "header", "footer", "nav", "main"]);
const NON_CONTAINER_TAGS = new Set([
  "p",
  "span",
  "label",
  "button",
  "a",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6"
]);

function normalizeTagToken(token: string): string {
  return token.replace(/^<\/?/, "").replace(/\/?>$/, "").trim().toLowerCase();
}

function inferNodeType(tag: string): BuildNode["type"] {
  if (tag === "img") return "image";
  if (tag === "button" || tag === "a") return "button";
  if (tag === "ul" || tag === "ol") return "list";
  if (tag === "li") return "listItem";
  if (/^h[1-6]$/i.test(tag)) return "heading";
  if (tag === "p" || tag === "span" || tag === "label") return "text";
  return "box";
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

function countInvalidClassNames(node: BuildNode): number {
  return (
    node.classNames.filter((className) => !isClientFirstName(className)).length +
    node.children.reduce((total, child) => total + countInvalidClassNames(child), 0)
  );
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

    const textMatch = content.match(/\s+"([^"]*)"$/);
    const textContent = textMatch?.[1];
    if (textMatch?.index !== undefined) {
      content = content.slice(0, textMatch.index).trim();
    }

    const tokens = content.split(/\s+/).filter(Boolean);
    const structureToken = tokens[0];
    if (!structureToken) {
      throw new Error(`Invalid skeleton line ${index + 1}.`);
    }

    const parts = structureToken.split(".").filter(Boolean);
    const tag = normalizeTagToken(parts[0] ?? "");
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
    ].filter((className) => isClientFirstName(className));
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
    elementTree: root
  };
}

export function sanitizeSkeletonPlan(plan: SkeletonPlan): SkeletonPlan {
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

    const safeTag = WRAPPER_TO_DIV_TAGS.has(normalizedTag) ? "div" : normalizedTag;
    if (safeTag !== normalizedTag) {
      warnings.push({
        code: "converted-semantic-wrapper",
        message: `Converted <${normalizedTag}> to <div> for safer Webflow insertion.`,
        level: "warning"
      });
    }

    const filteredClassNames = node.classNames.filter((className) => isClientFirstName(className));
    if (filteredClassNames.length !== node.classNames.length) {
      warnings.push({
        code: "removed-invalid-class-name",
        message: `Removed invalid class tokens from <${safeTag}> before Webflow insertion.`,
        level: "warning"
      });
    }

    if ((LEAF_TAGS.has(safeTag) || NON_CONTAINER_TAGS.has(safeTag)) && normalizedChildren.length > 0) {
      warnings.push({
        code: "invalid-noncontainer-children",
        message: `Moved children out of <${safeTag}> because it should not contain nested elements in the Webflow skeleton.`,
        level: "warning"
      });
      return {
        node: {
          ...node,
          id: nextId,
          tag: safeTag,
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
        tag: safeTag,
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
    elementTree: sanitizedRoot.node,
    warnings
  };
}

export function normalizeSkeletonPlan(plan: SkeletonPlan): SkeletonPlan {
  const sanitized = sanitizeSkeletonPlan(plan);
  const existingClassCount = new Set(collectClassNames(sanitized.elementTree)).size;
  const existingInvalidClassCount = countInvalidClassNames(sanitized.elementTree);

  try {
    const reparsed = sanitizeSkeletonPlan(parseSkeletonTreeText(sanitized, sanitized.treeText));
    const reparsedClassCount = new Set(collectClassNames(reparsed.elementTree)).size;
    const reparsedInvalidClassCount = countInvalidClassNames(reparsed.elementTree);
    if (existingClassCount === 0 && reparsedClassCount > 0) {
      return reparsed;
    }
    if (existingInvalidClassCount > reparsedInvalidClassCount) {
      return reparsed;
    }
    return sanitized;
  } catch {
    return sanitized;
  }
}
