import { getAppServices } from "../../app.js";
import { handlePreflight } from "../cors.js";
import { handleError } from "../error.js";
import { json, pathParam } from "../json.js";
import { Handler } from "../types.js";

export const handler: Handler = async (event) => {
  const preflight = handlePreflight(event);
  if (preflight) {
    return preflight;
  }
  try {
    const repoId = pathParam(event, "repoId");
    const services = getAppServices();
    const repo = await services.repository.getRepo(repoId);
    if (!repo) {
      throw new Error(`Unknown repo: ${repoId}`);
    }
    const pages = await services.repository.getPages(repoId);
    const sections = await services.repository.getSections(repoId);
    return json(200, {
      repo,
      pages: pages.map((page) => ({
        page,
        sections: sections.filter((section) => section.pageId === page.id)
      }))
    }, event);
  } catch (error) {
    return handleError(error, event);
  }
};
