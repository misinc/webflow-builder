import { getEnv } from "../../env.js";
import { handlePreflight } from "../cors.js";
import { json } from "../json.js";
import { Handler } from "../types.js";

export const handler: Handler = async (event) => {
  const preflight = handlePreflight(event);
  if (preflight) {
    return preflight;
  }

  const env = getEnv();
  return json(
    200,
    {
      githubAppId: Boolean(env.githubAppId),
      githubAppClientId: Boolean(env.githubAppClientId),
      githubAppClientSecret: Boolean(env.githubAppClientSecret),
      githubAppInstallationId: Boolean(env.githubAppInstallationId),
      githubAppInstallationToken: Boolean(env.githubAppInstallationToken),
      githubAppPrivateKey: Boolean(env.githubAppPrivateKey),
      githubAppPrivateKeyLength: env.githubAppPrivateKey?.length ?? 0,
      githubAccessToken: Boolean(env.githubAccessToken),
      localMisRepoPath: Boolean(env.localMisRepoPath),
      databaseUrl: Boolean(env.databaseUrl),
      databaseUrlUnpooled: Boolean(env.databaseUrlUnpooled),
      canonicalWebflowSiteId: env.canonicalWebflowSiteId
    },
    event
  );
};
