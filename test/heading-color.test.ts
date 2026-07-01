import { describe, expect, it } from "vitest";
import { htmlToSkeletonPlan } from "@wfb/backend-core/planner/html-planner.js";
import { buildResolvedStylingFromSkeleton } from "@wfb/backend-core/planner/resolved-styling.js";
import type { SectionMetadata } from "@wfb/shared/contracts.js";

const metadata: SectionMetadata = {
  repoId: "r",
  pageId: "p",
  sectionId: "s",
  pageName: "Home",
  sectionName: "Section",
  sourceFile: "index.html",
  repoType: "html"
};

// body sets the design text color via a token; the h2 hardcodes a one-off dark
// ink (Figma-export style) that should be normalized to that token.
const CSS =
  ":root { --foreground: #6b4a1e; }" +
  "body { color: var(--foreground); }" +
  ".text-\\[\\#151515\\] { color: #151515; }" +
  ".on-dark { color: #fff4e3; }";

function styleFor(html: string, className: string) {
  const skeleton = htmlToSkeletonPlan({ metadata, sourceCode: html })!;
  const plan = buildResolvedStylingFromSkeleton({
    metadata,
    mode: "fullAssist",
    skeleton,
    cssText: CSS
  });
  return {
    definition: plan.styleDefinitions.find((entry) => entry.className === className),
    colorBindings: plan.variableBindings.filter((binding) => binding.property === "color")
  };
}

describe("heading color normalization", () => {
  it("replaces a hardcoded dark heading color with the site text token", () => {
    const { definition, colorBindings } = styleFor(
      `<section class="wrap"><h2 class="text-[#151515] heading">Title</h2></section>`,
      "heading-style-h2"
    );
    expect(definition?.properties.color).toBe("#6b4a1e");
    expect(colorBindings).toContainEqual(
      expect.objectContaining({ property: "color", variableName: "foreground", value: "#6b4a1e" })
    );
  });

  it("leaves an intentional light (on-dark) heading color untouched", () => {
    const { definition } = styleFor(
      `<section class="wrap"><h2 class="on-dark heading">Title</h2></section>`,
      "heading-style-h2"
    );
    expect(definition?.properties.color).toBe("#fff4e3");
  });
});
