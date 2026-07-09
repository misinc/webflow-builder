import {
  RepoToken,
  repoTokenSchema,
  RepoTokenType,
  repoTokensResponseSchema,
  RepoTokensResponse
} from "@wfb/shared/contracts.js";
import { BlobStore } from "../blob/blob-store.js";
import { RepositorySnapshot } from "../github/client.js";
import { nowIso } from "../utils.js";

const TOKEN_FILE_PATTERN = /^(.+)\.tokens\.json$/i;
const TOKEN_PARENT_NAMES = new Set(["tokens", "variables"]);

function titleCaseGroup(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Tokens";
}

function normalizeTokenType(value: unknown): RepoTokenType {
  const normalized = String(value ?? "other").trim().toLowerCase();
  if (normalized === "color") return "color";
  if (normalized === "size" || normalized === "dimension" || normalized === "spacing") return "size";
  if (normalized === "fontfamily" || normalized === "font-family" || normalized === "font") return "fontFamily";
  if (normalized === "number") return "number";
  if (normalized === "string") return "string";
  return "other";
}

function rgbaFromFigmaColor(value: Record<string, unknown>, alpha: number): string | null {
  const components = Array.isArray(value.components) ? value.components : null;
  if (!components || components.length < 3) {
    return null;
  }
  const [red, green, blue] = components.map((component) =>
    Math.max(0, Math.min(255, Math.round(Number(component) * 255)))
  );
  if ([red, green, blue].some((part) => Number.isNaN(part))) {
    return null;
  }
  const roundedAlpha = Math.round(alpha * 1000) / 1000;
  return `rgba(${red}, ${green}, ${blue}, ${roundedAlpha})`;
}

function normalizeTokenValue(type: RepoTokenType, value: unknown): string | null {
  if (type === "color" && value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const hex = typeof record.hex === "string" ? record.hex.trim() : "";
    const alpha = typeof record.alpha === "number" ? record.alpha : 1;
    if (hex && alpha >= 1) {
      return hex;
    }
    if (alpha < 1) {
      return rgbaFromFigmaColor(record, alpha) ?? (hex ? hex : null);
    }
    return hex || null;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("value" in record && "unit" in record) {
      return `${String(record.value)}${String(record.unit)}`;
    }
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const text = String(value).trim();
    return text || null;
  }
  return null;
}

function figmaVariableId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const extensions = (value as Record<string, unknown>)["$extensions"];
  if (!extensions || typeof extensions !== "object") {
    return undefined;
  }
  const id = (extensions as Record<string, unknown>)["com.figma.variableId"];
  return typeof id === "string" && id.trim() ? id : undefined;
}

function isTokenLeaf(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      "$type" in (value as Record<string, unknown>) &&
      "$value" in (value as Record<string, unknown>)
  );
}

function collectTokensFromJson(params: {
  node: unknown;
  group: string;
  sourceFile: string;
  path: string[];
  warnings: string[];
}): RepoToken[] {
  if (isTokenLeaf(params.node)) {
    const type = normalizeTokenType(params.node.$type);
    const value = normalizeTokenValue(type, params.node.$value);
    const name = params.path.join("/");
    if (!name || !value) {
      params.warnings.push(`Skipped invalid token in ${params.sourceFile} at ${params.path.join("/") || "<root>"}.`);
      return [];
    }
    const parsed = repoTokenSchema.safeParse({
      group: params.group,
      name,
      type,
      value,
      sourceFile: params.sourceFile,
      figmaVariableId: figmaVariableId(params.node)
    });
    if (!parsed.success) {
      params.warnings.push(`Skipped invalid token ${params.group}/${name} in ${params.sourceFile}.`);
      return [];
    }
    return [parsed.data];
  }

  if (!params.node || typeof params.node !== "object" || Array.isArray(params.node)) {
    return [];
  }

  const tokens: RepoToken[] = [];
  for (const [key, child] of Object.entries(params.node as Record<string, unknown>)) {
    if (key.startsWith("$")) {
      continue;
    }
    tokens.push(
      ...collectTokensFromJson({
        ...params,
        node: child,
        path: [...params.path, key]
      })
    );
  }
  return tokens;
}

function tokenFileGroup(filePath: string): string | null {
  const parts = filePath.split("/").filter(Boolean);
  const fileName = parts.at(-1);
  const parent = parts.at(-2);
  if (!fileName || !parent || !TOKEN_PARENT_NAMES.has(parent)) {
    return null;
  }
  if (parts.at(-3) && TOKEN_PARENT_NAMES.has(parts.at(-3)!)) {
    return null;
  }
  const match = TOKEN_FILE_PATTERN.exec(fileName);
  return match ? titleCaseGroup(match[1]) : null;
}

export class RepoTokenService {
  constructor(private readonly blobStore: BlobStore) {}

  async discoverRepoTokens(repoId: string): Promise<RepoTokensResponse> {
    const snapshot = await this.blobStore.getJson<RepositorySnapshot>(
      `repos/${repoId}/snapshots/latest.json`
    );
    if (!snapshot) {
      throw new Error("Repo has not been synced yet.");
    }

    const warnings: string[] = [];
    const tokens: RepoToken[] = [];
    const seen = new Set<string>();

    for (const file of snapshot.files.sort((left, right) => left.path.localeCompare(right.path))) {
      const group = tokenFileGroup(file.path);
      if (!group) {
        continue;
      }
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(file.content);
      } catch {
        warnings.push(`Could not parse token file ${file.path}.`);
        continue;
      }
      const fileTokens = collectTokensFromJson({
        node: parsedJson,
        group,
        sourceFile: file.path,
        path: [],
        warnings
      });
      for (const token of fileTokens) {
        const key = `${token.group}/${token.name}`;
        if (seen.has(key)) {
          warnings.push(`Skipped duplicate token ${key} from ${file.path}.`);
          continue;
        }
        seen.add(key);
        tokens.push(token);
      }
    }

    return repoTokensResponseSchema.parse({
      repoId,
      generatedAt: nowIso(),
      tokens,
      warnings
    });
  }
}
