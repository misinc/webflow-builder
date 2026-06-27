import { describe, expect, it } from "vitest";
import { HeuristicBuildPlanner } from "@wfb/backend-core/planner/heuristic-planner.js";
import {
  BuildNode,
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

function findNodeById(node: BuildNode, id: string): BuildNode | null {
  if (node.id === id) {
    return node;
  }
  for (const child of node.children) {
    const match = findNodeById(child, id);
    if (match) {
      return match;
    }
  }
  return null;
}

function collectText(node: BuildNode): string[] {
  return [
    ...(node.textContent ? [node.textContent] : []),
    ...node.children.flatMap(collectText)
  ];
}

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

  it("produces deterministic trees and class assignments for the same source", () => {
    const planner = new HeuristicBuildPlanner();
    const input = {
      pageId: "page-1",
      sectionId: "section-1",
      sectionContext,
      projectContext,
      sharedStyleContext
    };

    const first = planner.plan(input);
    const second = planner.plan(input);

    expect(first.elementTree).toEqual(second.elementTree);
    expect(first.classAssignments).toEqual(second.classAssignments);
    expect(first.styleDefinitions).toEqual(second.styleDefinitions);
    expect(first.elementTree.classNames).toContain("section_hero");
    expect(first.elementTree.classNames).not.toContain("section");
    expect(
      first.classAssignments.flatMap((assignment) => assignment.classNames)
    ).toContain("padding-global");
  });

  it("uses source content instead of generic internal fallback copy", () => {
    const planner = new HeuristicBuildPlanner();
    const plan = planner.plan({
      pageId: "page-1",
      sectionId: "section-1",
      sectionContext: {
        ...sectionContext,
        sectionName: "Solutions",
        componentName: "Solutions",
        sourceCode: [
          "export function Solutions() {",
          "  return <section><p>Designed for teams</p><h2>Practical Webflow builds</h2><p>Reusable sections that match your repo source.</p></section>;",
          "}"
        ].join("\n"),
        contentHints: []
      },
      projectContext,
      sharedStyleContext
    });

    const bodyNode = findNodeById(plan.elementTree, "solutions-body");

    expect(bodyNode?.textContent).toBe("Reusable sections that match your repo source.");
    expect(bodyNode?.textContent).not.toContain("Unsupported patterns become warnings");
    expect(collectText(plan.elementTree)).not.toContain("Repo extraction");
  });

  it("does not invent list text for dynamic-only source content", () => {
    const planner = new HeuristicBuildPlanner();
    const plan = planner.plan({
      pageId: "page-1",
      sectionId: "section-1",
      sectionContext: {
        ...sectionContext,
        sectionName: "Solutions",
        componentName: "Solutions",
        sourceCode: [
          "export function Solutions() {",
          "  return <section><div>{industries.map((industry, index) => {",
          "    const Icon = industry.icon;",
          "    return <article key={industry.title}><h3>{industry.title}</h3><p>{industry.copy}</p></article>;",
          "  })}</div></section>;",
          "}"
        ].join("\n"),
        contentHints: []
      },
      projectContext,
      sharedStyleContext
    });

    const text = collectText(plan.elementTree);

    expect(text).not.toContain("Repo extraction");
    expect(text).not.toContain("Plan validation");
    expect(text).not.toContain("Designer execution");
    expect(text.some((value) => value.includes("});"))).toBe(false);
  });
});
