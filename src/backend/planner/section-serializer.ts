import { SectionContext } from "../../shared/contracts.js";
import { JSDOM } from "jsdom";

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

function outlineNodeLabel(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.getAttribute("id")?.trim();
  const classList = Array.from(element.classList).filter((name) => !looksLikeUtilityClass(name));
  const classSuffix = classList.slice(0, 3).map((name) => `.${name}`).join("");
  const idSuffix = id ? `#${id}` : "";
  const textSource =
    tag === "img"
      ? element.getAttribute("alt")?.trim()
      : element.children.length === 0
        ? cleanText(element.textContent ?? "")
        : "";
  const textSuffix = textSource ? ` "${textSource.slice(0, 80)}"` : "";
  return `${tag}${idSuffix}${classSuffix}${textSuffix}`;
}

function signatureForElement(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const classList = Array.from(element.classList)
    .filter((name) => !looksLikeUtilityClass(name))
    .sort()
    .join(".");
  const childTags = Array.from(element.children)
    .slice(0, 4)
    .map((child) => child.tagName.toLowerCase())
    .join(",");
  return `${tag}|${classList}|${childTags}`;
}

function outlineHtmlSource(sourceCode: string): string {
  try {
    const dom = new JSDOM(`<body>${sourceCode}</body>`);
    const root = dom.window.document.body.firstElementChild;
    if (!root) {
      return sourceCode.slice(0, 12000);
    }

    const lines: string[] = [];
    const banned = new Set([
      "script",
      "style",
      "svg",
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

    function visit(element: Element, depth: number): void {
      const tag = element.tagName.toLowerCase();
      if (banned.has(tag)) {
        return;
      }

      lines.push(`${"  ".repeat(depth)}${outlineNodeLabel(element)}`);

      const children = Array.from(element.children).filter(
        (child) => !banned.has(child.tagName.toLowerCase())
      );
      if (children.length === 0) {
        return;
      }

      let index = 0;
      while (index < children.length) {
        const current = children[index];
        const signature = signatureForElement(current);
        let runLength = 1;
        while (
          index + runLength < children.length &&
          signatureForElement(children[index + runLength]) === signature
        ) {
          runLength += 1;
        }

        if (runLength >= 3) {
          lines.push(
            `${"  ".repeat(depth + 1)}${outlineNodeLabel(current)} [repeats x${runLength}]`
          );
          visit(current, depth + 2);
        } else {
          for (let offset = 0; offset < runLength; offset += 1) {
            visit(children[index + offset], depth + 1);
          }
        }
        index += runLength;
      }
    }

    visit(root, 0);
    return lines.join("\n").slice(0, 12000);
  } catch {
    return sourceCode.slice(0, 12000);
  }
}

function collectHtmlContent(sourceCode: string): SerializedSectionContentItem[] {
  try {
    const dom = new JSDOM(`<body>${sourceCode}</body>`);
    const document = dom.window.document;
    const selectors = ["h1", "h2", "h3", "h4", "p", "button", "a", "li", "img"];
    const items: SerializedSectionContentItem[] = [];

    for (const selector of selectors) {
      const elements = Array.from(document.querySelectorAll(selector)).slice(0, 12);
      for (const element of elements) {
        const rawValue =
          selector === "img"
            ? element.getAttribute("alt") ?? ""
            : element.textContent ?? "";
        const value = cleanText(rawValue);
        if (!looksLikeContent(value)) {
          continue;
        }
        items.push({
          kind: selector,
          label: selector,
          value
        });
      }
    }

    return items
      .filter(
        (item, index, array) =>
          array.findIndex(
            (candidate) => candidate.kind === item.kind && candidate.value === item.value
          ) === index
      )
      .slice(0, 24);
  } catch {
    return [];
  }
}

function looksLikeContent(value: string): boolean {
  const trimmed = cleanText(value);
  if (trimmed.length < 3 || trimmed.length > 180) {
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

function collectLabeledContent(sourceCode: string): SerializedSectionContentItem[] {
  if (isHtmlLike(sourceCode)) {
    const htmlItems = collectHtmlContent(sourceCode);
    if (htmlItems.length > 0) {
      return htmlItems;
    }
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
  content: SerializedSectionContentItem[]
): string {
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
  sectionContext: SectionContext
): SerializedSectionContext {
  const content = collectLabeledContent(sectionContext.sourceCode);
  const sourceExcerpt = isHtmlLike(sectionContext.sourceCode)
    ? outlineHtmlSource(sectionContext.sourceCode)
    : sectionContext.sourceCode.slice(0, 6000);
  return {
    summary: summarizeContent(sectionContext, content),
    content,
    assetReferences: sectionContext.assetReferences,
    layoutHints: collectLayoutHints(
      sectionContext.sourceCode,
      sectionContext.sectionName
    ),
    sourceExcerpt
  };
}
