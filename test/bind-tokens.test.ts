import { describe, expect, it } from "vitest";
import {
  normalizeColorValue,
  normalizeTokenLiteral,
  tokenKindMatchesProperty
} from "../extension/src/webflow/bridge.js";

describe("normalizeColorValue (token value matching)", () => {
  it("normalizes hex forms", () => {
    expect(normalizeColorValue("#FF9902")).toBe("#ff9902");
    expect(normalizeColorValue("#abc")).toBe("#aabbcc");
    expect(normalizeColorValue("  #FFEFCF ")).toBe("#ffefcf");
  });

  it("converts rgb()/opaque rgba() to hex", () => {
    expect(normalizeColorValue("rgb(201, 146, 61)")).toBe("#c9923d");
    expect(normalizeColorValue("rgba(255, 153, 2, 1)")).toBe("#ff9902");
  });

  it("passes other values through lowercased; rejects empty", () => {
    expect(normalizeColorValue("White")).toBe("white");
    // translucent rgba is NOT collapsed to hex (not value-equal to a solid token)
    expect(normalizeColorValue("rgba(0,0,0,0.5)")).toBe("rgba(0,0,0,0.5)");
    expect(normalizeColorValue("  ")).toBeNull();
  });
});

describe("normalizeTokenLiteral (all variable types)", () => {
  it("classifies colors, sizes, and font families", () => {
    expect(normalizeTokenLiteral("#FF9902")).toEqual({ normalized: "#ff9902", kind: "color" });
    expect(normalizeTokenLiteral("1.75rem")).toEqual({ normalized: "1.75rem", kind: "size" });
    expect(normalizeTokenLiteral("Manrope")).toEqual({ normalized: "manrope", kind: "fontFamily" });
    expect(normalizeTokenLiteral("500")).toEqual({ normalized: "500", kind: "other" });
  });

  it("handles Designer API size objects ({ unit, value })", () => {
    expect(normalizeTokenLiteral({ unit: "rem", value: 1 })).toEqual({
      normalized: "1rem",
      kind: "size"
    });
  });

  it("rejects empty and unusable values", () => {
    expect(normalizeTokenLiteral("")).toBeNull();
    expect(normalizeTokenLiteral(undefined)).toBeNull();
    expect(normalizeTokenLiteral(null)).toBeNull();
  });
});

describe("tokenKindMatchesProperty (type-aware binding gates)", () => {
  it("colors bind only to color-ish properties", () => {
    expect(tokenKindMatchesProperty("color", "background-color")).toBe(true);
    expect(tokenKindMatchesProperty("color", "border-left-color")).toBe(true);
    expect(tokenKindMatchesProperty("color", "font-size")).toBe(false);
  });

  it("sizes bind to spacing/typography-size properties, not colors", () => {
    expect(tokenKindMatchesProperty("size", "padding-top")).toBe(true);
    expect(tokenKindMatchesProperty("size", "font-size")).toBe(true);
    expect(tokenKindMatchesProperty("size", "gap")).toBe(true);
    expect(tokenKindMatchesProperty("size", "border-radius")).toBe(true);
    expect(tokenKindMatchesProperty("size", "background-color")).toBe(false);
  });

  it("font families bind only to font-family", () => {
    expect(tokenKindMatchesProperty("fontFamily", "font-family")).toBe(true);
    expect(tokenKindMatchesProperty("fontFamily", "color")).toBe(false);
  });
});
