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
    /^(?:src\/)?app\/components\/sections\/.+\.(tsx|jsx|ts|js)$/.test(filePath) ||
    /^(?:src\/)?components\/sections\/.+\.(tsx|jsx|ts|js)$/.test(filePath)
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

function displayNameFromSectionKey(sectionKey: string, fallback: string): string {
  switch (sectionKey) {
    case "hero":
      return "Hero";
    case "services":
      return "Services";
    case "solutions":
      return "Solutions";
    default:
      return fallback;
  }
}

function sectionComponentPath(importPath: string): string | null {
  const normalized = importPath.replace(/^@\//, "src/").replace(/^\.\//, "");
  const match = normalized.match(
    /(?:src\/app\/components\/sections|app\/components\/sections|src\/components\/sections|components\/sections)\/(.+)$/
  );
  if (!match) {
    return null;
  }
  return /\.(tsx|jsx|ts|js)$/.test(match[1]) ? match[1] : `${match[1]}.tsx`;
}

function isSectionsBarrelImport(importPath: string): boolean {
  const normalized = importPath.replace(/^@\//, "src/").replace(/^\.\//, "");
  return (
    [
      "src/app/components/sections",
      "src/app/components/sections/index",
      "src/app/components/sections/index.ts",
      "src/app/components/sections/index.tsx",
      "src/app/components/sections/index.js",
      "src/app/components/sections/index.jsx",
      "app/components/sections",
      "app/components/sections/index",
      "app/components/sections/index.ts",
      "app/components/sections/index.tsx",
      "app/components/sections/index.js",
      "app/components/sections/index.jsx",
      "src/components/sections",
      "src/components/sections/index",
      "src/components/sections/index.ts",
      "src/components/sections/index.tsx",
      "src/components/sections/index.js",
      "src/components/sections/index.jsx",
      "components/sections",
      "components/sections/index",
      "components/sections/index.ts",
      "components/sections/index.tsx",
      "components/sections/index.js",
      "components/sections/index.jsx"
    ].includes(normalized)
  );
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
}> {
  const defaultMatches = [
    ...content.matchAll(
      /import\s+([A-Za-z0-9_]+)\s+from\s+["']([^"']*components\/sections\/[^"']+)["']/g
    )
  ];
  const namedMatches = [
    ...content.matchAll(
      /import\s*{\s*([^}]+)\s*}\s*from\s*["']([^"']*components\/sections(?:\/index)?(?:\.[a-z]+)?)["']/gs
    )
  ].flatMap((match) =>
    match[1]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((specifier) => {
        const aliasMatch = specifier.match(/^([A-Za-z0-9_]+)\s+as\s+([A-Za-z0-9_]+)$/);
        return {
          componentName: aliasMatch ? aliasMatch[2] : specifier,
          importPath: match[2]
        };
      })
  );

  return [...defaultMatches.map((match) => ({
    componentName: match[1],
    importPath: match[2]
  })), ...namedMatches];
}

function resolveSectionSourceFile(
  snapshot: RepositorySnapshot,
  importPath: string,
  componentName: string
): string | null {
  const directMatch = sectionComponentPath(importPath);
  if (directMatch) {
    const directCandidates = [
      `src/app/components/sections/${directMatch}`,
      `app/components/sections/${directMatch}`,
      `src/components/sections/${directMatch}`,
      `components/sections/${directMatch}`
    ];
    const exactPath = directCandidates.find((candidate) =>
      snapshot.files.some((file) => file.path === candidate)
    );
    if (exactPath) {
      return exactPath;
    }
  }

  if (!isSectionsBarrelImport(importPath)) {
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
    new RegExp(
      `export\\s+(?:default\\s+function|function|const)\\s+${componentName}\\b`
    ).test(file.content)
  );
  if (exportedSymbolMatch) {
    return exportedSymbolMatch.path;
  }

  return null;
}

function detectSectionOrder(
  content: string,
  componentName: string,
  fallbackIndex: number
): number {
  const jsxMatch = content.indexOf(`<${componentName}`);
  return jsxMatch >= 0 ? jsxMatch : fallbackIndex;
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
            item.componentName
          ),
          sortOrder: detectSectionOrder(
            pageFile.content,
            item.componentName,
            importIndex
          )
        }))
        .filter((item): item is typeof item & { sourceFile: string } => Boolean(item.sourceFile))
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .forEach((item, sortOrder) => {
          const sectionKey =
            inferSupportedSectionKey(item.componentName) ??
            inferSupportedSectionKey(item.sourceFile);
          if (!sectionKey) {
            return;
          }
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
