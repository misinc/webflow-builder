import { ZodSchema } from "zod";
import { HandlerEvent, HandlerResponse } from "./types.js";

export function json(statusCode: number, payload: unknown): HandlerResponse {
  return {
    statusCode,
    headers: {
      "content-type": "application/json"
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

export function pathParam(event: HandlerEvent, name: string): string {
  const value = event.pathParameters?.[name];
  if (!value) {
    throw new Error(`Missing path parameter: ${name}`);
  }
  return value;
}
