import { RepositorySnapshot } from "../github/client.js";

export type RepoType = "react" | "html";

function markerRepoType(snapshot: RepositorySnapshot): RepoType | null {
  const marker = snapshot.files.find((file) => file.path === "webflow-builder.json");
  if (!marker) {
    return null;
  }
  try {
    const parsed = JSON.parse(marker.content) as { type?: unknown };
    return parsed.type === "html" || parsed.type === "react" ? parsed.type : null;
  } catch {
    return null;
  }
}

function isHtmlPageFile(path: string): boolean {
  if (!/\.html?$/i.test(path)) {
    return false;
  }
  if (/(^|\/)(404|500)\.html?$/i.test(path) || /(^|\/)_/.test(path)) {
    return false;
  }
  if (/(^|\/)(node_modules|assets|static|images|img|media|fonts)(\/|$)/i.test(path)) {
    return false;
  }
  return true;
}

function hasReactEntry(snapshot: RepositorySnapshot): boolean {
  return snapshot.files.some((file) =>
    /^(?:src\/)?app(?:\/.+)?\/page\.(tsx|jsx|ts|js)$/.test(file.path) ||
    /^(?:src\/)?pages\/(?!_app\.|_document\.|_error\.).+\.(tsx|jsx|ts|js)$/.test(file.path) ||
    /^src\/app\/pages\/.+\.(tsx|jsx|ts|js)$/.test(file.path)
  );
}

export function isHtmlRepoPageFile(path: string): boolean {
  return isHtmlPageFile(path);
}

export function detectRepoType(snapshot: RepositorySnapshot): RepoType {
  const marked = markerRepoType(snapshot);
  if (marked) {
    return marked;
  }
  const htmlPageCount = snapshot.files.filter((file) => isHtmlPageFile(file.path)).length;
  if (htmlPageCount > 0 && !hasReactEntry(snapshot)) {
    return "html";
  }
  return "react";
}
