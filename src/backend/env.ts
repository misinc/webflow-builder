export interface AppEnv {
  databaseUrl?: string;
  databaseUrlUnpooled?: string;
  githubAppId?: string;
  githubAppClientId?: string;
  githubAppClientSecret?: string;
  githubAppInstallationId?: string;
  githubAppPrivateKey?: string;
  githubAccessToken?: string;
  localMisRepoPath?: string;
  canonicalWebflowSiteId: string;
}

export function getEnv(): AppEnv {
  return {
    databaseUrl: process.env.DATABASE_URL,
    databaseUrlUnpooled: process.env.DATABASE_URL_UNPOOLED,
    githubAppId: process.env.GITHUB_APP_ID,
    githubAppClientId: process.env.GITHUB_APP_CLIENT_ID,
    githubAppClientSecret: process.env.GITHUB_APP_CLIENT_SECRET,
    githubAppInstallationId: process.env.GITHUB_APP_INSTALLATION_ID,
    githubAppPrivateKey: process.env.GITHUB_APP_PRIVATE_KEY,
    githubAccessToken:
      process.env.GITHUB_APP_INSTALLATION_TOKEN ?? process.env.GITHUB_ACCESS_TOKEN,
    localMisRepoPath: process.env.LOCAL_MIS_REPO_PATH,
    canonicalWebflowSiteId:
      process.env.CANONICAL_WEBFLOW_SITE_ID ?? "6a10876cde32438bc9f52304"
  };
}
