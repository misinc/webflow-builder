import { describe, expect, it } from "vitest";
import { HtmlRepoExtractor } from "@wfb/backend-core/extractor/html-extractor.js";
import { detectRepoType } from "@wfb/backend-core/extractor/repo-type.js";
import { htmlToSkeletonPlan } from "@wfb/backend-core/planner/html-planner.js";
import { MemoryAppRepository } from "@wfb/backend-core/repositories/memory-app-repository.js";
import { SiteStylePlanService } from "@wfb/backend-core/services/site-style-plan-service.js";
import { V2ReadService } from "@wfb/backend-core/services/v2-read-service.js";
import {
  AvailableRepository,
  GitHubRepositoryClient,
  isRelevantRepoFile,
  RepositorySnapshot
} from "@wfb/backend-core/github/client.js";
import { normalizeSkeletonPlan } from "../extension/src/skeleton/tree.js";
import type { SharedStyleContext, SkeletonPlan } from "@wfb/shared/contracts.js";

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

  it("parses HTML text only from visible text nodes and preserves source classes", () => {
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
    expect(plan!.elementTree.classNames).toContain("hero-wrap");
    expect(plan!.elementTree.classNames).toContain("md:py-[120px]");
  });

  it("maps confirmed site style plan class decisions onto HTML skeletons", async () => {
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
    const utilityDecision = confirmed.classDecisions.find(
      (decision) => decision.sourceClassName === "md:py-[120px]"
    );

    expect(utilityDecision).toMatchObject({
      action: "create",
      targetClassName: "html_md-py-120px"
    });

    const plan = htmlToSkeletonPlan({
      metadata: metadata(),
      sourceCode: messyHtml,
      siteStylePlan: confirmed,
      sharedStyleContext
    });

    expect(plan!.elementTree.classNames).toContain("html_md-py-120px");
    expect(plan!.elementTree.classNames).not.toContain("md:py-[120px]");
  });

  it("normalizes HTML skeletons with draft site style plan mappings before review", async () => {
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
    expect(normalized.elementTree.classNames).toContain("html_md-py-120px");
    expect(normalized.elementTree.classNames).not.toContain("md:py-[120px]");
    expect(normalized.treeText).toContain("html_md-py-120px");
    expect(normalized.treeText).not.toContain("md:py-[120px]");
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
