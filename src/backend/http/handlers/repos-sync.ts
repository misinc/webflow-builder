import { getAppServices } from "../../app.js";
import { handlePreflight } from "../cors.js";
import { handleError } from "../error.js";
import { json, pathParam } from "../json.js";
import { Handler } from "../types.js";

export const handler: Handler = async (event) => {
  const preflight = handlePreflight(event);
  if (preflight) {
    return preflight;
  }
  try {
    const repoId = pathParam(event, "repoId");
    const services = getAppServices();
    const sync = await services.repoSyncService.syncRepo(repoId);
    return json(200, { sync }, event);
  } catch (error) {
    return handleError(error, event);
  }
};
