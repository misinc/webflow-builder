import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { RepoConnectionInput } from "@wfb/shared/contracts.js";
import { stableId } from "../utils.js";

export interface RepoFile {
  path: string;
  content: string;
}

export interface RepositorySnapshot {
  owner: string;
  name: string;
  defaultBranch: string;
  commitSha: string;
  files: RepoFile[];
}

export interface AvailableRepository {
  owner: string;
  name: string;
  fullName: string;
  repoUrl: string;
  defaultBranch: string;
  updatedAt: string | null;
}

export interface GitHubRepositoryClient {
  connectRepo(
    input: RepoConnectionInput
  ): Promise<{ defaultBranch: string; remoteId: string }>;
  fetchSnapshot(owner: string, name: string): Promise<RepositorySnapshot>;
  listAvailableRepos(): Promise<AvailableRepository[]>;
}

interface GitHubAppCredentials {
  appId?: string;
  clientId?: string;
  installationId: string;
  privateKey: string;
}

function isRelevantRepoFile(filePath: string): boolean {
  if (/^(?:src\/)?pages\/api\//.test(filePath)) {
    return false;
  }

  return (
    /^src\/app\/pages\/.+\.(tsx|jsx|ts|js)$/.test(filePath) ||
    /^(?:src\/)?app(?:\/.+)?\/page\.(tsx|jsx|ts|js)$/.test(filePath) ||
    /^(?:src\/)?pages\/(?!_app\.|_document\.|_error\.).+\.(tsx|jsx|ts|js)$/.test(filePath) ||
    /^(?:src\/)?app\/components\/.+\.(tsx|jsx|ts|js)$/.test(filePath) ||
    /^(?:src\/)?components\/.+\.(tsx|jsx|ts|js)$/.test(filePath) ||
    /^src\/styles\/.+\.(css|scss|ts)$/.test(filePath) ||
    /^(?:src\/)?styles\/.+\.(css|scss|ts)$/.test(filePath) ||
    /^(?:src\/)?app\/.+\.(css|scss)$/.test(filePath)
  );
}

async function readFilesRecursive(
  root: string,
  baseRoot = root
): Promise<RepoFile[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files: RepoFile[] = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await readFilesRecursive(fullPath, baseRoot)));
      continue;
    }

    const relative = path.relative(baseRoot, fullPath);
    const normalized = relative.split(path.sep).join("/");
    if (!isRelevantRepoFile(normalized)) {
      continue;
    }

    files.push({
      path: normalized,
      content: await fs.readFile(fullPath, "utf8")
    });
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

class LocalFixtureGitHubClient implements GitHubRepositoryClient {
  constructor(private readonly repoRoot: string) {}

  async connectRepo(
    input: RepoConnectionInput
  ): Promise<{ defaultBranch: string; remoteId: string }> {
    return {
      defaultBranch: "main",
      remoteId: stableId(input.owner, input.name)
    };
  }

  async fetchSnapshot(owner: string, name: string): Promise<RepositorySnapshot> {
    return {
      owner,
      name,
      defaultBranch: "main",
      commitSha: stableId(owner, name, "local-snapshot"),
      files: await readFilesRecursive(this.repoRoot)
    };
  }

  async listAvailableRepos(): Promise<AvailableRepository[]> {
    const repoName = path.basename(this.repoRoot) || "local-repo";
    return [
      {
        owner: "local",
        name: repoName,
        fullName: `local/${repoName}`,
        repoUrl: pathToFileURL(this.repoRoot).toString(),
        defaultBranch: "main",
        updatedAt: null
      }
    ];
  }
}

function base64UrlEncode(value: string | Buffer): string {
  const buffer = typeof value === "string" ? Buffer.from(value) : value;
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function normalizePrivateKey(privateKey: string): string {
  return privateKey.includes("\\n") ? privateKey.replace(/\\n/g, "\n") : privateKey;
}

function createGitHubAppJwt(credentials: GitHubAppCredentials): string {
  const issuer = credentials.clientId ?? credentials.appId;
  if (!issuer) {
    throw new Error(
      "GitHub App credentials are incomplete. Set GITHUB_APP_CLIENT_ID or GITHUB_APP_ID."
    );
  }

  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60,
    exp: now + 9 * 60,
    iss: issuer
  };
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(payload)
  )}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(signingInput)
    .end()
    .sign(normalizePrivateKey(credentials.privateKey));

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

