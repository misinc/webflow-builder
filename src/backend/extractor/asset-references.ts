const IMAGE_SOURCE_EXTENSIONS =
  /\.(?:avif|bmp|gif|heic|heif|ico|jpe?g|jfif|png|svg|webp|mp4|mov|m4v|webm)(?:\?[^"'`]*)?$/i;

function firstDefined(values: Array<string | undefined>): string | undefined {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function isImageLikeComponentName(tagName: string): boolean {
  return /(image|img|photo|picture)/i.test(tagName);
}

export function parseJsxAttributeValue(
  tagSource: string,
  attributeName: string
): string | undefined {
  const patterns = [
    new RegExp(`${attributeName}\\s*=\\s*"([^"]*)"`, "i"),
    new RegExp(`${attributeName}\\s*=\\s*'([^']*)'`, "i"),
    new RegExp(attributeName + "\\s*=\\s*\\{\\s*`([^`]*)`\\s*\\}", "i"),
    new RegExp(`${attributeName}\\s*=\\s*\\{\\s*"([^"]*)"\\s*\\}`, "i"),
    new RegExp(`${attributeName}\\s*=\\s*\\{\\s*'([^']*)'\\s*\\}`, "i"),
    new RegExp(`${attributeName}\\s*=\\s*\\{\\s*([^}\\s][^}]*)\\s*\\}`, "i"),
    new RegExp(`${attributeName}\\s*=\\s*([^\\s>/]+)`, "i")
  ];

  for (const pattern of patterns) {
    const match = tagSource.match(pattern);
    if (match?.[1]) {
      return decodeHtmlEntities(match[1].trim());
    }
  }

  return undefined;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function normalizeImageLikeJsx(sourceCode: string): string {
  const componentPattern = /<([A-Z][A-Za-z0-9]*)\b([\s\S]*?)\/>/g;

  return sourceCode.replace(componentPattern, (fullMatch, tagName: string, rawProps: string) => {
    if (!isImageLikeComponentName(tagName)) {
      return fullMatch;
    }

    const src = parseJsxAttributeValue(rawProps, "src");
    const alt = parseJsxAttributeValue(rawProps, "alt");
    const className =
      parseJsxAttributeValue(rawProps, "className") ??
      parseJsxAttributeValue(rawProps, "class");
    const attributes = [
      src ? `src="${escapeHtmlAttribute(src)}"` : null,
      alt ? `alt="${escapeHtmlAttribute(alt)}"` : null,
      className ? `class="${escapeHtmlAttribute(className)}"` : null
    ].filter((value): value is string => Boolean(value));

    return `<img${attributes.length > 0 ? ` ${attributes.join(" ")}` : ""} />`;
  });
}

function collectImportedAssetMap(sourceCode: string): Map<string, string> {
  const assetMap = new Map<string, string>();
  const importPattern =
    /import\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+\.(?:avif|bmp|gif|heic|heif|ico|jpe?g|jfif|png|svg|webp|mp4|mov|m4v|webm)(?:\?[^"']*)?)["']/g;
  const constStringPattern =
    /const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:"([^"]+\.(?:avif|bmp|gif|heic|heif|ico|jpe?g|jfif|png|svg|webp|mp4|mov|m4v|webm)(?:\?[^"]*)?)"|'([^']+\.(?:avif|bmp|gif|heic|heif|ico|jpe?g|jfif|png|svg|webp|mp4|mov|m4v|webm)(?:\?[^']*)?)')/g;
  const constUrlPattern =
    /const\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+URL\(\s*(?:"([^"]+\.(?:avif|bmp|gif|heic|heif|ico|jpe?g|jfif|png|svg|webp|mp4|mov|m4v|webm)(?:\?[^"]*)?)"|'([^']+\.(?:avif|bmp|gif|heic|heif|ico|jpe?g|jfif|png|svg|webp|mp4|mov|m4v|webm)(?:\?[^']*)?)')\s*,\s*import\.meta\.url\s*\)\.href/g;

  for (const match of sourceCode.matchAll(importPattern)) {
    assetMap.set(match[1], match[2]);
  }

  for (const match of sourceCode.matchAll(constStringPattern)) {
    assetMap.set(match[1], firstDefined([match[2], match[3]])!);
  }

  for (const match of sourceCode.matchAll(constUrlPattern)) {
    assetMap.set(match[1], firstDefined([match[2], match[3]])!);
  }

  return assetMap;
}

function resolveAssetReference(rawValue: string, assetMap: Map<string, string>): string | null {
  const normalized = rawValue.trim();
  if (!normalized) {
    return null;
  }
  if (IMAGE_SOURCE_EXTENSIONS.test(normalized) || /^https?:\/\//i.test(normalized)) {
    return normalized;
  }
  if (/^[A-Za-z_$][\w$]*$/.test(normalized)) {
    return assetMap.get(normalized) ?? null;
  }
  return null;
}

export function extractAssetReferencesFromSource(input: {
  sourceCode: string;
  contextCode?: string;
}): string[] {
  const assetMap = collectImportedAssetMap(
    [input.contextCode, input.sourceCode].filter(Boolean).join("\n")
  );
  const references: string[] = [];
  const jsxImageSourcePattern =
    /<(img|[A-Z][A-Za-z0-9]*)\b([^>]*\bsrc\s*=\s*(?:"[^"]*"|'[^']*'|\{[^}]+\})[^>]*)\/?>/g;

  for (const match of input.sourceCode.matchAll(jsxImageSourcePattern)) {
    const tagName = match[1];
    if (tagName !== "img" && !isImageLikeComponentName(tagName)) {
      continue;
    }
    const src = parseJsxAttributeValue(match[2], "src");
    const resolved = src ? resolveAssetReference(src, assetMap) : null;
    if (resolved) {
      references.push(resolved);
    }
  }

  const deduped = [...new Set(references)];
  return deduped;
}
