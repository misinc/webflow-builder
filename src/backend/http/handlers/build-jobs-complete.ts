import { completeBuildJobInputSchema } from "../../../shared/contracts.js";
import { getAppServices } from "../../app.js";
import { handleError } from "../error.js";
import { json, parseBody, pathParam } from "../json.js";
import { Handler } from "../types.js";

export const handler: Handler = async (event) => {
  try {
    const buildJobId = pathParam(event, "id");
    const input = parseBody(event, completeBuildJobInputSchema);
    const services = getAppServices();
    const result = await services.buildJobService.completeJob(buildJobId, input);
    return json(200, { result });
  } catch (error) {
    return handleError(error);
  }
};
