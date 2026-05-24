import { getAppServices } from "../../app.js";
import { handlePreflight } from "../cors.js";
import { handleError } from "../error.js";
import { json } from "../json.js";
import { Handler } from "../types.js";

export const handler: Handler = async (event) => {
  const preflight = handlePreflight(event);
  if (preflight) {
    return preflight;
  }

  try {
    const services = getAppServices();
    const payload = await services.v2ReadService.getBootstrap();
    return json(200, payload, event);
  } catch (error) {
    return handleError(error, event);
  }
};
