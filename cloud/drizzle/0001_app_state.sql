CREATE TABLE IF NOT EXISTS project_rulesets (
  id TEXT PRIMARY KEY NOT NULL,
  repo_id TEXT NOT NULL,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  rules_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS project_rulesets_repo_version_idx
  ON project_rulesets (repo_id, version);

CREATE TABLE IF NOT EXISTS webflow_site_bindings (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  repo_id TEXT NOT NULL,
  webflow_site_id TEXT NOT NULL,
  ruleset_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS webflow_site_bindings_repo_user_idx
  ON webflow_site_bindings (repo_id, user_id);

CREATE INDEX IF NOT EXISTS webflow_site_bindings_site_idx
  ON webflow_site_bindings (webflow_site_id);

CREATE TABLE IF NOT EXISTS webflow_page_mappings (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  repo_id TEXT NOT NULL,
  webflow_site_id TEXT NOT NULL,
  webflow_page_id TEXT NOT NULL,
  webflow_page_name TEXT NOT NULL,
  webflow_page_route TEXT,
  repo_page_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS webflow_page_mappings_repo_user_page_idx
  ON webflow_page_mappings (repo_id, user_id, webflow_page_id);

CREATE INDEX IF NOT EXISTS webflow_page_mappings_site_user_idx
  ON webflow_page_mappings (webflow_site_id, user_id);

CREATE TABLE IF NOT EXISTS shared_style_contexts (
  site_id TEXT PRIMARY KEY NOT NULL,
  context_json TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS section_workflow_states (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  webflow_site_id TEXT NOT NULL,
  webflow_page_id TEXT NOT NULL,
  repo_page_id TEXT NOT NULL,
  repo_section_id TEXT NOT NULL,
  status TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  last_run_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  skipped_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS section_workflow_states_unique_idx
  ON section_workflow_states (user_id, webflow_page_id, repo_section_id);

CREATE INDEX IF NOT EXISTS section_workflow_states_page_idx
  ON section_workflow_states (user_id, webflow_site_id, webflow_page_id, sort_order);

CREATE TABLE IF NOT EXISTS section_runs (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  repo_id TEXT NOT NULL,
  webflow_site_id TEXT NOT NULL,
  webflow_page_id TEXT NOT NULL,
  repo_page_id TEXT NOT NULL,
  repo_section_id TEXT NOT NULL,
  run_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  approval_outcome TEXT,
  created_at TEXT NOT NULL,
  approved_at TEXT
);

CREATE INDEX IF NOT EXISTS section_runs_page_section_idx
  ON section_runs (user_id, webflow_page_id, repo_section_id, created_at);

CREATE TABLE IF NOT EXISTS build_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  repo_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  webflow_site_id TEXT NOT NULL,
  webflow_page_id TEXT NOT NULL,
  placement_mode TEXT NOT NULL,
  placement_target TEXT,
  status TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS build_jobs_repo_idx
  ON build_jobs (repo_id);

CREATE INDEX IF NOT EXISTS build_jobs_requested_by_idx
  ON build_jobs (requested_by);

CREATE INDEX IF NOT EXISTS build_jobs_started_at_idx
  ON build_jobs (started_at);

CREATE TABLE IF NOT EXISTS build_results (
  id TEXT PRIMARY KEY NOT NULL,
  build_job_id TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS build_results_build_job_idx
  ON build_results (build_job_id);
