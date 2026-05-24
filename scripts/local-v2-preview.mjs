import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handler as reposTreeHandler } from "../dist/server/netlify/functions/repos-tree.js";
import { handler as v2BootstrapHandler } from "../dist/server/netlify/functions/v2-bootstrap.js";
import { handler as v2ComponentOpportunitiesHandler } from "../dist/server/netlify/functions/v2-component-opportunities.js";
import { handler as bindSiteHandler } from "../dist/server/netlify/functions/webflow-bind-site.js";
import { handler as workflowPageCompleteHandler } from "../dist/server/netlify/functions/workflow-page-complete.js";
import { handler as workflowPageMappingsGetHandler } from "../dist/server/netlify/functions/workflow-page-mappings-get.js";
import { handler as workflowPageMappingsPostHandler } from "../dist/server/netlify/functions/workflow-page-mappings-post.js";
import { handler as workflowQueueHandler } from "../dist/server/netlify/functions/workflow-queue.js";
import { handler as workflowSectionAnalyzeHandler } from "../dist/server/netlify/functions/workflow-section-analyze.js";
import { handler as workflowSectionApproveHandler } from "../dist/server/netlify/functions/workflow-section-approve.js";
import { handler as workflowSectionGenerateSkeletonHandler } from "../dist/server/netlify/functions/workflow-section-generate-skeleton.js";
import { handler as workflowSectionSkipHandler } from "../dist/server/netlify/functions/workflow-section-skip.js";
import { handler as workflowSectionStyleHandler } from "../dist/server/netlify/functions/workflow-section-style.js";
import { handler as workflowSectionVerifyHandler } from "../dist/server/netlify/functions/workflow-section-verify.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../extension/dist");
const port = Number(process.env.PORT || 8010);

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"]
]);

const routeTable = [
  {
    method: "GET",
    test: (pathname) => pathname === "/api/v2/bootstrap",
    handler: v2BootstrapHandler
  },
  {
    method: "GET",
    test: (pathname) => pathname === "/api/v2/component-opportunities",
    handler: v2ComponentOpportunitiesHandler
  },
  {
    method: "GET",
    test: (pathname) => /^\/api\/repos\/[^/]+\/tree$/.test(pathname),
    handler: reposTreeHandler
  },
  {
    method: "POST",
    test: (pathname) => pathname === "/api/webflow/bind-site",
    handler: bindSiteHandler
  },
  {
    method: "GET",
    test: (pathname) => pathname === "/api/workflow/page-mappings",
    handler: workflowPageMappingsGetHandler
  },
  {
    method: "POST",
    test: (pathname) => pathname === "/api/workflow/page-mappings",
    handler: workflowPageMappingsPostHandler
  },
  {
    method: "GET",
    test: (pathname) => pathname === "/api/workflow/queue",
    handler: workflowQueueHandler
  },
  {
    method: "POST",
    test: (pathname) => pathname === "/api/workflow/section/analyze",
    handler: workflowSectionAnalyzeHandler
  },
  {
    method: "POST",
    test: (pathname) => pathname === "/api/workflow/section/generate-skeleton",
    handler: workflowSectionGenerateSkeletonHandler
  },
  {
    method: "POST",
    test: (pathname) => pathname === "/api/workflow/section/style",
    handler: workflowSectionStyleHandler
  },
  {
    method: "POST",
    test: (pathname) => pathname === "/api/workflow/section/verify",
    handler: workflowSectionVerifyHandler
  },
  {
    method: "POST",
    test: (pathname) => pathname === "/api/workflow/section/approve",
    handler: workflowSectionApproveHandler
  },
  {
    method: "POST",
    test: (pathname) => pathname === "/api/workflow/section/skip",
    handler: workflowSectionSkipHandler
  },
  {
    method: "POST",
    test: (pathname) => pathname === "/api/workflow/page/complete",
    handler: workflowPageCompleteHandler
  }
];

function collectBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      resolve(chunks.length > 0 ? Buffer.concat(chunks).toString("utf8") : null);
    });
    request.on("error", reject);
  });
}

function headersFromRequest(request) {
  return Object.fromEntries(
    Object.entries(request.headers).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.join(",") : value
    ])
  );
}

async function handleApi(request, response, url) {
  const route = routeTable.find(
    (entry) => entry.method === request.method && entry.test(url.pathname)
  );
  if (!route) {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  const body = await collectBody(request);
  const result = await route.handler({
    httpMethod: request.method || "GET",
    headers: headersFromRequest(request),
    body,
    path: url.pathname,
    rawPath: url.pathname,
    rawUrl: url.toString()
  });

  response.writeHead(result.statusCode, result.headers || {});
  response.end(result.body);
}

async function serveStatic(response, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.resolve(distDir, `.${safePath}`);
  if (!filePath.startsWith(distDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const resolved = existsSync(filePath) ? filePath : path.join(distDir, "index.html");
  const fileStat = await stat(resolved);
  if (!fileStat.isFile()) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  const contentType = contentTypes.get(path.extname(resolved)) || "application/octet-stream";
  response.writeHead(200, { "content-type": contentType });
  createReadStream(resolved).pipe(response);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || `127.0.0.1:${port}`}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }
    await serveStatic(response, url.pathname);
  } catch (error) {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unexpected local preview error."
      })
    );
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Local V2 preview running at http://127.0.0.1:${port}`);
});
