import path from "node:path";
import {
  RepoPageRecord,
  RepoSectionRecord,
  SectionContext,
  SharedStyleContext
} from "../../shared/contracts.js";
import { dedupe, inferSharedCategory } from "../../shared/client-first.js";
import { RepositorySnapshot } from "../github/client.js";
import { slugify, stableId } from "../utils.js";

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

  return [...defaultMatches, ...namedMatches, ...reExportMatches];
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
    .filter(Boolean)
    .slice(0, 6);
  return dedupe(strings);
}

function assetReferencesFromSource(sourceCode: string): string[] {
  return dedupe(
    [...sourceCode.matchAll(/(?:src|image|poster)=["']([^"']+)["']/g)].map(
      (match) => match[1]
    )
  );
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
    const sourceCode = fileByPath(params.snapshot, params.section.sourceFile);
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
      assetReferences: assetReferencesFromSource(sourceCode),
      contentHints: contentHintsFromSource(sourceCode),
      relatedSharedClasses
    };
  }
}
