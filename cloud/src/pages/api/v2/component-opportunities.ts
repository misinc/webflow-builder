import type { APIRoute } from "astro";
import { json, optionsHandler } from "../../../lib/api";
import { getComponentOpportunities } from "../../../lib/repo-read";

export const config = {
  runtime: "edge"
};

export const OPTIONS = optionsHandler;

export const GET: APIRoute = async ({ locals, request }) => {
  try {
    const repoId = new URL(request.url).searchParams.get("repoId");
    if (!repoId) {
      return json({ error: "Missing repoId query parameter." }, 400);
    }

    const payload = await getComponentOpportunities(locals, repoId);
    return json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load component opportunities.";
    return json({ error: message }, 500);
  }
};
