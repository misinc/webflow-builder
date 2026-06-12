import { desc, eq, sql } from "drizzle-orm";
import type {
  V2AvailableRepo,
  V2BootstrapDiagnostics,
  V2BootstrapResponse,
  V2Session,
  V2SessionAccount
} from "../../../src/shared/contracts.js";
import { v2BootstrapResponseSchema } from "../../../src/shared/contracts.js";
import { getDb } from "../db/getDb";
import {
  repoPagesTable,
  reposTable,
  repoSectionsTable,
  repoSyncsTable
} from "../db/schema";
import { stableId } from "./ids";

function repoAccessMode(locals: App.Locals): V2BootstrapDiagnostics["repoAccessMode"] {
  const env = locals.runtime.env;
  if ((env.GITHUB_APP_INSTALLATION_ID && env.GITHUB_APP_PRIVATE_KEY) || env.GITHUB_APP_INSTALLATION_TOKEN) {
    return "github-app";
  }
  if (env.GITHUB_ACCESS_TOKEN) {
    return "github-token";
  }
  return "none";
}

function buildAccounts(repos: V2AvailableRepo[]): V2SessionAccount[] {
  const accountsByOwner = new Map<string, V2SessionAccount>();
  for (const repo of repos) {
    if (accountsByOwner.has(repo.owner)) {
      continue;
    }
    accountsByOwner.set(repo.owner, {
      id: stableId("account", repo.owner),
      login: repo.owner,
      displayName: repo.owner,
      kind: "stored"
    });
  }
  return [...accountsByOwner.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName)
  );
}

function buildSession(
  locals: App.Locals,
  accounts: V2SessionAccount[]
): V2Session {
  const accessMode = repoAccessMode(locals);
  const fallbackLogin = accounts[0]?.login ?? "webflow-builder";
  return {
    userId: fallbackLogin,
    displayName: accounts[0]?.displayName ?? fallbackLogin,
    login: accounts[0]?.login ?? fallbackLogin,
    source:
      accessMode === "github-app"
        ? "github-app"
        : accessMode === "github-token"
          ? "github-token"
          : accounts.length > 0
            ? "stored-repo"
            : "anonymous",
    canListRepos: false,
    accounts,
    selectedAccountId: accounts[0]?.id ?? null
  };
}

export async function getBootstrap(locals: App.Locals): Promise<V2BootstrapResponse> {
  const db = getDb(locals);
  const repoRows = await db.select().from(reposTable).orderBy(desc(reposTable.updatedAt));

  const repos = await Promise.all(
    repoRows.map(async (repo) => {
      const [latestSync, pageCountRow, sectionCountRow] = await Promise.all([
        db.query.repoSyncsTable.findFirst({
          where: eq(repoSyncsTable.repoId, repo.id),
          orderBy: [desc(repoSyncsTable.startedAt)]
        }),
        db
          .select({ count: sql<number>`count(*)` })
          .from(repoPagesTable)
          .where(eq(repoPagesTable.repoId, repo.id)),
        db
          .select({ count: sql<number>`count(*)` })
          .from(repoSectionsTable)
          .where(eq(repoSectionsTable.repoId, repo.id))
      ]);

      return {
        id: repo.id,
        owner: repo.owner,
        name: repo.name,
        fullName: `${repo.owner}/${repo.name}`,
        repoUrl: repo.repoUrl,
        defaultBranch: repo.defaultBranch,
        status: repo.status as V2AvailableRepo["status"],
        source: "connected",
        updatedAt: repo.updatedAt,
        lastSyncedAt: latestSync?.completedAt ?? latestSync?.startedAt ?? null,
        pageCount: Number(pageCountRow[0]?.count ?? 0),
        sectionCount: Number(sectionCountRow[0]?.count ?? 0)
      } satisfies V2AvailableRepo;
    })
  );

  const accounts = buildAccounts(repos);
  return v2BootstrapResponseSchema.parse({
    session: buildSession(locals, accounts),
    repos,
    diagnostics: {
      repoAccessMode: repoAccessMode(locals),
      repoListingError: null,
      repoListingAttempted: false
    }
  });
}
