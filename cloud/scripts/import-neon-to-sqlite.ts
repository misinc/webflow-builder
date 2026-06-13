import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { TABLES } from "./neon-table-config";

function resolveSqlitePath(inputPath?: string): string {
  if (inputPath) {
    return path.resolve(inputPath);
  }

  const stateDir = path.resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
  const candidates = fs
    .readdirSync(stateDir)
    .filter((file) => file.endsWith(".sqlite") && file !== "metadata.sqlite")
    .sort();

  if (candidates.length === 0) {
    throw new Error(`No local D1 sqlite file found in ${stateDir}`);
  }

  return path.join(stateDir, candidates[0] as string);
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Set DATABASE_URL to the Neon/Postgres source database.");
  }

  const sqlitePath = resolveSqlitePath(process.argv[2]);
  const sqlite = new Database(sqlitePath);
  const pool = new Pool({ connectionString });

  try {
    sqlite.pragma("journal_mode = WAL");

    for (const table of TABLES) {
      const result = await pool.query(table.selectSql);
      const insert = sqlite.prepare(
        `INSERT OR REPLACE INTO ${table.name} (${table.insertColumns.join(", ")}) VALUES (${placeholders(table.insertColumns.length)})`
      );

      const tx = sqlite.transaction((rows: Record<string, unknown>[]) => {
        sqlite.prepare(`DELETE FROM ${table.name}`).run();
        for (const row of rows) {
          insert.run(...table.normalizeRow(row));
        }
      });

      tx(result.rows as Record<string, unknown>[]);
      console.log(`${table.name}: ${result.rows.length}`);
    }
  } finally {
    sqlite.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
