import { describe, expect, it } from "vitest";
import { MemoryBlobStore } from "@wfb/backend-core/blob/blob-store.js";
import { HtmlRepoExtractor } from "@wfb/backend-core/extractor/html-extractor.js";
import { detectRepoType } from "@wfb/backend-core/extractor/repo-type.js";
import { htmlToSkeletonPlan } from "@wfb/backend-core/planner/html-planner.js";
import type { PlanningProvider } from "@wfb/backend-core/planner/planning-provider.js";
import { MemoryAppRepository } from "@wfb/backend-core/repositories/memory-app-repository.js";
import { SiteStylePlanService } from "@wfb/backend-core/services/site-style-plan-service.js";
import { V2ReadService } from "@wfb/backend-core/services/v2-read-service.js";
import { WorkflowService } from "@wfb/backend-core/services/workflow-service.js";
import {
  AvailableRepository,
  GitHubRepositoryClient,
  isRelevantRepoFile,
  RepositorySnapshot
} from "@wfb/backend-core/github/client.js";
import { normalizeSkeletonPlan, serializeSkeletonTree } from "../extension/src/skeleton/tree.js";
import type {
  SectionAnalysis,
  SectionVerification,
  SharedStyleContext,
  SkeletonPlan,
  StylingPlan
} from "@wfb/shared/contracts.js";

const messyHtml = `
  <section class="hero-wrap md:py-[120px]" data-title="Do not leak">
    <style>.hero-wrap { color: red; }</style>
    <script>window.bad = "Do not leak";</script>
    <div class="content-shell">
      <h1 class="headline">Real <span class="accent">human</span> headline</h1>
      <p class="lede">Visible <strong>body</strong> copy <a href="/x" class="link-class">with link</a>.</p>
      <img src="/assets/hero.png" alt="Attribute text must not become visible copy" class="image-class" />
    </div>
  </section>
`;

const solutionsHtml = `
  <section class="solv-section">
    <div class="solv-section-inner">
      <h2>Solutions Tailored to Your Industry</h2>
      <div class="solv-mosaic-grid">
        <div class="solv-mosaic-lead">
          <h3>Solutions designed around how each industry actually operates.</h3>
          <p>Instead of presenting every audience at the same weight, this version creates a stronger entry point.</p>
          <div class="solv-mini-stack">
            <a class="solv-mini-pill" href="/small-businesses"><svg><path d="M0 0"></path></svg><span>Small Businesses</span></a>
            <a class="solv-mini-pill" href="/real-estate"><svg><path d="M0 0"></path></svg><span>Real Estate</span></a>
            <a class="solv-mini-pill" href="/nonprofits"><svg><path d="M0 0"></path></svg><span>Nonprofits</span></a>
            <a class="solv-mini-pill" href="/professional-services"><svg><path d="M0 0"></path></svg><span>Professional Services</span></a>
            <a class="solv-mini-pill" href="/startups-saas"><svg><path d="M0 0"></path></svg><span>Startups & SaaS</span></a>
            <a class="solv-mini-pill" href="/retail-ecommerce"><svg><path d="M0 0"></path></svg><span>Retail / Ecommerce</span></a>
          </div>
        </div>
        <div class="solv-mosaic-cards">
          <div><a class="solv-card solv-mosaic-card" href="/small-businesses"><div class="solv-mosaic-card__title"><svg><path d="M0 0"></path></svg><h3>Small Businesses</h3></div><p>Practical website and growth systems for owner-led teams.</p></a></div>
          <div><a class="solv-card solv-mosaic-card" href="/real-estate"><div class="solv-mosaic-card__title"><svg><path d="M0 0"></path></svg><h3>Real Estate</h3></div><p>Listing-ready digital experiences and lead funnels.</p></a></div>
          <div><a class="solv-card solv-mosaic-card" href="/nonprofits"><div class="solv-mosaic-card__title"><svg><path d="M0 0"></path></svg><h3>Nonprofits</h3></div><p>Mission-first websites focused on measurable community impact.</p></a></div>
          <div><a class="solv-card solv-mosaic-card" href="/professional-services"><div class="solv-mosaic-card__title"><svg><path d="M0 0"></path></svg><h3>Professional Services</h3></div><p>Credibility-driven websites that support complex buying cycles.</p></a></div>
          <div><a class="solv-card solv-mosaic-card" href="/startups-saas"><div class="solv-mosaic-card__title"><svg><path d="M0 0"></path></svg><h3>Startups & SaaS</h3></div><p>Conversion-focused experiences that support product positioning.</p></a></div>
          <div><a class="solv-card solv-mosaic-card" href="/retail-ecommerce"><div class="solv-mosaic-card__title"><svg><path d="M0 0"></path></svg><h3>Retail / Ecommerce</h3></div><p>Online storefronts and conversion systems designed to increase revenue.</p></a></div>
        </div>
      </div>
    </div>
  </section>
`;

