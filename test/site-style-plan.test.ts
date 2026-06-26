import { describe, expect, it } from "vitest";
import { MemoryBlobStore } from "@wfb/backend-core/blob/blob-store.js";
import { MisRepoExtractor } from "@wfb/backend-core/extractor/mis-extractor.js";
import { PlanningProvider } from "@wfb/backend-core/planner/planning-provider.js";
import { MemoryAppRepository } from "@wfb/backend-core/repositories/memory-app-repository.js";
import { SiteStylePlanService } from "@wfb/backend-core/services/site-style-plan-service.js";
import { WorkflowService } from "@wfb/backend-core/services/workflow-service.js";
import {
  SectionAnalysis,
  SectionVerification,
  SharedStyleContext,
  SkeletonPlan,
  StylingPlan
} from "@wfb/shared/contracts.js";

const sharedStyleContext: SharedStyleContext = {
  siteId: "site-1",
  capturedAt: new Date().toISOString(),
  classes: [
    { name: "text-size-medium", category: "text" },
    { name: "padding-global", category: "layout" }
  ],
  variables: [{ name: "color-brand", category: "color", value: "#146ef5" }],
  styleIds: []
};

async function seedRepo(repository: MemoryAppRepository, blobStore: MemoryBlobStore) {
  const repo = await repository.createRepo({
    owner: "misinc",
    name: "demo",
    repoUrl: "https://github.com/misinc/demo",
    provider: "github",
    requestedBy: "user-1",
    defaultBranch: "main"
  });
  const repoId = repo.id;
  await repository.replaceRepoIndex(
    repoId,
    [
      {
        id: "page-1",
        repoId,
        name: "Home",
        route: "/",
        sourceFile: "src/app/pages/home.tsx",
        sourceCode: "",
        sortOrder: 0,
        metadata: {}
      }
    ],
    [
      {
        id: "section-1",
        repoId,
        pageId: "page-1",
        name: "Hero",
        sectionKey: "hero",
        sourceFile: "src/app/components/sections/Hero.tsx",
        sourceCode: "",
        importPath: "@/app/components/sections/Hero",
        sortOrder: 0,
        componentName: "Hero",
        metadata: {
          inlineSourceCode:
            '<section className="hero_wrap text-size-medium"><div className="hero_card">Hello</div></section>'
        }
      }
    ]
  );
  await repository.upsertSiteBinding({
    repoId,
    webflowSiteId: "site-1",
    requestedBy: "user-1",
    sharedStyleContext
  });
  await repository.upsertPageMappings({
    repoId,
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
  await blobStore.putJson(`repos/${repoId}/snapshots/latest.json`, {
    repoId,
    commitSha: "abc123",
    branch: "main",
    files: [
      {
        path: "src/app/pages/home.tsx",
        content:
          'import Hero from "@/app/components/sections/Hero"; export default function Home(){ return <Hero />; }'
      },
      {
        path: "src/app/components/sections/Hero.tsx",
        content:
          'export default function Hero(){ return <section className="hero_wrap text-size-medium"><div className="hero_card">Hello</div></section>; }'
      }
    ]
  });
  return repoId;
}

function providerWithUnplannedClass(repoId: string): PlanningProvider {
  return {
    async analyzeSection(): Promise<SectionAnalysis> {
      throw new Error("not used");
    },
    async generateSkeleton(): Promise<SkeletonPlan> {
      throw new Error("not used");
    },
    async generateStylingPlan(): Promise<StylingPlan> {
      return {
        sectionMetadata: {
          repoId,
          pageId: "page-1",
          sectionId: "section-1",
          pageName: "Home",
          sectionName: "Hero",
          sourceFile: "src/app/components/sections/Hero.tsx"
        },
        mode: "fullAssist",
        styleDefinitions: [
          { className: "hero_wrap", properties: { display: "block" }, shared: false },
          { className: "provider_only", properties: { color: "red" }, shared: false }
        ],
        variableBindings: [],
        reusableClasses: ["text-size-medium"],
        suggestedNewClasses: ["provider_only"],
        requiredClassNames: ["hero_wrap", "provider_only"],
        notes: [],
        warnings: []
      };
    },
    async verifySection(): Promise<SectionVerification> {
      throw new Error("not used");
    }
  };
}

describe("site style plans", () => {
  it("plans repo classes against existing Webflow shared classes", async () => {
    const repository = new MemoryAppRepository();
    const blobStore = new MemoryBlobStore();
    const repoId = await seedRepo(repository, blobStore);

    const service = new SiteStylePlanService(repository);
    const plan = await service.rebuildPlan({
      repoId,
      webflowSiteId: "site-1",
      requestedBy: "user-1",
      sharedStyleContext
    });

    expect(plan.status).toBe("draft");
    expect(plan.classCounts.repo).toBe(3);
    expect(plan.classDecisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceClassName: "text-size-medium",
          action: "reuse"
        }),
        expect.objectContaining({ sourceClassName: "hero_wrap", action: "create" }),
        expect.objectContaining({ sourceClassName: "hero_card", action: "create" })
      ])
    );

    const confirmed = await service.confirmPlan({
      repoId,
      webflowSiteId: "site-1",
      requestedBy: "user-1",
      sharedStyleContext
    });
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.confirmedAt).toBeTruthy();
  });

  it("warns when styling references classes outside the confirmed global plan", async () => {
    const repository = new MemoryAppRepository();
    const blobStore = new MemoryBlobStore();
    const repoId = await seedRepo(repository, blobStore);
    await new SiteStylePlanService(repository).confirmPlan({
      repoId,
      webflowSiteId: "site-1",
      requestedBy: "user-1",
      sharedStyleContext
    });

    const workflow = new WorkflowService(
      repository,
      blobStore,
      new MisRepoExtractor(),
      providerWithUnplannedClass(repoId)
    );
    const styling = await workflow.styleSection({
      repoId,
      webflowSiteId: "site-1",
      webflowPageId: "webflow-page-1",
      sectionId: "section-1",
      requestedBy: "user-1",
      mode: "fullAssist",
      sharedStyleContext
    });

    expect(styling.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "style-plan-unplanned-class",
          message: expect.stringContaining("provider_only")
        })
      ])
    );
  });
});
