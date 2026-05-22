import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex
} from "drizzle-orm/pg-core";

export const repos = pgTable(
  "repos",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    owner: text("owner").notNull(),
    provider: text("provider").notNull(),
    repoUrl: text("repo_url").notNull(),
    defaultBranch: text("default_branch").notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => ({
    ownerNameIdx: uniqueIndex("repos_owner_name_idx").on(table.owner, table.name)
  })
);

export const repoSyncs = pgTable(
  "repo_syncs",
  {
    id: text("id").primaryKey(),
    repoId: text("repo_id").notNull(),
    commitSha: text("commit_sha").notNull(),
    branch: text("branch").notNull(),
    status: text("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorMessage: text("error_message")
  },
  (table) => ({
    repoIdx: index("repo_syncs_repo_idx").on(table.repoId),
    repoStartedIdx: index("repo_syncs_repo_started_idx").on(
      table.repoId,
      table.startedAt
    )
  })
);

export const repoPages = pgTable(
  "repo_pages",
  {
    id: text("id").primaryKey(),
    repoId: text("repo_id").notNull(),
    name: text("name").notNull(),
    route: text("route").notNull(),
    sourceFile: text("source_file").notNull(),
    sortOrder: integer("sort_order").notNull(),
    metadataJson: jsonb("metadata_json").notNull()
  },
  (table) => ({
    repoSortIdx: index("repo_pages_repo_sort_idx").on(table.repoId, table.sortOrder),
    repoSourceIdx: uniqueIndex("repo_pages_repo_source_idx").on(
      table.repoId,
      table.sourceFile
    )
  })
);

export const repoSections = pgTable(
  "repo_sections",
  {
    id: text("id").primaryKey(),
    repoId: text("repo_id").notNull(),
    pageId: text("page_id").notNull(),
    name: text("name").notNull(),
    sectionKey: text("section_key").notNull(),
    sourceFile: text("source_file").notNull(),
    importPath: text("import_path").notNull(),
    sortOrder: integer("sort_order").notNull(),
    componentName: text("component_name").notNull(),
    metadataJson: jsonb("metadata_json").notNull()
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

export const projectRulesets = pgTable(
  "project_rulesets",
  {
    id: text("id").primaryKey(),
    repoId: text("repo_id").notNull(),
    name: text("name").notNull(),
    version: text("version").notNull(),
    rulesJson: jsonb("rules_json").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => ({
    repoVersionIdx: uniqueIndex("project_rulesets_repo_version_idx").on(
      table.repoId,
      table.version
    )
  })
);

export const webflowSiteBindings = pgTable(
  "webflow_site_bindings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    repoId: text("repo_id").notNull(),
    webflowSiteId: text("webflow_site_id").notNull(),
    rulesetId: text("ruleset_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
  },
  (table) => ({
    repoUserIdx: uniqueIndex("webflow_site_bindings_repo_user_idx").on(
      table.repoId,
      table.userId
    ),
    siteIdx: index("webflow_site_bindings_site_idx").on(table.webflowSiteId)
  })
);

export const sharedStyleContexts = pgTable("shared_style_contexts", {
  siteId: text("site_id").primaryKey(),
  contextJson: jsonb("context_json").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
});

export const buildJobs = pgTable(
  "build_jobs",
  {
    id: text("id").primaryKey(),
    repoId: text("repo_id").notNull(),
    pageId: text("page_id").notNull(),
    sectionId: text("section_id").notNull(),
    webflowSiteId: text("webflow_site_id").notNull(),
    webflowPageId: text("webflow_page_id").notNull(),
    placementMode: text("placement_mode").notNull(),
    placementTarget: text("placement_target"),
    status: text("status").notNull(),
    requestedBy: text("requested_by").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorMessage: text("error_message")
  },
  (table) => ({
    repoIdx: index("build_jobs_repo_idx").on(table.repoId),
    requesterIdx: index("build_jobs_requested_by_idx").on(table.requestedBy),
    startedIdx: index("build_jobs_started_at_idx").on(table.startedAt)
  })
);

export const buildResults = pgTable(
  "build_results",
  {
    id: text("id").primaryKey(),
    buildJobId: text("build_job_id").notNull(),
    resultJson: jsonb("result_json").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (table) => ({
    buildJobIdx: uniqueIndex("build_results_build_job_idx").on(table.buildJobId)
  })
);
