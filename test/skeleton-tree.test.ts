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

  it("normalizes stat-value paragraphs into textblock syntax", () => {
    const normalized = normalizeSkeletonPlan(
      parseSkeletonTreeText(
        basePlan(),
        'section.section-name\n  p.authority_item_value "50+"'
      )
    );

    expect(serializeSkeletonTree(normalized.elementTree)).toContain(
      'textblock.authority_item_value "50+"'
    );
    expect(normalized.elementTree.children[0]?.tag).toBe("div");
  });

  it("normalizes blockquote-class paragraphs into native blockquote nodes", () => {
    const normalized = normalizeSkeletonPlan(
      parseSkeletonTreeText(
        basePlan(),
        'section.section-name\n  p.blockquote.text-style-italic "Quoted disclaimer copy"'
      )
    );

    expect(serializeSkeletonTree(normalized.elementTree)).toContain(
      'blockquote.blockquote.text-style-italic "Quoted disclaimer copy"'
    );
    expect(normalized.elementTree.children[0]?.tag).toBe("blockquote");
  });

  it("splits tag wrapper text into an inner textblock child", () => {
    const normalized = normalizeSkeletonPlan(
      parseSkeletonTreeText(
        basePlan(),
        'section.section-name\n  div.tag "Medicare Fraud and Kickbacks"'
      )
    );

    expect(serializeSkeletonTree(normalized.elementTree)).toContain("div.tag");
    expect(serializeSkeletonTree(normalized.elementTree)).toContain(
      'textblock "Medicare Fraud and Kickbacks"'
    );
    const wrapper = normalized.elementTree.children[0];
    expect(wrapper?.tag).toBe("div");
    expect(wrapper?.classNames).toEqual(["tag"]);
    expect(wrapper?.children[0]?.tag).toBe("div");
    expect(wrapper?.children[0]?.textContent).toBe("Medicare Fraud and Kickbacks");
  });

  it("splits list item text into an inner textblock child", () => {
    const normalized = normalizeSkeletonPlan(
      parseSkeletonTreeText(
        basePlan(),
        'section.section-name\n  ul.items\n    li.item "State Bar of California"'
      )
    );

    expect(serializeSkeletonTree(normalized.elementTree)).toContain("li.item");
    expect(serializeSkeletonTree(normalized.elementTree)).toContain(
      'p "State Bar of California"'
    );
    const listItem = normalized.elementTree.children[0]?.children[0];
    expect(listItem?.tag).toBe("li");
    expect(listItem?.textContent).toBeUndefined();
    expect(listItem?.children[0]?.tag).toBe("p");
    expect(listItem?.children[0]?.textContent).toBe("State Bar of California");
  });

  it("preserves image children inside anchor wrappers", () => {
    const normalized = normalizeSkeletonPlan(
      parseSkeletonTreeText(
        basePlan(),
        "section.section-name\n  a.footer_logo-link\n    img.footer_logo"
      )
    );

    const anchor = normalized.elementTree.children[0];
    expect(anchor?.tag).toBe("a");
    expect(anchor?.children[0]?.tag).toBe("img");
    expect(anchor?.children[0]?.classNames).toEqual(["footer_logo"]);
  });

  it("preserves a footer root instead of converting it to a div or section", () => {
    const normalized = normalizeSkeletonPlan(
      parseSkeletonTreeText(
        basePlan(),
        "footer.section_footer\n  div.padding-global"
      )
    );

    expect(normalized.elementTree.tag).toBe("footer");
    expect(normalized.elementTree.classNames).toEqual(["section_footer"]);
    expect(normalized.elementTree.children[0]?.classNames).toEqual(["padding-global"]);
  });
});
