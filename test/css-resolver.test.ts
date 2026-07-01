import { describe, expect, it } from "vitest";
import {
  normalizeResolvedLayout,
  parseCompiledCss,
  resolveClasses,
  resolveDeclarationsWithBindings,
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

describe("css-resolver variable bindings", () => {
  const parsed = parseCompiledCss(
    ":root { --mis-primary: #a62025; --accent: var(--mis-primary); --pad: 8px; }"
  );

  it("binds pure var() properties to the underlying token, keeping a fallback value", () => {
    const { properties, bindings } = resolveDeclarationsWithBindings(
      { color: "var(--accent)", padding: "var(--pad)", background: "#ffffff" },
      parsed.variables
    );
    expect(properties.color).toBe("#a62025");
    expect(properties.padding).toBe("8px");
    expect(properties.background).toBe("#ffffff");
    // follows --accent -> --mis-primary (the token that actually holds the literal)
    expect(bindings).toContainEqual({
      property: "color",
      variableName: "mis-primary",
      value: "#a62025"
    });
    expect(bindings).toContainEqual({ property: "padding", variableName: "pad", value: "8px" });
    // a literal (non-var) value produces no binding
    expect(bindings.some((binding) => binding.property === "background")).toBe(false);
  });

  it("excludes custom-property (--x) and vendor-prefixed (-webkit-*) props", () => {
    const withVars = parseCompiledCss(
      ".card { --accent: #a62025; -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); color: #111; }"
    );
    const decls = resolveClasses(["card"], withVars);
    expect(decls.color).toBe("#111");
    // vendor-prefixed dropped, standard property kept (Webflow adds its own prefix)
    expect(decls["-webkit-backdrop-filter"]).toBeUndefined();
    expect(decls["backdrop-filter"]).toBe("blur(10px)");
    expect(decls["--accent"]).toBeUndefined();

    const { properties } = resolveDeclarationsWithBindings(
      { "--accent": "#a62025", "-webkit-backdrop-filter": "blur(10px)", color: "#111" },
      withVars.variables
    );
    expect(properties["--accent"]).toBeUndefined();
    expect(properties["-webkit-backdrop-filter"]).toBeUndefined();
    expect(properties.color).toBe("#111");
  });
});

describe("css-resolver layout normalization (scroll-deck scaffolding)", () => {
  it("strips absolute positioning off deck items so they flow", () => {
    const card = normalizeResolvedLayout({
      display: "grid",
      "grid-template-columns": "auto 1fr",
      gap: "18px",
      position: "absolute",
      top: "0",
      left: "0",
      right: "0",
      "z-index": "1"
    });
    expect(card.position).toBeUndefined();
    expect(card.top).toBeUndefined();
    expect(card["z-index"]).toBeUndefined();
    expect(card.display).toBe("grid");
    expect(card["grid-template-columns"]).toBe("auto 1fr");
  });

  it("unpins a scroll-pinned container (sticky + fixed height) and restores grid+gap", () => {
    const list = normalizeResolvedLayout({
      display: "block",
      gap: "18px",
      height: "700px",
      position: "sticky",
      top: "132px"
    });
    expect(list.position).toBeUndefined();
    expect(list.height).toBeUndefined();
    // gap on a block box → the author meant a grid/flex stack
    expect(list.display).toBe("grid");
    expect(list.gap).toBe("18px");
  });

  it("keeps position:relative and a bare sticky sidebar (no fixed height)", () => {
    expect(normalizeResolvedLayout({ position: "relative", display: "grid" }).position).toBe("relative");
    const sidebar = normalizeResolvedLayout({ position: "sticky", top: "24px", display: "grid" });
    expect(sidebar.position).toBe("sticky");
    expect(sidebar.top).toBe("24px");
  });
});

describe("css-resolver default (inherited) text color", () => {
  it("captures the body text color and its token binding", () => {
    const parsed = parseCompiledCss(
      ":root { --foreground: #6b4a1e; } body { color: var(--foreground); background: #fff; }"
    );
    expect(parsed.defaultTextColor).toEqual({ value: "#6b4a1e", variableName: "foreground" });
  });

  it("captures a literal body color with no binding, and falls back to html", () => {
    expect(parseCompiledCss("body { color: #222; }").defaultTextColor).toEqual({ value: "#222" });
    expect(parseCompiledCss("html { color: #333; }").defaultTextColor).toEqual({ value: "#333" });
    expect(parseCompiledCss(".x { color: red; }").defaultTextColor).toBeUndefined();
  });
});

describe("css-resolver arbitrary-value classes + responsive", () => {
  const parsed = parseCompiledCss(
    ".gap-\\[48px\\] { gap: 48px; }" +
      ".text-\\[32px\\] { font-size: 32px; }" +
      ".max-w-\\[1200px\\] { max-width: 1200px; }" +
      "@media (min-width: 64rem) { .text-\\[32px\\] { font-size: 48px; } }" +
      "@media (max-width: 40rem) { .gap-\\[48px\\] { gap: 12px; } }"
  );

  it("captures Tailwind arbitrary-value classes (escaped selectors)", () => {
    expect(resolveClasses(["gap-[48px]"], parsed).gap).toBe("48px");
    expect(resolveClasses(["max-w-[1200px]"], parsed)["max-width"]).toBe("1200px");
  });

  it("prefers desktop (largest min-width) and ignores max-width mobile overrides", () => {
    expect(resolveClasses(["text-[32px]"], parsed)["font-size"]).toBe("48px");
    expect(resolveClasses(["gap-[48px]"], parsed).gap).toBe("48px");
  });
});
