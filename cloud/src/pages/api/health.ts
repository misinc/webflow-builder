import type { APIRoute } from "astro";

export const config = {
  runtime: "edge"
};

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,OPTIONS",
  "access-control-allow-headers": "content-type,x-user-id"
};

export const OPTIONS: APIRoute = async () =>
  new Response(null, {
    status: 204,
    headers: corsHeaders
  });

const EXPECTED_SITE_ID = "6a2db2a041dabacd48068930";

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env;
  const checks = {
    dbBindingPresent: Boolean(env.DB),
    dbQuerySucceeded: false,
    canonicalWebflowSiteIdPresent: Boolean(env.CANONICAL_WEBFLOW_SITE_ID),
    canonicalWebflowSiteIdMatches:
      (env.CANONICAL_WEBFLOW_SITE_ID ?? EXPECTED_SITE_ID) === EXPECTED_SITE_ID,
    githubCredentialPresent: Boolean(
      (env.GITHUB_APP_INSTALLATION_ID &&
        env.GITHUB_APP_PRIVATE_KEY &&
        (env.GITHUB_APP_CLIENT_ID || env.GITHUB_APP_ID)) ||
        env.GITHUB_APP_INSTALLATION_TOKEN ||
        env.GITHUB_ACCESS_TOKEN
    ),
    openAiApiKeyPresent: Boolean(env.OPENAI_API_KEY)
  };

  try {
    if (env.DB) {
      await env.DB.prepare("select 1 as ok").first();
      checks.dbQuerySucceeded = true;
    }
  } catch {
    checks.dbQuerySucceeded = false;
  }

  const ready =
    checks.dbBindingPresent &&
    checks.dbQuerySucceeded &&
    checks.canonicalWebflowSiteIdMatches &&
    checks.githubCredentialPresent &&
    checks.openAiApiKeyPresent;

  return Response.json(
    {
      ok: ready,
      service: "webflow-builder-cloud",
      runtime: "edge",
      siteId: env.CANONICAL_WEBFLOW_SITE_ID ?? EXPECTED_SITE_ID,
      checks
    },
    {
      status: ready ? 200 : 503,
      headers: corsHeaders
    }
  );
};
