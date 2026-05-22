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
    const webflowPageId = queryParam(event, "webflowPageId");
    const userId = requireUserId(event);
    if (!repoId || !webflowSiteId || !webflowPageId) {
      throw new Error("Missing workflow queue query parameters.");
    }
    const services = getAppServices();
    const queue = await services.workflowService.getQueue(
      repoId,
      webflowSiteId,
      webflowPageId,
      userId
    );
    return json(200, queue, event);
  } catch (error) {
    return handleError(error, event);
  }
};
