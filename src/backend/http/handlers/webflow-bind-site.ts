import { bindSiteInputSchema } from "../../../shared/contracts.js";
import { getAppServices } from "../../app.js";
import { handleError } from "../error.js";
import { json, parseBody } from "../json.js";
import { Handler } from "../types.js";

export const handler: Handler = async (event) => {
  try {
    const input = parseBody(event, bindSiteInputSchema);
    const services = getAppServices();
    const binding = await services.siteBindingService.bindSite(input);
    return json(200, { binding });
  } catch (error) {
    return handleError(error);
  }
};
