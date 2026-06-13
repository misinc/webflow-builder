type SourceRow = Record<string, unknown>;

export type TableConfig = {
  name: string;
  selectSql: string;
  insertColumns: string[];
  normalizeRow: (row: SourceRow) => unknown[];
};

function normalizeJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}

function normalizeIso(value: unknown): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    return value;
  }
  return new Date(String(value)).toISOString();
}

export const TABLES: TableConfig[] = [
  {
    name: "repos",
    selectSql: `
      select id, name, owner, provider, repo_url, default_branch, status, created_at, updated_at
      from repos
      order by created_at asc
    `,
    insertColumns: [
      "id",
      "name",
      "owner",
      "provider",
      "repo_url",
      "default_branch",
      "status",
      "created_at",
      "updated_at"
    ],
    normalizeRow: (row) => [
      row.id,
      row.name,
      row.owner,
      row.provider,
      row.repo_url,
      row.default_branch,
      row.status,
      normalizeIso(row.created_at),
      normalizeIso(row.updated_at)
    ]
  },
  {
    name: "repo_syncs",
    selectSql: `
      select id, repo_id, commit_sha, branch, status, started_at, completed_at, error_message
      from repo_syncs
      order by started_at asc
    `,
    insertColumns: [
      "id",
      "repo_id",
      "commit_sha",
      "branch",
      "status",
      "started_at",
      "completed_at",
      "error_message"
    ],
    normalizeRow: (row) => [
      row.id,
      row.repo_id,
      row.commit_sha,
      row.branch,
      row.status,
      normalizeIso(row.started_at),
      normalizeIso(row.completed_at),
      row.error_message ?? null
    ]
  },
  {
    name: "repo_pages",
    selectSql: `
      select id, repo_id, name, route, source_file, sort_order, metadata_json
      from repo_pages
      order by sort_order asc, id asc
    `,
    insertColumns: [
      "id",
      "repo_id",
      "name",
      "route",
      "source_file",
      "sort_order",
      "metadata_json"
    ],
    normalizeRow: (row) => [
      row.id,
      row.repo_id,
      row.name,
      row.route,
      row.source_file,
      row.sort_order,
      normalizeJson(row.metadata_json)
    ]
  },
  {
    name: "repo_sections",
    selectSql: `
      select id, repo_id, page_id, name, section_key, source_file, import_path, sort_order, component_name, metadata_json
      from repo_sections
      order by sort_order asc, id asc
    `,
    insertColumns: [
      "id",
      "repo_id",
      "page_id",
      "name",
      "section_key",
      "source_file",
      "import_path",
      "sort_order",
      "component_name",
      "metadata_json"
    ],
    normalizeRow: (row) => [
      row.id,
      row.repo_id,
      row.page_id,
      row.name,
      row.section_key,
      row.source_file,
      row.import_path,
      row.sort_order,
      row.component_name,
      normalizeJson(row.metadata_json)
    ]
  },
  {
    name: "project_rulesets",
    selectSql: `
      select id, repo_id, name, version, rules_json, created_at, updated_at
      from project_rulesets
      order by created_at asc
    `,
    insertColumns: ["id", "repo_id", "name", "version", "rules_json", "created_at", "updated_at"],
    normalizeRow: (row) => [
      row.id,
      row.repo_id,
      row.name,
      row.version,
      normalizeJson(row.rules_json),
      normalizeIso(row.created_at),
      normalizeIso(row.updated_at)
    ]
  },
  {
    name: "webflow_site_bindings",
    selectSql: `
      select id, user_id, repo_id, webflow_site_id, ruleset_id, created_at, updated_at
      from webflow_site_bindings
      order by created_at asc
    `,
    insertColumns: [
      "id",
      "user_id",
      "repo_id",
      "webflow_site_id",
      "ruleset_id",
      "created_at",
      "updated_at"
    ],
    normalizeRow: (row) => [
      row.id,
      row.user_id,
      row.repo_id,
      row.webflow_site_id,
      row.ruleset_id ?? null,
      normalizeIso(row.created_at),
      normalizeIso(row.updated_at)
    ]
  },
  {
    name: "webflow_page_mappings",
    selectSql: `
      select id, user_id, repo_id, webflow_site_id, webflow_page_id, webflow_page_name, webflow_page_route, repo_page_id, created_at, updated_at
      from webflow_page_mappings
      order by created_at asc
    `,
    insertColumns: [
      "id",
      "user_id",
      "repo_id",
      "webflow_site_id",
      "webflow_page_id",
      "webflow_page_name",
      "webflow_page_route",
      "repo_page_id",
      "created_at",
      "updated_at"
    ],
    normalizeRow: (row) => [
      row.id,
      row.user_id,
      row.repo_id,
      row.webflow_site_id,
      row.webflow_page_id,
      row.webflow_page_name,
      row.webflow_page_route ?? null,
      row.repo_page_id ?? null,
      normalizeIso(row.created_at),
      normalizeIso(row.updated_at)
    ]
  },
  {
    name: "shared_style_contexts",
    selectSql: `
      select site_id, context_json, captured_at, updated_at
      from shared_style_contexts
      order by site_id asc
    `,
    insertColumns: ["site_id", "context_json", "captured_at", "updated_at"],
    normalizeRow: (row) => [
      row.site_id,
      normalizeJson(row.context_json),
      normalizeIso(row.captured_at),
      normalizeIso(row.updated_at)
    ]
  },
  {
    name: "app_blobs",
    selectSql: `
      select key, value_json, extract(epoch from updated_at) * 1000 as updated_at
      from app_blobs
      order by key asc
    `,
    insertColumns: ["key", "value_json", "updated_at"],
    normalizeRow: (row) => [
      row.key,
      normalizeJson(row.value_json),
      Number(row.updated_at ?? Date.now())
    ]
  },
  {
    name: "section_workflow_states",
    selectSql: `
      select id, user_id, webflow_site_id, webflow_page_id, repo_page_id, repo_section_id, status, sort_order, last_run_id, created_at, updated_at, completed_at, skipped_at
      from section_workflow_states
      order by sort_order asc, id asc
    `,
    insertColumns: [
      "id",
      "user_id",
      "webflow_site_id",
      "webflow_page_id",
      "repo_page_id",
      "repo_section_id",
      "status",
      "sort_order",
      "last_run_id",
      "created_at",
      "updated_at",
      "completed_at",
      "skipped_at"
    ],
    normalizeRow: (row) => [
      row.id,
      row.user_id,
      row.webflow_site_id,
      row.webflow_page_id,
      row.repo_page_id,
      row.repo_section_id,
      row.status,
      row.sort_order,
      row.last_run_id ?? null,
      normalizeIso(row.created_at),
      normalizeIso(row.updated_at),
      normalizeIso(row.completed_at),
      normalizeIso(row.skipped_at)
    ]
  },
  {
    name: "section_runs",
    selectSql: `
      select id, user_id, repo_id, webflow_site_id, webflow_page_id, repo_page_id, repo_section_id, run_type, payload_json, approval_outcome, created_at, approved_at
      from section_runs
      order by created_at asc
    `,
    insertColumns: [
      "id",
      "user_id",
      "repo_id",
      "webflow_site_id",
      "webflow_page_id",
      "repo_page_id",
      "repo_section_id",
      "run_type",
      "payload_json",
      "approval_outcome",
      "created_at",
      "approved_at"
    ],
    normalizeRow: (row) => [
      row.id,
      row.user_id,
      row.repo_id,
      row.webflow_site_id,
      row.webflow_page_id,
      row.repo_page_id,
      row.repo_section_id,
      row.run_type,
      normalizeJson(row.payload_json),
      row.approval_outcome ?? null,
      normalizeIso(row.created_at),
      normalizeIso(row.approved_at)
    ]
  },
  {
    name: "build_jobs",
    selectSql: `
      select id, repo_id, page_id, section_id, webflow_site_id, webflow_page_id, placement_mode, placement_target, status, requested_by, started_at, completed_at, error_message
      from build_jobs
      order by started_at asc
    `,
    insertColumns: [
      "id",
      "repo_id",
      "page_id",
      "section_id",
      "webflow_site_id",
      "webflow_page_id",
      "placement_mode",
      "placement_target",
      "status",
      "requested_by",
      "started_at",
      "completed_at",
      "error_message"
    ],
    normalizeRow: (row) => [
      row.id,
      row.repo_id,
      row.page_id,
      row.section_id,
      row.webflow_site_id,
      row.webflow_page_id,
      row.placement_mode,
      row.placement_target ?? null,
      row.status,
      row.requested_by,
      normalizeIso(row.started_at),
      normalizeIso(row.completed_at),
      row.error_message ?? null
    ]
  },
  {
    name: "build_results",
    selectSql: `
      select id, build_job_id, result_json, created_at
      from build_results
      order by created_at asc
    `,
    insertColumns: ["id", "build_job_id", "result_json", "created_at"],
    normalizeRow: (row) => [
      row.id,
      row.build_job_id,
      normalizeJson(row.result_json),
      normalizeIso(row.created_at)
    ]
  }
];
