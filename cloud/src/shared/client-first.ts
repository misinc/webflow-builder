const PAGE_SCOPED_PREFIXES = [
  "home",
  "homepage",
  "about",
  "services-page",
  "solutions-page",
  "landing",
  "page-"
];

const SHARED_CATEGORY_HINTS = new Map<string, string>([
  ["heading", "heading"],
  ["text", "text"],
  ["button", "button"],
  ["btn", "button"],
  ["padding", "spacing"],
  ["margin", "spacing"],
  ["container", "layout"],
  ["wrapper", "layout"]
]);

export function isClientFirstName(name: string): boolean {
  return /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(name);
}

export function isPageScopedClassName(name: string): boolean {
  const lower = name.toLowerCase();
  return PAGE_SCOPED_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

export function inferSharedCategory(className: string): string | null {
  const lower = className.toLowerCase();
  for (const [hint, category] of SHARED_CATEGORY_HINTS.entries()) {
    if (lower.includes(hint)) {
      return category;
    }
  }
  return null;
}

export function dedupe<T>(values: T[]): T[] {
  return [...new Set(values)];
}
