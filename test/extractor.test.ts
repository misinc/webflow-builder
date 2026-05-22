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

  it("infers supported section families from non-exact MIS component names", () => {
    const extractor = new MisRepoExtractor();
    const snapshot: RepositorySnapshot = {
      owner: "misinc",
      name: "misinc-2026",
      defaultBranch: "main",
      commitSha: "fixture-variant-commit",
      files: [
        {
          path: "src/app/pages/NewHomePage.tsx",
          content: `
            import HomeHeroVariant from "@/app/components/sections/HomeHeroVariant";
            import ServicesSectionVariant from "@/app/components/sections/ServicesSectionVariant";
            import SolutionsSectionStack from "@/app/components/sections/SolutionsSectionStack";

            export default function NewHomePage() {
              return (
                <>
                  <HomeHeroVariant />
                  <ServicesSectionVariant />
                  <SolutionsSectionStack />
                </>
              );
            }
          `
        },
        {
          path: "src/app/components/sections/HomeHeroVariant.tsx",
          content: "export default function HomeHeroVariant() { return <section>Hero</section>; }"
        },
        {
          path: "src/app/components/sections/ServicesSectionVariant.tsx",
          content:
            "export default function ServicesSectionVariant() { return <section>Services</section>; }"
        },
        {
          path: "src/app/components/sections/SolutionsSectionStack.tsx",
          content:
            "export default function SolutionsSectionStack() { return <section>Solutions</section>; }"
        }
      ]
    };

    const index = extractor.extractRepoIndex("repo-1", snapshot);

    expect(index.sections.map((section) => section.sectionKey)).toEqual([
      "hero",
      "services",
      "solutions"
    ]);
    expect(index.sections.map((section) => section.name)).toEqual([
      "Hero",
      "Services",
      "Solutions"
    ]);
  });
});
