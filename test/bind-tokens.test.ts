import { describe, expect, it } from "vitest";
import { normalizeColorValue } from "../extension/src/webflow/bridge.js";

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
