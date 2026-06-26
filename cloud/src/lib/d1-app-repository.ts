import { and, asc, desc, eq } from "drizzle-orm";
import type {
  BindSiteInput,
  BuildJobRecord,
  BuildResultRecord,
  PageMapping,
  PageMappingsUpsertInput,
  RepoConnectionInput,
  RepoPageRecord,
  RepoRecord,
  RepoSectionRecord,
  RepoSyncRecord,
  SectionRunRecord,
  SectionWorkflowState,
  SharedStyleContext
} from "../shared/contracts.js";
import { getDb } from "../db/getDb";
import {
  appBlobsTable,
  buildJobsTable,
  buildResultsTable,
  repoPagesTable,
  reposTable,
  repoSectionsTable,
  repoSyncsTable,
  sectionRunsTable,
  sectionWorkflowStatesTable,
  sharedStyleContextsTable,
  webflowPageMappingsTable,
  webflowSiteBindingsTable
} from "../db/schema";
import { stableId } from "../backend/utils.js";
import type {
  AppRepository,
  WebflowSiteBinding
} from "../backend/repositories/app-repository.js";
import {
  assertD1BatchWithinLimit,
  insertBatchSize
} from "./d1-limits";

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function chunkValues<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
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

function mapSync(row: typeof repoSyncsTable.$inferSelect): RepoSyncRecord {
  return {
    id: row.id,
    repoId: row.repoId,
    commitSha: row.commitSha,
    branch: row.branch,
    status: row.status as RepoSyncRecord["status"],
    startedAt: row.startedAt,
    completedAt: row.completedAt ?? null,
    errorMessage: row.errorMessage ?? null
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
    metadata: parseJson(row.metadataJson, {})
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
    metadata: parseJson(row.metadataJson, {})
  };
}

