import { getAppServices } from "../../app.js";
import { handleError } from "../error.js";
import { json, pathParam } from "../json.js";
import { Handler } from "../types.js";

export const handler: Handler = async (event) => {
  try {
    const buildJobId = pathParam(event, "id");
    const services = getAppServices();
    const job = await services.buildJobService.getJob(buildJobId);
    return json(200, job);
  } catch (error) {
    return handleError(error);
  }
};
