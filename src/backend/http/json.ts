import { corsHeaders } from "./cors.js";
import { ZodSchema } from "zod";
import { HandlerEvent, HandlerResponse } from "./types.js";

export function json(
  statusCode: number,
  payload: unknown,
  event?: HandlerEvent
): HandlerResponse {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      ...corsHeaders(event)
    },
    body: JSON.stringify(payload)
  };
}

export function requireUserId(event: HandlerEvent): string {
  const userId = event.headers["x-user-id"] ?? event.headers["X-User-Id"];
  if (!userId) {
    throw new Error("Missing x-user-id header.");
  }
  return userId;
}

export function parseBody<T>(event: HandlerEvent, schema: ZodSchema<T>): T {
  const body = event.body ? JSON.parse(event.body) : {};
  return schema.parse(body);
}

function findPathValue(event: HandlerEvent, segmentName: string): string | null {
  const rawPath =
    event.path ??
    event.rawPath ??
    (event.rawUrl ? new URL(event.rawUrl).pathname : undefined);
  if (!rawPath) {
    return null;
  }

  const segments = rawPath.split("/").filter(Boolean);
  const markerIndex = segments.findIndex((segment) => segment === segmentName);
  if (markerIndex === -1 || markerIndex + 1 >= segments.length) {
    return null;
  }

  return segments[markerIndex + 1] ?? null;
}

export function pathParam(event: HandlerEvent, name: string): string {
  const value = event.pathParameters?.[name];
  if (value) {
    return value;
  }

  const fallback =
    name === "repoId"
      ? findPathValue(event, "repos")
      : name === "id"
        ? findPathValue(event, "jobs")
        : null;

  if (!fallback) {
    throw new Error(`Missing path parameter: ${name}`);
  }

  return fallback;
}

export function queryParam(event: HandlerEvent, name: string): string | null {
  const rawUrl = event.rawUrl;
  if (!rawUrl) {
    return null;
  }

  return new URL(rawUrl).searchParams.get(name);
}
