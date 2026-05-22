import { ZodError } from "zod";
import { json } from "./json.js";

export function handleError(error: unknown) {
  if (error instanceof ZodError) {
    return json(400, {
      error: "Invalid request",
      details: error.flatten()
    });
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  const statusCode = /missing|invalid|unknown|not configured/i.test(message)
    ? 400
    : 500;
  return json(statusCode, { error: message });
}
