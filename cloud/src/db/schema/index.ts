import { index, int, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const reposTable = sqliteTable(
  "repos",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    owner: text("owner").notNull(),
    provider: text("provider").notNull(),
    repoUrl: text("repo_url").notNull(),
    defaultBranch: text("default_branch").notNull(),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    ownerNameIdx: uniqueIndex("repos_owner_name_idx").on(table.owner, table.name)
  })
);

export const repoSyncsTable = sqliteTable(
  "repo_syncs",
  {
    id: text("id").primaryKey(),
    repoId: text("repo_id").notNull(),
    commitSha: text("commit_sha").notNull(),
    branch: text("branch").notNull(),
    status: text("status").notNull(),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    errorMessage: text("error_message")
  },
  (table) => ({
    repoIdx: index("repo_syncs_repo_idx").on(table.repoId),
    repoStartedIdx: index("repo_syncs_repo_started_idx").on(table.repoId, table.startedAt)
  })
);

export const repoPagesTable = sqliteTable(
  "repo_pages",
  {
    id: text("id").primaryKey(),
    repoId: text("repo_id").notNull(),
    name: text("name").notNull(),
    route: text("route").notNull(),
    sourceFile: text("source_file").notNull(),
    sortOrder: int("sort_order").notNull(),
    metadataJson: text("metadata_json").notNull()
  },
  (table) => ({
    repoSortIdx: index("repo_pages_repo_sort_idx").on(table.repoId, table.sortOrder),
    repoSourceIdx: uniqueIndex("repo_pages_repo_source_idx").on(table.repoId, table.sourceFile)
  })
);

export const repoSectionsTable = sqliteTable(
  "repo_sections",
  {
    id: text("id").primaryKey(),
    repoId: text("repo_id").notNull(),
    pageId: text("page_id").notNull(),
    name: text("name").notNull(),
    sectionKey: text("section_key").notNull(),
    sourceFile: text("source_file").notNull(),
    importPath: text("import_path").notNull(),
    sortOrder: int("sort_order").notNull(),
    componentName: text("component_name").notNull(),
    metadataJson: text("metadata_json").notNull()
  },
  (table) => ({
    repoPageSortIdx: index("repo_sections_repo_page_sort_idx").on(
      table.repoId,
      table.pageId,
      table.sortOrder
    ),
    repoPageComponentIdx: uniqueIndex("repo_sections_page_component_idx").on(
      table.pageId,
      table.componentName
    )
  })
);

export const appBlobsTable = sqliteTable("app_blobs", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedAt: int("updated_at", { mode: "timestamp_ms" }).notNull()
});
