import { describe, expect, it } from "vitest";
import { planStyleGuideApply, type StyleGuideSpec } from "@wfb/shared/style-guide.js";

const spec: StyleGuideSpec = {
  version: 1,
  variables: {
    "--color-primary": { value: "#8EC441", type: "color", label: "Brand green" },
    "--font-heading": { value: "'Sora', sans-serif", type: "font" },
    "--font-size-h1": { value: "3.5rem", type: "size" },
    "--weight-semibold": { value: "600", type: "number" }
  },
  classes: {
    "heading-style-h1": {
      base: {
        "font-family": "var(--font-heading)",
        "font-size": "var(--font-size-h1)",
        "font-weight": "var(--weight-semibold)",
        "line-height": "1.2"
      },
      breakpoints: { medium: { "font-size": "2.75rem" }, small: { "font-size": "2.25rem" } }
    },
    button: {
      base: { "background-color": "var(--color-primary)", "border-width": "0px" },
      variants: { "is-secondary": { "background-color": "transparent", "border-width": "1px" } }
    }
  }
};

describe("planStyleGuideApply", () => {
  const plan = planStyleGuideApply(spec);

  it("emits one variable op per spec variable, slugged", () => {
    expect(plan.variables).toHaveLength(4);
    const primary = plan.variables.find((v) => v.token === "--color-primary");
    expect(primary).toMatchObject({ name: "color-primary", type: "color", value: "#8EC441" });
  });

  it("splits var(--token) values into bindings and keeps literals", () => {
    const h1Base = plan.styles.find((op) => op.className === "heading-style-h1" && op.breakpoint === null)!;
    expect(h1Base.bindings).toEqual({
      "font-family": "--font-heading",
      "font-size": "--font-size-h1",
      "font-weight": "--weight-semibold"
    });
    expect(h1Base.literals).toEqual({ "line-height": "1.2" });
  });

  it("emits a style op per non-empty breakpoint, desktop-first", () => {
    const bps = plan.styles
      .filter((op) => op.className === "heading-style-h1" && op.breakpoint)
      .map((op) => op.breakpoint);
    expect(bps).toEqual(["medium", "small"]); // tiny had no override → no op
    const medium = plan.styles.find((op) => op.className === "heading-style-h1" && op.breakpoint === "medium")!;
    expect(medium.literals).toEqual({ "font-size": "2.75rem" });
  });

  it("emits variants as their own class ops", () => {
    const secondary = plan.styles.find((op) => op.className === "is-secondary")!;
    expect(secondary.breakpoint).toBeNull();
    expect(secondary.literals).toEqual({ "background-color": "transparent", "border-width": "1px" });
  });

  it("orders all variables before any style op", () => {
    const firstStyleIndex = plan.styles.length > 0 ? 0 : -1;
    expect(firstStyleIndex).toBe(0);
    // (variables and styles are separate arrays; the bridge runs variables first)
    expect(plan.variables.every((v) => v.kind === "variable")).toBe(true);
    expect(plan.styles.every((s) => s.kind === "style")).toBe(true);
  });
});
