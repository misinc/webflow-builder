import fs from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { TABLES } from "./neon-table-config";

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  const stringValue = String(value).replace(/'/g, "''");
  return `'${stringValue}'`;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Set DATABASE_URL to the Neon/Postgres source database.");
  }

  const outputPath = path.resolve(process.argv[2] ?? "tmp/neon-import.sql");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const pool = new Pool({ connectionString });
  const statements: string[] = ["BEGIN TRANSACTION;"];
  const summary: Array<{ table: string; rows: number }> = [];

  try {
    for (const table of TABLES) {
      const result = await pool.query(table.selectSql);
      summary.push({ table: table.name, rows: result.rows.length });
      statements.push(`DELETE FROM ${table.name};`);
      for (const row of result.rows) {
        const values = table.normalizeRow(row).map(sqlValue).join(", ");
        statements.push(
          `INSERT OR REPLACE INTO ${table.name} (${table.insertColumns.join(", ")}) VALUES (${values});`
        );
      }
    }
  } finally {
    await pool.end();
  }

  statements.push("COMMIT;");
  await fs.writeFile(outputPath, `${statements.join("\n")}\n`, "utf8");

  const totalRows = summary.reduce((count, item) => count + item.rows, 0);
  console.log(`Wrote ${totalRows} rows to ${outputPath}`);
  for (const item of summary) {
    console.log(`${item.table}: ${item.rows}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
