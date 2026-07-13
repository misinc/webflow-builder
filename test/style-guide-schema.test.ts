import { describe, expect, it } from "vitest";
import { parseVarRef, styleGuideSpecSchema } from "@wfb/shared/style-guide.js";

const sample = {
  version: 1,
  source: { url: "https://example.com", name: "Example" },
  variables: {
    "--color-primary": { value: "#FF9902", type: "color", collection: "Primitives", group: "Colors", name: "Primary" },
    "--color-neutral-darkest": { value: "#0D0800", type: "color", collection: "Primitives", group: "Colors", name: "Neutral Darkest" },
    "--font-heading": { value: "Lato", type: "font", collection: "Typography", group: "Font Styles", name: "Heading" },
    "--radius-medium": { value: "6px", type: "size", collection: "UI Styles", group: "Radius", name: "Medium" }
  },
  classes: {
    "heading-style-h1": {
      base: {
        "font-family": "var(--font-heading)",
        "font-size": "3.5rem",
        "font-weight": "var(--weight-bold)",
        "line-height": "1.1"
      },
      breakpoints: { medium: { "font-size": "2.75rem" }, small: { "font-size": "2.25rem" } }
    },
    button: {
      base: {
        "background-color": "var(--color-primary)",
        "color": "var(--color-neutral-darkest)",
        "border-top-left-radius": "var(--radius-medium)"
      },
      variants: {
        "is-secondary": { "background-color": "transparent", "border-top-color": "var(--color-primary)" }
      }
    }
  },
  colorSchemes: {
    "color-scheme-1": {
      label: "Light surface — Philosophy section",
      vars: { "--background-color": "var(--color-white)", "--text-color": "var(--color-neutral-darkest)" }
    }
  }
};

describe("styleGuideSpecSchema", () => {
  it("accepts a representative spec", () => {
    const parsed = styleGuideSpecSchema.parse(sample);
    expect(parsed.classes["heading-style-h1"].breakpoints?.medium?.["font-size"]).toBe("2.75rem");
    expect(parsed.classes["button"].variants?.["is-secondary"]?.["background-color"]).toBe("transparent");
    expect(parsed.colorSchemes?.["color-scheme-1"].label).toBe("Light surface — Philosophy section");
    expect(parsed.colorSchemes?.["color-scheme-1"].vars["--background-color"]).toBe("var(--color-white)");
  });

  it("rejects a wrong version and a bad variable type", () => {
    expect(() => styleGuideSpecSchema.parse({ ...sample, version: 2 })).toThrow();
    expect(() =>
      styleGuideSpecSchema.parse({
        ...sample,
        variables: { "--x": { value: "#000", type: "colour" } }
      })
    ).toThrow();
  });

  it("parseVarRef extracts the token or returns null", () => {
    expect(parseVarRef("var(--color-primary)")).toBe("--color-primary");
    expect(parseVarRef("var(--color-primary, #FF9902)")).toBe("--color-primary");
    expect(parseVarRef("#FF9902")).toBeNull();
    expect(parseVarRef("1.5rem")).toBeNull();
  });
});
