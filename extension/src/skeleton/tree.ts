import { BuildNode, SkeletonPlan } from "../../../src/shared/contracts.js";

const LEAF_TAGS = new Set(["img", "source", "br", "hr", "input", "meta", "link"]);
const REMOVED_TAGS = new Set(["source"]);
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
  return token.replace(/^<\/?/, "").replace(/\/?>$/, "").trim();
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

function normalizeLines(treeText: string): string[] {
  return expandInlineChain(treeText)
    .split("\n")
    .map((line) => line.replace(/\t/g, "  "))
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
        .filter((token) => Boolean(token) && token !== "/" && token !== "->")
    ];
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

    if (REMOVED_TAGS.has(node.tag)) {
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
        message: `Removed <${node.tag}> from the Webflow skeleton because it should not be inserted as a standalone element.`,
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

    if ((LEAF_TAGS.has(node.tag) || NON_CONTAINER_TAGS.has(node.tag)) && normalizedChildren.length > 0) {
      warnings.push({
        code: "invalid-noncontainer-children",
        message: `Moved children out of <${node.tag}> because it should not contain nested elements in the Webflow skeleton.`,
        level: "warning"
      });
      return {
        node: {
          ...node,
          id: nextId,
          children: []
        },
        hoistedChildren: normalizedChildren
      };
    }

    return {
      node: {
        ...node,
        id: nextId,
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
  if (existingClassCount > 0) {
    return sanitized;
  }

  try {
    const reparsed = sanitizeSkeletonPlan(parseSkeletonTreeText(sanitized, sanitized.treeText));
    const reparsedClassCount = new Set(collectClassNames(reparsed.elementTree)).size;
    return reparsedClassCount > 0 ? reparsed : sanitized;
  } catch {
    return sanitized;
  }
}
