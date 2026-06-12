import type { APIRoute } from "astro";
import { edgeConfig, json, optionsHandler } from "../../../lib/api";
import { getBootstrap } from "../../../lib/bootstrap";

export const config = edgeConfig;
export const OPTIONS = optionsHandler;

export const GET: APIRoute = async ({ locals }) => {
  try {
    const payload = await getBootstrap(locals);
    return json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load bootstrap.";
    return json({ error: message }, 500);
  }
};
