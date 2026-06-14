import { Pool } from "pg";
import { TABLES } from "./neon-table-config";
import { firstScalar, runWranglerD1Json } from "./wrangler-d1";

type SpotCheck = {
  label: string;
  table: string;
  sourceSql: string;
  remoteSql: (id: string) => string;
};

const SPOT_CHECKS: SpotCheck[] = [
  {
    label: "site binding",
    table: "webflow_site_bindings",
    sourceSql: "select id::text as id from webflow_site_bindings order by created_at asc limit 1",
    remoteSql: (id) =>
      `select id from webflow_site_bindings where id = '${id.replace(/'/g, "''")}' limit 1`
  },
  {
    label: "page mapping",
    table: "webflow_page_mappings",
    sourceSql: "select id::text as id from webflow_page_mappings order by created_at asc limit 1",
    remoteSql: (id) =>
      `select id from webflow_page_mappings where id = '${id.replace(/'/g, "''")}' limit 1`
  },
  {
    label: "workflow state",
    table: "section_workflow_states",
    sourceSql:
      "select id::text as id from section_workflow_states order by created_at asc limit 1",
    remoteSql: (id) =>
      `select id from section_workflow_states where id = '${id.replace(/'/g, "''")}' limit 1`
  },
  {
    label: "blob snapshot",
    table: "app_blobs",
    sourceSql:
      "select key::text as id from app_blobs where key like 'repos/%/snapshots/latest.json' order by key asc limit 1",
    remoteSql: (id) =>
      `select key from app_blobs where key = '${id.replace(/'/g, "''")}' limit 1`
  }
];

async function queryRemoteScalar(sql: string): Promise<string> {
  const rows = await runWranglerD1Json(["execute", "DB", "--remote", "--command", sql]);
  return firstScalar(rows[0] ?? {});
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Set DATABASE_URL to the Neon/Postgres source database.");
  }

  const pool = new Pool({ connectionString });
  let mismatches = 0;

  try {
    for (const table of TABLES) {
      const source = await pool.query<{ count: string }>(
        `select count(*)::text as count from ${table.name}`
      );
      const sourceCount = Number(source.rows[0]?.count ?? 0);
      const remoteCount = Number(
        await queryRemoteScalar(`select count(*) as count from ${table.name}`)
      );

      if (sourceCount !== remoteCount) {
        mismatches += 1;
        console.error(`${table.name}: source=${sourceCount} remote=${remoteCount}`);
      } else {
        console.log(`${table.name}: ${sourceCount}`);
      }
    }

    for (const check of SPOT_CHECKS) {
      const source = await pool.query<{ id: string }>(check.sourceSql);
      const sourceId = source.rows[0]?.id ?? null;
      if (!sourceId) {
        console.log(`${check.label}: skipped (no source rows in ${check.table})`);
        continue;
      }

      const remoteId = await queryRemoteScalar(check.remoteSql(sourceId));
      if (remoteId !== sourceId) {
        mismatches += 1;
        console.error(`${check.label}: expected ${sourceId}, got ${remoteId || "missing"}`);
      } else {
        console.log(`${check.label}: ${sourceId}`);
      }
    }
  } finally {
    await pool.end();
  }

  if (mismatches > 0) {
    throw new Error(`Remote verification failed for ${mismatches} check(s).`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
