import {
  componentOpportunitiesResponseSchema,
  BindSiteInput,
  ComponentOpportunitiesResponse,
  debugSkeletonRequestSchema,
  debugSkeletonJobResponseSchema,
  debugSkeletonJobStartSchema,
  debugSkeletonJobTriggerSchema,
  DebugSkeletonRequest,
  DebugSkeletonJobResponse,
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
import { decideDebugSkeletonRouting } from "../../../src/shared/debug-skeleton.js";

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
    const pathname = new URL(url, window.location.origin).pathname;
    const message =
      error instanceof Error ? error.message : `Network request failed for ${pathname}`;
    throw new Error(
      message === "Failed to fetch" ? `Failed to fetch ${pathname}` : message
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

async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      window.clearTimeout(timeoutId);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
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

type ApiRuntime = "cloud" | "netlify";

const cloudRouteMap: Record<string, string> = {
  "v2-bootstrap": "/v2/bootstrap",
  "v2-component-opportunities": "/v2/component-opportunities",
  "repos-connect": "/repos/connect",
  "repos-sync": "/repos-sync",
  "repos-tree": "/repos-tree",
  "webflow-bind-site": "/webflow/bind-site",
  "workflow-site-pages": "/workflow/site-pages",
  "workflow-page-mappings-get": "/workflow/page-mappings",
  "workflow-page-mappings-post": "/workflow/page-mappings",
  "workflow-queue": "/workflow/queue",
  "workflow-section-analyze": "/workflow/section/analyze",
  "workflow-section-generate-skeleton": "/workflow/section/generate-skeleton",
  "workflow-debug-generate-skeleton": "/workflow/debug/generate-skeleton",
  "workflow-debug-generate-skeleton-start": "/workflow/debug/generate-skeleton/start",
  "workflow-debug-generate-skeleton-background":
    "/workflow/debug/generate-skeleton/background",
  "workflow-debug-generate-skeleton-status": "/workflow/debug/generate-skeleton/status",
  "workflow-section-style": "/workflow/section/style",
  "workflow-section-verify": "/workflow/section/verify",
  "workflow-section-approve": "/workflow/section/approve",
  "workflow-section-skip": "/workflow/section/skip",
  "workflow-page-complete": "/workflow/page/complete"
};

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//.test(value);
}

function resolveApiRuntime(baseUrl: string): ApiRuntime {
  const configured = import.meta.env.VITE_API_RUNTIME;
  if (configured === "cloud" || configured === "netlify") {
    return configured;
  }
  if (baseUrl.includes("/.netlify/functions")) {
    return "netlify";
  }
  return isAbsoluteHttpUrl(baseUrl) ? "cloud" : "netlify";
}

export class BackendClient {
  private readonly runtime: ApiRuntime;

  constructor(
    private readonly baseUrl =
      (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api"
  ) {
    this.runtime = resolveApiRuntime(this.baseUrl);
  }

  private get functionBaseUrl() {
    if (this.baseUrl.includes("/.netlify/functions")) {
      return stripTrailingSlash(this.baseUrl);
    }
    return stripTrailingSlash(this.baseUrl).replace(/\/api\/?$/, "/.netlify/functions");
  }

  private functionUrl(functionName: string) {
    if (this.runtime === "cloud") {
      const mappedPath = cloudRouteMap[functionName] ?? `/${functionName}`;
      return `${stripTrailingSlash(this.baseUrl)}${mappedPath}`;
    }
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

  async generateDebugSkeleton(
    input: DebugSkeletonRequest,
    signal?: AbortSignal
  ): Promise<SkeletonPlan> {
    const validated = debugSkeletonRequestSchema.parse(input);
    const routing = decideDebugSkeletonRouting(validated);
    const runSyncRequest = async () => {
      const response = await request<SkeletonPlan>(
        this.functionUrl("workflow-debug-generate-skeleton"),
        {
          method: "POST",
          body: JSON.stringify(validated)
        },
        undefined,
        signal
      );
      return skeletonPlanSchema.parse(response);
    };

    if (!routing.useBackground) {
      return runSyncRequest();
    }

    let start;
    let backgroundStartError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        start = debugSkeletonJobStartSchema.parse(
          await request(
            this.functionUrl("workflow-debug-generate-skeleton-start"),
            {
              method: "POST",
              body: JSON.stringify(validated)
            },
            undefined,
            signal
          )
        );

        await request<{ status: string }>(
          this.functionUrl("workflow-debug-generate-skeleton-background"),
          {
            method: "POST",
            body: JSON.stringify(
              debugSkeletonJobTriggerSchema.parse({
                jobId: start.jobId
              })
            )
          },
          undefined,
          signal
        );

        backgroundStartError = null;
        break;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw error;
        }
        backgroundStartError =
          error instanceof Error
            ? error
            : new Error("Background debug skeleton generation failed to start.");
      }
    }

    if (!start || backgroundStartError) {
      const reasons = routing.reasons.length > 0 ? ` (${routing.reasons.join(", ")})` : "";
      throw new Error(
        `Background debug skeleton generation could not start after 2 attempts${reasons}. ${backgroundStartError?.message ?? "No additional error details were available."}`
      );
    }

    let pollAfterMs = start.pollAfterMs;
    while (true) {
      await delay(pollAfterMs, signal);
      const status = debugSkeletonJobResponseSchema.parse(
        await request<DebugSkeletonJobResponse>(
          this.functionUrl(`workflow-debug-generate-skeleton-status?jobId=${encodeURIComponent(start.jobId)}`),
          { method: "GET" },
          undefined,
          signal
        )
      );

      if (status.status === "completed") {
        return skeletonPlanSchema.parse(status.skeleton);
      }
      if (status.status === "failed") {
        throw new Error(status.error);
      }

      pollAfterMs = status.pollAfterMs;
    }
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
