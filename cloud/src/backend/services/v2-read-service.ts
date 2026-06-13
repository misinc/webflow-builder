import {
  ComponentOpportunitiesResponse,
  componentOpportunitiesResponseSchema,
  V2AvailableRepo,
  V2BootstrapDiagnostics,
  V2BootstrapResponse,
  v2BootstrapResponseSchema,
  V2Session,
  V2SessionAccount
} from "../../shared/contracts.js";
import { AppEnv } from "../env.js";
import {
  AvailableRepository,
  GitHubRepositoryClient
} from "../github/client.js";
import { AppRepository } from "../repositories/app-repository.js";
import { stableId } from "../utils.js";

function humanizeComponentName(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function sortIsoDesc(left: string | null, right: string | null) {
  return (right ?? "").localeCompare(left ?? "");
}

function repoSourceForAvailable(env: AppEnv): V2AvailableRepo["source"] {
  if (env.localMisRepoPath) {
    return "local-fixture";
  }
  if (env.githubAppInstallationId || env.githubAppInstallationToken || env.githubAccessToken) {
    return "installation";
  }
  return "fallback";
}

function repoAccessMode(env: AppEnv): V2BootstrapDiagnostics["repoAccessMode"] {
  if (env.localMisRepoPath) {
    return "local-repo";
  }
  if (
    (env.githubAppInstallationId && env.githubAppPrivateKey) ||
    env.githubAppInstallationToken
  ) {
    return "github-app";
  }
  if (env.githubAccessToken) {
    return "github-token";
  }
  return "none";
}

export class V2ReadService {
  constructor(
    private readonly repository: AppRepository,
    private readonly githubClient: GitHubRepositoryClient,
    private readonly env: AppEnv
  ) {}

  private buildAccounts(
    availableRepos: V2AvailableRepo[],
    storedRepos: V2AvailableRepo[]
  ): V2SessionAccount[] {
    const map = new Map<string, V2SessionAccount>();
    const allRepos = [...availableRepos, ...storedRepos];
    const defaultKind: V2SessionAccount["kind"] = this.env.localMisRepoPath
      ? "local"
      : this.env.githubAppInstallationId || this.env.githubAppInstallationToken
        ? "installation"
        : this.env.githubAccessToken
          ? "user"
          : "stored";

    for (const repo of allRepos) {
      if (map.has(repo.owner)) {
        continue;
      }
      map.set(repo.owner, {
        id: stableId("account", repo.owner),
        login: repo.owner,
        displayName: repo.owner,
        kind: defaultKind
      });
    }

    if (map.size === 0 && this.env.localMisRepoPath) {
      map.set("local", {
        id: stableId("account", "local"),
        login: "local",
        displayName: "Local repo",
        kind: "local"
      });
    }

    return [...map.values()].sort((left, right) =>
      left.displayName.localeCompare(right.displayName)
    );
  }

  private buildSession(accounts: V2SessionAccount[]): V2Session {
    const source: V2Session["source"] = this.env.localMisRepoPath
      ? "local-repo"
      : this.env.githubAppInstallationId || this.env.githubAppInstallationToken
        ? "github-app"
        : this.env.githubAccessToken
          ? "github-token"
          : accounts.length > 0
            ? "stored-repo"
            : "anonymous";
    const fallbackLogin = accounts[0]?.login ?? "webflow-builder";
    const selectedAccountId = accounts[0]?.id ?? null;

    return {
      userId: fallbackLogin,
      displayName: accounts[0]?.displayName ?? fallbackLogin,
      login: accounts[0]?.login ?? fallbackLogin,
      source,
      canListRepos: source === "github-app" || source === "github-token" || source === "local-repo",
      accounts,
      selectedAccountId
    };
  }

  async getBootstrap(): Promise<V2BootstrapResponse> {
    const storedRepoRecords = await this.repository.listRepos();
    const storedRepos = await Promise.all(
      storedRepoRecords.map(async (repo) => {
        const [latestSync, pages, sections] = await Promise.all([
          this.repository.getLatestSync(repo.id),
          this.repository.getPages(repo.id),
          this.repository.getSections(repo.id)
        ]);

        return {
          id: repo.id,
          owner: repo.owner,
          name: repo.name,
          fullName: `${repo.owner}/${repo.name}`,
          repoUrl: repo.repoUrl,
          defaultBranch: repo.defaultBranch,
          status: repo.status,
          source: "connected",
          updatedAt: repo.updatedAt,
          lastSyncedAt: latestSync?.completedAt ?? latestSync?.startedAt ?? null,
          pageCount: pages.length,
          sectionCount: sections.length
        } satisfies V2AvailableRepo;
      })
    );

    let availableRepos: AvailableRepository[] = [];
    let repoListingError: string | null = null;
    let repoListingAttempted = false;
    try {
      repoListingAttempted = true;
      availableRepos = await this.githubClient.listAvailableRepos();
    } catch (error) {
      availableRepos = [];
      repoListingError =
        error instanceof Error ? error.message : "Failed to load repositories.";
    }

    const repoMap = new Map<string, V2AvailableRepo>(
      storedRepos.map((repo) => [repo.fullName, repo] as const)
    );

    for (const repo of availableRepos) {
      if (repoMap.has(repo.fullName)) {
        continue;
      }

      repoMap.set(repo.fullName, {
        id: stableId(repo.owner, repo.name),
        owner: repo.owner,
        name: repo.name,
        fullName: repo.fullName,
        repoUrl: repo.repoUrl,
        defaultBranch: repo.defaultBranch,
        status: "available",
        source: repoSourceForAvailable(this.env),
        updatedAt: repo.updatedAt,
        lastSyncedAt: null,
        pageCount: 0,
        sectionCount: 0
      });
    }

    const repos = [...repoMap.values()].sort((left, right) => {
      const syncComparison = sortIsoDesc(left.lastSyncedAt, right.lastSyncedAt);
      if (syncComparison !== 0) {
        return syncComparison;
      }
      const updateComparison = sortIsoDesc(left.updatedAt, right.updatedAt);
      if (updateComparison !== 0) {
        return updateComparison;
      }
      return left.fullName.localeCompare(right.fullName);
    });

    const session = this.buildSession(this.buildAccounts(repos, storedRepos));
    return v2BootstrapResponseSchema.parse({
      session,
      repos,
      diagnostics: {
        repoAccessMode: repoAccessMode(this.env),
        repoListingError,
        repoListingAttempted
      }
    });
  }

  async getComponentOpportunities(
    repoId: string
  ): Promise<ComponentOpportunitiesResponse> {
    const [pages, sections] = await Promise.all([
      this.repository.getPages(repoId),
      this.repository.getSections(repoId)
    ]);
    const pageById = new Map(pages.map((page) => [page.id, page]));
    const grouped = new Map<
      string,
      {
        componentName: string;
        pageFiles: Set<string>;
        routes: Set<string>;
        instances: number;
      }
    >();

    for (const section of sections) {
      const key = `${section.componentName}:${section.sourceFile}`;
      const group = grouped.get(key) ?? {
        componentName: section.componentName,
        pageFiles: new Set<string>(),
        routes: new Set<string>(),
        instances: 0
      };
      const page = pageById.get(section.pageId);
      if (page) {
        group.pageFiles.add(page.sourceFile);
        group.routes.add(page.route);
      }
      group.instances += 1;
      grouped.set(key, group);
    }

    const opportunities = [...grouped.entries()]
      .filter(([, group]) => group.instances >= 2 && group.pageFiles.size >= 2)
      .map(([key, group]) => ({
        id: stableId(repoId, key),
        name: humanizeComponentName(group.componentName),
        componentName: group.componentName,
        confidence:
          group.instances >= 3 || group.pageFiles.size >= 3 ? "high" : "medium",
        instances: group.instances,
        files: group.pageFiles.size,
        sourceFiles: [...group.pageFiles].sort(),
        sampleRoutes: [...group.routes].sort(),
        selectedByDefault: true
      }))
      .sort((left, right) => {
        if (right.instances !== left.instances) {
          return right.instances - left.instances;
        }
        return right.files - left.files;
      });

    return componentOpportunitiesResponseSchema.parse({
      repoId,
      generatedAt: new Date().toISOString(),
      opportunities
    });
  }
}