const solutionsCss = `
  :root {
    --mis-text: #6b4a1e;
    --mis-muted: #8f6a35;
  }
  .solv-section { background-color: #fffdf9; }
  .solv-mosaic-grid {
    display: grid;
    gap: 21px;
    grid-template-columns: 1.11fr 1.44fr;
    align-items: stretch;
  }
  .solv-mosaic-lead {
    background: linear-gradient(160deg, #fff8ef, #ffefcf);
    border-radius: 31px;
    padding: 35px;
  }
  .solv-mosaic-lead h3 {
    color: var(--mis-text);
    font-size: 3.7rem;
    line-height: .95;
  }
  .solv-mini-stack {
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
  }
  .solv-mini-pill {
    border-radius: 999px;
    padding: 10px 14px;
  }
  .solv-mini-pill svg {
    height: 20px;
    width: 20px;
  }
  .solv-mosaic-cards {
    display: grid;
    gap: 22px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .solv-mosaic-card {
    background-color: #fffdfa;
    border: 1px solid rgba(166,32,37,.12);
    border-radius: 29px;
    min-height: 212px;
    padding: 24px;
  }
  .solv-mosaic-card p {
    color: var(--mis-muted);
    max-width: 32ch;
  }
  .solv-mosaic-card__title {
    align-items: center;
    display: flex;
    gap: 12px;
  }
`;

const sharedStyleContext: SharedStyleContext = {
  siteId: "site-1",
  capturedAt: new Date().toISOString(),
  classes: [{ name: "content-shell", category: "layout" }],
  variables: [],
  styleIds: []
};

const emptyGithubClient: GitHubRepositoryClient = {
  async connectRepo() {
    return { defaultBranch: "main", remoteId: "remote-1" };
  },
  async fetchSnapshot(): Promise<RepositorySnapshot> {
    throw new Error("not used");
  },
  async listAvailableRepos(): Promise<AvailableRepository[]> {
    return [];
  }
};

const fallbackOnlyProvider: PlanningProvider = {
  async analyzeSection(): Promise<SectionAnalysis> {
    throw new Error("not used");
  },
  async generateSkeleton(): Promise<SkeletonPlan> {
    throw new Error("not used");
  },
  async generateStylingPlan(): Promise<StylingPlan> {
    throw new Error("force deterministic styling fallback");
  },
  async verifySection(): Promise<SectionVerification> {
    throw new Error("not used");
  }
};

function metadata(repoType: "react" | "html" = "html") {
  return {
    repoId: "repo-1",
    pageId: "page-1",
    sectionId: "section-1",
    pageName: "Home",
    sectionName: "Hero",
    sourceFile: "index.html",
    repoType
  } as const;
}

function flattenText(plan: SkeletonPlan): string {
  const values: string[] = [];
  function visit(node: SkeletonPlan["elementTree"]): void {
    if (node.textContent) {
      values.push(node.textContent);
    }
    node.children.forEach(visit);
  }
  visit(plan.elementTree);
  return values.join(" ");
}

