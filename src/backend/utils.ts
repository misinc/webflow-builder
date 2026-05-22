import crypto from "node:crypto";

export function nowIso(): string {
  return new Date().toISOString();
}

export function stableId(...parts: string[]): string {
  const hash = crypto.createHash("sha1");
  hash.update(parts.join("::"));
  return hash.digest("hex").slice(0, 16);
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function invariant(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
