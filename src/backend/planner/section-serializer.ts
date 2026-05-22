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

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
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
  return {
    summary: summarizeContent(sectionContext, content),
    content,
    assetReferences: sectionContext.assetReferences,
    layoutHints: collectLayoutHints(
      sectionContext.sourceCode,
      sectionContext.sectionName
    ),
    sourceExcerpt: sectionContext.sourceCode.slice(0, 6000)
  };
}
