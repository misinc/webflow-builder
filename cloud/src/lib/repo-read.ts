import { asc, eq } from "drizzle-orm";
import { getDb } from "../db/getDb";
import {
  appBlobsTable,
  repoPagesTable,
  reposTable,
  repoSectionsTable
} from "../db/schema";
import { stableId } from "./ids";

type RepoRecord = {
  id: string;
  owner: string;
  name: string;
  provider: "github";
  repoUrl: string;
  defaultBranch: string;
  status: "connected" | "syncing" | "ready" | "failed";
  createdAt: string;
  updatedAt: string;
};

type RepoPageRecord = {
  id: string;
  repoId: string;
  name: string;
  route: string;
  sourceFile: string;
  sourceCode?: string;
  sortOrder: number;
  metadata: Record<string, unknown>;
};

type RepoSectionRecord = {
  id: string;
  repoId: string;
  pageId: string;
  name: string;
  sectionKey: string;
  sourceFile: string;
  sourceCode?: string;
  importPath: string;
  sortOrder: number;
  componentName: string;
  metadata: Record<string, unknown>;
};

type RepoTreeResponse = {
  repo: RepoRecord;
  pages: Array<{
    page: RepoPageRecord;
    sections: RepoSectionRecord[];
  }>;
};

type ComponentOpportunity = {
  id: string;
  name: string;
  componentName: string;
  confidence: "high" | "medium";
  instances: number;
  files: number;
  sourceFiles: string[];
  sampleRoutes: string[];
  selectedByDefault: boolean;
};

type ComponentOpportunitiesResponse = {
  repoId: string;
  generatedAt: string;
  opportunities: ComponentOpportunity[];
};

interface RepositorySnapshot {
  files?: Array<{
    path: string;
    content: string;
  }>;
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function humanizeComponentName(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function mapRepo(row: typeof reposTable.$inferSelect): RepoRecord {
  return {
    id: row.id,
    owner: row.owner,
    name: row.name,
    provider: "github",
    repoUrl: row.repoUrl,
    defaultBranch: row.defaultBranch,
    status: row.status as RepoRecord["status"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapPage(row: typeof repoPagesTable.$inferSelect): RepoPageRecord {
  return {
    id: row.id,
    repoId: row.repoId,
    name: row.name,
    route: row.route,
    sourceFile: row.sourceFile,
    sortOrder: row.sortOrder,
    metadata: parseJsonObject(row.metadataJson)
  };
}

function mapSection(row: typeof repoSectionsTable.$inferSelect): RepoSectionRecord {
  return {
    id: row.id,
    repoId: row.repoId,
    pageId: row.pageId,
    name: row.name,
    sectionKey: row.sectionKey,
    sourceFile: row.sourceFile,
    importPath: row.importPath,
    sortOrder: row.sortOrder,
    componentName: row.componentName,
    metadata: parseJsonObject(row.metadataJson)
  };
}

async function getSnapshot(
  locals: App.Locals,
  repoId: string
): Promise<RepositorySnapshot | null> {
  const db = getDb(locals);
  const row = await db.query.appBlobsTable.findFirst({
    where: eq(appBlobsTable.key, `repos/${repoId}/snapshots/latest.json`)
  });
  if (!row) {
    return null;
  }

  try {
    return JSON.parse(row.valueJson) as RepositorySnapshot;
  } catch {
    return null;
  }
}

async function getRepoOrThrow(locals: App.Locals, repoId: string) {
  const db = getDb(locals);
  const repo = await db.query.reposTable.findFirst({
    where: eq(reposTable.id, repoId)
  });
  if (!repo) {
    throw new Error(`Unknown repo: ${repoId}`);
  }
  return repo;
}

export async function getRepoTree(locals: App.Locals, repoId: string) {
  const db = getDb(locals);
  const repo = await getRepoOrThrow(locals, repoId);
  const [pageRows, sectionRows, snapshot] = await Promise.all([
    db.query.repoPagesTable.findMany({
      where: eq(repoPagesTable.repoId, repoId),
      orderBy: [asc(repoPagesTable.sortOrder)]
    }),
    db.query.repoSectionsTable.findMany({
      where: eq(repoSectionsTable.repoId, repoId),
      orderBy: [asc(repoSectionsTable.sortOrder)]
    }),
    getSnapshot(locals, repoId)
  ]);

  const pages = pageRows.map(mapPage);
  const sections = sectionRows.map(mapSection);
  const sourceByPath = new Map(
    (snapshot?.files ?? []).map((file) => [file.path, file.content] as const)
  );

  return {
    repo: mapRepo(repo),
    pages: pages.map((page) => ({
      page: {
        ...page,
        sourceCode: sourceByPath.get(page.sourceFile)
      },
      sections: sections
        .filter((section) => section.pageId === page.id)
        .map((section) => ({
          ...section,
          sourceCode:
            (typeof section.metadata.inlineSourceCode === "string"
              ? section.metadata.inlineSourceCode
              : null) ?? sourceByPath.get(section.sourceFile)
        }))
    }))
  } satisfies RepoTreeResponse;
}

export async function getComponentOpportunities(
  locals: App.Locals,
  repoId: string
): Promise<ComponentOpportunitiesResponse> {
  const db = getDb(locals);
  await getRepoOrThrow(locals, repoId);

  const [pageRows, sectionRows] = await Promise.all([
    db.query.repoPagesTable.findMany({
      where: eq(repoPagesTable.repoId, repoId)
    }),
    db.query.repoSectionsTable.findMany({
      where: eq(repoSectionsTable.repoId, repoId)
    })
  ]);

  const pages = pageRows.map(mapPage);
  const sections = sectionRows.map(mapSection);
  const pageById = new Map(pages.map((page) => [page.id, page]));
  const grouped = new Map<
    string,
    {
      componentName: string;
      pageFiles: Set<string>;
      routes: Set<string>;
      instances: number;
    }
  >();

  for (const section of sections) {
    const key = `${section.componentName}:${section.sourceFile}`;
    const group = grouped.get(key) ?? {
      componentName: section.componentName,
      pageFiles: new Set<string>(),
      routes: new Set<string>(),
      instances: 0
    };
    const page = pageById.get(section.pageId);
    if (page) {
      group.pageFiles.add(page.sourceFile);
      group.routes.add(page.route);
    }
    group.instances += 1;
    grouped.set(key, group);
  }

  const opportunities = [...grouped.entries()]
    .filter(([, group]) => group.instances >= 2 && group.pageFiles.size >= 2)
    .map(([key, group]) => ({
      id: stableId(repoId, key),
      name: humanizeComponentName(group.componentName),
      componentName: group.componentName,
      confidence:
        group.instances >= 3 || group.pageFiles.size >= 3 ? "high" : "medium",
      instances: group.instances,
      files: group.pageFiles.size,
      sourceFiles: [...group.pageFiles].sort(),
      sampleRoutes: [...group.routes].sort(),
      selectedByDefault: true
    }))
    .sort((left, right) => {
      if (right.instances !== left.instances) {
        return right.instances - left.instances;
      }
      return right.files - left.files;
    });

  return {
    repoId,
    generatedAt: new Date().toISOString(),
    opportunities
  } satisfies ComponentOpportunitiesResponse;
}
