import Database from "better-sqlite3";
import { Pool } from "pg";
import path from "node:path";
import { TABLES } from "./neon-table-config";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Set DATABASE_URL to the Neon/Postgres source database.");
  }

  const sqlitePath = path.resolve(process.argv[2] ?? ".wrangler/state/v3/d1/miniflare-D1DatabaseObject/DB.sqlite");
  const sqlite = new Database(sqlitePath, { readonly: true });
  const pool = new Pool({ connectionString });

  let mismatches = 0;
  try {
    for (const table of TABLES) {
      const source = await pool.query<{ count: string }>(`select count(*)::text as count from ${table.name}`);
      const sourceCount = Number(source.rows[0]?.count ?? 0);
      const sqliteRow = sqlite
        .prepare(`select count(*) as count from ${table.name}`)
        .get() as { count: number };
      const sqliteCount = Number(sqliteRow.count ?? 0);

      if (sourceCount !== sqliteCount) {
        mismatches += 1;
        console.error(`${table.name}: source=${sourceCount} sqlite=${sqliteCount}`);
      } else {
        console.log(`${table.name}: ${sourceCount}`);
      }
    }
  } finally {
    sqlite.close();
    await pool.end();
  }

  if (mismatches > 0) {
    throw new Error(`Verification failed for ${mismatches} table(s).`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
