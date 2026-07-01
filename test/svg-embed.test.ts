import { describe, expect, it } from "vitest";
import { htmlToSkeletonPlan } from "@wfb/backend-core/planner/html-planner.js";
import type { BuildNode } from "@wfb/shared/contracts.js";

function find(node: BuildNode, predicate: (node: BuildNode) => boolean): BuildNode | null {
  if (predicate(node)) {
    return node;
  }
  for (const child of node.children ?? []) {
    const found = find(child, predicate);
    if (found) {
      return found;
    }
  }
  return null;
}

const html = `<section class="s"><div class="card"><div class="icon"><svg viewBox="0 0 24 24" class="lucide lucide-globe"><circle cx="12" cy="12" r="10"></circle></svg></div><h3>Title</h3></div></section>`;

describe("inline svg -> client-first icon embed", () => {
  it("preserves the svg as an icon-embed embed node", () => {
    const plan = htmlToSkeletonPlan({
      metadata: {
        repoId: "r",
        pageId: "p",
        sectionId: "s",
        pageName: "P",
        sectionName: "S",
        sourceFile: "f.html",
        repoType: "html"
      },
      sourceCode: html
    });

    expect(plan).not.toBeNull();
    const embed = find(plan!.elementTree, (node) => node.type === "embed");
    expect(embed).not.toBeNull();
    expect(embed!.classNames).toContain("icon-embed-xsmall");
    expect(embed!.embedHtml ?? "").toContain("<svg");
    expect(embed!.embedHtml ?? "").toContain("circle");
    // original Lucide classes retained as backend metadata
    expect(embed!.sourceClassNames ?? []).toContain("lucide-globe");
  });
});
