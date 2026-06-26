import {
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
  SharedStyleContext,
  SiteStylePlan
} from "@wfb/shared/contracts.js";
import { nowIso, stableId } from "../utils.js";
import {
  AppRepository,
  WebflowSiteBinding
} from "./app-repository.js";

export class MemoryAppRepository implements AppRepository {
  private readonly repos = new Map<string, RepoRecord>();
  private readonly repoKeyLookup = new Map<string, string>();
  private readonly syncs = new Map<string, RepoSyncRecord>();
  private readonly pages = new Map<string, RepoPageRecord>();
  private readonly sections = new Map<string, RepoSectionRecord>();
  private readonly pagesByRepo = new Map<string, string[]>();
  private readonly sectionsByRepo = new Map<string, string[]>();
  private readonly siteBindings = new Map<string, WebflowSiteBinding>();
  private readonly sharedStyleContexts = new Map<string, SharedStyleContext>();
  private readonly siteStylePlans = new Map<string, SiteStylePlan>();
  private readonly pageMappings = new Map<string, PageMapping>();
  private readonly pageMappingsBySite = new Map<string, string[]>();
  private readonly workflowStates = new Map<string, SectionWorkflowState>();
  private readonly workflowStatesByPage = new Map<string, string[]>();
  private readonly sectionRuns = new Map<string, SectionRunRecord>();
  private readonly sectionRunsBySection = new Map<string, string[]>();
  private readonly buildJobs = new Map<string, BuildJobRecord>();
  private readonly buildResults = new Map<string, BuildResultRecord>();

