CREATE TABLE IF NOT EXISTS repos (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  owner TEXT NOT NULL,
  provider TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  default_branch TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS repos_owner_name_idx
  ON repos (owner, name);

CREATE TABLE IF NOT EXISTS repo_syncs (
  id TEXT PRIMARY KEY NOT NULL,
  repo_id TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  branch TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS repo_syncs_repo_idx
  ON repo_syncs (repo_id);

CREATE INDEX IF NOT EXISTS repo_syncs_repo_started_idx
  ON repo_syncs (repo_id, started_at);

CREATE TABLE IF NOT EXISTS repo_pages (
  id TEXT PRIMARY KEY NOT NULL,
  repo_id TEXT NOT NULL,
  name TEXT NOT NULL,
  route TEXT NOT NULL,
  source_file TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  metadata_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS repo_pages_repo_sort_idx
  ON repo_pages (repo_id, sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS repo_pages_repo_source_idx
  ON repo_pages (repo_id, source_file);

CREATE TABLE IF NOT EXISTS repo_sections (
  id TEXT PRIMARY KEY NOT NULL,
  repo_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  name TEXT NOT NULL,
  section_key TEXT NOT NULL,
  source_file TEXT NOT NULL,
  import_path TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  component_name TEXT NOT NULL,
  metadata_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS repo_sections_repo_page_sort_idx
  ON repo_sections (repo_id, page_id, sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS repo_sections_page_component_idx
  ON repo_sections (page_id, component_name);

CREATE TABLE IF NOT EXISTS app_blobs (
  key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
