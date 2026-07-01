import { describe, expect, it } from "vitest";
import {
  parseCompiledCss,
  resolveClasses,
  resolveDescendantRules,
  resolveValue,
  splitLayoutVisual
} from "@wfb/backend-core/planner/css-resolver.js";

const CSS = `
:root { --accent: #a62025; --pad: 8px; --spacing: 0.25rem; }
.grid3 { display: grid; gap: 20px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.card { display: grid; gap: 16px; background: #fffdfa; border-radius: 30px; padding: 26px; }
.chip { color: var(--accent, var(--brand)); padding: var(--pad); }
.mix { background: color-mix(in srgb, var(--accent) 10%, white); }
@media (max-width: 1100px) { .grid3 { grid-template-columns: 1fr; } }
`;

describe("css-resolver", () => {
  const parsed = parseCompiledCss(CSS);

  it("looks up the exact base (desktop) declarations for a class", () => {
    const grid = resolveClasses(["grid3"], parsed);
    expect(grid.display).toBe("grid");
    // 3 columns from the base rule — NOT the 1fr @media override
    expect(grid["grid-template-columns"]).toBe("repeat(3, minmax(0, 1fr))");
    expect(grid.gap).toBe("20px");
  });

  it("resolves nested var() fallbacks without breaking parentheses", () => {
    const chip = resolveClasses(["chip"], parsed);
    expect(chip.color).toBe("#a62025");
    expect(chip.padding).toBe("8px");
  });

  it("keeps color-mix() balanced while resolving inner vars", () => {
    expect(resolveValue("color-mix(in srgb, var(--accent) 10%, white)", parsed.variables)).toBe(
      "color-mix(in srgb, #a62025 10%, white)"
    );
  });

  it("splits layout vs visual declarations", () => {
    const card = resolveClasses(["card"], parsed);
    const { layout, visual } = splitLayoutVisual(card);
    expect(layout.display).toBe("grid");
    expect(layout.gap).toBe("16px");
    expect(layout.padding).toBe("26px");
    expect(visual.background).toBe("#fffdfa");
    expect(visual["border-radius"]).toBe("30px");
    expect(layout.background).toBeUndefined();
  });

  it("returns empty maps for unknown classes / empty css", () => {
    expect(resolveClasses(["nope"], parsed)).toEqual({});
    expect(parseCompiledCss("").classes.size).toBe(0);
  });
});

const TYPO_CSS = `
:root { --brand: #a62025; --text: #6b4a1e; }
.header h2, .section h3 { color: var(--text); font-weight: 300; }
.header h2 { font-size: clamp(2.2rem, 4vw, 4rem); }
.card p { color: #8f6a35; line-height: 1.7; }
.eyebrow { color: var(--brand); text-transform: uppercase; }
`;

describe("css-resolver descendant/element rules", () => {
  const parsed = parseCompiledCss(TYPO_CSS);

  it("captures class-scoped element rules (grouped selectors too)", () => {
    // an h2 inside an element with source class "header"
    const h2 = resolveDescendantRules({ tag: "h2" }, new Set(["header"]), parsed);
    expect(h2["font-weight"]).toBe("300");
    expect(h2.color).toBe("#6b4a1e");
    expect(h2["font-size"]).toBe("clamp(2.2rem, 4vw, 4rem)");
  });

  it("scopes rules to the right ancestor + tag", () => {
    // h3 inside "section" gets weight/color but NOT the header-only font-size
    const h3 = resolveDescendantRules({ tag: "h3" }, new Set(["section"]), parsed);
    expect(h3["font-weight"]).toBe("300");
    expect(h3["font-size"]).toBeUndefined();
    // a p inside "card"
    const p = resolveDescendantRules({ tag: "p" }, new Set(["card"]), parsed);
    expect(p.color).toBe("#8f6a35");
    // no matching ancestor -> nothing
    expect(resolveDescendantRules({ tag: "h2" }, new Set(["unrelated"]), parsed)).toEqual({});
  });
});
