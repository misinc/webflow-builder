import { spawn } from "node:child_process";

type WranglerJson = Record<string, unknown> | Array<unknown>;

function collectString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function findRows(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    const recordRows = value.filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" &&
        item !== null &&
        !Array.isArray(item)
    );
    if (recordRows.length > 0) {
      return recordRows;
    }

    for (const item of value) {
      const nested = findRows(item);
      if (nested.length > 0) {
        return nested;
      }
    }
    return [];
  }

  if (typeof value !== "object" || value === null) {
    return [];
  }

  const record = value as Record<string, unknown>;
  for (const key of ["results", "result", "rows"]) {
    if (key in record) {
      const nested = findRows(record[key]);
      if (nested.length > 0) {
        return nested;
      }
    }
  }

  for (const nested of Object.values(record)) {
    const rows = findRows(nested);
    if (rows.length > 0) {
      return rows;
    }
  }

  return [];
}

export async function runWranglerD1(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("npx", ["wrangler", "d1", ...args], {
      stdio: "inherit",
      env: {
        ...process.env,
        WRANGLER_LOG: "error"
      }
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`wrangler d1 ${args.join(" ")} exited with code ${code ?? 1}`));
    });
  });
}

export async function runWranglerD1Json(
  args: string[]
): Promise<Array<Record<string, unknown>>> {
  const stdout = await new Promise<string>((resolve, reject) => {
    let output = "";
    let errorOutput = "";
    const child = spawn("npx", ["wrangler", "d1", ...args, "--json"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        WRANGLER_LOG: "error"
      }
    });

    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      errorOutput += String(chunk);
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(output);
        return;
      }
      reject(
        new Error(
          errorOutput.trim() || `wrangler d1 ${args.join(" ")} exited with code ${code ?? 1}`
        )
      );
    });
  });

  const parsed = JSON.parse(stdout) as WranglerJson;
  const rows = findRows(parsed);
  if (rows.length === 0) {
    throw new Error(`No rows found in Wrangler JSON output for args: ${args.join(" ")}`);
  }
  return rows;
}

export function firstScalar(row: Record<string, unknown>): string {
  for (const value of Object.values(row)) {
    const scalar = collectString(value);
    if (scalar !== null) {
      return scalar;
    }
  }
  throw new Error("Could not find a scalar value in the row returned by Wrangler.");
}
