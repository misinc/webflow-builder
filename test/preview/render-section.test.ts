import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { htmlToSkeletonPlan } from "@wfb/backend-core/planner/html-planner.js";
import { buildResolvedStylingFromSkeleton } from "@wfb/backend-core/planner/resolved-styling.js";
import { renderSectionPreviewDocument } from "@wfb/backend-core/preview/render-preview.js";
import type { StylingPlan } from "@wfb/shared/contracts.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

// Inputs are overridable via env so this harness works for any section + stylesheet.
const SECTION_HTML =
  process.env.SECTION_HTML ?? join(here, "..", "fixtures", "misinc-services-section.html");
const CSS_FILE =
  process.env.CSS_FILE ??
  "/private/tmp/claude-501/-Users-karim-apps-webflow-builder-app/ed4dd39a-b9b3-4cb1-84ae-7d53d509ed22/scratchpad/html-repo/misinc/assets/index-BVarBVXh.css";
const OUT_NAME = process.env.OUT_NAME ?? "services-areas";

function columnsOf(plan: StylingPlan): string {
  for (const def of plan.styleDefinitions) {
    if (def.properties["grid-template-columns"]) {
      return `${def.className} -> ${def.properties["grid-template-columns"]}`;
    }
  }
  return "(no grid-template-columns emitted)";
}

describe("preview harness: section -> client-first HTML+CSS", () => {
  it("renders the resolved client-first preview", () => {
    const sourceCode = readFileSync(SECTION_HTML, "utf8");
    const cssText = existsSync(CSS_FILE) ? readFileSync(CSS_FILE, "utf8") : "";

    const metadata = {
      repoId: "preview",
      pageId: "services",
      sectionId: OUT_NAME,
      pageName: "Services",
      sectionName: "Service Areas",
      sourceFile: "services.html",
      repoType: "html" as const
    };

    const skeleton = htmlToSkeletonPlan({ metadata, sourceCode });
    if (!skeleton) {
      console.log("\n[preview] htmlToSkeletonPlan returned null (parse failed)\n");
      return;
    }

    const styling = buildResolvedStylingFromSkeleton({
      metadata,
      mode: "skeletonThenStyle",
      skeleton,
      cssText
    });

    const doc = renderSectionPreviewDocument({
      title: `${metadata.sectionName} — preview`,
      skeleton,
      styling
    });

    const outDir = join(repoRoot, "preview-output");
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, `${OUT_NAME}.html`);
    writeFileSync(outPath, doc, "utf8");

    console.log(`\n[preview] wrote ${outPath}`);
    console.log(`[preview] columns: ${columnsOf(styling)}`);
    console.log(
      `[preview] ${styling.styleDefinitions.length} style classes, ${styling.variableBindings.length} variable bindings`
    );
    console.log("");
  });
});
