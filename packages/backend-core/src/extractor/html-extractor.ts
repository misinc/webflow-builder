import { HTMLElement, NodeType, parse } from "node-html-parser";
import { RepoPageRecord, RepoSectionRecord, SectionContext, SharedStyleContext } from "@wfb/shared/contracts.js";
import { slugify } from "@wfb/shared/text.js";
import { RepositorySnapshot } from "../github/client.js";
import { stableId } from "../utils.js";
import { ExtractedRepoIndex } from "./mis-extractor.js";
import { isHtmlRepoPageFile } from "./repo-type.js";

const SECTION_TAGS = new Set(["section", "header", "footer", "article"]);
const LANDMARK_TAGS = new Set(["main", "aside", "nav"]);
const WRAPPER_TAGS = new Set(["div", "main", "body"]);
const SKIPPED_TAGS = new Set(["script", "style", "noscript", "template", "link", "meta"]);
const HEADING_TAG_PATTERN = /^h[1-6]$/;
export const HTML_REPO_INDEX_VERSION = 3;

function elementChildren(element: HTMLElement): HTMLElement[] {
  return element.childNodes.filter(
    (node): node is HTMLElement => node.nodeType === NodeType.ELEMENT_NODE
  );
}

function tagName(element: HTMLElement): string {
  return element.rawTagName.toLowerCase();
}

function textContent(element: HTMLElement): string {
  return element.text.replace(/\s+/g, " ").trim();
}

function htmlPageName(filePath: string, siteRoot = ""): string {
  const normalizedPath = stripSiteRoot(filePath, siteRoot);
  const withoutExtension = normalizedPath.replace(/\.html?$/i, "");
  const parts = withoutExtension.split("/").filter(Boolean);
  const last = parts.at(-1) ?? "index";
  if (last === "index") {
    const parent = parts.at(-2);
    return parent ? titleCase(parent) : "Home";
  }
  return titleCase(last);
}

function titleCase(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Page";
}

function stripSiteRoot(filePath: string, siteRoot: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  return siteRoot && normalized.startsWith(`${siteRoot}/`)
    ? normalized.slice(siteRoot.length + 1)
    : normalized;
}

