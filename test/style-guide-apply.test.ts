import { describe, expect, it } from "vitest";
import { planStyleGuideApply, type StyleGuideSpec } from "@wfb/shared/style-guide.js";

// Match-Relume shape: only colors, fonts, radius, stroke are variables; sizes,
// weights, and line-heights are literals on the classes.
const spec: StyleGuideSpec = {
  version: 1,
  variables: {
    "--color-primary": { value: "#8EC441", type: "color", collection: "Primitives", group: "Colors", name: "Primary" },
    "--font-heading": { value: "Sora", type: "font", collection: "Typography", group: "Font Styles", name: "Heading" },
    "--radius-medium": { value: "6px", type: "size", collection: "UI Styles", group: "Radius", name: "Medium" }
  },
  classes: {
    "heading-style-h1": {
      base: {
        "font-family": "var(--font-heading)",
        "font-size": "3.5rem",
        "font-weight": "600",
        "line-height": "1.2"
      },
      breakpoints: { medium: { "font-size": "2.75rem" }, small: { "font-size": "2.25rem" } }
    },
    button: {
      base: {
        "background-color": "var(--color-primary)",
        "border-top-left-radius": "var(--radius-medium)",
        "border-width": "0px"
      },
      variants: { "is-secondary": { "background-color": "transparent", "border-width": "1px" } }
    }
  }
};

describe("planStyleGuideApply", () => {
  const plan = planStyleGuideApply(spec);

  it("carries each variable's collection and Relume name", () => {
    const primary = plan.variables.find((v) => v.token === "--color-primary");
    expect(primary).toMatchObject({ collection: "Primitives", name: "Primary", type: "color" });
    const heading = plan.variables.find((v) => v.token === "--font-heading");
    expect(heading).toMatchObject({ collection: "Typography", name: "Heading", value: "Sora" });
  });

  it("binds var(--token) props and keeps literal sizes as literals", () => {
    const h1 = plan.styles.find((op) => op.className === "heading-style-h1" && op.breakpoint === null)!;
    expect(h1.bindings).toEqual({ "font-family": "--font-heading" });
    expect(h1.literals).toEqual({ "font-size": "3.5rem", "font-weight": "600", "line-height": "1.2" });
  });

  it("emits a style op per non-empty breakpoint, desktop-first", () => {
    const bps = plan.styles
      .filter((op) => op.className === "heading-style-h1" && op.breakpoint)
      .map((op) => op.breakpoint);
    expect(bps).toEqual(["medium", "small"]);
  });

  it("emits variants as their own class ops", () => {
    const secondary = plan.styles.find((op) => op.className === "is-secondary")!;
    expect(secondary.breakpoint).toBeNull();
    expect(secondary.literals).toEqual({ "background-color": "transparent", "border-width": "1px" });
  });

  it("keeps variables and styles as separate op streams", () => {
    expect(plan.variables.every((v) => v.kind === "variable")).toBe(true);
    expect(plan.styles.every((s) => s.kind === "style")).toBe(true);
  });
});
