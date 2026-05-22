import { getAppServices } from "../../app.js";
import { handleError } from "../error.js";
import { json, pathParam } from "../json.js";
import { Handler } from "../types.js";

export const handler: Handler = async (event) => {
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
    });
  } catch (error) {
    return handleError(error);
  }
};
