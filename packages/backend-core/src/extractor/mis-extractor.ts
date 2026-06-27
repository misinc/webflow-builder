import path from "node:path";
import {
  RepoPageRecord,
  RepoSectionRecord,
  SectionContext,
  SharedStyleContext
} from "@wfb/shared/contracts.js";
import { dedupe, inferSharedCategory } from "@wfb/shared/client-first.js";
import { RepositorySnapshot } from "../github/client.js";
import { slugify, stableId } from "../utils.js";
import { extractAssetReferencesFromSource } from "./asset-references.js";
import { looksLikeContent } from "../planner/section-serializer.js";

const SUPPORTED_SECTION_KEYS = new Set(["hero", "services", "solutions"]);

function isLegacyPagesFile(filePath: string): boolean {
  return /^src\/app\/pages\/.+\.(tsx|jsx|ts|js)$/.test(filePath);
}

function isAppRouterPageFile(filePath: string): boolean {
  return /^(?:src\/)?app(?:\/.+)?\/page\.(tsx|jsx|ts|js)$/.test(filePath);
}

function isPagesRouterFile(filePath: string): boolean {
  return (
    /^(?:src\/)?pages\/.+\.(tsx|jsx|ts|js)$/.test(filePath) &&
    !/^(?:src\/)?pages\/api\//.test(filePath) &&
    !/^(?:src\/)?pages\/(?:_app|_document|_error)\.(tsx|jsx|ts|js)$/.test(filePath)
  );
}

function isPageFile(filePath: string): boolean {
  return (
    isLegacyPagesFile(filePath) ||
    isAppRouterPageFile(filePath) ||
    isPagesRouterFile(filePath)
  );
}

function isSectionFile(filePath: string): boolean {
  return (
    /^(?:src\/)?app\/components\/.+\.(tsx|jsx|ts|js)$/.test(filePath) ||
    /^(?:src\/)?components\/.+\.(tsx|jsx|ts|js)$/.test(filePath)
  );
}

function isRelevantStylesheet(filePath: string): boolean {
  return (
    /^src\/styles\/.+\.(css|scss|ts)$/.test(filePath) ||
    /^(?:src\/)?styles\/.+\.(css|scss|ts)$/.test(filePath) ||
    /^(?:src\/)?app\/.+\.(css|scss)$/.test(filePath)
  );
}

function inferSupportedSectionKey(input: string): string | null {
  const normalized = slugify(input);
  for (const key of SUPPORTED_SECTION_KEYS) {
    if (normalized === key || normalized.includes(key)) {
      return key;
    }
  }
  return null;
}

