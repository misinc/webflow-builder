import { MemoryBlobStore } from "./blob/blob-store.js";
import { getEnv } from "./env.js";
import { MisRepoExtractor } from "./extractor/mis-extractor.js";
import { createGitHubRepositoryClient } from "./github/client.js";
import { HeuristicBuildPlanner } from "./planner/heuristic-planner.js";
import { MemoryAppRepository } from "./repositories/memory-app-repository.js";
import { BuildJobService } from "./services/build-job-service.js";
import { BuildPlanService } from "./services/build-plan-service.js";
import { RepoSyncService } from "./services/repo-sync-service.js";
import { SiteBindingService } from "./services/site-binding-service.js";
import { BuildPlanValidator } from "./validation/build-plan-validator.js";

let singleton: ReturnType<typeof createServices> | null = null;

function createServices() {
  const env = getEnv();
  const repository = new MemoryAppRepository();
  const blobStore = new MemoryBlobStore();
  const extractor = new MisRepoExtractor();
  const planner = new HeuristicBuildPlanner();
  const validator = new BuildPlanValidator();
  const githubClient = createGitHubRepositoryClient(env);

  return {
    env,
    repository,
    blobStore,
    githubClient,
    extractor,
    planner,
    validator,
    repoSyncService: new RepoSyncService(
      repository,
      blobStore,
      githubClient,
      extractor
    ),
    buildPlanService: new BuildPlanService(
      repository,
      blobStore,
      extractor,
      planner,
      validator
    ),
    siteBindingService: new SiteBindingService(repository),
    buildJobService: new BuildJobService(repository)
  };
}

export function getAppServices() {
  if (!singleton) {
    singleton = createServices();
  }
  return singleton;
}
