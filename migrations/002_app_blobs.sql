CREATE TABLE IF NOT EXISTS public.app_blobs (
  key text PRIMARY KEY,
  value_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL
);
