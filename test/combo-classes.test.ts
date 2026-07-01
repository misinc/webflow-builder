import { describe, expect, it } from "vitest";
import { htmlToSkeletonPlan } from "@wfb/backend-core/planner/html-planner.js";
import { buildResolvedStylingFromSkeleton } from "@wfb/backend-core/planner/resolved-styling.js";
import type { BuildNode, SectionMetadata } from "@wfb/shared/contracts.js";

const metadata: SectionMetadata = {
  repoId: "r",
  pageId: "p",
  sectionId: "s",
  pageName: "Home",
  sectionName: "Section",
  sourceFile: "index.html",
  repoType: "html"
};

// Two cards share a base class; only the second carries a BEM `--2` modifier that
// overrides the accent border. The first modifier (`--1`) adds nothing.
const CSS =
  ".card { border-left: 8px solid #0000ff; padding: 10px; }" +
  ".card--1 { }" +
  ".card--2 { border-left: 8px solid #ff0000; }";

const HTML =
  `<section><div class="grid">` +
  `<article class="card card--1"><h3>A</h3><p>x</p></article>` +
  `<article class="card card--2"><h3>B</h3><p>y</p></article>` +
  `</div></section>`;

describe("per-instance combo modifier classes", () => {
  const skeleton = htmlToSkeletonPlan({ metadata, sourceCode: HTML })!;
  const plan = buildResolvedStylingFromSkeleton({ metadata, mode: "fullAssist", skeleton, cssText: CSS });

  const combos = plan.styleDefinitions.filter((d) => d.combo);
  const comboClass = combos[0]?.className ?? "";
  const baseClass = comboClass.replace(/_v[a-z0-9-]+$/, "");

  it("keeps the shared base accent and emits a combo class for the override", () => {
    expect(combos).toHaveLength(1);
    expect(combos[0].properties["border-left"]).toBe("8px solid #ff0000");

    const base = plan.styleDefinitions.find((d) => d.className === baseClass && !d.combo);
    expect(base?.properties["border-left"]).toBe("8px solid #0000ff");
  });

  it("applies base + combo to the varied card, base only to the plain one", () => {
    const cards: string[][] = [];
    const walk = (n: BuildNode) => {
      if (n.classNames.includes(baseClass)) cards.push(n.classNames);
      (n.children ?? []).forEach(walk);
    };
    walk(skeleton.elementTree);
    // card A: base only; card B: base + combo
    expect(cards.some((c) => c.length === 1 && c[0] === baseClass)).toBe(true);
    expect(cards.some((c) => c.includes(comboClass))).toBe(true);
  });
});
