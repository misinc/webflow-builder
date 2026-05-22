import { and, asc, desc, eq } from "drizzle-orm";
import {
  BindSiteInput,
  BuildJobRecord,
  BuildResultRecord,
  RepoConnectionInput,
  RepoPageRecord,
  RepoRecord,
  RepoSectionRecord,
  RepoSyncRecord,
  SharedStyleContext
} from "../../shared/contracts.js";
import { createDatabaseClient } from "../db/client.js";
import {
  buildJobs,
  buildResults,
  repoPages,
  repos,
  repoSections,
  repoSyncs,
  sharedStyleContexts,
  webflowSiteBindings
} from "../db/schema.js";
import { nowIso, stableId } from "../utils.js";
import { AppRepository, WebflowSiteBinding } from "./app-repository.js";

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function mapRepo(row: typeof repos.$inferSelect): RepoRecord {
  return {
    id: row.id,
    owner: row.owner,
    name: row.name,
    provider: "github",
    repoUrl: row.repoUrl,
    defaultBranch: row.defaultBranch,
    status: row.status as RepoRecord["status"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function mapSync(row: typeof repoSyncs.$inferSelect): RepoSyncRecord {
  return {
    id: row.id,
    repoId: row.repoId,
    commitSha: row.commitSha,
    branch: row.branch,
    status: row.status as RepoSyncRecord["status"],
    startedAt: row.startedAt.toISOString(),
    completedAt: toIso(row.completedAt),
    errorMessage: row.errorMessage
  };
}

function mapPage(row: typeof repoPages.$inferSelect): RepoPageRecord {
  return {
    id: row.id,
    repoId: row.repoId,
    name: row.name,
    route: row.route,
    sourceFile: row.sourceFile,
    sortOrder: row.sortOrder,
    metadata: row.metadataJson as RepoPageRecord["metadata"]
  };
}

function mapSection(row: typeof repoSections.$inferSelect): RepoSectionRecord {
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
    metadata: row.metadataJson as RepoSectionRecord["metadata"]
  };
}

function mapBinding(row: typeof webflowSiteBindings.$inferSelect): WebflowSiteBinding {
  return {
    id: row.id,
    repoId: row.repoId,
    userId: row.userId,
    webflowSiteId: row.webflowSiteId,
    rulesetName: row.rulesetId ?? "live-webflow-site",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function mapBuildJob(row: typeof buildJobs.$inferSelect): BuildJobRecord {
  return {
    id: row.id,
    repoId: row.repoId,
    pageId: row.pageId,
    sectionId: row.sectionId,
    webflowSiteId: row.webflowSiteId,
    webflowPageId: row.webflowPageId,
    placementMode: row.placementMode as BuildJobRecord["placementMode"],
    placementTarget: row.placementTarget,
    status: row.status as BuildJobRecord["status"],
    requestedBy: row.requestedBy,
    startedAt: row.startedAt.toISOString(),
    completedAt: toIso(row.completedAt),
    errorMessage: row.errorMessage
  };
}

function mapBuildResult(row: typeof buildResults.$inferSelect): BuildResultRecord {
  const payload = row.resultJson as Omit<
    BuildResultRecord,
    "id" | "buildJobId" | "createdAt"
  >;
  return {
    id: row.id,
    buildJobId: row.buildJobId,
    createdAt: row.createdAt.toISOString(),
    ...payload
  };
}

export class PostgresAppRepository implements AppRepository {
  private readonly client;

  constructor(connectionString: string) {
    this.client = createDatabaseClient(connectionString);
  }

  async createRepo(
    input: RepoConnectionInput & { defaultBranch: string }
  ): Promise<RepoRecord> {
    const existing = await this.getRepoByOwnerAndName(input.owner, input.name);
    if (existing) {
      return existing;
    }

    const timestamp = new Date();
    const id = stableId(input.owner, input.name);
    await this.client.db.insert(repos).values({
      id,
      owner: input.owner,
      name: input.name,
      provider: "github",
      repoUrl: input.repoUrl,
      defaultBranch: input.defaultBranch,
      status: "connected",
      createdAt: timestamp,
      updatedAt: timestamp
    });

    const created = await this.getRepo(id);
    if (!created) {
      throw new Error("Failed to create repo record.");
    }
    return created;
  }

  async getRepo(repoId: string): Promise<RepoRecord | null> {
    const row = await this.client.db.query.repos.findFirst({
      where: eq(repos.id, repoId)
    });
    return row ? mapRepo(row) : null;
  }

  async getRepoByOwnerAndName(owner: string, name: string): Promise<RepoRecord | null> {
    const row = await this.client.db.query.repos.findFirst({
      where: and(eq(repos.owner, owner), eq(repos.name, name))
    });
    return row ? mapRepo(row) : null;
  }

  async updateRepoStatus(repoId: string, status: RepoRecord["status"]): Promise<void> {
    await this.client.db
      .update(repos)
      .set({ status, updatedAt: new Date() })
      .where(eq(repos.id, repoId));
  }

  async saveSync(sync: RepoSyncRecord): Promise<void> {
    await this.client.db
      .insert(repoSyncs)
      .values({
        id: sync.id,
        repoId: sync.repoId,
        commitSha: sync.commitSha,
        branch: sync.branch,
        status: sync.status,
        startedAt: new Date(sync.startedAt),
        completedAt: sync.completedAt ? new Date(sync.completedAt) : null,
        errorMessage: sync.errorMessage
      })
      .onConflictDoUpdate({
        target: repoSyncs.id,
        set: {
          status: sync.status,
          startedAt: new Date(sync.startedAt),
          completedAt: sync.completedAt ? new Date(sync.completedAt) : null,
          errorMessage: sync.errorMessage
        }
      });
  }

  async getLatestSync(repoId: string): Promise<RepoSyncRecord | null> {
    const row = await this.client.db.query.repoSyncs.findFirst({
      where: eq(repoSyncs.repoId, repoId),
      orderBy: [desc(repoSyncs.startedAt)]
    });
    return row ? mapSync(row) : null;
  }

  async replaceRepoIndex(
    repoId: string,
    pages: RepoPageRecord[],
    sections: RepoSectionRecord[]
  ): Promise<void> {
    await this.client.db.transaction(async (tx) => {
      await tx.delete(repoSections).where(eq(repoSections.repoId, repoId));
      await tx.delete(repoPages).where(eq(repoPages.repoId, repoId));

      if (pages.length > 0) {
        await tx.insert(repoPages).values(
          pages.map((page) => ({
            id: page.id,
            repoId: page.repoId,
            name: page.name,
            route: page.route,
            sourceFile: page.sourceFile,
            sortOrder: page.sortOrder,
            metadataJson: page.metadata
          }))
        );
      }

      if (sections.length > 0) {
        await tx.insert(repoSections).values(
          sections.map((section) => ({
            id: section.id,
            repoId: section.repoId,
            pageId: section.pageId,
            name: section.name,
            sectionKey: section.sectionKey,
            sourceFile: section.sourceFile,
            importPath: section.importPath,
            sortOrder: section.sortOrder,
            componentName: section.componentName,
            metadataJson: section.metadata
          }))
        );
      }
    });
  }

  async getPages(repoId: string): Promise<RepoPageRecord[]> {
    const rows = await this.client.db.query.repoPages.findMany({
      where: eq(repoPages.repoId, repoId),
      orderBy: [asc(repoPages.sortOrder)]
    });
    return rows.map(mapPage);
  }

  async getSections(repoId: string): Promise<RepoSectionRecord[]> {
    const rows = await this.client.db.query.repoSections.findMany({
      where: eq(repoSections.repoId, repoId),
      orderBy: [asc(repoSections.sortOrder)]
    });
    return rows.map(mapSection);
  }

  async getPage(pageId: string): Promise<RepoPageRecord | null> {
    const row = await this.client.db.query.repoPages.findFirst({
      where: eq(repoPages.id, pageId)
    });
    return row ? mapPage(row) : null;
  }

  async getSection(sectionId: string): Promise<RepoSectionRecord | null> {
    const row = await this.client.db.query.repoSections.findFirst({
      where: eq(repoSections.id, sectionId)
    });
    return row ? mapSection(row) : null;
  }

  async upsertSiteBinding(input: BindSiteInput): Promise<WebflowSiteBinding> {
    const timestamp = new Date();
    await this.client.db
      .insert(webflowSiteBindings)
      .values({
        id: stableId(input.repoId, input.requestedBy, input.webflowSiteId),
        userId: input.requestedBy,
        repoId: input.repoId,
        webflowSiteId: input.webflowSiteId,
        rulesetId: input.rulesetName ?? "live-webflow-site",
        createdAt: timestamp,
        updatedAt: timestamp
      })
      .onConflictDoUpdate({
        target: [webflowSiteBindings.repoId, webflowSiteBindings.userId],
        set: {
          webflowSiteId: input.webflowSiteId,
          rulesetId: input.rulesetName ?? "live-webflow-site",
          updatedAt: timestamp
        }
      });

    if (input.sharedStyleContext) {
      await this.saveSharedStyleContext(input.webflowSiteId, input.sharedStyleContext);
    }

    const row = await this.client.db.query.webflowSiteBindings.findFirst({
      where: and(
        eq(webflowSiteBindings.repoId, input.repoId),
        eq(webflowSiteBindings.userId, input.requestedBy)
      )
    });
    if (!row) {
      throw new Error("Failed to persist Webflow site binding.");
    }
    return mapBinding(row);
  }

  async getSiteBinding(repoId: string, userId: string): Promise<WebflowSiteBinding | null> {
    const row = await this.client.db.query.webflowSiteBindings.findFirst({
      where: and(eq(webflowSiteBindings.repoId, repoId), eq(webflowSiteBindings.userId, userId))
    });
    return row ? mapBinding(row) : null;
  }

  async saveSharedStyleContext(
    siteId: string,
    sharedStyleContext: SharedStyleContext
  ): Promise<void> {
    await this.client.db
      .insert(sharedStyleContexts)
      .values({
        siteId,
        contextJson: sharedStyleContext,
        capturedAt: new Date(sharedStyleContext.capturedAt),
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: sharedStyleContexts.siteId,
        set: {
          contextJson: sharedStyleContext,
          capturedAt: new Date(sharedStyleContext.capturedAt),
          updatedAt: new Date()
        }
      });
  }

  async getSharedStyleContext(siteId: string): Promise<SharedStyleContext | null> {
    const row = await this.client.db.query.sharedStyleContexts.findFirst({
      where: eq(sharedStyleContexts.siteId, siteId)
    });
    return row ? (row.contextJson as SharedStyleContext) : null;
  }

  async createBuildJob(job: BuildJobRecord): Promise<void> {
    await this.client.db.insert(buildJobs).values({
      id: job.id,
      repoId: job.repoId,
      pageId: job.pageId,
      sectionId: job.sectionId,
      webflowSiteId: job.webflowSiteId,
      webflowPageId: job.webflowPageId,
      placementMode: job.placementMode,
      placementTarget: job.placementTarget,
      status: job.status,
      requestedBy: job.requestedBy,
      startedAt: new Date(job.startedAt),
      completedAt: job.completedAt ? new Date(job.completedAt) : null,
      errorMessage: job.errorMessage
    });
  }

  async getBuildJob(jobId: string): Promise<BuildJobRecord | null> {
    const row = await this.client.db.query.buildJobs.findFirst({
      where: eq(buildJobs.id, jobId)
    });
    return row ? mapBuildJob(row) : null;
  }

  async updateBuildJob(job: BuildJobRecord): Promise<void> {
    await this.client.db
      .update(buildJobs)
      .set({
        status: job.status,
        completedAt: job.completedAt ? new Date(job.completedAt) : null,
        errorMessage: job.errorMessage
      })
      .where(eq(buildJobs.id, job.id));
  }

  async saveBuildResult(result: BuildResultRecord): Promise<void> {
    const payload = {
      success: result.success,
      insertedSectionName: result.insertedSectionName,
      webflowPageId: result.webflowPageId,
      reusedClasses: result.reusedClasses,
      createdClasses: result.createdClasses,
      createdNodeIds: result.createdNodeIds,
      warnings: result.warnings,
      missingAssets: result.missingAssets,
      rollbackOutcome: result.rollbackOutcome
    };

    await this.client.db
      .insert(buildResults)
      .values({
        id: result.id,
        buildJobId: result.buildJobId,
        resultJson: payload,
        createdAt: new Date(result.createdAt)
      })
      .onConflictDoUpdate({
        target: buildResults.buildJobId,
        set: {
          resultJson: payload,
          createdAt: new Date(result.createdAt)
        }
      });
  }

  async getBuildResult(buildJobId: string): Promise<BuildResultRecord | null> {
    const row = await this.client.db.query.buildResults.findFirst({
      where: eq(buildResults.buildJobId, buildJobId)
    });
    return row ? mapBuildResult(row) : null;
  }
}
