import { SectionContext } from "../../shared/contracts.js";

export interface SerializedSectionContentItem {
  kind: string;
  label: string;
  value: string;
}

export interface SerializedSectionContext {
  summary: string;
  content: SerializedSectionContentItem[];
  assetReferences: string[];
  layoutHints: string[];
  sourceExcerpt: string;
}

interface SerializeSectionOptions {
  includeContent?: boolean;
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isHtmlLike(sourceCode: string): boolean {
  const trimmed = sourceCode.trim();
  return /^<([a-z][a-z0-9-]*)\b/i.test(trimmed);
}

interface HtmlOutlineNode {
  tag: string;
  id?: string;
  classNames: string[];
  textContent?: string;
  children: HtmlOutlineNode[];
}

function iconEmbedClassForSvg(tagSource: string): string {
  const width = Number.parseFloat(parseAttributeValue(tagSource, "width") ?? "");
  const height = Number.parseFloat(parseAttributeValue(tagSource, "height") ?? "");
  const maxDimension = Math.max(
    Number.isFinite(width) ? width : 0,
    Number.isFinite(height) ? height : 0
  );

  if (maxDimension > 0 && maxDimension <= 18) {
    return "icon-embed-xsmall";
  }
  if (maxDimension > 0 && maxDimension <= 24) {
    return "icon-embed-small";
  }
  return "icon-embed-small";
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function looksLikeUtilityClass(className: string): boolean {
  return (
    className.includes(":") ||
    className.includes("[") ||
    className.includes("]") ||
    /^(flex|grid|gap-|px-|py-|pt-|pb-|pl-|pr-|mx-|my-|mt-|mb-|ml-|mr-|w-|h-|max-w-|min-w-|min-h-|max-h-|text-|font-|leading-|tracking-|items-|justify-|content-|relative|absolute|inset-|overflow-|rounded-|bg-|object-|cursor-|transition-|duration-|group|shrink-|grow|basis-|col-|row-)/.test(
      className
    )
  );
}

function parseAttributeValue(tagSource: string, attributeName: string): string | undefined {
  const match = tagSource.match(
    new RegExp(`${attributeName}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i")
  );
  const raw = match?.[2] ?? match?.[3] ?? match?.[4];
  return raw ? decodeHtmlEntities(raw.trim()) : undefined;
}

function outlineNodeLabel(node: HtmlOutlineNode, includeContent: boolean): string {
  const tag = node.tag;
  const id = node.id?.trim();
  const classList = node.classNames.filter((name) => !looksLikeUtilityClass(name));
  const classSuffix = classList.slice(0, 3).map((name) => `.${name}`).join("");
  const idSuffix = id ? `#${id}` : "";
  const hasOnlyLineBreakChildren =
    node.children.length > 0 && node.children.every((child) => child.tag === "br");
  const textSource =
    includeContent && (node.children.length === 0 || hasOnlyLineBreakChildren)
      ? cleanText(node.textContent ?? "")
      : "";
  const textSuffix = textSource ? ` "${textSource.slice(0, 180)}"` : "";
  return `${tag}${idSuffix}${classSuffix}${textSuffix}`;
}

function signatureForElement(node: HtmlOutlineNode): string {
  const tag = node.tag;
  const classList = node.classNames
    .filter((name) => !looksLikeUtilityClass(name))
    .sort()
    .join(".");
  const childTags = node.children
    .slice(0, 4)
    .map((child) => child.tag)
    .join(",");
  return `${tag}|${classList}|${childTags}`;
}

function parseHtmlOutline(sourceCode: string): HtmlOutlineNode | null {
  const tagPattern = /<!--[\s\S]*?-->|<\/?([a-z][a-z0-9-]*)\b[^>]*>/gi;
  const banned = new Set([
    "script",
    "style",
    "path",
    "rect",
    "circle",
    "line",
    "polyline",
    "polygon",
    "ellipse",
    "g",
    "defs"
  ]);
  const selfClosing = new Set(["img", "source", "br", "hr", "input", "meta", "link"]);
  const roots: HtmlOutlineNode[] = [];
  const stack: HtmlOutlineNode[] = [];
  let skipDepth = 0;
  let cursor = 0;

  function attachText(nextIndex: number): void {
    if (skipDepth > 0 || stack.length === 0) {
      cursor = nextIndex;
      return;
    }
    const text = cleanText(decodeHtmlEntities(sourceCode.slice(cursor, nextIndex).replace(/<[^>]+>/g, " ")));
    if (text) {
      const current = stack[stack.length - 1];
      current.textContent = current.textContent ? `${current.textContent} ${text}` : text;
    }
    cursor = nextIndex;
  }

  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(sourceCode))) {
    const rawTag = match[0];
    const tag = (match[1] ?? "").toLowerCase();
    const tagIndex = match.index;
    attachText(tagIndex);

    if (!tag || rawTag.startsWith("<!--")) {
      cursor = tagPattern.lastIndex;
      continue;
    }

    const isClosing = rawTag.startsWith("</");
    const isSelfClosing = selfClosing.has(tag) || /\/>$/.test(rawTag);

    if (skipDepth > 0) {
      if (!isClosing && !isSelfClosing) {
        skipDepth += 1;
      } else if (isClosing) {
        skipDepth -= 1;
      }
      cursor = tagPattern.lastIndex;
      continue;
    }

    if (tag === "svg" && !isClosing) {
      const rawClassNames = (parseAttributeValue(rawTag, "class") ?? "")
        .split(/\s+/)
        .map((value) => value.trim())
        .filter(Boolean);
      const classNames = dedupe([
        iconEmbedClassForSvg(rawTag),
        ...rawClassNames.filter((name) => /icon|embed/i.test(name))
      ]);
      const node: HtmlOutlineNode = {
        tag: "img",
        id: undefined,
        classNames,
        children: []
      };

      if (stack.length > 0) {
        stack[stack.length - 1].children.push(node);
      } else {
        roots.push(node);
      }

      if (!isSelfClosing) {
        skipDepth = 1;
      }
      cursor = tagPattern.lastIndex;
      continue;
    }

    if (banned.has(tag)) {
      if (!isClosing && !isSelfClosing) {
        skipDepth = 1;
      }
      cursor = tagPattern.lastIndex;
      continue;
    }

    if (isClosing) {
      while (stack.length > 0) {
        const current = stack.pop()!;
        if (current.tag === tag) {
          break;
        }
      }
      cursor = tagPattern.lastIndex;
      continue;
    }

    const classNames = (parseAttributeValue(rawTag, "class") ?? "")
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean);
    const node: HtmlOutlineNode = {
      tag,
      id: parseAttributeValue(rawTag, "id"),
      classNames,
      textContent: tag === "img" ? parseAttributeValue(rawTag, "alt") : undefined,
      children: []
    };

    if (stack.length > 0) {
      stack[stack.length - 1].children.push(node);
    } else {
      roots.push(node);
    }

    if (!isSelfClosing) {
      stack.push(node);
    }
    cursor = tagPattern.lastIndex;
  }

  attachText(sourceCode.length);
  return roots[0] ?? null;
}

function walkHtmlNodes(node: HtmlOutlineNode, visitor: (node: HtmlOutlineNode) => void): void {
  visitor(node);
  for (const child of node.children) {
    walkHtmlNodes(child, visitor);
  }
}

function outlineHtmlSource(sourceCode: string, includeContent: boolean): string {
  const root = parseHtmlOutline(sourceCode);
  if (!root) {
    return sourceCode.slice(0, 12000);
  }

  const lines: string[] = [];

  function visit(node: HtmlOutlineNode, depth: number): void {
    lines.push(`${"  ".repeat(depth)}${outlineNodeLabel(node, includeContent)}`);

    if (node.children.length === 0) {
      return;
    }

    let index = 0;
    while (index < node.children.length) {
      const current = node.children[index];
      const signature = signatureForElement(current);
      let runLength = 1;
      while (
        index + runLength < node.children.length &&
        signatureForElement(node.children[index + runLength]) === signature
      ) {
        runLength += 1;
      }

      if (runLength >= 3) {
        lines.push(
          `${"  ".repeat(depth + 1)}${outlineNodeLabel(current, includeContent)} [repeats x${runLength}]`
        );
        visit(current, depth + 2);
      } else {
        for (let offset = 0; offset < runLength; offset += 1) {
          visit(node.children[index + offset], depth + 1);
        }
      }
      index += runLength;
    }
  }

  visit(root, 0);
  return lines.join("\n").slice(0, 12000);
}

function collectHtmlContent(
  sourceCode: string,
  includeContent: boolean
): SerializedSectionContentItem[] {
  if (!includeContent) {
    return [];
  }
  const root = parseHtmlOutline(sourceCode);
  if (root) {
    const items: SerializedSectionContentItem[] = [];
    walkHtmlNodes(root, (node) => {
      const value = cleanText(decodeHtmlEntities(node.textContent ?? ""));
      if (node.tag === "img") {
        if (looksLikeContent(value) || looksLikeStatValue(value)) {
          items.push({
            kind: "img",
            label: "img",
            value
          });
        }
        return;
      }

      if (!["h1", "h2", "h3", "h4", "h5", "h6", "p", "button", "a", "li", "span", "div"].includes(node.tag)) {
        return;
      }

      if (!looksLikeContent(value) && !looksLikeStatValue(value)) {
        return;
      }

      if (node.tag === "div" && !looksLikeStatValue(value)) {
        return;
      }

      items.push({
        kind: node.tag,
        label: node.tag,
        value
      });
    });

    const dedupedItems = items
      .filter(
        (item, index, array) =>
          array.findIndex(
            (candidate) => candidate.kind === item.kind && candidate.value === item.value
          ) === index
      )
      .slice(0, 24);

    if (dedupedItems.length > 0) {
      return dedupedItems;
    }
  }

  const items: SerializedSectionContentItem[] = [];

  for (const match of sourceCode.matchAll(/<(h[1-6]|p|button|a|li)[^>]*>\s*([^<]{3,180})\s*<\/\1>/gi)) {
    const value = cleanText(decodeHtmlEntities(match[2]));
    if (!looksLikeContent(value) && !looksLikeStatValue(value)) {
      continue;
    }
    items.push({
      kind: match[1].toLowerCase(),
      label: match[1].toLowerCase(),
      value
    });
  }

  for (const match of sourceCode.matchAll(/<img[^>]*alt\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/gi)) {
    const value = cleanText(decodeHtmlEntities(match[2] ?? match[3] ?? ""));
    if (!looksLikeContent(value) && !looksLikeStatValue(value)) {
      continue;
    }
    items.push({
      kind: "img",
      label: "img",
      value
    });
  }

  return items
    .filter(
      (item, index, array) =>
        array.findIndex(
          (candidate) => candidate.kind === item.kind && candidate.value === item.value
        ) === index
    )
    .slice(0, 24);
}

function looksLikeContent(value: string): boolean {
  const trimmed = cleanText(value);
  if (trimmed.length < 2 || trimmed.length > 400) {
    return false;
  }
  if (
    trimmed.startsWith("@/") ||
    trimmed.includes("/") ||
    trimmed.includes("className") ||
    trimmed.includes("function ") ||
    trimmed.includes("return ") ||
    trimmed.includes("=>") ||
    trimmed.includes("import ")
  ) {
    return false;
  }
  return /[a-z]/i.test(trimmed);
}

function looksLikeStatValue(value: string): boolean {
  const trimmed = cleanText(value);
  if (trimmed.length < 1 || trimmed.length > 40) {
    return false;
  }
  return /^\d[\d+.,:%xX°/-]*$/.test(trimmed);
}

function placeholderForContentKind(kind: string): SerializedSectionContentItem {
  const normalized = kind.toLowerCase();
  if (/^h[1-6]$/.test(normalized) || ["title", "heading", "subtitle"].includes(normalized)) {
    return { kind, label: kind, value: "Heading" };
  }
  if (["button", "a", "ctatext", "buttontext"].includes(normalized)) {
    return { kind, label: kind, value: "Button text" };
  }
  if (normalized === "img") {
    return { kind, label: kind, value: "Image" };
  }
  if (normalized === "li") {
    return { kind, label: kind, value: "List item" };
  }
  if (["label", "span", "eyebrow"].includes(normalized)) {
    return { kind, label: kind, value: "Label" };
  }
  return { kind, label: kind, value: "Body copy" };
}

function collectLabeledContent(
  sourceCode: string,
  includeContent: boolean
): SerializedSectionContentItem[] {
  if (isHtmlLike(sourceCode)) {
    const htmlItems = collectHtmlContent(sourceCode, includeContent);
    if (htmlItems.length > 0) {
      return htmlItems;
    }
  }

  if (!includeContent) {
    const kinds: string[] = [];

    for (const match of sourceCode.matchAll(/<(h[1-6]|p|span|li|button|a|img)\b/gi)) {
      kinds.push(match[1].toLowerCase());
    }

    for (const match of sourceCode.matchAll(
      /(eyebrow|title|heading|subtitle|description|body|copy|label|buttonText|ctaText)\s*[:=]/g
    )) {
      kinds.push(match[1].toLowerCase());
    }

    return dedupe(kinds)
      .slice(0, 24)
      .map((kind) => placeholderForContentKind(kind));
  }

  const items: SerializedSectionContentItem[] = [];

  for (const match of sourceCode.matchAll(
    /(eyebrow|title|heading|subtitle|description|body|copy|label|buttonText|ctaText)\s*[:=]\s*["'`]([^"'`]{3,180})["'`]/g
  )) {
    items.push({
      kind: match[1].toLowerCase(),
      label: match[1],
      value: cleanText(match[2])
    });
  }

  for (const match of sourceCode.matchAll(
    /<(h[1-6]|p|span|li|button)[^>]*>\s*([^<>{]{3,180})\s*<\/\1>/g
  )) {
    const value = cleanText(match[2]);
    if (!looksLikeContent(value)) {
      continue;
    }
    items.push({
      kind: match[1].toLowerCase(),
      label: match[1].toLowerCase(),
      value
    });
  }

  for (const match of sourceCode.matchAll(/["'`]([^"'`\n]{3,180})["'`]/g)) {
    const value = cleanText(match[1]);
    if (!looksLikeContent(value)) {
      continue;
    }
    items.push({
      kind: "string",
      label: "string",
      value
    });
  }

  return items
    .filter(
      (item, index, array) =>
        array.findIndex(
          (candidate) => candidate.kind === item.kind && candidate.value === item.value
        ) === index
    )
    .slice(0, 24);
}

function collectLayoutHints(sourceCode: string, sectionName: string): string[] {
  const hints: string[] = [];
  if (/grid/i.test(sourceCode)) {
    hints.push("grid layout appears in the source");
  }
  if (/flex/i.test(sourceCode)) {
    hints.push("flex layout appears in the source");
  }
  if (/card/i.test(sourceCode)) {
    hints.push("card-based grouping appears in the source");
  }
  if (/button|cta/i.test(sourceCode)) {
    hints.push("section includes CTA or button affordances");
  }
  if (/icon/i.test(sourceCode)) {
    hints.push("section references iconography");
  }
  hints.push(`section family: ${sectionName.toLowerCase()}`);
  return dedupe(hints);
}

function summarizeContent(
  sectionContext: SectionContext,
  content: SerializedSectionContentItem[],
  includeContent: boolean
): string {
  if (!includeContent) {
    return cleanText(
      `${sectionContext.sectionName} on ${sectionContext.pageName}. Preserve the source structure, but use placeholder copy for text-bearing elements.`
    );
  }
  const lead = content
    .slice(0, 4)
    .map((item) => item.value)
    .join(" | ");
  return cleanText(
    `${sectionContext.sectionName} on ${sectionContext.pageName}. ${
      lead || "Use the source code and stylesheet context to infer structure and styling intent."
    }`
  );
}

export function serializeSectionContext(
  sectionContext: SectionContext,
  options: SerializeSectionOptions = {}
): SerializedSectionContext {
  const includeContent = options.includeContent ?? true;
  const content = collectLabeledContent(sectionContext.sourceCode, includeContent);
  const sourceExcerpt = isHtmlLike(sectionContext.sourceCode)
    ? outlineHtmlSource(sectionContext.sourceCode, includeContent)
    : sectionContext.sourceCode.slice(0, 6000);
  return {
    summary: summarizeContent(sectionContext, content, includeContent),
    content,
    assetReferences: sectionContext.assetReferences,
    layoutHints: collectLayoutHints(
      sectionContext.sourceCode,
      sectionContext.sectionName
    ),
    sourceExcerpt
  };
}
