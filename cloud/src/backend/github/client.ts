import type { RepoConnectionInput } from "../../shared/contracts.js";

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
          ? decodeBase64(payload.content)
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

class UnsupportedGitHubClient implements GitHubRepositoryClient {
  async connectRepo(): Promise<{ defaultBranch: string; remoteId: string }> {
    throw new Error(
      "GitHub access is not configured for Webflow Cloud. Set GITHUB_APP_INSTALLATION_TOKEN or GITHUB_ACCESS_TOKEN."
    );
  }

  async fetchSnapshot(): Promise<RepositorySnapshot> {
    throw new Error(
      "GitHub access is not configured for Webflow Cloud. Set GITHUB_APP_INSTALLATION_TOKEN or GITHUB_ACCESS_TOKEN."
    );
  }

  async listAvailableRepos(): Promise<AvailableRepository[]> {
    return [];
  }
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

function decodeBase64(value: string): string {
  const normalized = value.replace(/\s+/g, "");
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
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
