create table if not exists public.webflow_page_mappings (
  id text primary key,
  user_id text not null,
  repo_id text not null,
  webflow_site_id text not null,
  webflow_page_id text not null,
  webflow_page_name text not null,
  webflow_page_route text,
  repo_page_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists webflow_page_mappings_repo_user_page_idx
  on public.webflow_page_mappings (repo_id, user_id, webflow_page_id);

create index if not exists webflow_page_mappings_site_user_idx
  on public.webflow_page_mappings (webflow_site_id, user_id);

create table if not exists public.section_workflow_states (
  id text primary key,
  user_id text not null,
  webflow_site_id text not null,
  webflow_page_id text not null,
  repo_page_id text not null,
  repo_section_id text not null,
  status text not null,
  sort_order integer not null,
  last_run_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  skipped_at timestamptz
);

create unique index if not exists section_workflow_states_unique_idx
  on public.section_workflow_states (user_id, webflow_page_id, repo_section_id);

create index if not exists section_workflow_states_page_idx
  on public.section_workflow_states (user_id, webflow_site_id, webflow_page_id, sort_order);

create table if not exists public.section_runs (
  id text primary key,
  user_id text not null,
  repo_id text not null,
  webflow_site_id text not null,
  webflow_page_id text not null,
  repo_page_id text not null,
  repo_section_id text not null,
  run_type text not null,
  payload_json jsonb not null,
  approval_outcome text,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create index if not exists section_runs_page_section_idx
  on public.section_runs (user_id, webflow_page_id, repo_section_id, created_at);
