import {
  BuildJobRecord,
  BuildPlanRequest,
  BuildResultRecord,
  CompleteBuildJobInput
} from "@wfb/shared/contracts.js";
import { AppRepository } from "../repositories/app-repository.js";
import { nowIso, stableId } from "../utils.js";

export class BuildJobService {
  constructor(private readonly repository: AppRepository) {}

  async createJob(request: BuildPlanRequest, userId: string): Promise<BuildJobRecord> {
    const job: BuildJobRecord = {
      id: stableId(
        request.repoId,
        request.pageId,
        request.sectionId,
        request.webflowPageId,
        nowIso()
      ),
      repoId: request.repoId,
      pageId: request.pageId,
      sectionId: request.sectionId,
      webflowSiteId: request.webflowSiteId,
      webflowPageId: request.webflowPageId,
      placementMode: request.placementMode,
      placementTarget: request.placementTarget ?? null,
      status: "running",
      requestedBy: userId,
      startedAt: nowIso(),
      completedAt: null,
      errorMessage: null
    };
    await this.repository.createBuildJob(job);
    return job;
  }

  async completeJob(
    buildJobId: string,
    input: CompleteBuildJobInput
  ): Promise<BuildResultRecord> {
    const job = await this.repository.getBuildJob(buildJobId);
    if (!job) {
      throw new Error(`Unknown build job: ${buildJobId}`);
    }

    const updatedJob: BuildJobRecord = {
      ...job,
      status: input.success ? "completed" : "failed",
      completedAt: nowIso(),
      errorMessage: input.success ? null : "Build execution failed"
    };
    await this.repository.updateBuildJob(updatedJob);

    const result: BuildResultRecord = {
      id: stableId(buildJobId, "result"),
      buildJobId,
      success: input.success,
      insertedSectionName: input.insertedSectionName,
      webflowPageId: input.webflowPageId,
      reusedClasses: input.reusedClasses,
      createdClasses: input.createdClasses,
      createdNodeIds: input.createdNodeIds,
      warnings: input.warnings,
      missingAssets: input.missingAssets,
      rollbackOutcome: input.rollbackOutcome,
      createdAt: nowIso()
    };
    await this.repository.saveBuildResult(result);
    return result;
  }

  async getJob(buildJobId: string) {
    const job = await this.repository.getBuildJob(buildJobId);
    const result = await this.repository.getBuildResult(buildJobId);
    return { job, result };
  }
}