function humanizeComponentName(input: string): string {
  return input
    .replace(/\.(tsx|jsx|ts|js)$/, "")
    .replace(/(Section|Block|Component|Module|Wrapper|Layout)$/i, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function componentNameFromImportPath(importPath: string): string {
  const normalized = importPath.replace(/\/index$/, "");
  const baseName = normalized.split("/").pop() ?? normalized;
  return baseName.replace(/\.(tsx|jsx|ts|js)$/, "");
}

function displayNameFromSectionKey(sectionKey: string, fallback: string): string {
  switch (sectionKey) {
    case "hero":
      return "Hero";
    case "services":
      return "Services";
    case "solutions":
      return "Solutions";
    default:
      return humanizeComponentName(fallback);
  }
}

function isLocalImportPath(importPath: string): boolean {
  return (
    importPath.startsWith("@/") ||
    importPath.startsWith("./") ||
    importPath.startsWith("../") ||
    importPath.startsWith("/")
  );
}

function hasScriptExtension(filePath: string): boolean {
  return /\.(tsx|jsx|ts|js)$/.test(filePath);
}

function toImportBaseCandidates(importPath: string, importerPath: string): string[] {
  if (importPath.startsWith("@/")) {
    const rest = importPath.slice(2);
    return [`src/${rest}`, rest];
  }

  if (importPath.startsWith("./") || importPath.startsWith("../")) {
    return [path.posix.normalize(path.posix.join(path.posix.dirname(importerPath), importPath))];
  }

  if (importPath.startsWith("/")) {
    const rest = importPath.slice(1);
    return [rest, `src/${rest}`];
  }

  return [];
}

function expandImportCandidates(importPath: string, importerPath: string): string[] {
  const candidates = new Set<string>();
  for (const base of toImportBaseCandidates(importPath, importerPath)) {
    if (hasScriptExtension(base)) {
      candidates.add(base);
      continue;
    }

    for (const suffix of [
      ".tsx",
      ".jsx",
      ".ts",
      ".js",
      "/index.tsx",
      "/index.jsx",
      "/index.ts",
      "/index.js"
    ]) {
      candidates.add(`${base}${suffix}`);
    }
  }
  return [...candidates];
}

function deriveSectionKey(componentName: string, sourceFile: string): string {
  const normalizedComponent = componentName.replace(
    /(Section|Block|Component|Module|Wrapper|Layout)$/i,
    ""
  );
  return (
    inferSupportedSectionKey(componentName) ??
    inferSupportedSectionKey(sourceFile) ??
    slugify(humanizeComponentName(normalizedComponent)) ??
    slugify(sourceFile.split("/").pop() ?? sourceFile) ??
    "section"
  );
}

function fileExportsComponent(fileContent: string, componentName: string): boolean {
  return new RegExp(
    `export\\s+(?:default\\s+function|function|const|class)\\s+${componentName}\\b`
  ).test(fileContent);
}

function fileByPath(snapshot: RepositorySnapshot, filePath: string): string {
  return (
    snapshot.files.find((file) => file.path === filePath)?.content ??
    (() => {
      throw new Error(`Missing repo file: ${filePath}`);
    })()
  );
}

function parseImports(content: string): Array<{
  componentName: string;
  importPath: string;
  usage: "jsx" | "reexport";
}> {
  const defaultMatches = [
    ...content.matchAll(
      /import\s+([A-Z][A-Za-z0-9_]*)\s+from\s+["']([^"']+)["']/g
    )
  ]
    .filter((match) => isLocalImportPath(match[2]))
    .map((match) => ({
      componentName: match[1],
      importPath: match[2],
      usage: "jsx" as const
    }));
  const namedMatches = [
    ...content.matchAll(
      /import\s*{\s*([^}]+)\s*}\s*from\s*["']([^"']+)["']/gs
    )
  ]
    .filter((match) => isLocalImportPath(match[2]))
    .flatMap((match) =>
    match[1]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((specifier) => {
        const aliasMatch = specifier.match(/^([A-Za-z0-9_]+)\s+as\s+([A-Za-z0-9_]+)$/);
        return {
          componentName: aliasMatch ? aliasMatch[2] : specifier,
          importPath: match[2],
          usage: "jsx" as const
        };
      })
    )
    .filter((item) => /^[A-Z]/.test(item.componentName));

  const reExportMatches = [
    ...content.matchAll(
      /export\s*{\s*([^}]+)\s*}\s*from\s*["']([^"']+)["']/gs
    )
  ]
    .filter((match) => isLocalImportPath(match[2]))
    .flatMap((match) =>
      match[1]
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .flatMap((specifier) => {
          if (/^default$/i.test(specifier)) {
            return [
              {
                componentName: componentNameFromImportPath(match[2]),
                importPath: match[2],
                usage: "reexport" as const
              }
            ];
          }

          const defaultAliasMatch = specifier.match(/^default\s+as\s+([A-Za-z0-9_]+)$/i);
          if (defaultAliasMatch) {
            return [
              {
                componentName: defaultAliasMatch[1],
                importPath: match[2],
                usage: "reexport" as const
              }
            ];
          }

          return [];
        })
    );

  const defaultExportReferenceMatches = [
    ...content.matchAll(/export\s+default\s+([A-Z][A-Za-z0-9_]*)\s*;?/g)
  ].flatMap((match) => {
    const componentName = match[1];
    const imported =
      defaultMatches.find((item) => item.componentName === componentName) ??
      namedMatches.find((item) => item.componentName === componentName);
    return imported
      ? [
          {
            componentName,
            importPath: imported.importPath,
            usage: "reexport" as const
          }
        ]
      : [];
  });

  return [...defaultMatches, ...namedMatches, ...reExportMatches, ...defaultExportReferenceMatches];
}

