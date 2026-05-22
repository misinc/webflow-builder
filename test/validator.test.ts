import { describe, expect, it } from "vitest";
import {
  BuildPlan,
  ProjectContext,
  SharedStyleContext
} from "../src/shared/contracts.js";
import { BuildPlanValidator } from "../src/backend/validation/build-plan-validator.js";

const projectContext: ProjectContext = {
  namingRules: [],
  sharedTextClasses: ["text-size-medium"],
  sharedHeadingClasses: ["heading-style-h1"],
  sharedButtonClasses: ["button"],
  spacingVariableRules: ["space-large"],
  colorVariableRules: ["color-brand"],
  forbiddenPatterns: [],
  allowedNewClassPolicy: "layout-only"
};

const sharedStyleContext: SharedStyleContext = {
  siteId: "site-1",
  capturedAt: new Date().toISOString(),
  classes: [
    { name: "text-size-medium", category: "text" },
    { name: "heading-style-h1", category: "heading" },
    { name: "button", category: "button" }
  ],
  variables: [{ name: "color-brand", category: "color", value: "#123456" }],
  styleIds: []
};

describe("BuildPlanValidator", () => {
  it("rejects page-scoped class names", () => {
    const validator = new BuildPlanValidator();
    const plan: BuildPlan = {
      sectionMetadata: {
        repoId: "repo-1",
        pageId: "page-1",
        sectionId: "section-1",
        pageName: "Home",
        sectionName: "Hero",
        sourceFile: "src/app/components/sections/Hero.tsx"
      },
      elementTree: {
        id: "root",
        type: "section",
        tag: "section",
        classNames: ["home_hero"],
        children: []
      },
      classAssignments: [
        {
          nodeId: "root",
          classNames: ["home_hero"],
          reused: [],
          created: ["home_hero"]
        }
      ],
      styleDefinitions: [],
      variableBindings: [],
      assetBindings: [],
      warnings: []
    };

    expect(() =>
      validator.validate({ plan, projectContext, sharedStyleContext })
    ).toThrow(/Page-scoped class names/);
  });
});
