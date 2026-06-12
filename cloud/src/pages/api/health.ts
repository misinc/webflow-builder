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

export const GET: APIRoute = async () =>
  Response.json(
    {
      ok: true,
      service: "webflow-builder-cloud",
      runtime: "edge"
    },
    {
      headers: corsHeaders
    }
  );
