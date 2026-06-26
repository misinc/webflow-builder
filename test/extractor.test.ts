import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MisRepoExtractor } from "@wfb/backend-core/extractor/mis-extractor.js";
import { RepositorySnapshot } from "@wfb/backend-core/github/client.js";

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

  it("indexes page sections from broader component folders", () => {
    const extractor = new MisRepoExtractor();
    const snapshot: RepositorySnapshot = {
      owner: "misinc",
      name: "windsorkimball",
      defaultBranch: "main",
      commitSha: "fixture-generic-components-commit",
      files: [
        {
          path: "src/app/pages/home.tsx",
          content: `
            import HeroBanner from "@/components/home/HeroBanner";
            import PracticeAreasSection from "@/components/home/PracticeAreasSection";
            import FaqSection from "@/components/home/FaqSection";

            export default function HomePage() {
              return (
                <>
                  <HeroBanner />
                  <PracticeAreasSection />
                  <FaqSection />
                </>
              );
            }
          `
        },
        {
          path: "src/components/home/HeroBanner.tsx",
          content: "export default function HeroBanner() { return <section>Hero</section>; }"
        },
        {
          path: "src/components/home/PracticeAreasSection.tsx",
          content:
            "export default function PracticeAreasSection() { return <section>Practice Areas</section>; }"
        },
        {
          path: "src/components/home/FaqSection.tsx",
          content: "export default function FaqSection() { return <section>FAQ</section>; }"
        }
      ]
    };

    const index = extractor.extractRepoIndex("repo-1", snapshot);

    expect(index.sections.map((section) => section.sourceFile)).toEqual([
      "src/components/home/HeroBanner.tsx",
      "src/components/home/PracticeAreasSection.tsx",
      "src/components/home/FaqSection.tsx"
    ]);
    expect(index.sections.map((section) => section.sectionKey)).toEqual([
      "hero",
      "practice-areas",
      "faq"
    ]);
    expect(index.sections.map((section) => section.name)).toEqual([
      "Hero",
      "Practice Areas",
      "Faq"
    ]);
  });

  it("indexes page components re-exported from route files", () => {
    const extractor = new MisRepoExtractor();
    const snapshot: RepositorySnapshot = {
      owner: "misinc",
      name: "windsorkimball",
      defaultBranch: "main",
      commitSha: "fixture-reexport-commit",
      files: [
        {
          path: "src/app/pages/about.tsx",
          content: `
            export { default } from "@/components/pages/AboutPage";
            export { metadata } from "@/components/pages/AboutPage";
          `
        },
        {
          path: "src/components/pages/AboutPage.tsx",
          content:
            "export default function AboutPage() { return <section>About</section>; } export const metadata = {};"
        }
      ]
    };

    const index = extractor.extractRepoIndex("repo-1", snapshot);

    expect(index.pages).toHaveLength(1);
    expect(index.sections.map((section) => section.sourceFile)).toEqual([
      "src/components/pages/AboutPage.tsx"
    ]);
    expect(index.sections.map((section) => section.sectionKey)).toEqual(["about-page"]);
    expect(index.sections.map((section) => section.name)).toEqual(["About Page"]);
  });

  it("indexes imported page components exported as the route default", () => {
    const extractor = new MisRepoExtractor();
    const snapshot: RepositorySnapshot = {
      owner: "misinc",
      name: "windsorkimball",
      defaultBranch: "main",
      commitSha: "fixture-default-ref-commit",
      files: [
        {
          path: "src/app/pages/about.tsx",
          content: `
            import { AboutPage } from "@/components/pages/AboutPage";
            export default AboutPage;
          `
        },
        {
          path: "src/components/pages/AboutPage.tsx",
          content: "export function AboutPage() { return <section>About</section>; }"
        }
      ]
    };

    const index = extractor.extractRepoIndex("repo-1", snapshot);

    expect(index.sections.map((section) => section.sourceFile)).toEqual([
      "src/components/pages/AboutPage.tsx"
    ]);
    expect(index.sections.map((section) => section.name)).toEqual(["About Page"]);
  });

  it("falls back to indexing the page file itself as a section", () => {
    const extractor = new MisRepoExtractor();
    const snapshot: RepositorySnapshot = {
      owner: "misinc",
      name: "windsorkimball",
      defaultBranch: "main",
      commitSha: "fixture-page-fallback-commit",
      files: [
        {
          path: "src/app/pages/about.tsx",
          content: `
            export default function AboutPage() {
              return (
                <main>
                  <div>
                    <h1>About Windsor Kimball APC</h1>
                    <p>Firm overview content.</p>
                  </div>
                </main>
              );
            }
          `
        }
      ]
    };

    const index = extractor.extractRepoIndex("repo-1", snapshot);

    expect(index.pages).toHaveLength(1);
    expect(index.sections.map((section) => section.sourceFile)).toEqual([
      "src/app/pages/about.tsx"
    ]);
    expect(index.sections.map((section) => section.sectionKey)).toEqual(["about"]);
    expect(index.sections.map((section) => section.name)).toEqual(["About"]);
  });

  it("ignores helper imports when indexing page sections", () => {
    const extractor = new MisRepoExtractor();
    const snapshot: RepositorySnapshot = {
      owner: "misinc",
      name: "windsorkimball",
      defaultBranch: "main",
      commitSha: "fixture-helper-imports-commit",
      files: [
        {
          path: "src/app/pages/about.tsx",
          content: `
            import { ImageWithFallback } from "../components/figma/ImageWithFallback";
            import { Seo } from "../components/seo";
            import HeroBanner from "@/components/home/HeroBanner";

            export default function AboutPage() {
              return (
                <main>
                  <Seo title="About" />
                  <HeroBanner />
                  <ImageWithFallback src="/room.jpg" alt="Conference room" />
                </main>
              );
            }
          `
        },
        {
          path: "src/app/components/figma/ImageWithFallback.tsx",
          content:
            "export function ImageWithFallback() { return <img src='/room.jpg' alt='Conference room' />; }"
        },
        {
          path: "src/app/components/seo.tsx",
          content: "export function Seo() { return null; }"
        },
        {
          path: "src/components/home/HeroBanner.tsx",
          content: "export default function HeroBanner() { return <section>Hero</section>; }"
        }
      ]
    };

    const index = extractor.extractRepoIndex("repo-1", snapshot);

    expect(index.sections.map((section) => section.name)).toEqual(["Hero"]);
    expect(index.sections.map((section) => section.sectionKey)).toEqual(["hero"]);
  });

  it("extracts inline top-level sections from page markup", () => {
    const extractor = new MisRepoExtractor();
    const snapshot: RepositorySnapshot = {
      owner: "misinc",
      name: "windsorkimball",
      defaultBranch: "main",
      commitSha: "fixture-inline-sections-commit",
      files: [
        {
          path: "src/app/pages/about.tsx",
          content: `
            import { ImageWithFallback } from "../components/figma/ImageWithFallback";
            import { Seo } from "../components/seo";

            export function AboutPage() {
              return (
                <div>
                  <Seo title="About" />

                  {/* Header Section */}
                  <section className="hero">
                    <h1>About Windsor Kimball APC</h1>
                    <p>Intro copy.</p>
                  </section>

                  {/* Our Approach */}
                  <section className="approach">
                    <div>
                      <h2>Our Approach</h2>
                      <p>Approach copy.</p>
                    </div>
                    <ImageWithFallback src="/room.jpg" alt="Conference room" />
                  </section>

                  {/* Attorney Profiles */}
                  <section className="profiles">
                    <h2>Our Attorneys</h2>
                  </section>

                  {/* Jurisdictions */}
                  <section className="jurisdictions">
                    <h2>Jurisdictions Served</h2>
                  </section>
                </div>
              );
            }
          `
        },
        {
          path: "src/app/components/figma/ImageWithFallback.tsx",
          content:
            "export function ImageWithFallback() { return <img src='/room.jpg' alt='Conference room' />; }"
        },
        {
          path: "src/app/components/seo.tsx",
          content: "export function Seo() { return null; }"
        }
      ]
    };

    const index = extractor.extractRepoIndex("repo-1", snapshot);

    expect(index.sections.map((section) => section.name)).toEqual([
      "Header",
      "Our Approach",
      "Attorney Profiles",
      "Jurisdictions"
    ]);
    expect(index.sections.map((section) => section.sectionKey)).toEqual([
      "header",
      "our-approach",
      "attorney-profiles",
      "jurisdictions"
    ]);
    expect(index.sections.every((section) => section.sourceFile === "src/app/pages/about.tsx")).toBe(
      true
    );
  });

  it("generates unique component names for repeated inline collection sections", () => {
    const extractor = new MisRepoExtractor();
    const snapshot: RepositorySnapshot = {
      owner: "misinc",
      name: "misinc-2026",
      defaultBranch: "main",
      commitSha: "fixture-repeated-inline-sections-commit",
      files: [
        {
          path: "src/app/pages/services.tsx",
          content: `
            export function ServicesPage() {
              return (
                <main>
                  {services.map((service) => (
                    <section key={service.title}>
                      <h2>{service.title}</h2>
                      <p>{service.description}</p>
                    </section>
                  ))}
                  {featuredServices.map((service) => (
                    <section key={service.slug}>
                      <h2>{service.title}</h2>
                      <p>{service.summary}</p>
                    </section>
                  ))}
                </main>
              );
            }
          `
        }
      ]
    };

    const index = extractor.extractRepoIndex("repo-1", snapshot);
    const componentNames = index.sections.map((section) => section.componentName);

    expect(componentNames).toEqual(["ServiceTitleSection1", "ServiceTitleSection2"]);
    expect(new Set(componentNames).size).toBe(componentNames.length);
  });

  it("resolves imported JSX image assets for inline sections", () => {
    const extractor = new MisRepoExtractor();
    const snapshot: RepositorySnapshot = {
      owner: "misinc",
      name: "windsorkimball",
      defaultBranch: "main",
      commitSha: "fixture-inline-assets-commit",
      files: [
        {
          path: "src/app/pages/about.tsx",
          content: `
            import { ImageWithFallback } from "../components/figma/ImageWithFallback";
            import katyPhoto from "../../assets/Katy Kimball Windsor.jpg";
            import markPhoto from "../../assets/Mark Windsor.jpg";

            export function AboutPage() {
              return (
                <div>
                  <section className="profiles">
                    <h2>Our Attorneys</h2>
                    <div>
                      <ImageWithFallback src={markPhoto} alt="Portrait of Mark Windsor" />
                      <ImageWithFallback src={katyPhoto} alt="Portrait of Katy Kimball Windsor" />
                    </div>
                  </section>
                </div>
              );
            }
          `
        },
        {
          path: "src/app/components/figma/ImageWithFallback.tsx",
          content:
            "export function ImageWithFallback() { return <img src='/room.jpg' alt='Conference room' />; }"
        }
      ]
    };

    const index = extractor.extractRepoIndex("repo-1", snapshot);
    const section = index.sections[0];
    const page = index.pages[0];
    const sectionContext = extractor.buildSectionContext({
      repoId: "repo-1",
      page,
      section,
      snapshot,
      sharedStyleContext: {
        siteId: "site-1",
        capturedAt: new Date().toISOString(),
        classes: [],
        variables: [],
        styleIds: []
      }
    });

    expect(sectionContext.assetReferences).toEqual([
      "../../assets/Mark Windsor.jpg",
      "../../assets/Katy Kimball Windsor.jpg"
    ]);
  });
});
