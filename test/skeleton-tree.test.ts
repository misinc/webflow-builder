import { describe, expect, it } from "vitest";
import { parseSkeletonTreeText } from "../extension/src/skeleton/tree.js";
import { SkeletonPlan } from "../src/shared/contracts.js";

function basePlan(): SkeletonPlan {
  return {
    sectionMetadata: {
      repoId: "repo-1",
      pageId: "page-1",
      sectionId: "section-1",
      pageName: "Home",
      sectionName: "Solutions",
      sourceFile: "Solutions.tsx"
    },
    treeText: "",
    elementTree: {
      id: "root",
      type: "box",
      tag: "section",
      classNames: ["placeholder"],
      children: []
    },
    reusableClasses: [],
    suggestedNewClasses: [],
    warnings: []
  };
}

describe("parseSkeletonTreeText", () => {
  it("parses tree-glyph skeleton text into a nested element tree", () => {
    const plan = parseSkeletonTreeText(
      basePlan(),
      [
        "section.section-name",
        "   └─ div.padding-global",
        "      └─ div.container-large",
        "         └─ div.padding-section-medium",
        "            └─ div.section-name_component",
        "               ├─ div.section-name_content",
        "               └─ div.section-name_visual"
      ].join("\n")
    );

    expect(plan.elementTree.tag).toBe("section");
    expect(plan.elementTree.children[0]?.classNames).toEqual(["padding-global"]);
    expect(
      plan.elementTree.children[0]?.children[0]?.children[0]?.children[0]?.children.map(
        (child) => child.classNames[0]
      )
    ).toEqual(["section-name_content", "section-name_visual"]);
  });

  it("parses a compact inline chain into nested nodes", () => {
    const plan = parseSkeletonTreeText(
      basePlan(),
      "section.section-name -> div.padding-global -> div.container-large"
    );

    expect(plan.elementTree.tag).toBe("section");
    expect(plan.elementTree.children[0]?.tag).toBe("div");
    expect(plan.elementTree.children[0]?.children[0]?.classNames).toEqual([
      "container-large"
    ]);
  });
});