class GitHubHttpRepositoryClient implements GitHubRepositoryClient {
  constructor(private readonly getAccessToken: () => Promise<string>) {}

  private async request<T>(pathName: string): Promise<T> {
    const accessToken = await this.getAccessToken();
    const response = await fetch(`https://api.github.com${pathName}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "webflow-builder"
      }
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        `GitHub request failed (${response.status} ${response.statusText}): ${message}`
      );
    }

    return (await response.json()) as T;
  }

  async connectRepo(
    input: RepoConnectionInput
  ): Promise<{ defaultBranch: string; remoteId: string }> {
    const repo = await this.request<{ id: number; default_branch: string }>(
      `/repos/${input.owner}/${input.name}`
    );
    return {
      defaultBranch: repo.default_branch,
      remoteId: String(repo.id)
    };
  }

  async fetchSnapshot(owner: string, name: string): Promise<RepositorySnapshot> {
    const repo = await this.request<{ default_branch: string }>(
      `/repos/${owner}/${name}`
    );
    const tree = await this.request<{
      sha: string;
      tree: Array<{ path: string; type: string; url: string }>;
    }>(`/repos/${owner}/${name}/git/trees/${repo.default_branch}?recursive=1`);

    const relevantBlobs = tree.tree.filter(
      (entry) => entry.type === "blob" && isRelevantRepoFile(entry.path)
    );

    const files: RepoFile[] = [];
    for (const blob of relevantBlobs) {
      const accessToken = await this.getAccessToken();
      const response = await fetch(blob.url, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "webflow-builder"
        }
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch GitHub blob for ${blob.path}`);
      }
      const payload = (await response.json()) as {
        content: string;
        encoding: string;
      };
      const content =
        payload.encoding === "base64"
          ? Buffer.from(payload.content, "base64").toString("utf8")
          : payload.content;
      files.push({ path: blob.path, content });
    }

    return {
      owner,
      name,
      defaultBranch: repo.default_branch,
      commitSha: tree.sha,
      files: files.sort((left, right) => left.path.localeCompare(right.path))
    };
  }

  async listAvailableRepos(): Promise<AvailableRepository[]> {
    const repos = await this.request<
      Array<{
        owner?: { login?: string };
        name: string;
        full_name: string;
        html_url: string;
        default_branch: string;
        updated_at?: string;
      }>
    >("/user/repos?per_page=100&sort=updated");

    return repos.map((repo) => ({
      owner: repo.owner?.login ?? repo.full_name.split("/")[0] ?? "unknown",
      name: repo.name,
      fullName: repo.full_name,
      repoUrl: repo.html_url,
      defaultBranch: repo.default_branch,
      updatedAt: repo.updated_at ?? null
    }));
  }
}

class GitHubInstallationTokenRepositoryClient implements GitHubRepositoryClient {
  private readonly delegate: GitHubHttpRepositoryClient;

  constructor(private readonly getAccessToken: () => Promise<string>) {
    this.delegate = new GitHubHttpRepositoryClient(getAccessToken);
  }

  async connectRepo(
    input: RepoConnectionInput
  ): Promise<{ defaultBranch: string; remoteId: string }> {
    return this.delegate.connectRepo(input);
  }

  async fetchSnapshot(owner: string, name: string): Promise<RepositorySnapshot> {
    return this.delegate.fetchSnapshot(owner, name);
  }

  async listAvailableRepos(): Promise<AvailableRepository[]> {
    const accessToken = await this.getAccessToken();
    const response = await fetch(
      "https://api.github.com/installation/repositories?per_page=100",
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "webflow-builder"
        }
      }
    );

    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        `GitHub installation repositories request failed (${response.status} ${response.statusText}): ${message}`
      );
    }

    const payload = (await response.json()) as {
      repositories: Array<{
        owner?: { login?: string };
        name: string;
        full_name: string;
        html_url: string;
        default_branch: string;
        updated_at?: string;
      }>;
    };

    return payload.repositories.map((repo) => ({
      owner: repo.owner?.login ?? repo.full_name.split("/")[0] ?? "unknown",
      name: repo.name,
      fullName: repo.full_name,
      repoUrl: repo.html_url,
      defaultBranch: repo.default_branch,
      updatedAt: repo.updated_at ?? null
    }));
  }
}

