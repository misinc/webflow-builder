import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MisRepoExtractor } from "../src/backend/extractor/mis-extractor.js";
import { RepositorySnapshot } from "../src/backend/github/client.js";

async function loadFixtureSnapshot(): Promise<RepositorySnapshot> {
  const root = path.resolve(process.cwd(), "test/fixtures/mis-repo");
  const files = await Promise.all(
    [
      "src/app/pages/home.tsx",
      "src/app/components/sections/Hero.tsx",
      "src/app/components/sections/Services.tsx",
      "src/app/components/sections/Solutions.tsx",
      "src/styles/site.css"
    ].map(async (filePath) => ({
      path: filePath,
      content: await fs.readFile(path.join(root, filePath), "utf8")
    }))
  );

  return {
    owner: "misinc",
    name: "atlas",
    defaultBranch: "main",
    commitSha: "fixture-commit",
    files
  };
}

describe("MisRepoExtractor", () => {
  it("indexes supported sections in page order", async () => {
    const extractor = new MisRepoExtractor();
    const snapshot = await loadFixtureSnapshot();
    const index = extractor.extractRepoIndex("repo-1", snapshot);

    expect(index.pages).toHaveLength(1);
    expect(index.sections.map((section) => section.sectionKey)).toEqual([
      "hero",
      "services",
      "solutions"
    ]);
    expect(index.sections.map((section) => section.sortOrder)).toEqual([0, 1, 2]);
  });
});
