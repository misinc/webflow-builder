import { RepoSyncRecord } from "../../shared/contracts.js";
import { BlobStore } from "../blob/blob-store.js";
import { MisRepoExtractor } from "../extractor/mis-extractor.js";
import {
  GitHubRepositoryClient,
  RepositorySnapshot
} from "../github/client.js";
import { AppRepository } from "../repositories/app-repository.js";
import { nowIso, stableId } from "../utils.js";

export class RepoSyncService {
  constructor(
    private readonly repository: AppRepository,
    private readonly blobStore: BlobStore,
    private readonly githubClient: GitHubRepositoryClient,
    private readonly extractor: MisRepoExtractor
  ) {}

  async syncRepo(repoId: string): Promise<RepoSyncRecord> {
    const repo = await this.repository.getRepo(repoId);
    if (!repo) {
      throw new Error(`Unknown repo: ${repoId}`);
    }

    await this.repository.updateRepoStatus(repoId, "syncing");
    const startedAt = nowIso();
    const snapshot = await this.githubClient.fetchSnapshot(repo.owner, repo.name);
    const sync: RepoSyncRecord = {
      id: stableId(repoId, snapshot.commitSha),
      repoId,
      commitSha: snapshot.commitSha,
      branch: snapshot.defaultBranch,
      status: "completed",
      startedAt,
      completedAt: nowIso(),
      errorMessage: null
    };

    const index = this.extractor.extractRepoIndex(repoId, snapshot);
    await this.repository.replaceRepoIndex(repoId, index.pages, index.sections);
    await this.repository.saveSync(sync);
    await this.repository.updateRepoStatus(repoId, "ready");
    await this.blobStore.putJson<RepositorySnapshot>(
      `repos/${repoId}/snapshots/latest.json`,
      snapshot
    );
    await this.blobStore.putJson(
      `repos/${repoId}/syncs/${snapshot.commitSha}/tree.json`,
      index
    );
    return sync;
  }
}
