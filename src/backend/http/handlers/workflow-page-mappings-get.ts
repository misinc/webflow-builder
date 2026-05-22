import { getAppServices } from "../../app.js";
import { handlePreflight } from "../cors.js";
import { handleError } from "../error.js";
import { json, queryParam, requireUserId } from "../json.js";
import { Handler } from "../types.js";

export const handler: Handler = async (event) => {
  const preflight = handlePreflight(event);
  if (preflight) {
    return preflight;
  }
  try {
    const repoId = queryParam(event, "repoId");
    const webflowSiteId = queryParam(event, "webflowSiteId");
    const userId = requireUserId(event);
    if (!repoId || !webflowSiteId) {
      throw new Error("Missing repoId or webflowSiteId query parameter.");
    }
    const services = getAppServices();
    const mappings = await services.workflowService.getPageMappings(
      repoId,
      webflowSiteId,
      userId
    );
    return json(200, { mappings }, event);
  } catch (error) {
    return handleError(error, event);
  }
};
