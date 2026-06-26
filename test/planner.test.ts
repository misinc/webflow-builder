import { describe, expect, it } from "vitest";
import { HeuristicBuildPlanner } from "@wfb/backend-core/planner/heuristic-planner.js";
import {
  ProjectContext,
  SectionContext,
  SharedStyleContext
} from "@wfb/shared/contracts.js";

const projectContext: ProjectContext = {
  namingRules: [],
  sharedTextClasses: ["text-size-medium"],
  sharedHeadingClasses: ["heading-style-h1", "heading-style-h2"],
  sharedButtonClasses: ["button", "button-secondary"],
  spacingVariableRules: ["space-large"],
  colorVariableRules: ["color-brand"],
  forbiddenPatterns: [],
  allowedNewClassPolicy: "layout-only"
};

const sharedStyleContext: SharedStyleContext = {
  siteId: "site-1",
  capturedAt: new Date().toISOString(),
  classes: [
    { name: "padding-global", category: "layout" },
    { name: "container-large", category: "layout" },
    { name: "padding-section-large", category: "spacing" },
    { name: "heading-style-h1", category: "heading" },
    { name: "heading-style-h2", category: "heading" },
    { name: "text-size-small", category: "text" },
    { name: "text-size-medium", category: "text" },
    { name: "button", category: "button" },
    { name: "button-secondary", category: "button" }
  ],
  variables: [{ name: "space-large", category: "spacing", value: "64px" }],
  styleIds: []
};

const sectionContext: SectionContext = {
  repoId: "repo-1",
  pageName: "Home",
  pageSourceFile: "src/app/pages/Home.tsx",
  sectionName: "Hero",
  sectionSourceFile: "src/app/components/sections/Hero.tsx",
  componentName: "HeroSection",
  sectionOrder: 0,
  sourceCode: "export function HeroSection() { return null; }",
  relevantStylesheets: [],
  assetReferences: ["images/hero-banner.png"],
  contentHints: [],
  relatedSharedClasses: []
};

describe("HeuristicBuildPlanner", () => {
  it("binds image assets to the image node when one exists", () => {
    const planner = new HeuristicBuildPlanner();
    const plan = planner.plan({
      pageId: "page-1",
      sectionId: "section-1",
      sectionContext,
      projectContext,
      sharedStyleContext
    });

    expect(plan.assetBindings).toEqual([
      {
        nodeId: "hero-image",
        source: "images/hero-banner.png",
        fallback: "placeholder"
      }
    ]);
  });
});
