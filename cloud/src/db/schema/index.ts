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

export const projectRulesetsTable = sqliteTable(
  "project_rulesets",
  {
    id: text("id").primaryKey(),
    repoId: text("repo_id").notNull(),
    name: text("name").notNull(),
    version: text("version").notNull(),
    rulesJson: text("rules_json").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    repoVersionIdx: uniqueIndex("project_rulesets_repo_version_idx").on(
      table.repoId,
      table.version
    )
  })
);

export const appBlobsTable = sqliteTable("app_blobs", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedAt: int("updated_at", { mode: "timestamp_ms" }).notNull()
});

export const webflowSiteBindingsTable = sqliteTable(
  "webflow_site_bindings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    repoId: text("repo_id").notNull(),
    webflowSiteId: text("webflow_site_id").notNull(),
    rulesetId: text("ruleset_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    repoUserIdx: uniqueIndex("webflow_site_bindings_repo_user_idx").on(
      table.repoId,
      table.userId
    ),
    siteIdx: index("webflow_site_bindings_site_idx").on(table.webflowSiteId)
  })
);

export const webflowPageMappingsTable = sqliteTable(
  "webflow_page_mappings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    repoId: text("repo_id").notNull(),
    webflowSiteId: text("webflow_site_id").notNull(),
    webflowPageId: text("webflow_page_id").notNull(),
    webflowPageName: text("webflow_page_name").notNull(),
    webflowPageRoute: text("webflow_page_route"),
    repoPageId: text("repo_page_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    repoUserPageIdx: uniqueIndex("webflow_page_mappings_repo_user_page_idx").on(
      table.repoId,
      table.userId,
      table.webflowPageId
    ),
    siteUserIdx: index("webflow_page_mappings_site_user_idx").on(
      table.webflowSiteId,
      table.userId
    )
  })
);

export const sharedStyleContextsTable = sqliteTable("shared_style_contexts", {
  siteId: text("site_id").primaryKey(),
  contextJson: text("context_json").notNull(),
  capturedAt: text("captured_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const siteStylePlansTable = sqliteTable(
  "site_style_plans",
  {
    id: text("id").primaryKey(),
    repoId: text("repo_id").notNull(),
    webflowSiteId: text("webflow_site_id").notNull(),
    planJson: text("plan_json").notNull(),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    confirmedAt: text("confirmed_at")
  },
  (table) => ({
    repoSiteIdx: uniqueIndex("site_style_plans_repo_site_idx").on(
      table.repoId,
      table.webflowSiteId
    )
  })
);

export const sectionWorkflowStatesTable = sqliteTable(
  "section_workflow_states",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    webflowSiteId: text("webflow_site_id").notNull(),
    webflowPageId: text("webflow_page_id").notNull(),
    repoPageId: text("repo_page_id").notNull(),
    repoSectionId: text("repo_section_id").notNull(),
    status: text("status").notNull(),
    sortOrder: int("sort_order").notNull(),
    lastRunId: text("last_run_id"),
    placedRootNodeId: text("placed_root_node_id"),
    nodeIdMapJson: text("node_id_map_json").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
    skippedAt: text("skipped_at"),
    skeletonPlacedAt: text("skeleton_placed_at"),
    skeletonApprovedAt: text("skeleton_approved_at"),
    styledAt: text("styled_at")
  },
  (table) => ({
    uniqueStateIdx: uniqueIndex("section_workflow_states_unique_idx").on(
      table.userId,
      table.webflowPageId,
      table.repoSectionId
    ),
    pageStateIdx: index("section_workflow_states_page_idx").on(
      table.userId,
      table.webflowSiteId,
      table.webflowPageId,
      table.sortOrder
    )
  })
);

export const sectionRunsTable = sqliteTable(
  "section_runs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    repoId: text("repo_id").notNull(),
    webflowSiteId: text("webflow_site_id").notNull(),
    webflowPageId: text("webflow_page_id").notNull(),
    repoPageId: text("repo_page_id").notNull(),
    repoSectionId: text("repo_section_id").notNull(),
    runType: text("run_type").notNull(),
    payloadJson: text("payload_json").notNull(),
    approvalOutcome: text("approval_outcome"),
    createdAt: text("created_at").notNull(),
    approvedAt: text("approved_at")
  },
  (table) => ({
    pageSectionRunIdx: index("section_runs_page_section_idx").on(
      table.userId,
      table.webflowPageId,
      table.repoSectionId,
      table.createdAt
    )
  })
);

export const buildJobsTable = sqliteTable(
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
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    errorMessage: text("error_message")
  },
  (table) => ({
    repoIdx: index("build_jobs_repo_idx").on(table.repoId),
    requesterIdx: index("build_jobs_requested_by_idx").on(table.requestedBy),
    startedIdx: index("build_jobs_started_at_idx").on(table.startedAt)
  })
);

export const buildResultsTable = sqliteTable(
  "build_results",
  {
    id: text("id").primaryKey(),
    buildJobId: text("build_job_id").notNull(),
    resultJson: text("result_json").notNull(),
    createdAt: text("created_at").notNull()
  },
  (table) => ({
    buildJobIdx: uniqueIndex("build_results_build_job_idx").on(table.buildJobId)
  })
);
