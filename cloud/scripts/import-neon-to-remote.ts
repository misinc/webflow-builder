import path from "node:path";
import { spawn } from "node:child_process";
import { runWranglerD1 } from "./wrangler-d1";

async function runNodeScript(scriptPath: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("npx", ["tsx", scriptPath, ...args], {
      stdio: "inherit",
      env: process.env
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${scriptPath} exited with code ${code ?? 1}`));
    });
  });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Set DATABASE_URL to the Neon/Postgres source database.");
  }

  const outputPath = path.resolve(process.argv[2] ?? "tmp/neon-import.sql");
  await runNodeScript("scripts/export-neon-to-d1.ts", [outputPath]);
  await runWranglerD1(["execute", "DB", "--remote", "--file", outputPath]);
  console.log(`Imported Neon data into remote Webflow Cloud DB using ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