function routeFromHtmlPath(filePath: string, siteRoot = ""): string {
  const normalized = stripSiteRoot(filePath, siteRoot).replace(/\.html?$/i, "");
  const stripped = normalized.replace(/^(public|dist|build|out|site|pages)\//, "");
  if (stripped === "index" || stripped.endsWith("/index")) {
    const route = stripped.replace(/\/?index$/, "");
    return route ? `/${route}` : "/";
  }
  return `/${stripped}`;
}

function commonExportRoot(filePaths: string[]): string {
  if (filePaths.some((filePath) => !filePath.includes("/"))) {
    return "";
  }
  const firstSegments = new Set(
    filePaths
      .map((filePath) => filePath.split("/").filter(Boolean))
      .filter((parts) => parts.length > 1)
      .map((parts) => parts[0]!)
  );
  if (firstSegments.size !== 1) {
    return "";
  }
  const root = [...firstSegments][0]!;
  const hasRootIndex = filePaths.some((filePath) => filePath === `${root}/index.html`);
  return hasRootIndex ? root : "";
}

function componentNameFromSection(name: string, index: number): string {
  const base = name
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("") || "HtmlSection";
  return `${base}${index + 1}`;
}

function sectionNameFor(element: HTMLElement, index: number): string {
  const explicit =
    element.getAttribute("data-section") ??
    element.getAttribute("aria-label") ??
    element.getAttribute("id");
  if (explicit) {
    return titleCase(explicit);
  }
  const heading = element.querySelector("h1, h2, h3, h4, h5, h6");
  if (heading) {
    const text = textContent(heading);
    if (text) {
      return titleCase(text.slice(0, 60));
    }
  }
  const tag = tagName(element);
  if (tag === "header") return "Header";
  if (tag === "footer") return "Footer";
  return `Section ${index + 1}`;
}

function unwrapStructuralSingleChild(element: HTMLElement, stopAtSections = false): HTMLElement {
  let current = element;
  while (WRAPPER_TAGS.has(tagName(current))) {
    const children = elementChildren(current);
    if (children.length !== 1) {
      break;
    }
    const child = children[0];
    if (SECTION_TAGS.has(tagName(child))) {
      // When unwrapping the page SCOPE, a lone <section> child is the section
      // we're looking for — descending into it would discard the section root
      // (its padding classes) and slice at its inner content instead.
      if (stopAtSections) {
        break;
      }
      current = child;
      continue;
    }
    if (LANDMARK_TAGS.has(tagName(child)) || WRAPPER_TAGS.has(tagName(child))) {
      current = child;
      continue;
    }
    break;
  }
  return current;
}

function groupByHeadings(scope: HTMLElement): HTMLElement[] {
  const children = elementChildren(scope);
  const groups: HTMLElement[] = [];
  let current: HTMLElement[] = [];
  for (const child of children) {
    if (HEADING_TAG_PATTERN.test(tagName(child)) && current.length > 0) {
      groups.push(wrapGroup(current));
      current = [];
    }
    current.push(child);
  }
  if (current.length > 0) {
    groups.push(wrapGroup(current));
  }
  return groups.length > 1 ? groups : [];
}

function wrapGroup(children: HTMLElement[]): HTMLElement {
  const wrapper = parse("<section></section>").querySelector("section");
  if (!wrapper) {
    return children[0];
  }
  wrapper.set_content(children.map((child) => child.toString()).join(""));
  return wrapper;
}

/**
 * Extract the site chrome around <main>: everything before it (announcement
 * bar + navbar) or after it (footer). Sitewide elements are excluded from
 * section slicing — they are built ONCE via this and then componentized.
 */
export function extractChromeHtml(sourceCode: string, kind: "header" | "footer"): string | null {
  const document = parse(sourceCode, {
    comment: false,
    lowerCaseTagName: true,
    blockTextElements: { script: true, style: true, pre: false }
  });
  const body = document.querySelector("body") ?? document;
  // Descend through single-child wrappers until we reach the container that
  // actually holds <main> among its children.
  let container: HTMLElement = body as HTMLElement;
  for (let depth = 0; depth < 8; depth += 1) {
    const children = elementChildren(container);
    if (children.some((child) => tagName(child) === "main")) {
      break;
    }
    if (children.length === 1 && WRAPPER_TAGS.has(tagName(children[0]))) {
      container = children[0];
      continue;
    }
    return null;
  }
  const children = elementChildren(container);
  const mainIndex = children.findIndex((child) => tagName(child) === "main");
  if (mainIndex < 0) {
    return null;
  }
  const picked = kind === "header" ? children.slice(0, mainIndex) : children.slice(mainIndex + 1);
  const meaningful = picked.filter((child) => !SKIPPED_TAGS.has(tagName(child)));
  if (meaningful.length === 0) {
    return null;
  }
  // A single chrome element (one navbar div, one <footer>) is returned as-is —
  // a synthetic wrapper would double up with the `_component` class the planner
  // gives the inner element, leaving a classless wrapper in the paste.
  if (meaningful.length === 1) {
    return meaningful[0].toString();
  }
  const wrapperTag = kind === "header" ? "header" : "footer";
  return `<${wrapperTag}>${meaningful.map((child) => child.toString()).join("")}</${wrapperTag}>`;
}


function findSectionElements(sourceCode: string): HTMLElement[] {
  const document = parse(sourceCode, {
    comment: false,
    lowerCaseTagName: true,
    blockTextElements: {
      script: true,
      style: true,
      pre: false
    }
  });
  const body = document.querySelector("body");
  const main = body?.querySelector("main") ?? document.querySelector("main");
  const scope = unwrapStructuralSingleChild((main ?? body ?? document) as HTMLElement, true);
  // Explicit lambda: .map(fn) would pass the array index as stopAtSections.
  const children = elementChildren(scope).map((child) => unwrapStructuralSingleChild(child));
  const semantic = children.filter((child) => SECTION_TAGS.has(tagName(child)));
  if (semantic.length > 0) {
    return semantic;
  }
  const landmarks = children.filter((child) => SECTION_TAGS.has(tagName(child)) || LANDMARK_TAGS.has(tagName(child)));
  if (landmarks.length > 0) {
    return landmarks;
  }
  const headingGroups = groupByHeadings(scope);
  if (headingGroups.length > 0) {
    return headingGroups;
  }
  return children.length > 0 ? children : [scope];
}

/** The raw content of a repo file in the snapshot ("" when absent). */
export function fileByPath(snapshot: RepositorySnapshot, filePath: string): string {
  return snapshot.files.find((file) => file.path === filePath)?.content ?? "";
}

export class HtmlRepoExtractor {
  extractRepoIndex(repoId: string, snapshot: RepositorySnapshot): ExtractedRepoIndex {
    const pageFiles = snapshot.files
      .filter((file) => isHtmlRepoPageFile(file.path))
      .sort((left, right) => left.path.localeCompare(right.path));
    const siteRoot = commonExportRoot(pageFiles.map((file) => file.path));
    const pages: RepoPageRecord[] = [];
    const sections: RepoSectionRecord[] = [];

    pageFiles.forEach((pageFile, pageIndex) => {
      const pageId = stableId(repoId, pageFile.path);
      const page: RepoPageRecord = {
        id: pageId,
        repoId,
        name: htmlPageName(pageFile.path, siteRoot),
        route: routeFromHtmlPath(pageFile.path, siteRoot),
        sourceFile: pageFile.path,
        sourceCode: pageFile.content,
        sortOrder: pageIndex,
        metadata: {
          repoType: "html",
          htmlIndexerVersion: HTML_REPO_INDEX_VERSION,
          parseStatus: "parsed",
          confidence: 0.95,
          siteRoot: siteRoot || undefined
        }
      };
      pages.push(page);

      const sectionElements = findSectionElements(pageFile.content);
      sectionElements.forEach((sectionElement, sectionIndex) => {
        const name = sectionNameFor(sectionElement, sectionIndex);
        const sectionKey = slugify(name) || `section-${sectionIndex + 1}`;
        sections.push({
          id: stableId(pageId, "html-section", String(sectionIndex)),
          repoId,
          pageId,
          name,
          sectionKey,
          sourceFile: pageFile.path,
          sourceCode: sectionElement.toString(),
          importPath: pageFile.path,
          sortOrder: sectionIndex,
          componentName: componentNameFromSection(name, sectionIndex),
          metadata: {
            repoType: "html",
            htmlIndexerVersion: HTML_REPO_INDEX_VERSION,
            parseStatus: "parsed",
            confidence: 0.9,
            displayOrder: sectionIndex,
            inlineSourceCode: sectionElement.toString()
          }
        });
      });
    });

    return { pages, sections };
  }

  buildSectionContext(params: {
    repoId: string;
    page: RepoPageRecord;
    section: RepoSectionRecord;
    snapshot: RepositorySnapshot;
    sharedStyleContext: SharedStyleContext;
  }): SectionContext {
    const inlineSourceCode =
      typeof params.section.metadata.inlineSourceCode === "string"
        ? params.section.metadata.inlineSourceCode
        : null;
    const sourceCode = inlineSourceCode ?? fileByPath(params.snapshot, params.section.sourceFile);
    return {
      repoId: params.repoId,
      pageName: params.page.name,
      pageSourceFile: params.page.sourceFile,
      sectionName: params.section.name,
      sectionSourceFile: params.section.sourceFile,
      componentName: params.section.componentName,
      sectionOrder: params.section.sortOrder,
      sourceCode,
      relevantStylesheets: params.snapshot.files
        .filter((file) => /\.(css|scss)$/i.test(file.path))
        .map((file) => ({ path: file.path, content: file.content })),
      assetReferences: [],
      contentHints: [],
      relatedSharedClasses: params.sharedStyleContext.classes.map((item) => item.name).slice(0, 60)
    };
  }
}
