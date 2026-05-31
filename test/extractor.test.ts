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

  it("indexes named imports from the shared sections barrel", () => {
    const extractor = new MisRepoExtractor();
    const snapshot: RepositorySnapshot = {
      owner: "misinc",
      name: "misinc-2026",
      defaultBranch: "main",
      commitSha: "fixture-barrel-commit",
      files: [
        {
          path: "src/app/pages/HomePage.tsx",
          content: `
            import {
              AuthoritySection,
              CaseStudiesSection,
              HeroSection,
              SolutionsSection,
              StrategicServicesSection
            } from "@/app/components/sections";

            export default function HomePage() {
              return (
                <main>
                  <HeroSection />
                  <StrategicServicesSection />
                  <SolutionsSection />
                  <CaseStudiesSection />
                  <AuthoritySection />
                </main>
              );
            }
          `
        },
        {
          path: "src/app/components/sections/HeroSection.tsx",
          content: "export function HeroSection() { return <section>Hero</section>; }"
        },
        {
          path: "src/app/components/sections/StrategicServicesSection.tsx",
          content:
            "export function StrategicServicesSection() { return <section>Services</section>; }"
        },
        {
          path: "src/app/components/sections/SolutionsSection.tsx",
          content:
            "export function SolutionsSection() { return <section>Solutions</section>; }"
        },
        {
          path: "src/app/components/sections/index.ts",
          content: `
            export { HeroSection } from "./HeroSection";
            export { StrategicServicesSection } from "./StrategicServicesSection";
            export { SolutionsSection } from "./SolutionsSection";
          `
        }
      ]
    };

    const index = extractor.extractRepoIndex("repo-1", snapshot);

    expect(index.sections.map((section) => section.sectionKey)).toEqual([
      "hero",
      "services",
      "solutions"
    ]);
    expect(index.sections.map((section) => section.sourceFile)).toEqual([
      "src/app/components/sections/HeroSection.tsx",
      "src/app/components/sections/StrategicServicesSection.tsx",
      "src/app/components/sections/SolutionsSection.tsx"
    ]);
  });

  it("indexes common Next app-router pages for mapping", () => {
    const extractor = new MisRepoExtractor();
    const snapshot: RepositorySnapshot = {
      owner: "misinc",
      name: "windsorkimball",
      defaultBranch: "main",
      commitSha: "fixture-app-router-commit",
      files: [
        {
          path: "app/page.tsx",
          content: `
            import Hero from "@/components/sections/Hero";
            export default function Page() {
              return <Hero />;
            }
          `
        },
        {
          path: "app/about/page.tsx",
          content: `
            export default function Page() {
              return <main>About</main>;
            }
          `
        },
        {
          path: "app/contact/page.tsx",
          content: `
            export default function Page() {
              return <main>Contact</main>;
            }
          `
        },
        {
          path: "components/sections/Hero.tsx",
          content: "export default function Hero() { return <section>Hero</section>; }"
        }
      ]
    };

    const index = extractor.extractRepoIndex("repo-1", snapshot);

    expect(index.pages.map((page) => page.sourceFile)).toEqual([
      "app/about/page.tsx",
      "app/contact/page.tsx",
      "app/page.tsx"
    ]);
    expect(index.pages.map((page) => page.route)).toEqual(["/about", "/contact", "/"]);
    expect(index.pages.map((page) => page.name)).toEqual(["About", "Contact", "Home"]);
  });

  it("resolves section components outside the legacy src/app tree", () => {
    const extractor = new MisRepoExtractor();
    const snapshot: RepositorySnapshot = {
      owner: "misinc",
      name: "windsorkimball",
      defaultBranch: "main",
      commitSha: "fixture-components-commit",
      files: [
        {
          path: "app/page.tsx",
          content: `
            import HeroSection from "@/components/sections/HeroSection";
            import ServicesSection from "@/components/sections/ServicesSection";
            import SolutionsSection from "@/components/sections/SolutionsSection";

            export default function Page() {
              return (
                <>
                  <HeroSection />
                  <ServicesSection />
                  <SolutionsSection />
                </>
              );
            }
          `
        },
        {
          path: "components/sections/HeroSection.tsx",
          content: "export default function HeroSection() { return <section>Hero</section>; }"
        },
        {
          path: "components/sections/ServicesSection.tsx",
          content:
            "export default function ServicesSection() { return <section>Services</section>; }"
        },
        {
          path: "components/sections/SolutionsSection.tsx",
          content:
            "export default function SolutionsSection() { return <section>Solutions</section>; }"
        }
      ]
    };

    const index = extractor.extractRepoIndex("repo-1", snapshot);

    expect(index.sections.map((section) => section.sourceFile)).toEqual([
      "components/sections/HeroSection.tsx",
      "components/sections/ServicesSection.tsx",
      "components/sections/SolutionsSection.tsx"
    ]);
  });
});
