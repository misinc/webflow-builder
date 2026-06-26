CREATE TABLE IF NOT EXISTS site_style_plans (
  id TEXT PRIMARY KEY NOT NULL,
  repo_id TEXT NOT NULL,
  webflow_site_id TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  confirmed_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS site_style_plans_repo_site_idx
  ON site_style_plans (repo_id, webflow_site_id);
