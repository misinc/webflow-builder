import { HandlerEvent, HandlerResponse } from "./types.js";

const ALLOW_HEADERS = "content-type,x-user-id";
const ALLOW_METHODS = "GET,POST,OPTIONS";

export function corsHeaders(event?: HandlerEvent): Record<string, string> {
  const origin = event?.headers.origin ?? "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": ALLOW_METHODS,
    "access-control-allow-headers": ALLOW_HEADERS,
    vary: "Origin"
  };
}

export function handlePreflight(event: HandlerEvent): HandlerResponse | null {
  if (event.httpMethod.toUpperCase() !== "OPTIONS") {
    return null;
  }

  return {
    statusCode: 204,
    headers: corsHeaders(event),
    body: ""
  };
}
