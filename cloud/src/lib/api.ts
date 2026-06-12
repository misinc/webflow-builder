import type { APIRoute } from "astro";

export const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,x-user-id"
};

export const edgeConfig = {
  runtime: "edge"
};

export const optionsHandler: APIRoute = async () =>
  new Response(null, {
    status: 204,
    headers: corsHeaders
  });

export function json(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: corsHeaders
  });
}
