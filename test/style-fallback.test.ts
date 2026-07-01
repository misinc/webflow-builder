import { describe, expect, it } from "vitest";
import { shouldFallbackStylingPlan } from "@wfb/backend-core/planner/style-fallback.js";
import type { StylingPlan } from "@wfb/shared/contracts.js";

function plan(overrides: Partial<StylingPlan>): StylingPlan {
  return {
    sectionMetadata: {
      repoId: "repo-1",
      pageId: "page-1",
      sectionId: "section-1",
      pageName: "About",
      sectionName: "Jurisdictions",
      sourceFile: "about.tsx"
    },
    mode: "styleExisting",
    styleDefinitions: [],
    variableBindings: [],
    reusableClasses: [],
    suggestedNewClasses: [],
    requiredClassNames: [],
    notes: [],
    warnings: [],
    ...overrides
  };
}

describe("style fallback helpers", () => {
  it("flags an empty styling plan for fallback", () => {
    expect(shouldFallbackStylingPlan(plan({}))).toBe(true);
  });

  it("does not flag a plan with material style definitions", () => {
    expect(
      shouldFallbackStylingPlan(
        plan({
          styleDefinitions: [{ className: "x_card", properties: { display: "grid" }, shared: false }]
        })
      )
    ).toBe(false);
  });

  it("flags a plan that carries a styling-fallback warning", () => {
    expect(
      shouldFallbackStylingPlan(
        plan({
          styleDefinitions: [{ className: "x_card", properties: { display: "grid" }, shared: false }],
          warnings: [{ code: "styling-fallback", message: "low signal", level: "warning" }]
        })
      )
    ).toBe(true);
  });
});
