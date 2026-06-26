import {
  BuildPlan,
  BuildPlanRequest,
  SharedStyleContext
} from "@wfb/shared/contracts.js";
import { BlobStore } from "../blob/blob-store.js";
import { MisRepoExtractor } from "../extractor/mis-extractor.js";
import { RepositorySnapshot } from "../github/client.js";
import { AppRepository } from "../repositories/app-repository.js";
import { createProjectContext } from "./project-context.js";
import { HeuristicBuildPlanner } from "../planner/heuristic-planner.js";
import { BuildPlanValidator } from "../validation/build-plan-validator.js";

function emptySharedStyleContext(siteId: string): SharedStyleContext {
  return {
    siteId,
    capturedAt: new Date().toISOString(),
    classes: [],
    variables: [],
    styleIds: []
  };
}

export class BuildPlanService {
  constructor(
    private readonly repository: AppRepository,
    private readonly blobStore: BlobStore,
    private readonly extractor: MisRepoExtractor,
    private readonly planner: HeuristicBuildPlanner,
    private readonly validator: BuildPlanValidator
  ) {}

  async createPlan(
    request: BuildPlanRequest,
    userId: string
  ): Promise<BuildPlan> {
    const binding = await this.repository.getSiteBinding(request.repoId, userId);
    if (!binding) {
      throw new Error("Repo is not bound to a Webflow site for this user.");
    }
    if (binding.webflowSiteId !== request.webflowSiteId) {
      throw new Error("Requested Webflow site does not match the bound site.");
    }

    const [page, section] = await Promise.all([
      this.repository.getPage(request.pageId),
      this.repository.getSection(request.sectionId)
    ]);
    if (!page || !section) {
      throw new Error("Unknown page or section.");
    }

    const snapshot = await this.blobStore.getJson<RepositorySnapshot>(
      `repos/${request.repoId}/snapshots/latest.json`
    );
    if (!snapshot) {
      throw new Error("Repo has not been synced yet.");
    }

    const sharedStyleContext =
      request.sharedStyleContext ??
      (await this.repository.getSharedStyleContext(request.webflowSiteId)) ??
      emptySharedStyleContext(request.webflowSiteId);

    if (request.sharedStyleContext) {
      await this.repository.saveSharedStyleContext(
        request.webflowSiteId,
        request.sharedStyleContext
      );
    }

    const sectionContext = this.extractor.buildSectionContext({
      repoId: request.repoId,
      page,
      section,
      snapshot,
      sharedStyleContext
    });
    const projectContext = createProjectContext(sharedStyleContext);
    await this.blobStore.putJson(
      `repos/${request.repoId}/sections/${request.sectionId}/planner-input/latest.json`,
      {
        request,
        sectionContext,
        projectContext,
        sharedStyleContext
      }
    );

    const planned = this.planner.plan({
      pageId: request.pageId,
      sectionId: request.sectionId,
      sectionContext,
      projectContext,
      sharedStyleContext
    });
    const { validatedPlan } = this.validator.validate({
      plan: planned,
      projectContext,
      sharedStyleContext
    });
    await this.blobStore.putJson(
      `repos/${request.repoId}/sections/${request.sectionId}/plan/latest.json`,
      validatedPlan
    );

    return validatedPlan;
  }
}
