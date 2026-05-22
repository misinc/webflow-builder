import { repoConnectionInputSchema } from "../../../shared/contracts.js";
import { getAppServices } from "../../app.js";
import { handleError } from "../error.js";
import { json, parseBody } from "../json.js";
import { Handler } from "../types.js";

export const handler: Handler = async (event) => {
  try {
    const input = parseBody(event, repoConnectionInputSchema);
    const services = getAppServices();
    const connected = await services.githubClient.connectRepo(input);
    const repo = await services.repository.createRepo({
      ...input,
      defaultBranch: connected.defaultBranch
    });
    return json(200, { repo });
  } catch (error) {
    return handleError(error);
  }
};
