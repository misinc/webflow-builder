import { workflowPageCompleteInputSchema } from "../../../shared/contracts.js";
import { getAppServices } from "../../app.js";
import { handlePreflight } from "../cors.js";
import { handleError } from "../error.js";
import { json, parseBody } from "../json.js";
import { Handler } from "../types.js";

export const handler: Handler = async (event) => {
  const preflight = handlePreflight(event);
  if (preflight) {
    return preflight;
  }
  try {
    const input = parseBody(event, workflowPageCompleteInputSchema);
    const services = getAppServices();
    const queue = await services.workflowService.completePage(
      input.repoId,
      input.webflowSiteId,
      input.webflowPageId,
      input.requestedBy
    );
    return json(200, queue, event);
  } catch (error) {
    return handleError(error, event);
  }
};
