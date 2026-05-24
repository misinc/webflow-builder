import {
  componentOpportunitiesResponseSchema,
  BindSiteInput,
  ComponentOpportunitiesResponse,
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
  V2BootstrapResponse,
  v2BootstrapResponseSchema,
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
      sourceCode?: string;
      sortOrder: number;
      metadata: Record<string, unknown>;
    };
    sections: Array<{
      id: string;
      name: string;
      sectionKey: string;
      sourceFile: string;
      sourceCode?: string;
      sortOrder: number;
      componentName: string;
      metadata: Record<string, unknown>;
    }>;
  }>;
}

async function request<T>(
  url: string,
  options: RequestInit,
  userId?: string,
  signal?: AbortSignal
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      signal,
      headers: {
        "content-type": "application/json",
        ...(userId ? { "x-user-id": userId } : {}),
        ...(options.headers ?? {})
      }
    });
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : `Network request failed for ${new URL(url).pathname}`
    );
  }

  if (!response.ok) {
    const body = await response.text();
    let message = body || `Request failed: ${response.status}`;
    try {
      const payload = JSON.parse(body) as {
        error?: string;
        details?: {
          formErrors?: string[];
          fieldErrors?: Record<string, string[]>;
        };
      };
      const formError = payload.details?.formErrors?.find(Boolean);
      const fieldError = payload.details?.fieldErrors
        ? Object.values(payload.details.fieldErrors).flat().find(Boolean)
        : null;
      message =
        formError ??
        fieldError ??
        payload.error ??
        message;
    } catch {}
    throw new Error(message);
  }

  return (await response.json()) as T;
}

function withQuery(urlString: string, params: Record<string, string | null | undefined>): string {
  const url = new URL(urlString, window.location.origin);
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

  private get functionBaseUrl() {
    return this.baseUrl.replace(/\/api\/?$/, "/.netlify/functions");
  }

  private functionUrl(functionName: string) {
    return `${this.functionBaseUrl}/${functionName}`;
  }

  async getV2Bootstrap(): Promise<V2BootstrapResponse> {
    const response = await request<V2BootstrapResponse>(
      this.functionUrl("v2-bootstrap"),
      { method: "GET" }
    );
    return v2BootstrapResponseSchema.parse(response);
  }

  async getComponentOpportunities(
    repoId: string
  ): Promise<ComponentOpportunitiesResponse> {
    const response = await request<ComponentOpportunitiesResponse>(
      withQuery(this.functionUrl("v2-component-opportunities"), { repoId }),
      { method: "GET" }
    );
    return componentOpportunitiesResponseSchema.parse(response);
  }

  connectRepo(input: RepoConnectionInput) {
    return request<{ repo: RepoRecord }>(
      this.functionUrl("repos-connect"),
      {
        method: "POST",
        body: JSON.stringify(input)
      }
    );
  }

  syncRepo(repoId: string) {
    return request<{ sync: RepoSyncRecord }>(
      `${this.functionUrl("repos-sync")}/${repoId}`,
      {
        method: "POST"
      }
    );
  }

  async getRepoTree(repoId: string): Promise<RepoTreeResponse> {
    const response = await request<RepoTreeResponse>(
      `${this.functionUrl("repos-tree")}/${repoId}`,
      {
        method: "GET"
      }
    );
    return repoTreeResponseSchema.parse(response);
  }

  bindSite(input: BindSiteInput) {
    return request<{ binding: unknown }>(
      this.functionUrl("webflow-bind-site"),
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
      withQuery(this.functionUrl("workflow-site-pages"), { repoId, webflowSiteId }),
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
      withQuery(this.functionUrl("workflow-page-mappings-get"), {
        repoId,
        webflowSiteId
      }),
      { method: "GET" },
      userId
    );
    return response.mappings.map((row) => sitePageMappingRowSchema.parse(row));
  }

  async savePageMappings(input: PageMappingsUpsertInput): Promise<SitePageMappingRow[]> {
    const response = await request<{ mappings: SitePageMappingRow[] }>(
      this.functionUrl("workflow-page-mappings-post"),
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
      withQuery(this.functionUrl("workflow-queue"), {
        repoId,
        webflowSiteId,
        webflowPageId
      }),
      { method: "GET" },
      userId
    );
    return workflowQueueResponseSchema.parse(response);
  }

  async analyzeSection(
    input: WorkflowSectionRequest,
    signal?: AbortSignal
  ): Promise<SectionAnalysis> {
    const validated = workflowSectionRequestSchema.parse(input);
    const response = await request<SectionAnalysis>(
      this.functionUrl("workflow-section-analyze"),
      {
        method: "POST",
        body: JSON.stringify(validated)
      },
      input.requestedBy,
      signal
    );
    return sectionAnalysisSchema.parse(response);
  }

  async generateSkeleton(
    input: WorkflowSectionRequest,
    signal?: AbortSignal
  ): Promise<SkeletonPlan> {
    const validated = workflowSectionRequestSchema.parse(input);
    const response = await request<SkeletonPlan>(
      this.functionUrl("workflow-section-generate-skeleton"),
      {
        method: "POST",
        body: JSON.stringify(validated)
      },
      input.requestedBy,
      signal
    );
    return skeletonPlanSchema.parse(response);
  }

  async styleSection(
    input: WorkflowSectionRequest,
    signal?: AbortSignal
  ): Promise<StylingPlan> {
    const validated = workflowSectionRequestSchema.parse(input);
    const response = await request<StylingPlan>(
      this.functionUrl("workflow-section-style"),
      {
        method: "POST",
        body: JSON.stringify(validated)
      },
      input.requestedBy,
      signal
    );
    return stylingPlanSchema.parse(response);
  }

  async verifySection(
    input: WorkflowSectionRequest,
    signal?: AbortSignal
  ): Promise<SectionVerification> {
    const validated = workflowSectionRequestSchema.parse(input);
    const response = await request<SectionVerification>(
      this.functionUrl("workflow-section-verify"),
      {
        method: "POST",
        body: JSON.stringify(validated)
      },
      input.requestedBy,
      signal
    );
    return sectionVerificationSchema.parse(response);
  }

  async approveSection(input: WorkflowSectionDecisionInput): Promise<WorkflowQueueResponse> {
    const response = await request<WorkflowQueueResponse>(
      this.functionUrl("workflow-section-approve"),
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
      this.functionUrl("workflow-section-skip"),
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
      this.functionUrl("workflow-page-complete"),
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
