import { completeBuildJobInputSchema } from "../../../shared/contracts.js";
import { getAppServices } from "../../app.js";
import { handlePreflight } from "../cors.js";
import { handleError } from "../error.js";
import { json, parseBody, pathParam } from "../json.js";
import { Handler } from "../types.js";

export const handler: Handler = async (event) => {
  const preflight = handlePreflight(event);
  if (preflight) {
    return preflight;
  }
  try {
    const buildJobId = pathParam(event, "id");
    const input = parseBody(event, completeBuildJobInputSchema);
    const services = getAppServices();
    const result = await services.buildJobService.completeJob(buildJobId, input);
    return json(200, { result }, event);
  } catch (error) {
    return handleError(error, event);
  }
};
