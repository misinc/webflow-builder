import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractChromeHtml, HtmlRepoExtractor } from "@wfb/backend-core/extractor/html-extractor.js";
import { htmlToSkeletonPlan } from "@wfb/backend-core/planner/html-planner.js";
import { buildResolvedStylingFromSkeleton } from "@wfb/backend-core/planner/resolved-styling.js";
import { buildWebflowClipboardPayload } from "@wfb/shared/webflow-clipboard.js";

/**
 * GOLDEN PAYLOADS — the whole-section regression net.
 *
 * Every section of the real fixture site is run through the full pipeline
 * (extractor → planner → styling → clipboard payload) and compared against a
 * committed snapshot. Unit tests lock mechanisms; THIS locks outcomes: a fix
 * aimed at one section that drifts any other section's payload fails here and
 * the diff must be reviewed deliberately.
 *
 * When a change is intentional, refresh with: npx vitest run -u
 */

const FIXTURES = path.resolve(process.cwd(), "test/fixtures/misinc");
const css = readFileSync(path.join(FIXTURES, "compiled.css"), "utf8");

function sectionsOf(page: string) {
  const html = readFileSync(path.join(FIXTURES, `${page}.html`), "utf8");
  const index = new HtmlRepoExtractor().extractRepoIndex("golden-repo", {
    owner: "fixture",
    name: "misinc",
    defaultBranch: "main",
    commitSha: "fixture",
    files: [{ path: `misinc/${page}.html`, content: html }]
  });
  return index.sections;
}

describe("golden payloads (site chrome)", () => {
  for (const kind of ["header", "footer"] as const) {
    it(`index · chrome ${kind}`, async () => {
      const html = readFileSync(path.join(FIXTURES, "index.html"), "utf8");
      const chromeHtml = extractChromeHtml(html, kind);
      expect(chromeHtml).not.toBeNull();
      const sectionName = kind === "header" ? "Navbar" : "Footer";
      const metadata = {
        repoId: "golden-repo",
        pageId: "golden-page",
        sectionId: `chrome-${kind}`,
        pageName: "index",
        sectionName,
        sourceFile: "index.html",
        repoType: "html" as const
      };
      const skeleton = htmlToSkeletonPlan({ metadata, sourceCode: chromeHtml!, chrome: true });
      expect(skeleton).not.toBeNull();
      // chrome keeps its own root tag with a component class — no section scaffold
      expect(skeleton!.elementTree.classNames[0]).toBe(`${kind === "header" ? "navbar" : "footer"}_component`);
      expect(
        skeleton!.elementTree.children.some((child) => child.classNames.includes("padding-global"))
      ).toBe(false);
      const styling = buildResolvedStylingFromSkeleton({
        metadata,
        mode: "fullAssist",
        skeleton: skeleton!,
        cssText: css
      });
      const payload = buildWebflowClipboardPayload({
        elementTree: skeleton!.elementTree,
        styleDefinitions: styling.styleDefinitions
      });
      await expect(JSON.stringify(payload, null, 1)).toMatchFileSnapshot(
        `./fixtures/golden/index--chrome-${kind}.json`
      );
    });
  }
});

describe("golden payloads (whole-section outcomes)", () => {
  for (const page of ["index", "contact"]) {
    for (const section of sectionsOf(page)) {
      it(`${page} · ${section.sectionKey}`, async () => {
        const metadata = {
          repoId: "golden-repo",
          pageId: "golden-page",
          sectionId: section.id,
          pageName: page,
          sectionName: section.name,
          sourceFile: `${page}.html`,
          repoType: "html" as const
        };
        const skeleton = htmlToSkeletonPlan({ metadata, sourceCode: section.sourceCode! });
        expect(skeleton).not.toBeNull();
        const styling = buildResolvedStylingFromSkeleton({
          metadata,
          mode: "fullAssist",
          skeleton: skeleton!,
          cssText: css
        });
        const payload = buildWebflowClipboardPayload({
          elementTree: skeleton!.elementTree,
          styleDefinitions: styling.styleDefinitions
        });
        await expect(JSON.stringify(payload, null, 1)).toMatchFileSnapshot(
          `./fixtures/golden/${page}--${section.sectionKey}.json`
        );
      });
    }
  }
});
