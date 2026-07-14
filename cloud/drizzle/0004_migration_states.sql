CREATE TABLE IF NOT EXISTS migration_states (
  site_id TEXT PRIMARY KEY NOT NULL,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
