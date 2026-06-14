import type { AppEnv } from "../backend/env.js";
import { MisRepoExtractor } from "../backend/extractor/mis-extractor.js";
import { createGitHubRepositoryClient } from "../backend/github/client.js";
import { HeuristicBuildPlanner } from "../backend/planner/heuristic-planner.js";
import { OpenAIPlanningProvider } from "../backend/planner/openai-planning-provider.js";
import { BuildJobService } from "../backend/services/build-job-service.js";
import { BuildPlanService } from "../backend/services/build-plan-service.js";
import { RepoSyncService } from "../backend/services/repo-sync-service.js";
import { SiteBindingService } from "../backend/services/site-binding-service.js";
import { V2ReadService } from "../backend/services/v2-read-service.js";
import { WorkflowService } from "../backend/services/workflow-service.js";
import { BuildPlanValidator } from "../backend/validation/build-plan-validator.js";
import { D1AppRepository } from "./d1-app-repository";
import { D1BlobStore } from "./d1-blob-store";

function toAppEnv(locals: App.Locals): AppEnv {
  const env = locals.runtime.env;
  return {
    githubAppId: env.GITHUB_APP_ID,
    githubAppClientId: env.GITHUB_APP_CLIENT_ID,
    githubAppClientSecret: env.GITHUB_APP_CLIENT_SECRET,
    githubAppInstallationId: env.GITHUB_APP_INSTALLATION_ID,
    githubAppInstallationToken: env.GITHUB_APP_INSTALLATION_TOKEN,
    githubAppPrivateKey: env.GITHUB_APP_PRIVATE_KEY,
    githubAccessToken: env.GITHUB_ACCESS_TOKEN,
    localMisRepoPath: undefined,
    canonicalWebflowSiteId: env.CANONICAL_WEBFLOW_SITE_ID ?? "6a2db2a041dabacd48068930",
    openAiApiKey: env.OPENAI_API_KEY,
    openAiModel: env.OPENAI_MODEL ?? "gpt-5.4"
  };
}

export function getCloudServices(locals: App.Locals) {
  const env = toAppEnv(locals);
  const repository = new D1AppRepository(locals);
  const blobStore = new D1BlobStore(locals);
  const extractor = new MisRepoExtractor();
  const planner = new HeuristicBuildPlanner();
  const validator = new BuildPlanValidator();
  const githubClient = createGitHubRepositoryClient(env);
  const planningProvider = new OpenAIPlanningProvider(env.openAiApiKey, env.openAiModel);

  return {
    env,
    repository,
    blobStore,
    githubClient,
    extractor,
    planner,
    validator,
    repoSyncService: new RepoSyncService(repository, blobStore, githubClient, extractor),
    buildPlanService: new BuildPlanService(
      repository,
      blobStore,
      extractor,
      planner,
      validator
    ),
    siteBindingService: new SiteBindingService(repository),
    buildJobService: new BuildJobService(repository),
    v2ReadService: new V2ReadService(repository, githubClient, env),
    workflowService: new WorkflowService(repository, blobStore, extractor, planningProvider)
  };
}
