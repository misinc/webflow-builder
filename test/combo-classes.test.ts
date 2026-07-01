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

describe("inline-style per-instance combos (e.g. currentColor icon rings)", () => {
  const ICON_CSS = ".icon { border: 1px solid currentColor; border-radius: 999px; }";
  const ICON_HTML =
    `<section><div class="row">` +
    `<div class="icon" style="color: #ff0000;"><svg viewBox="0 0 1 1"><path d="M0 0"/></svg></div>` +
    `<div class="icon" style="color: #00ff00; opacity: 0;"><svg viewBox="0 0 1 1"><path d="M0 0"/></svg></div>` +
    `</div></section>`;

  it("captures safelisted inline colors as combos and ignores animation scaffolding", () => {
    const skeleton = htmlToSkeletonPlan({ metadata, sourceCode: ICON_HTML })!;
    const plan = buildResolvedStylingFromSkeleton({
      metadata,
      mode: "fullAssist",
      skeleton,
      cssText: ICON_CSS
    });
    const combos = plan.styleDefinitions.filter((d) => d.combo);
    expect(combos).toHaveLength(2);
    expect(combos.map((c) => c.properties.color).sort()).toEqual(["#00ff00", "#ff0000"]);
    // opacity (animation scaffolding) is not a safelisted inline style
    expect(combos.some((c) => "opacity" in c.properties)).toBe(false);
    // the base icon class keeps its currentColor ring
    const base = plan.styleDefinitions.find((d) => d.className.endsWith("_icon") && !d.combo);
    expect(base?.properties.border).toBe("1px solid currentColor");
  });
});
