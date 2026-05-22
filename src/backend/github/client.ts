import fs from "node:fs/promises";
import path from "node:path";
import { RepoConnectionInput } from "../../shared/contracts.js";
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

export interface GitHubRepositoryClient {
  connectRepo(
    input: RepoConnectionInput
  ): Promise<{ defaultBranch: string; remoteId: string }>;
  fetchSnapshot(owner: string, name: string): Promise<RepositorySnapshot>;
}

function isRelevantRepoFile(filePath: string): boolean {
  return (
    /^src\/app\/pages\/.+\.(tsx|jsx|ts|js)$/.test(filePath) ||
    /^src\/app\/components\/sections\/.+\.(tsx|jsx|ts|js)$/.test(filePath) ||
    /^src\/styles\/.+\.(css|scss|ts)$/.test(filePath)
  );
}

async function readFilesRecursive(root: string): Promise<RepoFile[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files: RepoFile[] = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await readFilesRecursive(fullPath)));
      continue;
    }

    const relative = path.relative(root, fullPath);
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
}

class GitHubHttpRepositoryClient implements GitHubRepositoryClient {
  constructor(private readonly accessToken: string) {}

  private async request<T>(pathName: string): Promise<T> {
    const response = await fetch(`https://api.github.com${pathName}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.accessToken}`,
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
      const response = await fetch(blob.url, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${this.accessToken}`,
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
}

class UnsupportedGitHubClient implements GitHubRepositoryClient {
  async connectRepo(): Promise<{ defaultBranch: string; remoteId: string }> {
    throw new Error(
      "GitHub access is not configured. Set GITHUB_APP_INSTALLATION_TOKEN or LOCAL_MIS_REPO_PATH."
    );
  }

  async fetchSnapshot(): Promise<RepositorySnapshot> {
    throw new Error(
      "GitHub access is not configured. Set GITHUB_APP_INSTALLATION_TOKEN or LOCAL_MIS_REPO_PATH."
    );
  }
}

export function createGitHubRepositoryClient(config: {
  githubAccessToken?: string;
  localMisRepoPath?: string;
}): GitHubRepositoryClient {
  if (config.localMisRepoPath) {
    return new LocalFixtureGitHubClient(config.localMisRepoPath);
  }
  if (config.githubAccessToken) {
    return new GitHubHttpRepositoryClient(config.githubAccessToken);
  }
  return new UnsupportedGitHubClient();
}
