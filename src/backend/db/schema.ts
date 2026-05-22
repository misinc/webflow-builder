import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp
} from "drizzle-orm/pg-core";

export const repos = pgTable("repos", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  owner: text("owner").notNull(),
  provider: text("provider").notNull(),
  repoUrl: text("repo_url").notNull(),
  defaultBranch: text("default_branch").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
});

export const repoSyncs = pgTable("repo_syncs", {
  id: text("id").primaryKey(),
  repoId: text("repo_id").notNull(),
  commitSha: text("commit_sha").notNull(),
  branch: text("branch").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  errorMessage: text("error_message")
});

export const repoPages = pgTable("repo_pages", {
  id: text("id").primaryKey(),
  repoId: text("repo_id").notNull(),
  name: text("name").notNull(),
  route: text("route").notNull(),
  sourceFile: text("source_file").notNull(),
  sortOrder: integer("sort_order").notNull(),
  metadataJson: jsonb("metadata_json").notNull()
});

export const repoSections = pgTable("repo_sections", {
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
});

export const projectRulesets = pgTable("project_rulesets", {
  id: text("id").primaryKey(),
  repoId: text("repo_id").notNull(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  rulesJson: jsonb("rules_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
});

export const webflowSiteBindings = pgTable("webflow_site_bindings", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  repoId: text("repo_id").notNull(),
  webflowSiteId: text("webflow_site_id").notNull(),
  rulesetId: text("ruleset_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
});

export const buildJobs = pgTable("build_jobs", {
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
});

export const buildResults = pgTable("build_results", {
  id: text("id").primaryKey(),
  buildJobId: text("build_job_id").notNull(),
  resultJson: jsonb("result_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});