  async createRepo(
    input: RepoConnectionInput & { defaultBranch: string }
  ): Promise<RepoRecord> {
    const existing = await this.getRepoByOwnerAndName(input.owner, input.name);
    if (existing) {
      return existing;
    }
    const record: RepoRecord = {
      id: stableId(input.owner, input.name),
      owner: input.owner,
      name: input.name,
      provider: "github",
      repoUrl: input.repoUrl,
      defaultBranch: input.defaultBranch,
      status: "connected",
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    this.repos.set(record.id, record);
    this.repoKeyLookup.set(`${input.owner}/${input.name}`, record.id);
    return record;
  }

  async listRepos(): Promise<RepoRecord[]> {
    return [...this.repos.values()].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt)
    );
  }

  async getRepo(repoId: string): Promise<RepoRecord | null> {
    return this.repos.get(repoId) ?? null;
  }

  async getRepoByOwnerAndName(owner: string, name: string): Promise<RepoRecord | null> {
    const repoId = this.repoKeyLookup.get(`${owner}/${name}`);
    return repoId ? (this.repos.get(repoId) ?? null) : null;
  }

  async updateRepoStatus(repoId: string, status: RepoRecord["status"]): Promise<void> {
    const repo = this.repos.get(repoId);
    if (!repo) return;
    this.repos.set(repoId, { ...repo, status, updatedAt: nowIso() });
  }

  async saveSync(sync: RepoSyncRecord): Promise<void> {
    this.syncs.set(sync.repoId, sync);
  }

  async getLatestSync(repoId: string): Promise<RepoSyncRecord | null> {
    return this.syncs.get(repoId) ?? null;
  }

  async replaceRepoIndex(
    repoId: string,
    pages: RepoPageRecord[],
    sections: RepoSectionRecord[]
  ): Promise<void> {
    const existingPageIds = this.pagesByRepo.get(repoId) ?? [];
    existingPageIds.forEach((pageId) => this.pages.delete(pageId));
    const existingSectionIds = this.sectionsByRepo.get(repoId) ?? [];
    existingSectionIds.forEach((sectionId) => this.sections.delete(sectionId));

    this.pagesByRepo.set(
      repoId,
      pages.map((page) => page.id)
    );
    this.sectionsByRepo.set(
      repoId,
      sections.map((section) => section.id)
    );
    pages.forEach((page) => this.pages.set(page.id, page));
    sections.forEach((section) => this.sections.set(section.id, section));
  }

  async getPages(repoId: string): Promise<RepoPageRecord[]> {
    return (this.pagesByRepo.get(repoId) ?? [])
      .map((pageId) => this.pages.get(pageId))
      .filter((page): page is RepoPageRecord => Boolean(page))
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }

  async getSections(repoId: string): Promise<RepoSectionRecord[]> {
    return (this.sectionsByRepo.get(repoId) ?? [])
      .map((sectionId) => this.sections.get(sectionId))
      .filter((section): section is RepoSectionRecord => Boolean(section))
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }

  async getPage(pageId: string): Promise<RepoPageRecord | null> {
    return this.pages.get(pageId) ?? null;
  }

  async getSection(sectionId: string): Promise<RepoSectionRecord | null> {
    return this.sections.get(sectionId) ?? null;
  }

  async upsertSiteBinding(input: BindSiteInput): Promise<WebflowSiteBinding> {
    const key = `${input.repoId}:${input.requestedBy}`;
    const existing = this.siteBindings.get(key);
    const binding: WebflowSiteBinding = {
      id: existing?.id ?? stableId(key, input.webflowSiteId),
      repoId: input.repoId,
      userId: input.requestedBy,
      webflowSiteId: input.webflowSiteId,
      rulesetName: input.rulesetName ?? "live-webflow-site",
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso()
    };
    this.siteBindings.set(key, binding);
    if (input.sharedStyleContext) {
      await this.saveSharedStyleContext(input.webflowSiteId, input.sharedStyleContext);
    }
    return binding;
  }

  async getSiteBinding(repoId: string, userId: string): Promise<WebflowSiteBinding | null> {
    return this.siteBindings.get(`${repoId}:${userId}`) ?? null;
  }

  async saveSharedStyleContext(
    siteId: string,
    sharedStyleContext: SharedStyleContext
  ): Promise<void> {
    this.sharedStyleContexts.set(siteId, sharedStyleContext);
  }

  async getSharedStyleContext(siteId: string): Promise<SharedStyleContext | null> {
    return this.sharedStyleContexts.get(siteId) ?? null;
  }

  async saveSiteStylePlan(plan: SiteStylePlan): Promise<void> {
    this.siteStylePlans.set(`${plan.repoId}:${plan.webflowSiteId}`, plan);
  }

  async getSiteStylePlan(
    repoId: string,
    webflowSiteId: string
  ): Promise<SiteStylePlan | null> {
    return this.siteStylePlans.get(`${repoId}:${webflowSiteId}`) ?? null;
  }

  async upsertPageMappings(input: PageMappingsUpsertInput): Promise<PageMapping[]> {
    const siteKey = `${input.requestedBy}:${input.webflowSiteId}:${input.repoId}`;
    const ids: string[] = [];
    const records = input.mappings.map((mapping) => {
      const existingId = stableId(input.repoId, input.requestedBy, mapping.webflowPageId);
      const existing = this.pageMappings.get(existingId);
      const record: PageMapping = {
        id: existingId,
        userId: input.requestedBy,
        repoId: input.repoId,
        webflowSiteId: input.webflowSiteId,
        webflowPageId: mapping.webflowPageId,
        webflowPageName: mapping.webflowPageName,
        webflowPageRoute: mapping.webflowPageRoute ?? null,
        repoPageId: mapping.repoPageId,
        createdAt: existing?.createdAt ?? nowIso(),
        updatedAt: nowIso()
      };
      this.pageMappings.set(record.id, record);
      ids.push(record.id);
      return record;
    });
    this.pageMappingsBySite.set(siteKey, ids);
    return records;
  }

  async getPageMappings(
    repoId: string,
    webflowSiteId: string,
    userId: string
  ): Promise<PageMapping[]> {
    const ids = this.pageMappingsBySite.get(`${userId}:${webflowSiteId}:${repoId}`) ?? [];
    return ids
      .map((id) => this.pageMappings.get(id))
      .filter((record): record is PageMapping => Boolean(record));
  }

  async replaceSectionWorkflowStates(
    userId: string,
    webflowSiteId: string,
    webflowPageId: string,
    repoPageId: string,
    states: Array<{ repoSectionId: string; sortOrder: number }>
  ): Promise<SectionWorkflowState[]> {
    const pageKey = `${userId}:${webflowSiteId}:${webflowPageId}:${repoPageId}`;
    const records = states.map((state) => {
      const id = stableId(userId, webflowPageId, state.repoSectionId);
      const existing = this.workflowStates.get(id);
      const record: SectionWorkflowState = {
        id,
        userId,
        webflowSiteId,
        webflowPageId,
        repoPageId,
        repoSectionId: state.repoSectionId,
        status: existing?.status ?? "not_started",
        sortOrder: state.sortOrder,
        lastRunId: existing?.lastRunId ?? null,
        createdAt: existing?.createdAt ?? nowIso(),
        updatedAt: nowIso(),
        completedAt: existing?.completedAt ?? null,
        skippedAt: existing?.skippedAt ?? null
      };
      this.workflowStates.set(id, record);
      return record;
    });
    this.workflowStatesByPage.set(
      pageKey,
      records.map((record) => record.id)
    );
    return records;
  }

  async getSectionWorkflowStates(
    userId: string,
    webflowSiteId: string,
    webflowPageId: string,
    repoPageId: string
  ): Promise<SectionWorkflowState[]> {
    const ids =
      this.workflowStatesByPage.get(
        `${userId}:${webflowSiteId}:${webflowPageId}:${repoPageId}`
      ) ?? [];
    return ids
      .map((id) => this.workflowStates.get(id))
      .filter((record): record is SectionWorkflowState => Boolean(record))
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }

  async updateSectionWorkflowState(state: SectionWorkflowState): Promise<void> {
    this.workflowStates.set(state.id, state);
  }

  async saveSectionRun(run: SectionRunRecord): Promise<void> {
    this.sectionRuns.set(run.id, run);
    const key = `${run.userId}:${run.webflowSiteId}:${run.webflowPageId}:${run.repoSectionId}`;
    const existing = this.sectionRunsBySection.get(key) ?? [];
    this.sectionRunsBySection.set(key, [...existing, run.id]);
  }

  async getLatestSectionRun(
    userId: string,
    webflowSiteId: string,
    webflowPageId: string,
    repoSectionId: string,
    runType?: SectionRunRecord["runType"]
  ): Promise<SectionRunRecord | null> {
    const key = `${userId}:${webflowSiteId}:${webflowPageId}:${repoSectionId}`;
    const ids = this.sectionRunsBySection.get(key) ?? [];
    const records = ids
      .map((id) => this.sectionRuns.get(id))
      .filter((record): record is SectionRunRecord => Boolean(record))
      .filter((record) => (runType ? record.runType === runType : true))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return records[0] ?? null;
  }

  async createBuildJob(job: BuildJobRecord): Promise<void> {
    this.buildJobs.set(job.id, job);
  }

  async getBuildJob(jobId: string): Promise<BuildJobRecord | null> {
    return this.buildJobs.get(jobId) ?? null;
  }

  async updateBuildJob(job: BuildJobRecord): Promise<void> {
    this.buildJobs.set(job.id, job);
  }

  async saveBuildResult(result: BuildResultRecord): Promise<void> {
    this.buildResults.set(result.buildJobId, result);
  }

  async getBuildResult(buildJobId: string): Promise<BuildResultRecord | null> {
    return this.buildResults.get(buildJobId) ?? null;
  }
}
