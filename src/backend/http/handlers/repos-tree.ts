import { getAppServices } from "../../app.js";
import { RepositorySnapshot } from "../../github/client.js";
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
    const snapshot = await services.blobStore.getJson<RepositorySnapshot>(
      `repos/${repoId}/snapshots/latest.json`
    );
    const sourceByPath = new Map(
      (snapshot?.files ?? []).map((file) => [file.path, file.content] as const)
    );
    return json(200, {
      repo,
      pages: pages.map((page) => ({
        page: {
          ...page,
          sourceCode: sourceByPath.get(page.sourceFile)
        },
        sections: sections
          .filter((section) => section.pageId === page.id)
          .map((section) => ({
            ...section,
            sourceCode: sourceByPath.get(section.sourceFile)
          }))
      }))
    }, event);
  } catch (error) {
    return handleError(error, event);
  }
};
