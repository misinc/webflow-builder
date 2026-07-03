import { describe, expect, it } from "vitest";
import { htmlToSkeletonPlan } from "@wfb/backend-core/planner/html-planner.js";
import type { BuildNode, SectionMetadata } from "@wfb/shared/contracts.js";

const metadata: SectionMetadata = {
  repoId: "r", pageId: "p", sectionId: "s",
  pageName: "Contact", sectionName: "Get in Touch - We're Ready to Help",
  sourceFile: "contact.html", repoType: "html"
};

describe("div-rooted section slices", () => {
  const plan = htmlToSkeletonPlan({
    metadata,
    sourceCode: `<div class="contact-cta"><p class="eyebrow">Contact</p><h1>Get in Touch</h1><p>Pick a path.</p></div>`
  })!;

  it("caps long section names to a 3-word key and roots as section_{key}", () => {
    expect(plan.elementTree.tag).toBe("section");
    expect(plan.elementTree.classNames).toEqual(["section_get-in-touch"]);
  });

  it("applies the client-first scaffold even when the source root is a div", () => {
    const chain: string[] = [];
    let node: BuildNode | undefined = plan.elementTree;
    while (node) {
      chain.push(node.classNames[0] ?? node.tag);
      node = node.children?.[0];
    }
    expect(chain.slice(0, 4)).toEqual([
      "section_get-in-touch", "padding-global", "container-large", "padding-section-medium"
    ]);
  });
});
