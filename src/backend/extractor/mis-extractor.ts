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

function sectionComponentPath(importPath: string): string | null {
  const normalized = importPath.replace(/^@\//, "src/").replace(/^\.\//, "");
  const match = normalized.match(/src\/app\/components\/sections\/(.+)$/);
  if (!match) {
    return null;
  }
  const withExtension = /\.(tsx|jsx|ts|js)$/.test(match[1])
    ? match[1]
    : `${match[1]}.tsx`;
  return `src/app/components/sections/${withExtension}`;
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
  const matches = [
    ...content.matchAll(
      /import\s+([A-Za-z0-9_]+)\s+from\s+["']([^"']*components\/sections\/[^"']+)["']/g
    )
  ];
  return matches.map((match) => ({
    componentName: match[1],
    importPath: match[2]
  }));
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
  const routeBase = filePath
    .replace(/^src\/app\/pages\//, "")
    .replace(/\.(tsx|jsx|ts|js)$/, "");
  return routeBase === "index" ? "/" : `/${routeBase}`;
}

function pageNameFromPath(filePath: string): string {
  const basename = filePath.split("/").pop() ?? filePath;
  const raw = basename.replace(/\.(tsx|jsx|ts|js)$/, "");
  return raw === "index" ? "Home" : raw.replace(/[-_]/g, " ");
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
    const pageFiles = snapshot.files.filter((file) =>
      /^src\/app\/pages\/.+\.(tsx|jsx|ts|js)$/.test(file.path)
    );
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
          sourceFile: sectionComponentPath(item.importPath),
          sortOrder: detectSectionOrder(
            pageFile.content,
            item.componentName,
            importIndex
          )
        }))
        .filter((item): item is typeof item & { sourceFile: string } => Boolean(item.sourceFile))
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .forEach((item, sortOrder) => {
          const sectionKey = slugify(item.componentName);
          if (!SUPPORTED_SECTION_KEYS.has(sectionKey)) {
            return;
          }
          sections.push({
            id: stableId(pageId, item.componentName),
            repoId,
            pageId,
            name: item.componentName,
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
      .filter((file) => file.path.startsWith("src/styles/"))
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
