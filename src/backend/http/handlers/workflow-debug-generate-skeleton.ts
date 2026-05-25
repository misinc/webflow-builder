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
    const skeleton = await services.workflowService.generateDebugSkeleton(input);
    return json(200, skeleton, event);
  } catch (error) {
    return handleError(error, event);
  }
};