function resolveSectionSourceFile(
  snapshot: RepositorySnapshot,
  importPath: string,
  componentName: string,
  importerPath: string
): string | null {
  const directPath = expandImportCandidates(importPath, importerPath).find((candidate) =>
    snapshot.files.some((file) => file.path === candidate)
  );
  if (directPath) {
    const directFile = snapshot.files.find((file) => file.path === directPath) ?? null;
    const baseName = directPath.split("/").pop()?.replace(/\.(tsx|jsx|ts|js)$/, "");
    if (
      directFile &&
      (baseName === componentName || fileExportsComponent(directFile.content, componentName))
    ) {
      return directPath;
    }
  }

  if (!isLocalImportPath(importPath)) {
    return null;
  }

  const sectionFiles = snapshot.files.filter((file) => isSectionFile(file.path));
  const exactNameMatch = sectionFiles.find((file) => {
    const baseName = file.path.split("/").pop()?.replace(/\.(tsx|jsx|ts|js)$/, "");
    return baseName === componentName;
  });
  if (exactNameMatch) {
    return exactNameMatch.path;
  }

  const exportedSymbolMatch = sectionFiles.find((file) =>
    fileExportsComponent(file.content, componentName)
  );
  if (exportedSymbolMatch) {
    return exportedSymbolMatch.path;
  }

  return null;
}

function detectSectionOrder(
  content: string,
  componentName: string,
  fallbackIndex: number,
  usage: "jsx" | "reexport"
): number | null {
  if (usage === "reexport") {
    return fallbackIndex;
  }
  const jsxMatch = content.indexOf(`<${componentName}`);
  return jsxMatch >= 0 ? jsxMatch : null;
}

function isBuildableSectionComponent(
  snapshot: RepositorySnapshot,
  sourceFile: string,
  componentName: string
): boolean {
  if (/\/(sections|pages)\//.test(sourceFile)) {
    return true;
  }

  if (/(Section|Page|Hero|Banner)$/i.test(componentName)) {
    return true;
  }

  const sourceContent =
    snapshot.files.find((file) => file.path === sourceFile)?.content ?? "";
  return /<(section|main|article|aside)\b/i.test(sourceContent);
}