class GitHubAppRepositoryClient implements GitHubRepositoryClient {
  private cachedToken:
    | {
        token: string;
        expiresAtMs: number;
      }
    | undefined;
  private readonly delegate: GitHubHttpRepositoryClient;

  constructor(private readonly credentials: GitHubAppCredentials) {
    this.delegate = new GitHubHttpRepositoryClient(async () => this.getInstallationToken());
  }

  private async getInstallationToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAtMs - now > 60_000) {
      return this.cachedToken.token;
    }

    const jwt = createGitHubAppJwt(this.credentials);
    const response = await fetch(
      `https://api.github.com/app/installations/${this.credentials.installationId}/access_tokens`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${jwt}`,
          "User-Agent": "webflow-builder"
        }
      }
    );

    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        `GitHub App installation token request failed (${response.status} ${response.statusText}): ${message}`
      );
    }

    const payload = (await response.json()) as {
      token: string;
      expires_at: string;
    };
    this.cachedToken = {
      token: payload.token,
      expiresAtMs: new Date(payload.expires_at).getTime()
    };
    return payload.token;
  }

  async connectRepo(
    input: RepoConnectionInput
  ): Promise<{ defaultBranch: string; remoteId: string }> {
    return this.delegate.connectRepo(input);
  }

  async fetchSnapshot(owner: string, name: string): Promise<RepositorySnapshot> {
    return this.delegate.fetchSnapshot(owner, name);
  }

  async listAvailableRepos(): Promise<AvailableRepository[]> {
    const accessToken = await this.getInstallationToken();
    const response = await fetch(
      "https://api.github.com/installation/repositories?per_page=100",
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "webflow-builder"
        }
      }
    );

    if (!response.ok) {
      const message = await response.text();
      throw new Error(
        `GitHub installation repositories request failed (${response.status} ${response.statusText}): ${message}`
      );
    }

    const payload = (await response.json()) as {
      repositories: Array<{
        owner?: { login?: string };
        name: string;
        full_name: string;
        html_url: string;
        default_branch: string;
        updated_at?: string;
      }>;
    };

    return payload.repositories.map((repo) => ({
      owner: repo.owner?.login ?? repo.full_name.split("/")[0] ?? "unknown",
      name: repo.name,
      fullName: repo.full_name,
      repoUrl: repo.html_url,
      defaultBranch: repo.default_branch,
      updatedAt: repo.updated_at ?? null
    }));
  }
}

class UnsupportedGitHubClient implements GitHubRepositoryClient {
  async connectRepo(): Promise<{ defaultBranch: string; remoteId: string }> {
    throw new Error(
      "GitHub access is not configured. Set GitHub App credentials, GITHUB_ACCESS_TOKEN, or LOCAL_MIS_REPO_PATH."
    );
  }

  async fetchSnapshot(): Promise<RepositorySnapshot> {
    throw new Error(
      "GitHub access is not configured. Set GitHub App credentials, GITHUB_ACCESS_TOKEN, or LOCAL_MIS_REPO_PATH."
    );
  }

  async listAvailableRepos(): Promise<AvailableRepository[]> {
    return [];
  }
}

export function createGitHubRepositoryClient(config: {
  githubAppId?: string;
  githubAppClientId?: string;
  githubAppInstallationId?: string;
  githubAppInstallationToken?: string;
  githubAppPrivateKey?: string;
  githubAccessToken?: string;
  localMisRepoPath?: string;
}): GitHubRepositoryClient {
  if (config.localMisRepoPath) {
    return new LocalFixtureGitHubClient(config.localMisRepoPath);
  }
  if (config.githubAppInstallationId && config.githubAppPrivateKey) {
    return new GitHubAppRepositoryClient({
      appId: config.githubAppId,
      clientId: config.githubAppClientId,
      installationId: config.githubAppInstallationId,
      privateKey: config.githubAppPrivateKey
    });
  }
  if (config.githubAppInstallationToken) {
    return new GitHubInstallationTokenRepositoryClient(
      async () => config.githubAppInstallationToken as string
    );
  }
  if (config.githubAccessToken) {
    return new GitHubHttpRepositoryClient(async () => config.githubAccessToken as string);
  }
  return new UnsupportedGitHubClient();
}
