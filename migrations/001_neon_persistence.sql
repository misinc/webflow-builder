CREATE TABLE IF NOT EXISTS public.repos (
  id text PRIMARY KEY,
  name text NOT NULL,
  owner text NOT NULL,
  provider text NOT NULL,
  repo_url text NOT NULL,
  default_branch text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS repos_owner_name_idx
  ON public.repos (owner, name);

CREATE TABLE IF NOT EXISTS public.repo_syncs (
  id text PRIMARY KEY,
  repo_id text NOT NULL,
  commit_sha text NOT NULL,
  branch text NOT NULL,
  status text NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  error_message text
);

CREATE INDEX IF NOT EXISTS repo_syncs_repo_idx
  ON public.repo_syncs (repo_id);

CREATE INDEX IF NOT EXISTS repo_syncs_repo_started_idx
  ON public.repo_syncs (repo_id, started_at);

CREATE TABLE IF NOT EXISTS public.repo_pages (
  id text PRIMARY KEY,
  repo_id text NOT NULL,
  name text NOT NULL,
  route text NOT NULL,
  source_file text NOT NULL,
  sort_order integer NOT NULL,
  metadata_json jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS repo_pages_repo_sort_idx
  ON public.repo_pages (repo_id, sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS repo_pages_repo_source_idx
  ON public.repo_pages (repo_id, source_file);

CREATE TABLE IF NOT EXISTS public.repo_sections (
  id text PRIMARY KEY,
  repo_id text NOT NULL,
  page_id text NOT NULL,
  name text NOT NULL,
  section_key text NOT NULL,
  source_file text NOT NULL,
  import_path text NOT NULL,
  sort_order integer NOT NULL,
  component_name text NOT NULL,
  metadata_json jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS repo_sections_repo_page_sort_idx
  ON public.repo_sections (repo_id, page_id, sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS repo_sections_page_component_idx
  ON public.repo_sections (page_id, component_name);

CREATE TABLE IF NOT EXISTS public.project_rulesets (
  id text PRIMARY KEY,
  repo_id text NOT NULL,
  name text NOT NULL,
  version text NOT NULL,
  rules_json jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS project_rulesets_repo_version_idx
  ON public.project_rulesets (repo_id, version);

CREATE TABLE IF NOT EXISTS public.webflow_site_bindings (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  repo_id text NOT NULL,
  webflow_site_id text NOT NULL,
  ruleset_id text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS webflow_site_bindings_repo_user_idx
  ON public.webflow_site_bindings (repo_id, user_id);

CREATE INDEX IF NOT EXISTS webflow_site_bindings_site_idx
  ON public.webflow_site_bindings (webflow_site_id);

CREATE TABLE IF NOT EXISTS public.shared_style_contexts (
  site_id text PRIMARY KEY,
  context_json jsonb NOT NULL,
  captured_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS public.build_jobs (
  id text PRIMARY KEY,
  repo_id text NOT NULL,
  page_id text NOT NULL,
  section_id text NOT NULL,
  webflow_site_id text NOT NULL,
  webflow_page_id text NOT NULL,
  placement_mode text NOT NULL,
  placement_target text,
  status text NOT NULL,
  requested_by text NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  error_message text
);

CREATE INDEX IF NOT EXISTS build_jobs_repo_idx
  ON public.build_jobs (repo_id);

CREATE INDEX IF NOT EXISTS build_jobs_requested_by_idx
  ON public.build_jobs (requested_by);

CREATE INDEX IF NOT EXISTS build_jobs_started_at_idx
  ON public.build_jobs (started_at);

CREATE TABLE IF NOT EXISTS public.build_results (
  id text PRIMARY KEY,
  build_job_id text NOT NULL,
  result_json jsonb NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS build_results_build_job_idx
  ON public.build_results (build_job_id);