function routeFromPagePath(filePath: string): string {
  if (isLegacyPagesFile(filePath)) {
    const routeBase = filePath
      .replace(/^src\/app\/pages\//, "")
      .replace(/\.(tsx|jsx|ts|js)$/, "")
      .replace(/\/index$/, "");
    return routeBase === "index" || routeBase === "" ? "/" : `/${routeBase}`;
  }

  if (isAppRouterPageFile(filePath)) {
    const routeBase = filePath
      .replace(/^(?:src\/)?app\//, "")
      .replace(/\/page\.(tsx|jsx|ts|js)$/, "")
      .replace(/^page\.(tsx|jsx|ts|js)$/, "");
    const segments = routeBase
      .split("/")
      .filter(Boolean)
      .filter((segment) => !/^\(.*\)$/.test(segment))
      .filter((segment) => !segment.startsWith("@"));
    return segments.length === 0 ? "/" : `/${segments.join("/")}`;
  }

  const routeBase = filePath
    .replace(/^(?:src\/)?pages\//, "")
    .replace(/\.(tsx|jsx|ts|js)$/, "")
    .replace(/\/index$/, "");
  return routeBase === "index" || routeBase === "" ? "/" : `/${routeBase}`;
}

function pageNameFromPath(filePath: string): string {
  const route = routeFromPagePath(filePath);
  if (route === "/") {
    return "Home";
  }

  const segments = route.split("/").filter(Boolean);
  const raw = segments[segments.length - 1] ?? "Page";
  return raw
    .replace(/[\[\]]/g, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function contentHintsFromSource(sourceCode: string): string[] {
  const strings = [...sourceCode.matchAll(/>([^<>{]{3,80})</g)]
    .map((match) => match[1].trim())
    .filter((value) => looksLikeContent(value))
    .slice(0, 6);
  return dedupe(strings);
}

function assetReferencesFromSource(sourceCode: string, contextCode?: string): string[] {
  return dedupe(
    extractAssetReferencesFromSource({
      sourceCode,
      contextCode
    })
  );
}

function extractInlineSections(content: string): Array<{
  name: string;
  sectionKey: string;
  sourceCode: string;
  sortOrder: number;
}> {
  const sections: Array<{
    name: string;
    sectionKey: string;
    sourceCode: string;
    sortOrder: number;
  }> = [];
  const openTag = /<section\b/g;
  const closeTag = /<\/section>/g;
  let searchIndex = 0;

  while (true) {
    openTag.lastIndex = searchIndex;
    const openMatch = openTag.exec(content);
    if (!openMatch) {
      break;
    }

    let depth = 1;
    let endIndex = -1;
    let scanIndex = openMatch.index + openMatch[0].length;
    while (depth > 0) {
      openTag.lastIndex = scanIndex;
      closeTag.lastIndex = scanIndex;
      const nextOpen = openTag.exec(content);
      const nextClose = closeTag.exec(content);
      if (!nextClose) {
        break;
      }
      if (nextOpen && nextOpen.index < nextClose.index) {
        depth += 1;
        scanIndex = nextOpen.index + nextOpen[0].length;
        continue;
      }
      depth -= 1;
      endIndex = nextClose.index + nextClose[0].length;
      scanIndex = endIndex;
    }

    if (endIndex === -1) {
      break;
    }

    const sourceCode = content.slice(openMatch.index, endIndex);
    const before = content.slice(Math.max(0, openMatch.index - 240), openMatch.index);
    const commentMatches = [
      ...before.matchAll(/\{\s*\/\*\s*([\s\S]*?)\s*\*\/\s*\}/g)
    ].filter((match) => /^\s*$/.test(before.slice((match.index ?? 0) + match[0].length)));
    const commentName = commentMatches.at(-1)?.[1]?.trim();
    const headingMatch = sourceCode.match(/<h[1-6][^>]*>\s*([^<]{2,80})\s*<\/h[1-6]>/i);
    const rawName =
      commentName?.replace(/\s+Section$/i, "") ??
      headingMatch?.[1]?.trim() ??
      `Section ${sections.length + 1}`;
    sections.push({
      name: humanizeComponentName(rawName),
      sectionKey: slugify(humanizeComponentName(rawName)) ?? `section-${sections.length + 1}`,
      sourceCode,
      sortOrder: openMatch.index
    });
    searchIndex = endIndex;
  }

  return sections;
}

function derivePageFallbackSectionKey(page: RepoPageRecord): string {
  if (page.route === "/") {
    return "home";
  }
  return slugify(page.name) ?? slugify(page.route.replace(/\//g, " ")) ?? "page";
}

function pascalCaseIdentifier(input: string, fallback: string): string {
  const normalized = slugify(input) ?? slugify(fallback) ?? "section";
  return normalized
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("");
}

function inlineSectionComponentName(
  inlineSections: Array<{ name: string; sectionKey: string }>,
  inlineSection: { name: string; sectionKey: string },
  inlineIndex: number
): string {
  const base = `${pascalCaseIdentifier(
    inlineSection.name,
    inlineSection.sectionKey
  )}Section`;
  const duplicateCount = inlineSections.filter(
    (section) =>
      `${pascalCaseIdentifier(section.name, section.sectionKey)}Section` === base
  ).length;
  return duplicateCount > 1 ? `${base}${inlineIndex + 1}` : base;
}

export interface ExtractedRepoIndex {
  pages: RepoPageRecord[];
  sections: RepoSectionRecord[];
}

export class MisRepoExtractor {
  extractRepoIndex(repoId: string, snapshot: RepositorySnapshot): ExtractedRepoIndex {
    const pageFiles = snapshot.files
      .filter((file) => isPageFile(file.path))
      .sort((left, right) => left.path.localeCompare(right.path));
    const pages: RepoPageRecord[] = [];
    const sections: RepoSectionRecord[] = [];

    pageFiles.forEach((pageFile, pageIndex) => {
      const pageId = stableId(repoId, pageFile.path);
      const page: RepoPageRecord = {
        id: pageId,
        repoId,
        name: pageNameFromPath(pageFile.path),
        route: routeFromPagePath(pageFile.path),
        sourceFile: pageFile.path,
        sortOrder: pageIndex,
        metadata: {
          parseStatus: "parsed",
          confidence: 0.95
        }
      };
      pages.push(page);
      const sectionsBeforePage = sections.length;
      const inlineSections = extractInlineSections(pageFile.content);

      if (inlineSections.length > 0) {
        inlineSections.forEach((inlineSection, inlineIndex) => {
          sections.push({
            id: stableId(pageId, "inline-section", String(inlineIndex)),
            repoId,
            pageId,
            name: inlineSection.name,
            sectionKey: inlineSection.sectionKey,
            sourceFile: pageFile.path,
            importPath: pageFile.path,
            sortOrder: inlineIndex,
            componentName: inlineSectionComponentName(
              inlineSections,
              inlineSection,
              inlineIndex
            ),
            metadata: {
              parseStatus: "parsed",
              confidence: 0.88,
              displayOrder: inlineIndex,
              inferredFromPageFile: true,
              inlineSourceCode: inlineSection.sourceCode
            }
          });
        });
        return;
      }

      const imports = parseImports(pageFile.content);
      imports
        .map((item, importIndex) => ({
          ...item,
          sourceFile: resolveSectionSourceFile(
            snapshot,
            item.importPath,
            item.componentName,
            pageFile.path
          ),
          sortOrder: detectSectionOrder(
            pageFile.content,
            item.componentName,
            importIndex,
            item.usage
          )
        }))
        .filter(
          (
            item
          ): item is typeof item & { sourceFile: string; sortOrder: number } =>
            Boolean(item.sourceFile) && item.sortOrder !== null
        )
        .filter((item) =>
          isBuildableSectionComponent(snapshot, item.sourceFile, item.componentName)
        )
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .forEach((item, sortOrder) => {
          const sectionKey = deriveSectionKey(item.componentName, item.sourceFile);
          sections.push({
            id: stableId(pageId, item.componentName),
            repoId,
            pageId,
            name: displayNameFromSectionKey(sectionKey, item.componentName),
            sectionKey,
            sourceFile: item.sourceFile,
            importPath: item.importPath,
            sortOrder,
            componentName: item.componentName,
            metadata: {
              parseStatus: "parsed",
              confidence: 0.9,
              displayOrder: sortOrder
            }
          });
        });

      if (sections.length === sectionsBeforePage) {
        const sectionKey = derivePageFallbackSectionKey(page);
        sections.push({
          id: stableId(pageId, "page-root-section"),
          repoId,
          pageId,
          name: page.name,
          sectionKey,
          sourceFile: pageFile.path,
          importPath: pageFile.path,
          sortOrder: 0,
          componentName: `${page.name.replace(/\s+/g, "")}Page`,
          metadata: {
            parseStatus: "parsed",
            confidence: 0.55,
            displayOrder: 0,
            inferredFromPageFile: true
          }
        });
      }
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
    const relevantStylesheets = params.snapshot.files
      .filter((file) => isRelevantStylesheet(file.path))
      .map((file) => ({
        path: file.path,
        content: file.content
      }));

    const relatedSharedClasses = params.sharedStyleContext.classes
      .filter((item) => {
        const category = inferSharedCategory(item.name);
        if (!category) {
          return false;
        }
        return (
          item.name.toLowerCase().includes(params.section.sectionKey) ||
          ["heading", "text", "button", "spacing", "layout"].includes(category)
        );
      })
      .map((item) => item.name)
      .slice(0, 20);

    return {
      repoId: params.repoId,
      pageName: params.page.name,
      pageSourceFile: params.page.sourceFile,
      sectionName: params.section.name,
      sectionSourceFile: params.section.sourceFile,
      componentName: params.section.componentName,
      sectionOrder: params.section.sortOrder,
      sourceCode,
      relevantStylesheets,
      assetReferences: assetReferencesFromSource(
        sourceCode,
        inlineSourceCode ? fileByPath(params.snapshot, params.page.sourceFile) : undefined
      ),
      contentHints: contentHintsFromSource(sourceCode),
      relatedSharedClasses
    };
  }
}
