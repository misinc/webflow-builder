import { debugSkeletonRequestSchema } from "../../../shared/contracts.js";
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
    const input = parseBody(event, debugSkeletonRequestSchema);
    const services = getAppServices();
    const job = await services.workflowService.startDebugSkeletonJob(input);
    return json(200, job, event);
  } catch (error) {
    return handleError(error, event);
  }
};
