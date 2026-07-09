import type { AppEnv } from "@wfb/backend-core/env.js";
import { MisRepoExtractor } from "@wfb/backend-core/extractor/mis-extractor.js";
import { createGitHubRepositoryClient } from "@wfb/backend-core/github/client.js";
import { HeuristicBuildPlanner } from "@wfb/backend-core/planner/heuristic-planner.js";
import { OpenAIPlanningProvider } from "@wfb/backend-core/planner/openai-planning-provider.js";
import { BuildJobService } from "@wfb/backend-core/services/build-job-service.js";
import { BuildPlanService } from "@wfb/backend-core/services/build-plan-service.js";
import { RepoSyncService } from "@wfb/backend-core/services/repo-sync-service.js";
import { RepoTokenService } from "@wfb/backend-core/services/repo-token-service.js";
import { SiteBindingService } from "@wfb/backend-core/services/site-binding-service.js";
import { SiteStylePlanService } from "@wfb/backend-core/services/site-style-plan-service.js";
import { V2ReadService } from "@wfb/backend-core/services/v2-read-service.js";
import { WorkflowService } from "@wfb/backend-core/services/workflow-service.js";
import { BuildPlanValidator } from "@wfb/backend-core/validation/build-plan-validator.js";
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
    openAiModel: env.OPENAI_MODEL ?? "gpt-4o-mini"
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
    repoTokenService: new RepoTokenService(blobStore),
    buildPlanService: new BuildPlanService(
      repository,
      blobStore,
      extractor,
      planner,
      validator
    ),
    siteBindingService: new SiteBindingService(repository),
    siteStylePlanService: new SiteStylePlanService(repository),
    buildJobService: new BuildJobService(repository),
    v2ReadService: new V2ReadService(repository, githubClient, env),
    workflowService: new WorkflowService(repository, blobStore, extractor, planningProvider)
  };
}
