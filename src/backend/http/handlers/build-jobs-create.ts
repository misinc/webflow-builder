import { buildPlanRequestSchema } from "../../../shared/contracts.js";
import { getAppServices } from "../../app.js";
import { handleError } from "../error.js";
import { json, parseBody, requireUserId } from "../json.js";
import { Handler } from "../types.js";

export const handler: Handler = async (event) => {
  try {
    const userId = requireUserId(event);
    const input = parseBody(event, buildPlanRequestSchema);
    const services = getAppServices();
    const job = await services.buildJobService.createJob(input, userId);
    return json(200, { job });
  } catch (error) {
    return handleError(error);
  }
};
