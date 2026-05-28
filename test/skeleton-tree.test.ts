import { describe, expect, it } from "vitest";
import {
  normalizeSkeletonPlan,
  parseSkeletonTreeText,
  serializeSkeletonTree
} from "../extension/src/skeleton/tree.js";
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

  it("parses textblock pseudo-tags as div nodes", () => {
    const plan = parseSkeletonTreeText(
      basePlan(),
      'section.section-name\n  textblock.text-style-tagline "FOUNDED IN 1995"'
    );

    expect(plan.elementTree.children[0]?.tag).toBe("div");
    expect(plan.elementTree.children[0]?.classNames).toEqual(["text-style-tagline"]);
    expect(plan.elementTree.children[0]?.textContent).toBe("FOUNDED IN 1995");
  });

  it("serializes tagline-style div nodes back to textblock syntax", () => {
    const normalized = normalizeSkeletonPlan(
      parseSkeletonTreeText(
        basePlan(),
        'section.section-name\n  p.text-style-tagline "FOUNDED IN 1995"'
      )
    );

    expect(serializeSkeletonTree(normalized.elementTree)).toContain(
      'textblock.text-style-tagline "FOUNDED IN 1995"'
    );
    expect(normalized.treeText).toContain('textblock.text-style-tagline "FOUNDED IN 1995"');
  });
});
