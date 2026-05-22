export interface AppEnv {
  githubAccessToken?: string;
  localMisRepoPath?: string;
  canonicalWebflowSiteId: string;
}

export function getEnv(): AppEnv {
  return {
    githubAccessToken:
      process.env.GITHUB_APP_INSTALLATION_TOKEN ?? process.env.GITHUB_ACCESS_TOKEN,
    localMisRepoPath: process.env.LOCAL_MIS_REPO_PATH,
    canonicalWebflowSiteId:
      process.env.CANONICAL_WEBFLOW_SITE_ID ?? "6a10876cde32438bc9f52304"
  };
}