function mapBinding(row: typeof webflowSiteBindingsTable.$inferSelect): WebflowSiteBinding {
  return {
    id: row.id,
    repoId: row.repoId,
    userId: row.userId,
    webflowSiteId: row.webflowSiteId,
    rulesetName: row.rulesetId ?? "live-webflow-site",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapPageMapping(row: typeof webflowPageMappingsTable.$inferSelect): PageMapping {
  return {
    id: row.id,
    userId: row.userId,
    repoId: row.repoId,
    webflowSiteId: row.webflowSiteId,
    webflowPageId: row.webflowPageId,
    webflowPageName: row.webflowPageName,
    webflowPageRoute: row.webflowPageRoute ?? null,
    repoPageId: row.repoPageId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapWorkflowState(
  row: typeof sectionWorkflowStatesTable.$inferSelect
): SectionWorkflowState {
  return {
    id: row.id,
    userId: row.userId,
    webflowSiteId: row.webflowSiteId,
    webflowPageId: row.webflowPageId,
    repoPageId: row.repoPageId,
    repoSectionId: row.repoSectionId,
    status: row.status as SectionWorkflowState["status"],
    sortOrder: row.sortOrder,
    lastRunId: row.lastRunId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt ?? null,
    skippedAt: row.skippedAt ?? null
  };
}

function mapSectionRun(row: typeof sectionRunsTable.$inferSelect): SectionRunRecord {
  return {
    id: row.id,
    userId: row.userId,
    repoId: row.repoId,
    webflowSiteId: row.webflowSiteId,
    webflowPageId: row.webflowPageId,
    repoPageId: row.repoPageId,
    repoSectionId: row.repoSectionId,
    runType: row.runType as SectionRunRecord["runType"],
    payload: parseJson(row.payloadJson, {}),
    approvalOutcome: (row.approvalOutcome as SectionRunRecord["approvalOutcome"]) ?? null,
    createdAt: row.createdAt,
    approvedAt: row.approvedAt ?? null
  };
}

function mapBuildJob(row: typeof buildJobsTable.$inferSelect): BuildJobRecord {
  return {
    id: row.id,
    repoId: row.repoId,
    pageId: row.pageId,
    sectionId: row.sectionId,
    webflowSiteId: row.webflowSiteId,
    webflowPageId: row.webflowPageId,
    placementMode: row.placementMode as BuildJobRecord["placementMode"],
    placementTarget: row.placementTarget ?? null,
    status: row.status as BuildJobRecord["status"],
    requestedBy: row.requestedBy,
    startedAt: row.startedAt,
    completedAt: row.completedAt ?? null,
    errorMessage: row.errorMessage ?? null
  };
}

function mapBuildResult(row: typeof buildResultsTable.$inferSelect): BuildResultRecord {
  const payload = parseJson<
    Omit<BuildResultRecord, "id" | "buildJobId" | "createdAt">
  >(row.resultJson, {
    success: false,
    insertedSectionName: "",
    webflowPageId: "",
    reusedClasses: [],
    createdClasses: [],
    createdNodeIds: [],
    warnings: [],
    missingAssets: [],
    rollbackOutcome: null
  });

  return {
    id: row.id,
    buildJobId: row.buildJobId,
    createdAt: row.createdAt,
    ...payload
  };
}

export class D1AppRepository implements AppRepository {
  constructor(private readonly locals: App.Locals) {}

  private get db() {
    return getDb(this.locals);
  }

  async createRepo(
    input: RepoConnectionInput & { defaultBranch: string }
  ): Promise<RepoRecord> {
    const existing = await this.getRepoByOwnerAndName(input.owner, input.name);
    if (existing) {
      return existing;
    }

    const timestamp = new Date().toISOString();
    const id = stableId(input.owner, input.name);
    await this.db.insert(reposTable).values({
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

  async listRepos(): Promise<RepoRecord[]> {
    const rows = await this.db.query.reposTable.findMany({
      orderBy: [desc(reposTable.updatedAt)]
    });
    return rows.map(mapRepo);
  }

  async getRepo(repoId: string): Promise<RepoRecord | null> {
    const row = await this.db.query.reposTable.findFirst({
      where: eq(reposTable.id, repoId)
    });
    return row ? mapRepo(row) : null;
  }

  async getRepoByOwnerAndName(owner: string, name: string): Promise<RepoRecord | null> {
    const row = await this.db.query.reposTable.findFirst({
      where: and(eq(reposTable.owner, owner), eq(reposTable.name, name))
    });
    return row ? mapRepo(row) : null;
  }

  async updateRepoStatus(repoId: string, status: RepoRecord["status"]): Promise<void> {
    await this.db
      .update(reposTable)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(reposTable.id, repoId));
  }

  async saveSync(sync: RepoSyncRecord): Promise<void> {
    await this.db
      .insert(repoSyncsTable)
      .values({
        id: sync.id,
        repoId: sync.repoId,
        commitSha: sync.commitSha,
        branch: sync.branch,
        status: sync.status,
        startedAt: sync.startedAt,
        completedAt: sync.completedAt,
        errorMessage: sync.errorMessage
      })
      .onConflictDoUpdate({
        target: repoSyncsTable.id,
        set: {
          status: sync.status,
          startedAt: sync.startedAt,
          completedAt: sync.completedAt,
          errorMessage: sync.errorMessage
        }
      });
  }

  async getLatestSync(repoId: string): Promise<RepoSyncRecord | null> {
    const row = await this.db.query.repoSyncsTable.findFirst({
      where: eq(repoSyncsTable.repoId, repoId),
      orderBy: [desc(repoSyncsTable.startedAt)]
    });
    return row ? mapSync(row) : null;
  }

  async replaceRepoIndex(
    repoId: string,
    pages: RepoPageRecord[],
    sections: RepoSectionRecord[]
  ): Promise<void> {
    // Build every write as a prepared statement and run them in a single
    // atomic D1 batch. Previously these were separate awaited statements, so a
    // failure on any insert (e.g. the old 175-param overflow) could leave the
    // repo index half-written or fully deleted. db.batch() is all-or-nothing.
    const statements = [
      this.db.delete(repoSectionsTable).where(eq(repoSectionsTable.repoId, repoId)),
      this.db.delete(repoPagesTable).where(eq(repoPagesTable.repoId, repoId)),
      ...chunkValues(pages, insertBatchSize(7)).map((pageBatch) =>
        {
          assertD1BatchWithinLimit("repo_pages insert", pageBatch.length, 7);
          return this.db.insert(repoPagesTable).values(
            pageBatch.map((page) => ({
              id: page.id,
              repoId: page.repoId,
              name: page.name,
              route: page.route,
              sourceFile: page.sourceFile,
              sortOrder: page.sortOrder,
              metadataJson: JSON.stringify(page.metadata)
            }))
          );
        }
      ),
      ...chunkValues(sections, insertBatchSize(10)).map((sectionBatch) =>
        {
          assertD1BatchWithinLimit("repo_sections insert", sectionBatch.length, 10);
          return this.db.insert(repoSectionsTable).values(
            sectionBatch.map((section) => ({
              id: section.id,
              repoId: section.repoId,
              pageId: section.pageId,
              name: section.name,
              sectionKey: section.sectionKey,
              sourceFile: section.sourceFile,
              importPath: section.importPath,
              sortOrder: section.sortOrder,
              componentName: section.componentName,
              metadataJson: JSON.stringify(section.metadata)
            }))
          );
        }
      )
    ];

    // The two deletes guarantee a non-empty batch (drizzle's d1 batch() needs
    // at least one statement).
    await this.db.batch(
      statements as [(typeof statements)[number], ...(typeof statements)[number][]]
    );
  }

  async getPages(repoId: string): Promise<RepoPageRecord[]> {
    const rows = await this.db.query.repoPagesTable.findMany({
      where: eq(repoPagesTable.repoId, repoId),
      orderBy: [asc(repoPagesTable.sortOrder)]
    });
    return rows.map(mapPage);
  }

  async getSections(repoId: string): Promise<RepoSectionRecord[]> {
    const rows = await this.db.query.repoSectionsTable.findMany({
      where: eq(repoSectionsTable.repoId, repoId),
      orderBy: [asc(repoSectionsTable.sortOrder)]
    });
    return rows.map(mapSection);
  }

  async getPage(pageId: string): Promise<RepoPageRecord | null> {
    const row = await this.db.query.repoPagesTable.findFirst({
      where: eq(repoPagesTable.id, pageId)
    });
    return row ? mapPage(row) : null;
  }

  async getSection(sectionId: string): Promise<RepoSectionRecord | null> {
    const row = await this.db.query.repoSectionsTable.findFirst({
      where: eq(repoSectionsTable.id, sectionId)
    });
    return row ? mapSection(row) : null;
  }

  async upsertSiteBinding(input: BindSiteInput): Promise<WebflowSiteBinding> {
    const timestamp = new Date().toISOString();
    await this.db
      .insert(webflowSiteBindingsTable)
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
        target: [webflowSiteBindingsTable.repoId, webflowSiteBindingsTable.userId],
        set: {
          webflowSiteId: input.webflowSiteId,
          rulesetId: input.rulesetName ?? "live-webflow-site",
          updatedAt: timestamp
        }
      });

    if (input.sharedStyleContext) {
      await this.saveSharedStyleContext(input.webflowSiteId, input.sharedStyleContext);
    }

    const row = await this.db.query.webflowSiteBindingsTable.findFirst({
      where: and(
        eq(webflowSiteBindingsTable.repoId, input.repoId),
        eq(webflowSiteBindingsTable.userId, input.requestedBy)
      )
    });
    if (!row) {
      throw new Error("Failed to persist Webflow site binding.");
    }
    return mapBinding(row);
  }

  async getSiteBinding(repoId: string, userId: string): Promise<WebflowSiteBinding | null> {
    const row = await this.db.query.webflowSiteBindingsTable.findFirst({
      where: and(
        eq(webflowSiteBindingsTable.repoId, repoId),
        eq(webflowSiteBindingsTable.userId, userId)
      )
    });
    return row ? mapBinding(row) : null;
  }

  async saveSharedStyleContext(
    siteId: string,
    sharedStyleContext: SharedStyleContext
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    await this.db
      .insert(sharedStyleContextsTable)
      .values({
        siteId,
        contextJson: JSON.stringify(sharedStyleContext),
        capturedAt: sharedStyleContext.capturedAt,
        updatedAt: timestamp
      })
      .onConflictDoUpdate({
        target: sharedStyleContextsTable.siteId,
        set: {
          contextJson: JSON.stringify(sharedStyleContext),
          capturedAt: sharedStyleContext.capturedAt,
          updatedAt: timestamp
        }
      });
  }

  async getSharedStyleContext(siteId: string): Promise<SharedStyleContext | null> {
    const row = await this.db.query.sharedStyleContextsTable.findFirst({
      where: eq(sharedStyleContextsTable.siteId, siteId)
    });
    return row
      ? parseJson<SharedStyleContext>(row.contextJson, {
          siteId,
          capturedAt: row.capturedAt,
          classes: [],
          variables: [],
          styleIds: []
        })
      : null;
  }

  async upsertPageMappings(input: PageMappingsUpsertInput): Promise<PageMapping[]> {
    const timestamp = new Date().toISOString();
    for (const mapping of input.mappings) {
      await this.db
        .insert(webflowPageMappingsTable)
        .values({
          id: stableId(input.repoId, input.requestedBy, mapping.webflowPageId),
          userId: input.requestedBy,
          repoId: input.repoId,
          webflowSiteId: input.webflowSiteId,
          webflowPageId: mapping.webflowPageId,
          webflowPageName: mapping.webflowPageName,
          webflowPageRoute: mapping.webflowPageRoute ?? null,
          repoPageId: mapping.repoPageId,
          createdAt: timestamp,
          updatedAt: timestamp
        })
        .onConflictDoUpdate({
          target: [
            webflowPageMappingsTable.repoId,
            webflowPageMappingsTable.userId,
            webflowPageMappingsTable.webflowPageId
          ],
          set: {
            webflowPageName: mapping.webflowPageName,
            webflowPageRoute: mapping.webflowPageRoute ?? null,
            repoPageId: mapping.repoPageId,
            updatedAt: timestamp
          }
        });
    }

    return this.getPageMappings(input.repoId, input.webflowSiteId, input.requestedBy);
  }

  async getPageMappings(
    repoId: string,
    webflowSiteId: string,
    userId: string
  ): Promise<PageMapping[]> {
    const rows = await this.db.query.webflowPageMappingsTable.findMany({
      where: and(
        eq(webflowPageMappingsTable.repoId, repoId),
        eq(webflowPageMappingsTable.webflowSiteId, webflowSiteId),
        eq(webflowPageMappingsTable.userId, userId)
      ),
      orderBy: [asc(webflowPageMappingsTable.webflowPageName)]
    });
    return rows.map(mapPageMapping);
  }

  async replaceSectionWorkflowStates(
    userId: string,
    webflowSiteId: string,
    webflowPageId: string,
    repoPageId: string,
    states: Array<{ repoSectionId: string; sortOrder: number }>
  ): Promise<SectionWorkflowState[]> {
    const timestamp = new Date().toISOString();
    for (const state of states) {
      await this.db
        .insert(sectionWorkflowStatesTable)
        .values({
          id: stableId(userId, webflowPageId, state.repoSectionId),
          userId,
          webflowSiteId,
          webflowPageId,
          repoPageId,
          repoSectionId: state.repoSectionId,
          status: "not_started",
          sortOrder: state.sortOrder,
          lastRunId: null,
          createdAt: timestamp,
          updatedAt: timestamp,
          completedAt: null,
          skippedAt: null
        })
        .onConflictDoUpdate({
          target: [
            sectionWorkflowStatesTable.userId,
            sectionWorkflowStatesTable.webflowPageId,
            sectionWorkflowStatesTable.repoSectionId
          ],
          set: {
            repoPageId,
            sortOrder: state.sortOrder,
            updatedAt: timestamp
          }
        });
    }

    return this.getSectionWorkflowStates(userId, webflowSiteId, webflowPageId, repoPageId);
  }

  async getSectionWorkflowStates(
    userId: string,
    webflowSiteId: string,
    webflowPageId: string,
    repoPageId: string
  ): Promise<SectionWorkflowState[]> {
    const rows = await this.db.query.sectionWorkflowStatesTable.findMany({
      where: and(
        eq(sectionWorkflowStatesTable.userId, userId),
        eq(sectionWorkflowStatesTable.webflowSiteId, webflowSiteId),
        eq(sectionWorkflowStatesTable.webflowPageId, webflowPageId),
        eq(sectionWorkflowStatesTable.repoPageId, repoPageId)
      ),
      orderBy: [asc(sectionWorkflowStatesTable.sortOrder)]
    });
    return rows.map(mapWorkflowState);
  }

  async updateSectionWorkflowState(state: SectionWorkflowState): Promise<void> {
    await this.db
      .update(sectionWorkflowStatesTable)
      .set({
        status: state.status,
        sortOrder: state.sortOrder,
        lastRunId: state.lastRunId,
        updatedAt: state.updatedAt,
        completedAt: state.completedAt,
        skippedAt: state.skippedAt
      })
      .where(eq(sectionWorkflowStatesTable.id, state.id));
  }

  async saveSectionRun(run: SectionRunRecord): Promise<void> {
    await this.db
      .insert(sectionRunsTable)
      .values({
        id: run.id,
        userId: run.userId,
        repoId: run.repoId,
        webflowSiteId: run.webflowSiteId,
        webflowPageId: run.webflowPageId,
        repoPageId: run.repoPageId,
        repoSectionId: run.repoSectionId,
        runType: run.runType,
        payloadJson: JSON.stringify(run.payload),
        approvalOutcome: run.approvalOutcome,
        createdAt: run.createdAt,
        approvedAt: run.approvedAt
      })
      .onConflictDoUpdate({
        target: sectionRunsTable.id,
        set: {
          payloadJson: JSON.stringify(run.payload),
          approvalOutcome: run.approvalOutcome,
          approvedAt: run.approvedAt
        }
      });
  }

  async getLatestSectionRun(
    userId: string,
    webflowSiteId: string,
    webflowPageId: string,
    repoSectionId: string,
    runType?: SectionRunRecord["runType"]
  ): Promise<SectionRunRecord | null> {
    const rows = await this.db.query.sectionRunsTable.findMany({
      where: and(
        eq(sectionRunsTable.userId, userId),
        eq(sectionRunsTable.webflowSiteId, webflowSiteId),
        eq(sectionRunsTable.webflowPageId, webflowPageId),
        eq(sectionRunsTable.repoSectionId, repoSectionId)
      ),
      orderBy: [desc(sectionRunsTable.createdAt)]
    });
    const row = runType
      ? rows.find((item) => item.runType === runType) ?? null
      : (rows[0] ?? null);
    return row ? mapSectionRun(row) : null;
  }

  async createBuildJob(job: BuildJobRecord): Promise<void> {
    await this.db.insert(buildJobsTable).values({
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
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      errorMessage: job.errorMessage
    });
  }

  async getBuildJob(jobId: string): Promise<BuildJobRecord | null> {
    const row = await this.db.query.buildJobsTable.findFirst({
      where: eq(buildJobsTable.id, jobId)
    });
    return row ? mapBuildJob(row) : null;
  }

  async updateBuildJob(job: BuildJobRecord): Promise<void> {
    await this.db
      .update(buildJobsTable)
      .set({
        status: job.status,
        completedAt: job.completedAt,
        errorMessage: job.errorMessage
      })
      .where(eq(buildJobsTable.id, job.id));
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

    await this.db
      .insert(buildResultsTable)
      .values({
        id: result.id,
        buildJobId: result.buildJobId,
        resultJson: JSON.stringify(payload),
        createdAt: result.createdAt
      })
      .onConflictDoUpdate({
        target: buildResultsTable.buildJobId,
        set: {
          resultJson: JSON.stringify(payload),
          createdAt: result.createdAt
        }
      });
  }

  async getBuildResult(buildJobId: string): Promise<BuildResultRecord | null> {
    const row = await this.db.query.buildResultsTable.findFirst({
      where: eq(buildResultsTable.buildJobId, buildJobId)
    });
    return row ? mapBuildResult(row) : null;
  }
}