describe("HTML repo support", () => {
  it("keeps HTML snapshot files text-only so D1 JSON blobs do not include binary assets", () => {
    expect(isRelevantRepoFile("index.html")).toBe(true);
    expect(isRelevantRepoFile("fonts.googleapis.com/css2﹖family=Manrope.css")).toBe(true);
    expect(isRelevantRepoFile("fonts.gstatic.com/s/manrope/v20/font.ttf")).toBe(false);
    expect(isRelevantRepoFile("assets/hero.png")).toBe(false);
    expect(isRelevantRepoFile("media/intro.mp4")).toBe(false);
    expect(isRelevantRepoFile("public/logo.svg")).toBe(false);
  });

  it("detects HTML repos and honors explicit repo type markers", () => {
    const htmlSnapshot: RepositorySnapshot = {
      owner: "local",
      name: "html-site",
      defaultBranch: "main",
      commitSha: "abc",
      files: [{ path: "index.html", content: "<html></html>" }]
    };
    const reactSnapshot: RepositorySnapshot = {
      ...htmlSnapshot,
      files: [
        { path: "index.html", content: "<html></html>" },
        { path: "app/page.tsx", content: "export default function Page(){ return null; }" }
      ]
    };
    const markedSnapshot: RepositorySnapshot = {
      ...reactSnapshot,
      files: [
        ...reactSnapshot.files,
        { path: "webflow-builder.json", content: JSON.stringify({ type: "html" }) }
      ]
    };

    expect(detectRepoType(htmlSnapshot)).toBe("html");
    expect(detectRepoType(reactSnapshot)).toBe("react");
    expect(detectRepoType(markedSnapshot)).toBe("html");
  });

  it("indexes HTML pages and nested semantic sections", () => {
    const extractor = new HtmlRepoExtractor();
    const snapshot: RepositorySnapshot = {
      owner: "local",
      name: "html-site",
      defaultBranch: "main",
      commitSha: "abc",
      files: [
        {
          path: "index.html",
          content: `
            <html><body><div class="page"><main>
              <section id="hero"><h1>Hero title</h1></section>
              <div><article aria-label="Case studies"><h2>Cases</h2></article></div>
              <footer><p>Footer text</p></footer>
            </main></div></body></html>
          `
        },
        {
          path: "about/index.html",
          content: "<main><h1>About</h1><p>About copy</p><h2>Team</h2><p>Team copy</p></main>"
        }
      ]
    };

    const index = extractor.extractRepoIndex("repo-1", snapshot);

    expect(index.pages.map((page) => page.route)).toEqual(["/about", "/"]);
    expect(index.sections).toHaveLength(5);
    expect(index.sections.every((section) => section.metadata.repoType === "html")).toBe(true);
    expect(index.sections.map((section) => section.name)).toEqual([
      "About",
      "Team",
      "Hero",
      "Case Studies",
      "Footer"
    ]);
    expect(index.sections[0].metadata.inlineSourceCode).toContain("<h1>About</h1>");
  });

  it("indexes top-level exported HTML pages and skips private helper downloads", () => {
    const extractor = new HtmlRepoExtractor();
    const snapshot: RepositorySnapshot = {
      owner: "misinc",
      name: "misinc-2026-html",
      defaultBranch: "main",
      commitSha: "abc",
      files: [
        { path: "_downloads.html", content: "<main><h1>Downloads</h1></main>" },
        { path: "index.html", content: "<main><h1>Home</h1></main>" },
        { path: "blog.html", content: "<main><h1>Blog</h1></main>" },
        { path: "case-studies.html", content: "<main><h1>Case Studies</h1></main>" },
        { path: "contact.html", content: "<main><h1>Contact</h1></main>" },
        { path: "resources.html", content: "<main><h1>Resources</h1></main>" },
        { path: "services.html", content: "<main><h1>Services</h1></main>" },
        { path: "assets/preview.html", content: "<main><h1>Asset helper</h1></main>" }
      ]
    };

    const index = extractor.extractRepoIndex("repo-1", snapshot);

    expect(index.pages.map((page) => page.sourceFile)).toEqual([
      "blog.html",
      "case-studies.html",
      "contact.html",
      "index.html",
      "resources.html",
      "services.html"
    ]);
    expect(index.pages.map((page) => page.route)).toEqual([
      "/blog",
      "/case-studies",
      "/contact",
      "/",
      "/resources",
      "/services"
    ]);
  });

  it("indexes nested single-folder HTML exports as root-relative pages", () => {
    const extractor = new HtmlRepoExtractor();
    const snapshot: RepositorySnapshot = {
      owner: "misinc",
      name: "misinc-2026-html",
      defaultBranch: "main",
      commitSha: "abc",
      files: [
        { path: "misinc/index.html", content: "<main><h1>Home</h1></main>" },
        { path: "misinc/blog.html", content: "<main><h1>Blog</h1></main>" },
        { path: "misinc/contact.html", content: "<main><h1>Contact</h1></main>" },
        { path: "misinc/services/index.html", content: "<main><h1>Services</h1></main>" }
      ]
    };

    const index = extractor.extractRepoIndex("repo-1", snapshot);

    expect(index.pages.map((page) => page.sourceFile)).toEqual([
      "misinc/blog.html",
      "misinc/contact.html",
      "misinc/index.html",
      "misinc/services/index.html"
    ]);
    expect(index.pages.map((page) => page.route)).toEqual([
      "/blog",
      "/contact",
      "/",
      "/services"
    ]);
  });

  it("marks previously indexed HTML repos as needing a one-time resync", async () => {
    const repository = new MemoryAppRepository();
    const repo = await repository.createRepo({
      owner: "misinc",
      name: "misinc-2026-html",
      repoUrl: "https://github.com/misinc/misinc-2026-html",
      provider: "github",
      requestedBy: "user-1",
      defaultBranch: "main"
    });
    await repository.replaceRepoIndex(
      repo.id,
      [
        {
          id: "page-1",
          repoId: repo.id,
          name: "Home",
          route: "/",
          sourceFile: "misinc/index.html",
          sortOrder: 0,
          metadata: { repoType: "html" }
        }
      ],
      []
    );

    const bootstrap = await new V2ReadService(
      repository,
      emptyGithubClient,
      {
        canonicalWebflowSiteId: "site-1",
        openAiModel: "test-model"
      }
    ).getBootstrap();

    expect(bootstrap.repos[0]).toMatchObject({
      fullName: "misinc/misinc-2026-html",
      pageCount: 1,
      needsResync: true
    });
  });

  it("parses HTML text only from visible text nodes and generates clean skeleton classes", () => {
    const plan = htmlToSkeletonPlan({
      metadata: metadata(),
      sourceCode: messyHtml,
      sharedStyleContext
    });

    expect(plan).not.toBeNull();
    const text = flattenText(plan!);
    expect(text).toContain("Real human headline");
    expect(text).toContain("Visible body copy with link .");
    expect(text).not.toContain("Do not leak");
    expect(text).not.toContain("hero-wrap");
    expect(text).not.toContain("Attribute text must not become visible copy");
    expect(plan!.elementTree.classNames).toEqual(["section_hero"]);
    expect(plan!.elementTree.classNames).not.toContain("hero-wrap");
    expect(plan!.elementTree.classNames).not.toContain("md:py-[120px]");
    expect(plan!.treeText).not.toContain("hero-wrap");
    expect(plan!.treeText).not.toContain("md:py-[120px]");
    expect(serializeSkeletonTree(plan!.elementTree)).toContain(
      "section.section_hero\n  div.padding-global\n    div.container-large\n      div.padding-section-medium\n        div.hero_component"
    );
  });

  it("does not turn HTML source classes into site style plan repo decisions", async () => {
    const repository = new MemoryAppRepository();
    const repo = await repository.createRepo({
      owner: "local",
      name: "html-site",
      repoUrl: "https://github.com/local/html-site",
      provider: "github",
      requestedBy: "user-1",
      defaultBranch: "main"
    });
    await repository.replaceRepoIndex(
      repo.id,
      [
        {
          id: "page-1",
          repoId: repo.id,
          name: "Home",
          route: "/",
          sourceFile: "index.html",
          sortOrder: 0,
          metadata: { repoType: "html" }
        }
      ],
      [
        {
          id: "section-1",
          repoId: repo.id,
          pageId: "page-1",
          name: "Hero",
          sectionKey: "hero",
          sourceFile: "index.html",
          importPath: "index.html",
          sortOrder: 0,
          componentName: "Hero",
          metadata: { repoType: "html", inlineSourceCode: messyHtml }
        }
      ]
    );

    const service = new SiteStylePlanService(repository);
    const confirmed = await service.confirmPlan({
      repoId: repo.id,
      webflowSiteId: "site-1",
      requestedBy: "user-1",
      sharedStyleContext
    });

    expect(confirmed.classDecisions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceClassName: "hero-wrap" }),
        expect.objectContaining({ sourceClassName: "md:py-[120px]" })
      ])
    );

    const plan = htmlToSkeletonPlan({
      metadata: metadata(),
      sourceCode: messyHtml,
      sharedStyleContext
    });

    expect(plan!.elementTree.classNames).toEqual(["section_hero"]);
    expect(plan!.elementTree.classNames).not.toContain("hero-wrap");
    expect(plan!.elementTree.classNames).not.toContain("md:py-[120px]");
  });

  it("keeps generated HTML skeleton classes when a draft site style plan exists", async () => {
    const repository = new MemoryAppRepository();
    const repo = await repository.createRepo({
      owner: "local",
      name: "html-site",
      repoUrl: "https://github.com/local/html-site",
      provider: "github",
      requestedBy: "user-1",
      defaultBranch: "main"
    });
    await repository.replaceRepoIndex(
      repo.id,
      [
        {
          id: "page-1",
          repoId: repo.id,
          name: "Home",
          route: "/",
          sourceFile: "index.html",
          sortOrder: 0,
          metadata: { repoType: "html" }
        }
      ],
      [
        {
          id: "section-1",
          repoId: repo.id,
          pageId: "page-1",
          name: "Hero",
          sectionKey: "hero",
          sourceFile: "index.html",
          importPath: "index.html",
          sortOrder: 0,
          componentName: "Hero",
          metadata: { repoType: "html", inlineSourceCode: messyHtml }
        }
      ]
    );
    const draft = await new SiteStylePlanService(repository).rebuildPlan({
      repoId: repo.id,
      webflowSiteId: "site-1",
      requestedBy: "user-1",
      sharedStyleContext
    });
    const rawPlan = htmlToSkeletonPlan({
      metadata: metadata(),
      sourceCode: messyHtml,
      sharedStyleContext
    });

    const normalized = normalizeSkeletonPlan(rawPlan!, { siteStylePlan: draft });

    expect(draft.status).toBe("draft");
    expect(normalized.elementTree.classNames).toEqual(["section_hero"]);
    expect(normalized.elementTree.classNames).not.toContain("hero-wrap");
    expect(normalized.elementTree.classNames).not.toContain("md:py-[120px]");
    expect(normalized.treeText).toContain("section_hero");
    expect(normalized.treeText).not.toContain("hero-wrap");
    expect(normalized.treeText).not.toContain("md:py-[120px]");
  });

  it("styles an approved HTML skeleton with deterministic fallback classes", async () => {
    const repository = new MemoryAppRepository();
    const blobStore = new MemoryBlobStore();
    const repo = await repository.createRepo({
      owner: "local",
      name: "html-site",
      repoUrl: "https://github.com/local/html-site",
      provider: "github",
      requestedBy: "user-1",
      defaultBranch: "main"
    });
    await repository.replaceRepoIndex(
      repo.id,
      [
        {
          id: "page-1",
          repoId: repo.id,
          name: "Home",
          route: "/",
          sourceFile: "index.html",
          sortOrder: 0,
          metadata: { repoType: "html" }
        }
      ],
      [
        {
          id: "section-1",
          repoId: repo.id,
          pageId: "page-1",
          name: "Solutions",
          sectionKey: "solutions",
          sourceFile: "index.html",
          importPath: "index.html",
          sortOrder: 0,
          componentName: "Solutions",
          metadata: { repoType: "html", inlineSourceCode: solutionsHtml }
        }
      ]
    );
    await repository.upsertSiteBinding({
      repoId: repo.id,
      webflowSiteId: "site-1",
      requestedBy: "user-1",
      sharedStyleContext
    });
    await repository.upsertPageMappings({
      repoId: repo.id,
      webflowSiteId: "site-1",
      requestedBy: "user-1",
      mappings: [
        {
          webflowPageId: "webflow-page-1",
          webflowPageName: "Home",
          webflowPageRoute: "/",
          repoPageId: "page-1"
        }
      ]
    });
    await repository.replaceSectionWorkflowStates(
      "user-1",
      "site-1",
      "webflow-page-1",
      "page-1",
      [{ repoSectionId: "section-1", sortOrder: 0 }]
    );
    await blobStore.putJson(`repos/${repo.id}/snapshots/latest.json`, {
      owner: "local",
      name: "html-site",
      defaultBranch: "main",
      commitSha: "abc",
      files: [
        { path: "index.html", content: solutionsHtml },
        { path: "assets/index.css", content: solutionsCss }
      ]
    });
    const workflow = new WorkflowService(
      repository,
      blobStore,
      new HtmlRepoExtractor() as never,
      fallbackOnlyProvider
    );

    const skeleton = await workflow.generateSkeleton({
      repoId: repo.id,
      webflowSiteId: "site-1",
      webflowPageId: "webflow-page-1",
      sectionId: "section-1",
      requestedBy: "user-1",
      mode: "fullAssist",
      sharedStyleContext
    });
    expect(serializeSkeletonTree(skeleton.elementTree)).toContain("div.solutions_grid");
    expect(serializeSkeletonTree(skeleton.elementTree)).toContain("div.solutions_feature");
    expect(serializeSkeletonTree(skeleton.elementTree)).toContain("div.solutions_pill_list");
    expect(serializeSkeletonTree(skeleton.elementTree)).toContain("div.solutions_card_list");
    expect(serializeSkeletonTree(skeleton.elementTree)).toContain("div.solutions_item");
    expect(serializeSkeletonTree(skeleton.elementTree)).toContain("div.solutions_card_title");
    expect(serializeSkeletonTree(skeleton.elementTree)).toContain("Retail / Ecommerce");
    await workflow.recordSkeletonPlacement({
      repoId: repo.id,
      webflowSiteId: "site-1",
      webflowPageId: "webflow-page-1",
      sectionId: "section-1",
      requestedBy: "user-1",
      rootNodeId: "runtime-root-1",
      nodeIdMap: { [skeleton.elementTree.id]: "runtime-root-1" }
    });
    await workflow.approveSkeleton({
      repoId: repo.id,
      webflowSiteId: "site-1",
      webflowPageId: "webflow-page-1",
      sectionId: "section-1",
      requestedBy: "user-1"
    });

    const styling = await workflow.styleSection({
      repoId: repo.id,
      webflowSiteId: "site-1",
      webflowPageId: "webflow-page-1",
      sectionId: "section-1",
      requestedBy: "user-1",
      mode: "fullAssist",
      sharedStyleContext
    });

    expect(styling.styleDefinitions.map((definition) => definition.className)).toEqual(
      expect.arrayContaining([
        "section_solutions",
        "solutions_component",
        "solutions_grid",
        "solutions_feature",
        "solutions_pill_list",
        "solutions_pill",
        "solutions_card_list",
        "solutions_card",
        "solutions_card_title",
        "solutions_card_heading"
      ])
    );
    expect(styling.styleDefinitions.length).toBeGreaterThan(8);
    expect(
      styling.styleDefinitions.find((definition) => definition.className === "solutions_grid")
        ?.properties["grid-template-columns"]
    ).toBe("1.11fr 1.44fr");
    expect(
      styling.styleDefinitions.find((definition) => definition.className === "solutions_grid")
        ?.properties.gap
    ).toBe("21px");
    expect(
      styling.styleDefinitions.find((definition) => definition.className === "solutions_card_list")
        ?.properties["grid-template-columns"]
    ).toBe("repeat(2, minmax(0, 1fr))");
    expect(
      styling.styleDefinitions.find((definition) => definition.className === "solutions_feature")
        ?.properties["border-radius"]
    ).toBe("31px");
    expect(
      styling.styleDefinitions.find((definition) => definition.className === "solutions_card")
        ?.properties["min-height"]
    ).toBe("212px");
    expect(
      styling.styleDefinitions.find((definition) => definition.className === "solutions_pill")
        ?.properties.width
    ).toBeUndefined();
    expect(
      styling.styleDefinitions.find((definition) => definition.className === "solutions_card_title")
        ?.properties.display
    ).toBe("flex");
    expect(
      styling.styleDefinitions.find((definition) => definition.className === "solutions_card_text")
        ?.properties.color
    ).toBe("#8f6a35");
    expect(
      styling.styleDefinitions.find((definition) => definition.className === "solutions_feature")
        ?.properties.background
    ).toContain("linear-gradient");
    expect(styling.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "styling-html-fallback" })
      ])
    );

    const retryStyling = await workflow.styleSection({
      repoId: repo.id,
      webflowSiteId: "site-1",
      webflowPageId: "webflow-page-1",
      sectionId: "section-1",
      requestedBy: "user-1",
      mode: "fullAssist",
      sharedStyleContext
    });

    expect(retryStyling.styleDefinitions.length).toBeGreaterThan(0);
  });

  it("normalizes HTML skeletons without DSL reparsing or class stripping", () => {
    const plan: SkeletonPlan = {
      sectionMetadata: metadata(),
      treeText: "section.reparsed-only",
      elementTree: {
        id: "root",
        type: "section",
        tag: "section",
        classNames: ["hero-wrap", "md:py-[120px]"],
        children: [
          {
            id: "heading",
            type: "heading",
            tag: "h1",
            classNames: ["headline"],
            textContent: "Visible heading",
            children: []
          }
        ]
      },
      assetBindings: [],
      reusableClasses: [],
      suggestedNewClasses: [],
      warnings: []
    };

    const normalized = normalizeSkeletonPlan(plan);

    expect(normalized.elementTree.classNames).toEqual(["hero-wrap", "md:py-[120px]"]);
    expect(normalized.treeText).not.toContain("reparsed-only");
    expect(normalized.treeText).toContain("md:py-[120px]");
  });
});
