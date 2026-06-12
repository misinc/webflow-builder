import type { APIRoute } from "astro";
import { json, optionsHandler } from "../../../lib/api";
import { getRepoTree } from "../../../lib/repo-read";

export const config = {
  runtime: "edge"
};

export const OPTIONS = optionsHandler;

export const GET: APIRoute = async ({ locals, params }) => {
  try {
    const repoId = params.repoId;
    if (!repoId) {
      return json({ error: "Missing repoId path parameter." }, 400);
    }

    const payload = await getRepoTree(locals, repoId);
    return json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load repo tree.";
    return json({ error: message }, 500);
  }
};
