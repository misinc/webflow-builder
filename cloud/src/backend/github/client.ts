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

interface GitHubAppCredentials {
  appId?: string;
  clientId?: string;
  installationId: string;
  privateKey: string;
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

    const jwt = await createGitHubAppJwt(this.credentials);
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
      "GitHub access is not configured for Webflow Cloud. Set GITHUB_APP_INSTALLATION_TOKEN or GITHUB_ACCESS_TOKEN."
    );
  }

  async fetchSnapshot(): Promise<RepositorySnapshot> {
    throw new Error(
      "GitHub access is not configured for Webflow Cloud. Set GITHUB_APP_INSTALLATION_TOKEN or GITHUB_ACCESS_TOKEN."
    );
  }

  async listAvailableRepos(): Promise<AvailableRepository[]> {
    throw new Error(
      "GitHub access is not configured for Webflow Cloud. Set GITHUB_APP_INSTALLATION_TOKEN or GITHUB_ACCESS_TOKEN."
    );
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

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncodeText(value: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function normalizePrivateKey(privateKey: string): string {
  const trimmed = privateKey.trim().replace(/^(['"])([\s\S]*)\1$/, "$2");
  return trimmed.replace(/\\r/g, "\r").replace(/\\n/g, "\n");
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function encodeDerLength(length: number): Uint8Array {
  if (length < 0x80) {
    return Uint8Array.of(length);
  }

  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>= 8;
  }
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

function encodeDer(tag: number, value: Uint8Array): Uint8Array {
  return concatBytes(Uint8Array.of(tag), encodeDerLength(value.length), value);
}

function convertPkcs1RsaToPkcs8(pkcs1Bytes: Uint8Array): Uint8Array {
  const version = encodeDer(0x02, Uint8Array.of(0x00));
  const rsaEncryptionOid = encodeDer(
    0x06,
    Uint8Array.of(0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01)
  );
  const algorithmIdentifier = encodeDer(
    0x30,
    concatBytes(rsaEncryptionOid, encodeDer(0x05, new Uint8Array()))
  );
  const privateKeyOctetString = encodeDer(0x04, pkcs1Bytes);
  return encodeDer(
    0x30,
    concatBytes(version, algorithmIdentifier, privateKeyOctetString)
  );
}

function decodeBase64Bytes(value: string, context: string): Uint8Array {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new Error(
      `${context} is not valid base64. Re-save GITHUB_APP_PRIVATE_KEY as the raw PEM contents.`
    );
  }
}

function pemToPkcs8Bytes(privateKey: string): Uint8Array {
  const normalizedPem = normalizePrivateKey(privateKey);
  const hasPkcs1Headers =
    normalizedPem.includes("-----BEGIN RSA PRIVATE KEY-----") &&
    normalizedPem.includes("-----END RSA PRIVATE KEY-----");
  const hasPkcs8Headers =
    normalizedPem.includes("-----BEGIN PRIVATE KEY-----") &&
    normalizedPem.includes("-----END PRIVATE KEY-----");

  if (!hasPkcs1Headers && !hasPkcs8Headers) {
    throw new Error(
      "GITHUB_APP_PRIVATE_KEY must include a full PEM block with BEGIN/END PRIVATE KEY markers."
    );
  }

  const base64Payload = normalizedPem
    .replace(/-----BEGIN RSA PRIVATE KEY-----/g, "")
    .replace(/-----END RSA PRIVATE KEY-----/g, "")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");

  if (!base64Payload) {
    throw new Error("GITHUB_APP_PRIVATE_KEY is empty after PEM normalization.");
  }

  const keyBytes = decodeBase64Bytes(base64Payload, "GITHUB_APP_PRIVATE_KEY");
  return hasPkcs1Headers ? convertPkcs1RsaToPkcs8(keyBytes) : keyBytes;
}

async function createGitHubAppJwt(credentials: GitHubAppCredentials): Promise<string> {
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
  const signingInput = `${base64UrlEncodeText(JSON.stringify(header))}.${base64UrlEncodeText(
    JSON.stringify(payload)
  )}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8Bytes(credentials.privateKey),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
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
