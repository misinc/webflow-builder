import {
  BindSiteInput,
  BuildPlan,
  BuildPlanRequest,
  BuildResultRecord,
  CompleteBuildJobInput,
  RepoConnectionInput,
  RepoRecord,
  RepoSyncRecord,
  repoTreeResponseSchema,
  SharedStyleContext,
  buildPlanSchema
} from "../../../src/shared/contracts.js";

export interface RepoTreeResponse {
  repo: RepoRecord;
  pages: Array<{
    page: {
      id: string;
      name: string;
      route: string;
      sourceFile: string;
      sortOrder: number;
      metadata: Record<string, unknown>;
    };
    sections: Array<{
      id: string;
      name: string;
      sectionKey: string;
      sourceFile: string;
      sortOrder: number;
      componentName: string;
      metadata: Record<string, unknown>;
    }>;
  }>;
}

async function request<T>(
  url: string,
  options: RequestInit,
  userId?: string
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(userId ? { "x-user-id": userId } : {}),
      ...(options.headers ?? {})
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export class BackendClient {
  constructor(
    private readonly baseUrl =
      (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api"
  ) {}

  connectRepo(input: RepoConnectionInput) {
    return request<{ repo: RepoRecord }>(
      `${this.baseUrl}/repos/connect`,
      {
        method: "POST",
        body: JSON.stringify(input)
      }
    );
  }

  syncRepo(repoId: string) {
    return request<{ sync: RepoSyncRecord }>(
      `${this.baseUrl}/repos/${repoId}/sync`,
      {
        method: "POST"
      }
    );
  }

  async getRepoTree(repoId: string): Promise<RepoTreeResponse> {
    const response = await request<RepoTreeResponse>(
      `${this.baseUrl}/repos/${repoId}/tree`,
      {
        method: "GET"
      }
    );
    return repoTreeResponseSchema.parse(response);
  }

  bindSite(input: BindSiteInput) {
    return request<{ binding: unknown }>(
      `${this.baseUrl}/webflow/bind-site`,
      {
        method: "POST",
        body: JSON.stringify(input)
      }
    );
  }

  createBuildJob(input: BuildPlanRequest, userId: string) {
    return request<{ job: { id: string } }>(
      `${this.baseUrl}/build/jobs`,
      {
        method: "POST",
        body: JSON.stringify(input)
      },
      userId
    );
  }

  async createPlan(input: BuildPlanRequest, userId: string): Promise<BuildPlan> {
    const response = await request<BuildPlan>(
      `${this.baseUrl}/build/plan`,
      {
        method: "POST",
        body: JSON.stringify(input)
      },
      userId
    );
    return buildPlanSchema.parse(response);
  }

  completeBuildJob(
    jobId: string,
    input: CompleteBuildJobInput
  ): Promise<{ result: BuildResultRecord }> {
    return request<{ result: BuildResultRecord }>(
      `${this.baseUrl}/build/jobs/${jobId}/complete`,
      {
        method: "POST",
        body: JSON.stringify(input)
      }
    );
  }

  getBuildJob(jobId: string) {
    return request<{ job: unknown; result: BuildResultRecord | null }>(
      `${this.baseUrl}/build/jobs/${jobId}`,
      {
        method: "GET"
      }
    );
  }
}

export function summarizeSharedStyles(sharedStyles: SharedStyleContext): string {
  return `${sharedStyles.classes.length} classes, ${sharedStyles.variables.length} variables`;
}
