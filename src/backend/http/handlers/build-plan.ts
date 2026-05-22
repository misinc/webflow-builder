import { buildPlanRequestSchema } from "../../../shared/contracts.js";
import { getAppServices } from "../../app.js";
import { handlePreflight } from "../cors.js";
import { handleError } from "../error.js";
import { json, parseBody, requireUserId } from "../json.js";
import { Handler } from "../types.js";

export const handler: Handler = async (event) => {
  const preflight = handlePreflight(event);
  if (preflight) {
    return preflight;
  }
  try {
    const userId = requireUserId(event);
    const input = parseBody(event, buildPlanRequestSchema);
    const services = getAppServices();
    const plan = await services.buildPlanService.createPlan(input, userId);
    return json(200, plan, event);
  } catch (error) {
    return handleError(error, event);
  }
};
