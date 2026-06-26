import { describe, expect, it } from "vitest";
import {
  buildFallbackStylingFromSkeleton,
  shouldFallbackStylingPlan
} from "@wfb/backend-core/planner/style-fallback.js";
import {
  SectionContext,
  SharedStyleContext,
  SkeletonPlan,
  StylingPlan
} from "@wfb/shared/contracts.js";

const sharedStyleContext: SharedStyleContext = {
  siteId: "site-1",
  capturedAt: new Date().toISOString(),
  classes: [
    { name: "padding-global", category: "layout" },
    { name: "container-large", category: "layout" },
    { name: "padding-section-medium", category: "spacing" },
    { name: "heading-style-h2", category: "heading" },
    { name: "heading-style-h3", category: "heading" },
    { name: "text-size-medium", category: "text" }
  ],
  variables: [],
  styleIds: []
};

const sectionContext: SectionContext = {
  repoId: "repo-1",
  pageName: "About",
  pageSourceFile: "src/app/pages/about.tsx",
  sectionName: "Jurisdictions",
  sectionSourceFile: "src/app/pages/about.tsx",
  componentName: "JurisdictionsSection",
  sectionOrder: 3,
  sourceCode:
    '<section class="bg-secondary py-20"><div class="max-w-3xl mx-auto"><p class="text-center mb-8">Intro</p><div class="grid grid-cols-1 md:grid-cols-2 gap-6"><div class="bg-white p-6 rounded"><h3>Trial Courts</h3><ul class="space-y-2"><li>Central District</li></ul></div><div class="bg-white p-6 rounded"><h3>Appellate Courts</h3><ul class="space-y-2"><li>Ninth Circuit</li></ul></div></div></div></section>',
  relevantStylesheets: [],
  assetReferences: [],
  contentHints: [],
  relatedSharedClasses: []
};

const skeleton: SkeletonPlan = {
  sectionMetadata: {
    repoId: "repo-1",
    pageId: "page-1",
    sectionId: "section-1",
    pageName: "About",
    sectionName: "Jurisdictions",
    sourceFile: "src/app/pages/about.tsx"
  },
  treeText: "",
  elementTree: {
    id: "root",
    type: "box",
    tag: "section",
    classNames: ["section_jurisdictions"],
    children: [
      {
        id: "padding",
        type: "box",
        tag: "div",
        classNames: ["padding-global"],
        children: [
          {
            id: "container",
            type: "box",
            tag: "div",
            classNames: ["container-large"],
            children: [
              {
                id: "spacing",
                type: "box",
                tag: "div",
                classNames: ["padding-section-medium"],
                children: [
                  {
                    id: "component",
                    type: "box",
                    tag: "div",
                    classNames: ["jurisdictions_component"],
                    children: [
                      {
                        id: "heading",
                        type: "heading",
                        tag: "h2",
                        classNames: ["heading-style-h2"],
                        textContent: "Jurisdictions Served",
                        children: []
                      },
                      {
                        id: "content",
                        type: "box",
                        tag: "div",
                        classNames: ["jurisdictions_content"],
                        children: [
                          {
                            id: "body",
                            type: "text",
                            tag: "p",
                            classNames: ["text-size-medium"],
                            textContent: "Intro",
                            children: []
                          },
                          {
                            id: "cards",
                            type: "box",
                            tag: "div",
                            classNames: ["jurisdictions_list"],
                            children: [
                              {
                                id: "item-1",
                                type: "box",
                                tag: "div",
                                classNames: ["jurisdictions_item"],
                                children: []
                              },
                              {
                                id: "item-2",
                                type: "box",
                                tag: "div",
                                classNames: ["jurisdictions_item"],
                                children: []
                              }
                            ]
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  assetBindings: [],
  reusableClasses: [],
  suggestedNewClasses: [],
  warnings: []
};

describe("style fallback helpers", () => {
  it("flags an empty styling plan for fallback", () => {
    const emptyPlan: StylingPlan = {
      sectionMetadata: skeleton.sectionMetadata,
      mode: "styleExisting",
      styleDefinitions: [],
      variableBindings: [],
      reusableClasses: [],
      suggestedNewClasses: [],
      requiredClassNames: [],
      notes: [],
      warnings: []
    };

    expect(shouldFallbackStylingPlan(emptyPlan)).toBe(true);
  });

  it("builds structural styles from the latest skeleton and source utilities", () => {
    const styling = buildFallbackStylingFromSkeleton({
      metadata: skeleton.sectionMetadata,
      mode: "styleExisting",
      sectionContext,
      sharedStyleContext,
      skeleton
    });

    expect(
      styling.styleDefinitions.find((definition) => definition.className === "section_jurisdictions")
        ?.properties["background-color"]
    ).toBe("#f5f5f5");
    expect(
      styling.styleDefinitions.find((definition) => definition.className === "jurisdictions_content")
        ?.properties["text-align"]
    ).toBe("center");
    expect(
      styling.styleDefinitions.find((definition) => definition.className === "jurisdictions_list")
        ?.properties["grid-template-columns"]
    ).toBe("repeat(2, minmax(0, 1fr))");
    expect(
      styling.styleDefinitions.find((definition) => definition.className === "jurisdictions_item")
        ?.properties.padding
    ).toBe("1.5rem");
    expect(
      styling.warnings.some((warning) => warning.code === "styling-html-fallback")
    ).toBe(true);
  });
});
