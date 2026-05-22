import {
  BindSiteInput,
  PageMappingsUpsertInput,
  RepoConnectionInput,
  RepoRecord,
  RepoSyncRecord,
  repoTreeResponseSchema,
  SectionAnalysis,
  sectionAnalysisSchema,
  SectionVerification,
  sectionVerificationSchema,
  SharedStyleContext,
  sitePageMappingRowSchema,
  SitePageMappingRow,
  SkeletonPlan,
  skeletonPlanSchema,
  StylingPlan,
  stylingPlanSchema,
  workflowQueueResponseSchema,
  WorkflowQueueResponse,
  WorkflowSectionDecisionInput,
  WorkflowSectionRequest,
  workflowSectionRequestSchema
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

function withQuery(
  baseUrl: string,
  path: string,
  params: Record<string, string | null | undefined>
): string {
  const url = new URL(`${baseUrl}${path}`, window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
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

  async getSitePages(
    repoId: string,
    webflowSiteId: string,
    userId: string
  ): Promise<SitePageMappingRow[]> {
    const response = await request<{ pages: SitePageMappingRow[] }>(
      withQuery(this.baseUrl, "/workflow/site-pages", { repoId, webflowSiteId }),
      { method: "GET" },
      userId
    );
    return response.pages.map((row) => sitePageMappingRowSchema.parse(row));
  }

  async getPageMappings(
    repoId: string,
    webflowSiteId: string,
    userId: string
  ): Promise<SitePageMappingRow[]> {
    const response = await request<{ mappings: SitePageMappingRow[] }>(
      withQuery(this.baseUrl, "/workflow/page-mappings", { repoId, webflowSiteId }),
      { method: "GET" },
      userId
    );
    return response.mappings.map((row) => sitePageMappingRowSchema.parse(row));
  }

  async savePageMappings(input: PageMappingsUpsertInput): Promise<SitePageMappingRow[]> {
    const response = await request<{ mappings: SitePageMappingRow[] }>(
      `${this.baseUrl}/workflow/page-mappings`,
      {
        method: "POST",
        body: JSON.stringify(input)
      },
      input.requestedBy
    );
    return response.mappings.map((row) => sitePageMappingRowSchema.parse(row));
  }

  async getWorkflowQueue(
    repoId: string,
    webflowSiteId: string,
    webflowPageId: string,
    userId: string
  ): Promise<WorkflowQueueResponse> {
    const response = await request<WorkflowQueueResponse>(
      withQuery(this.baseUrl, "/workflow/queue", {
        repoId,
        webflowSiteId,
        webflowPageId
      }),
      { method: "GET" },
      userId
    );
    return workflowQueueResponseSchema.parse(response);
  }

  async analyzeSection(input: WorkflowSectionRequest): Promise<SectionAnalysis> {
    const validated = workflowSectionRequestSchema.parse(input);
    const response = await request<SectionAnalysis>(
      `${this.baseUrl}/workflow/section/analyze`,
      {
        method: "POST",
        body: JSON.stringify(validated)
      },
      input.requestedBy
    );
    return sectionAnalysisSchema.parse(response);
  }

  async generateSkeleton(input: WorkflowSectionRequest): Promise<SkeletonPlan> {
    const validated = workflowSectionRequestSchema.parse(input);
    const response = await request<SkeletonPlan>(
      `${this.baseUrl}/workflow/section/generate-skeleton`,
      {
        method: "POST",
        body: JSON.stringify(validated)
      },
      input.requestedBy
    );
    return skeletonPlanSchema.parse(response);
  }

  async styleSection(input: WorkflowSectionRequest): Promise<StylingPlan> {
    const validated = workflowSectionRequestSchema.parse(input);
    const response = await request<StylingPlan>(
      `${this.baseUrl}/workflow/section/style`,
      {
        method: "POST",
        body: JSON.stringify(validated)
      },
      input.requestedBy
    );
    return stylingPlanSchema.parse(response);
  }

  async verifySection(input: WorkflowSectionRequest): Promise<SectionVerification> {
    const validated = workflowSectionRequestSchema.parse(input);
    const response = await request<SectionVerification>(
      `${this.baseUrl}/workflow/section/verify`,
      {
        method: "POST",
        body: JSON.stringify(validated)
      },
      input.requestedBy
    );
    return sectionVerificationSchema.parse(response);
  }

  async approveSection(input: WorkflowSectionDecisionInput): Promise<WorkflowQueueResponse> {
    const response = await request<WorkflowQueueResponse>(
      `${this.baseUrl}/workflow/section/approve`,
      {
        method: "POST",
        body: JSON.stringify(input)
      },
      input.requestedBy
    );
    return workflowQueueResponseSchema.parse(response);
  }

  async skipSection(input: WorkflowSectionDecisionInput): Promise<WorkflowQueueResponse> {
    const response = await request<WorkflowQueueResponse>(
      `${this.baseUrl}/workflow/section/skip`,
      {
        method: "POST",
        body: JSON.stringify(input)
      },
      input.requestedBy
    );
    return workflowQueueResponseSchema.parse(response);
  }

  async completePage(
    input: Pick<
      WorkflowSectionDecisionInput,
      "repoId" | "webflowSiteId" | "webflowPageId" | "requestedBy"
    >
  ): Promise<WorkflowQueueResponse> {
    const response = await request<WorkflowQueueResponse>(
      `${this.baseUrl}/workflow/page/complete`,
      {
        method: "POST",
        body: JSON.stringify(input)
      },
      input.requestedBy
    );
    return workflowQueueResponseSchema.parse(response);
  }
}

export function summarizeSharedStyles(sharedStyles: SharedStyleContext): string {
  return `${sharedStyles.classes.length} classes, ${sharedStyles.variables.length} variables`;
}
