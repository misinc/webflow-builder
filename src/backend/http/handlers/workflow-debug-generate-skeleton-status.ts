import { getAppServices } from "../../app.js";
import { handlePreflight } from "../cors.js";
import { handleError } from "../error.js";
import { json, queryParam } from "../json.js";
import { Handler } from "../types.js";

export const handler: Handler = async (event) => {
  const preflight = handlePreflight(event);
  if (preflight) {
    return preflight;
  }
  try {
    const jobId = queryParam(event, "jobId");
    if (!jobId) {
      throw new Error("Missing jobId query parameter.");
    }
    const services = getAppServices();
    const status = await services.workflowService.getDebugSkeletonJob(jobId);
    return json(200, status, event);
  } catch (error) {
    return handleError(error, event);
  }
};
