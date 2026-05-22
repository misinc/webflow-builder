import {
  BindSiteInput,
  BuildJobRecord,
  BuildResultRecord,
  CompleteBuildJobInput,
  RepoConnectionInput,
  RepoPageRecord,
  RepoRecord,
  RepoSectionRecord,
  RepoSyncRecord,
  SharedStyleContext
} from "../../shared/contracts.js";

export interface WebflowSiteBinding {
  id: string;
  repoId: string;
  userId: string;
  webflowSiteId: string;
  rulesetName: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppRepository {
  createRepo(
    input: RepoConnectionInput & { defaultBranch: string }
  ): Promise<RepoRecord>;
  getRepo(repoId: string): Promise<RepoRecord | null>;
  getRepoByOwnerAndName(owner: string, name: string): Promise<RepoRecord | null>;
  updateRepoStatus(repoId: string, status: RepoRecord["status"]): Promise<void>;
  saveSync(sync: RepoSyncRecord): Promise<void>;
  getLatestSync(repoId: string): Promise<RepoSyncRecord | null>;
  replaceRepoIndex(
    repoId: string,
    pages: RepoPageRecord[],
    sections: RepoSectionRecord[]
  ): Promise<void>;
  getPages(repoId: string): Promise<RepoPageRecord[]>;
  getSections(repoId: string): Promise<RepoSectionRecord[]>;
  getPage(pageId: string): Promise<RepoPageRecord | null>;
  getSection(sectionId: string): Promise<RepoSectionRecord | null>;
  upsertSiteBinding(input: BindSiteInput): Promise<WebflowSiteBinding>;
  getSiteBinding(repoId: string, userId: string): Promise<WebflowSiteBinding | null>;
  saveSharedStyleContext(siteId: string, sharedStyleContext: SharedStyleContext): Promise<void>;
  getSharedStyleContext(siteId: string): Promise<SharedStyleContext | null>;
  createBuildJob(job: BuildJobRecord): Promise<void>;
  getBuildJob(jobId: string): Promise<BuildJobRecord | null>;
  updateBuildJob(job: BuildJobRecord): Promise<void>;
  saveBuildResult(result: BuildResultRecord): Promise<void>;
  getBuildResult(buildJobId: string): Promise<BuildResultRecord | null>;
}
