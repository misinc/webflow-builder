import type { APIRoute } from "astro";
import { ZodError } from "zod";
import {
  bindSiteInputSchema,
  buildPlanRequestSchema,
  completeBuildJobInputSchema,
  debugSkeletonJobTriggerSchema,
  debugSkeletonRequestSchema,
  pageMappingsUpsertInputSchema,
  repoConnectionInputSchema,
  siteStylePlanRequestSchema,
  workflowSectionDecisionInputSchema,
  workflowSectionPlacementInputSchema,
  workflowSectionRequestSchema
} from "@wfb/shared/contracts.js";
import { getCloudServices } from "../../lib/cloud-services";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,x-user-id"
};

function json(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: corsHeaders
  });
}

function handleError(error: unknown) {
  if (error instanceof ZodError) {
    return json(
      {
        error: "Invalid request",
        details: error.flatten()
      },
      400
    );
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  const status = /missing|invalid|unknown|not configured/i.test(message) ? 400 : 500;
  if (status >= 500) {
    // Log full detail to Workers observability, but never leak internals
    // (raw SQL / DB driver messages) back to the extension UI.
    const errorId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}`;
    console.error(`[api-error ${errorId}]`, error);
    return json(
      { error: "Something went wrong on the server. Please retry.", errorId },
      500
    );
  }
  return json({ error: message }, status);
}

function getUserId(request: Request): string {
  const userId = request.headers.get("x-user-id");
  if (!userId) {
    throw new Error("Missing x-user-id header.");
  }
  return userId;
}

async function parseBody<T>(request: Request, schema: { parse: (input: unknown) => T }): Promise<T> {
  const body = await request.text();
  const payload = body ? (JSON.parse(body) as unknown) : {};
  return schema.parse(payload);
}

function routeMatch(pathname: string, expression: RegExp): RegExpMatchArray | null {
  return pathname.match(expression);
}

async function handleGet(request: Request, locals: App.Locals, pathname: string) {
  const services = getCloudServices(locals);
  const url = new URL(request.url);

  if (pathname === "/api/v2/bootstrap") {
    return json(await services.v2ReadService.getBootstrap());
  }

  if (pathname === "/api/v2/component-opportunities") {
    const repoId = url.searchParams.get("repoId");
    if (!repoId) {
      throw new Error("Missing repoId query parameter.");
    }
    return json(await services.v2ReadService.getComponentOpportunities(repoId));
  }

  {
    const match = routeMatch(pathname, /^\/api\/repos(?:-tree)?\/([^/]+)(?:\/tree)?$/);
    if (match && !pathname.endsWith("/sync")) {
      const repoId = decodeURIComponent(match[1] ?? "");
      if (pathname.includes("/repos/") || pathname.includes("/repos-tree/")) {
        const repo = await services.repository.getRepo(repoId);
        if (!repo) {
          throw new Error(`Unknown repo: ${repoId}`);
        }
        const [pages, sections, snapshot] = await Promise.all([
          services.repository.getPages(repoId),
          services.repository.getSections(repoId),
          services.blobStore.getJson<{ files?: Array<{ path: string; content: string }> }>(
            `repos/${repoId}/snapshots/latest.json`
          )
        ]);
        const sourceByPath = new Map(
          (snapshot?.files ?? []).map((file) => [file.path, file.content] as const)
        );
        return json({
          repo,
          pages: pages.map((page) => ({
            page: {
              ...page,
              sourceCode: sourceByPath.get(page.sourceFile)
            },
            sections: sections
              .filter((section) => section.pageId === page.id)
              .map((section) => ({
                ...section,
                sourceCode:
                  (typeof section.metadata.inlineSourceCode === "string"
                    ? section.metadata.inlineSourceCode
                    : null) ?? sourceByPath.get(section.sourceFile)
              }))
          }))
        });
      }
    }
  }

  if (pathname === "/api/debug-env-status") {
    const env = services.env;
    return json({
      // Surfaces the deployed build so the extension can detect version skew
      // between the uploaded bundle and the running backend. Set BUILD_SHA at
      // deploy time (e.g. BUILD_SHA=$(git rev-parse --short HEAD) astro build).
      buildSha: import.meta.env.BUILD_SHA ?? "unknown",
      dbBinding: true,
      githubAppId: Boolean(env.githubAppId),
      githubAppClientId: Boolean(env.githubAppClientId),
      githubAppClientSecret: Boolean(env.githubAppClientSecret),
      githubAppInstallationId: Boolean(env.githubAppInstallationId),
      githubAppInstallationToken: Boolean(env.githubAppInstallationToken),
      githubAppPrivateKey: Boolean(env.githubAppPrivateKey),
      githubAppPrivateKeyLength: env.githubAppPrivateKey?.length ?? 0,
      githubAccessToken: Boolean(env.githubAccessToken),
      localMisRepoPath: Boolean(env.localMisRepoPath),
      githubCredentialPresent: Boolean(
        (env.githubAppInstallationId &&
          env.githubAppPrivateKey &&
          (env.githubAppClientId || env.githubAppId)) ||
          env.githubAppInstallationToken ||
          env.githubAccessToken
      ),
      openAiApiKey: Boolean(env.openAiApiKey),
      canonicalWebflowSiteId: env.canonicalWebflowSiteId
    });
  }

  if (pathname === "/api/workflow/site-pages") {
    const repoId = url.searchParams.get("repoId");
    const webflowSiteId = url.searchParams.get("webflowSiteId");
    if (!repoId || !webflowSiteId) {
      throw new Error("Missing workflow site pages query parameters.");
    }
    return json({
      pages: await services.workflowService.getSitePages(
        repoId,
        webflowSiteId,
        getUserId(request)
      )
    });
  }

  if (pathname === "/api/workflow/page-mappings") {
    const repoId = url.searchParams.get("repoId");
    const webflowSiteId = url.searchParams.get("webflowSiteId");
    if (!repoId || !webflowSiteId) {
      throw new Error("Missing workflow page mapping query parameters.");
    }
    return json({
      mappings: await services.workflowService.getPageMappings(
        repoId,
        webflowSiteId,
        getUserId(request)
      )
    });
  }

  if (pathname === "/api/workflow/queue") {
    const repoId = url.searchParams.get("repoId");
    const webflowSiteId = url.searchParams.get("webflowSiteId");
    const webflowPageId = url.searchParams.get("webflowPageId");
    if (!repoId || !webflowSiteId || !webflowPageId) {
      throw new Error("Missing workflow queue query parameters.");
    }
    return json(
      await services.workflowService.getQueue(
        repoId,
        webflowSiteId,
        webflowPageId,
        getUserId(request)
      )
    );
  }

  if (pathname === "/api/workflow/site-style-plan") {
    const repoId = url.searchParams.get("repoId");
    const webflowSiteId = url.searchParams.get("webflowSiteId");
    if (!repoId || !webflowSiteId) {
      throw new Error("Missing site style plan query parameters.");
    }
    return json(
      await services.siteStylePlanService.getOrCreatePlan({
        repoId,
        webflowSiteId,
        requestedBy: getUserId(request)
      })
    );
  }

  if (pathname === "/api/workflow/debug/generate-skeleton/status") {
    const jobId = url.searchParams.get("jobId");
    if (!jobId) {
      throw new Error("Missing jobId query parameter.");
    }
    return json(await services.workflowService.getDebugSkeletonJob(jobId));
  }

  {
    const match = routeMatch(pathname, /^\/api\/build\/jobs\/([^/]+)$/);
    if (match) {
      const buildJobId = decodeURIComponent(match[1] ?? "");
      return json(await services.buildJobService.getJob(buildJobId));
    }
  }

  return json({ error: "Not found" }, 404);
}

async function handlePost(request: Request, locals: App.Locals, pathname: string) {
  const services = getCloudServices(locals);

  if (pathname === "/api/repos/connect") {
    const input = await parseBody(request, repoConnectionInputSchema);
    const connected = await services.githubClient.connectRepo(input);
    const repo = await services.repository.createRepo({
      ...input,
      defaultBranch: connected.defaultBranch
    });
    return json({ repo });
  }

  {
    const match = routeMatch(pathname, /^\/api\/repos(?:-sync)?\/([^/]+)(?:\/sync)?$/);
    if (match && (pathname.includes("/repos-sync/") || pathname.endsWith("/sync"))) {
      const repoId = decodeURIComponent(match[1] ?? "");
      return json({ sync: await services.repoSyncService.syncRepo(repoId) });
    }
  }

  if (pathname === "/api/webflow/bind-site") {
    const input = await parseBody(request, bindSiteInputSchema);
    return json({ binding: await services.siteBindingService.bindSite(input) });
  }

  if (pathname === "/api/build/plan") {
    const input = await parseBody(request, buildPlanRequestSchema);
    return json(await services.buildPlanService.createPlan(input, getUserId(request)));
  }

  if (pathname === "/api/build/jobs") {
    const input = await parseBody(request, buildPlanRequestSchema);
    return json({
      job: await services.buildJobService.createJob(input, getUserId(request))
    });
  }

  {
    const match = routeMatch(pathname, /^\/api\/build\/jobs\/([^/]+)\/complete$/);
    if (match) {
      const input = await parseBody(request, completeBuildJobInputSchema);
      return json({
        result: await services.buildJobService.completeJob(
          decodeURIComponent(match[1] ?? ""),
          input
        )
      });
    }
  }

  if (pathname === "/api/workflow/page-mappings") {
    const input = await parseBody(request, pageMappingsUpsertInputSchema);
    return json({
      mappings: await services.workflowService.upsertPageMappings(input)
    });
  }

  if (pathname === "/api/workflow/site-style-plan/rebuild") {
    return json(
      await services.siteStylePlanService.rebuildPlan(
        await parseBody(request, siteStylePlanRequestSchema)
      )
    );
  }

  if (pathname === "/api/workflow/site-style-plan/confirm") {
    return json(
      await services.siteStylePlanService.confirmPlan(
        await parseBody(request, siteStylePlanRequestSchema)
      )
    );
  }

  if (pathname === "/api/workflow/section/analyze") {
    return json(
      await services.workflowService.analyzeSection(
        await parseBody(request, workflowSectionRequestSchema)
      )
    );
  }

  if (pathname === "/api/workflow/section/generate-skeleton") {
    return json(
      await services.workflowService.generateSkeleton(
        await parseBody(request, workflowSectionRequestSchema)
      )
    );
  }

  if (pathname === "/api/workflow/debug/generate-skeleton") {
    return json(
      await services.workflowService.generateDebugSkeleton(
        await parseBody(request, debugSkeletonRequestSchema)
      )
    );
  }

  if (pathname === "/api/workflow/debug/generate-skeleton/start") {
    return json(
      await services.workflowService.startDebugSkeletonJob(
        await parseBody(request, debugSkeletonRequestSchema)
      )
    );
  }

  if (pathname === "/api/workflow/debug/generate-skeleton/background") {
    await services.workflowService.runDebugSkeletonJob(
      await parseBody(request, debugSkeletonJobTriggerSchema)
    );
    return json({ status: "accepted" }, 202);
  }

  if (pathname === "/api/workflow/section/style") {
    return json(
      await services.workflowService.styleSection(
        await parseBody(request, workflowSectionRequestSchema)
      )
    );
  }

  if (pathname === "/api/workflow/section/place-skeleton") {
    return json(
      await services.workflowService.recordSkeletonPlacement(
        await parseBody(request, workflowSectionPlacementInputSchema)
      )
    );
  }

  if (pathname === "/api/workflow/section/approve-skeleton") {
    return json(
      await services.workflowService.approveSkeleton(
        await parseBody(request, workflowSectionDecisionInputSchema)
      )
    );
  }

  if (pathname === "/api/workflow/section/verify") {
    return json(
      await services.workflowService.verifySection(
        await parseBody(request, workflowSectionRequestSchema)
      )
    );
  }

  if (pathname === "/api/workflow/section/approve") {
    return json(
      await services.workflowService.approveSection(
        await parseBody(request, workflowSectionDecisionInputSchema)
      )
    );
  }

  if (pathname === "/api/workflow/section/skip") {
    return json(
      await services.workflowService.skipSection(
        await parseBody(request, workflowSectionDecisionInputSchema)
      )
    );
  }

  if (pathname === "/api/workflow/page/complete") {
    const input = await parseBody(
      request,
      workflowSectionDecisionInputSchema.pick({
        repoId: true,
        webflowSiteId: true,
        webflowPageId: true,
        requestedBy: true
      })
    );
    return json(
      await services.workflowService.completePage(
        input.repoId,
        input.webflowSiteId,
        input.webflowPageId,
        input.requestedBy
      )
    );
  }

  return json({ error: "Not found" }, 404);
}

export const OPTIONS: APIRoute = async () =>
  new Response(null, {
    status: 204,
    headers: corsHeaders
  });

async function handleRequest(request: Request, locals: App.Locals) {
  try {
    const pathname = new URL(request.url).pathname;
    if (request.method === "GET") {
      return await handleGet(request, locals, pathname);
    }
    if (request.method === "POST") {
      return await handlePost(request, locals, pathname);
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    return json({ error: "Method not allowed" }, 405);
  } catch (error) {
    return handleError(error);
  }
}

export const GET: APIRoute = async ({ request, locals }) => handleRequest(request, locals);
export const POST: APIRoute = async ({ request, locals }) => handleRequest(request, locals);
