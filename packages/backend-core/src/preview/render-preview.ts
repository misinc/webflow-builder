import type { BuildNode, SkeletonPlan, StylingPlan } from "@wfb/shared/contracts.js";

type StyleDefinition = StylingPlan["styleDefinitions"][number];

const VOID_TAGS = new Set([
  "img",
  "br",
  "hr",
  "input",
  "source",
  "track",
  "wbr",
  "col",
  "area",
  "base",
  "embed",
  "link",
  "meta",
  "param"
]);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function classAttr(node: BuildNode): string {
  return node.classNames.length ? ` class="${node.classNames.join(" ")}"` : "";
}

/**
 * Render a plan's BuildNode tree as readable, client-first HTML. This is the
 * same structure + class names the Designer executor would build in Webflow,
 * so rendering it in a browser previews the section without Webflow.
 */
export function renderBuildNodeToHtml(node: BuildNode, depth = 0): string {
  const pad = "  ".repeat(depth);
  const tag = node.tag || "div";
  if (node.embedHtml) {
    // Embed nodes (e.g. inline SVG icons) carry raw HTML — render it verbatim.
    return `${pad}<${tag}${classAttr(node)}>${node.embedHtml}</${tag}>`;
  }
  if (VOID_TAGS.has(tag)) {
    return `${pad}<${tag}${classAttr(node)}>`;
  }
  const open = `${pad}<${tag}${classAttr(node)}>`;
  const text = node.textContent ? escapeHtml(node.textContent.trim()) : "";
  const children = node.children ?? [];
  if (children.length === 0) {
    return `${open}${text}</${tag}>`;
  }
  const textLine = text ? `${"  ".repeat(depth + 1)}${text}\n` : "";
  const inner = children.map((child) => renderBuildNodeToHtml(child, depth + 1)).join("\n");
  return `${open}\n${textLine}${inner}\n${pad}</${tag}>`;
}

/** Emit the plan's generated classes as a CSS stylesheet. */
export function renderStyleDefinitionsToCss(definitions: StyleDefinition[]): string {
  return definitions
    .map((definition) => {
      const body = Object.entries(definition.properties)
        .map(([prop, value]) => `  ${prop}: ${value};`)
        .join("\n");
      return `.${definition.className} {\n${body}\n}`;
    })
    .join("\n\n");
}

const BASE_RESET_CSS = `*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: Manrope, system-ui, -apple-system, sans-serif; color: #222; line-height: 1.5; }
img, video { max-width: 100%; display: block; }
a { color: inherit; text-decoration: none; }
p { margin: 0; }`;

/**
 * Minimal client-first style-guide defaults so reused wrappers (which the app
 * does NOT redefine, because they live in the Webflow site) still render with
 * the right container/spacing/typography. Approximations of the Finsweet
 * starter — swap in the bound site's real values for exact fidelity.
 */
const CLIENT_FIRST_BASE_CSS = `.page-wrapper { overflow: hidden; }
.container-large { width: 100%; max-width: 80rem; margin-left: auto; margin-right: auto; }
.container-medium { width: 100%; max-width: 64rem; margin-left: auto; margin-right: auto; }
.padding-global { padding-left: 2.5rem; padding-right: 2.5rem; }
.padding-section-small { padding-top: 3rem; padding-bottom: 3rem; }
.padding-section-medium { padding-top: 5rem; padding-bottom: 5rem; }
.padding-section-large { padding-top: 7rem; padding-bottom: 7rem; }
.heading-style-h1 { font-size: 2.5rem; font-weight: 400; line-height: 1.1; margin: 0; }
.heading-style-h2 { font-size: 2rem; font-weight: 400; line-height: 1.15; margin: 0; }
.heading-style-h3 { font-size: 1.375rem; font-weight: 400; line-height: 1.25; margin: 0; }
.heading-style-h4 { font-size: 1.125rem; font-weight: 400; line-height: 1.3; margin: 0; }
.text-size-large { font-size: 1.25rem; }
.text-size-medium { font-size: 1.125rem; }
.text-size-small { font-size: 0.875rem; }`;

export interface SectionPreviewInput {
  title: string;
  skeleton: SkeletonPlan;
  styling: StylingPlan;
  /** Override the client-first base CSS (e.g. the bound site's real style guide). */
  clientFirstBaseCss?: string;
}

/** Build a single self-contained HTML document that previews the section. */
export function renderSectionPreviewDocument(input: SectionPreviewInput): string {
  const markup = renderBuildNodeToHtml(input.skeleton.elementTree);
  const generatedCss = renderStyleDefinitionsToCss(input.styling.styleDefinitions);
  const baseCss = input.clientFirstBaseCss ?? CLIENT_FIRST_BASE_CSS;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.title)}</title>
<style>
/* --- base reset --- */
${BASE_RESET_CSS}

/* --- client-first style-guide defaults (reused wrappers) --- */
${baseCss}

/* --- generated section classes --- */
${generatedCss}
</style>
</head>
<body>
${markup}
</body>
</html>
`;
}
