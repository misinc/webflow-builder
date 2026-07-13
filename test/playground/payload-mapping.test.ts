import { describe, expect, it } from "vitest";
import {
  capturedSectionToClipboardPayload,
  combineSections,
  type SectionCaptureInput
} from "../../visual-qa/src/payload";

const BP_KEYS = ["medium", "small", "tiny"];

type Payload = ReturnType<typeof capturedSectionToClipboardPayload>["payload"];
type Node = Payload["payload"]["nodes"][number];

/** Every class name present in the payload's style table. */
const classNames = (payload: Payload): string[] => payload.payload.styles.map((s) => s.name);

/** The class names applied to a node (resolving class ids → style names). */
const nodeClassNames = (payload: Payload, node: Node): string[] =>
  (node.classes ?? [])
    .map((id) => payload.payload.styles.find((s) => s._id === id)?.name)
    .filter((name): name is string => Boolean(name));

const styleByName = (payload: Payload, name: string) =>
  payload.payload.styles.find((s) => s.name === name);

/** A hero section: dark background, a heading and a paragraph. */
function hero(overrides: Partial<SectionCaptureInput> = {}): SectionCaptureInput {
  return {
    html:
      '<section data-pw-key="0" class="hero">' +
      '<div data-pw-key="0.0" class="hero-inner">' +
      '<h1 data-pw-key="0.0.0">Build faster</h1>' +
      '<p data-pw-key="0.0.1">Ship your site</p>' +
      "</div>" +
      "</section>",
    baseStylesByKey: {
      "0": { "background-color": "rgb(0, 18, 53)", "padding-top": "80px" },
      "0.0": { display: "flex", "flex-direction": "column", "row-gap": "16px" },
      "0.0.0": { "font-size": "56px", color: "rgb(255, 255, 255)" },
      "0.0.1": { "font-size": "18px", color: "rgb(200, 210, 230)" }
    },
    sectionId: "section-0",
    sectionName: "Hero",
    label: "Hero",
    ...overrides
  };
}

describe("client-first structure and naming (captured HTML → planner → XscpData)", () => {
  it("emits the client-first scaffold and semantic class names, never pw-* hashes", () => {
    const { payload } = capturedSectionToClipboardPayload(hero());
    const names = classNames(payload);
    expect(names).toEqual(
      expect.arrayContaining([
        "section_hero",
        "padding-global",
        "container-large",
        "padding-section-medium",
        "heading-style-h1",
        "text-size-medium"
      ])
    );
    // The old 1:1-DOM capture minted `pw-<tag>-<hash>` classes — never again.
    expect(names.some((name) => /^pw-/.test(name))).toBe(false);
  });

  it("names the section root for the Designer Navigator", () => {
    const { payload } = capturedSectionToClipboardPayload(hero());
    const root = payload.payload.nodes.at(-1);
    expect((root?.data as { displayName?: string })?.displayName).toBe("Hero");
  });

  it("references shared Style Guide classes by name with empty styleLess (adopted on paste)", () => {
    const { payload } = capturedSectionToClipboardPayload(hero());
    expect(styleByName(payload, "heading-style-h1")?.styleLess).toBe("");
    expect(styleByName(payload, "text-size-medium")?.styleLess).toBe("");
    expect(styleByName(payload, "padding-global")?.styleLess).toBe("");
  });
});

describe("captured styles ride as content-hashed combos", () => {
  it("puts the section background on a combo, minus scaffold-owned spacing", () => {
    const { payload } = capturedSectionToClipboardPayload(hero());
    const sectionNode = payload.payload.nodes.find((n) =>
      nodeClassNames(payload, n).includes("section_hero")
    )!;
    const comboName = nodeClassNames(payload, sectionNode).find((n) => n.startsWith("section_hero_v"));
    expect(comboName).toBeDefined();
    const combo = styleByName(payload, comboName!)!;
    expect(combo.comb).toBe("&");
    expect(combo.styleLess).toContain("background-color: rgb(0, 18, 53);");
    // The scaffold (padding-global / padding-section-*) owns spacing — the root
    // combo must not restate it.
    expect(combo.styleLess).not.toContain("padding-top");
  });

  it("carries the heading's captured color as a combo on heading-style-h1", () => {
    const { payload } = capturedSectionToClipboardPayload(hero());
    const headingNode = payload.payload.nodes.find((n) => n.type === "Heading")!;
    const names = nodeClassNames(payload, headingNode);
    expect(names).toContain("heading-style-h1");
    const comboName = names.find((n) => n.includes("_v"))!;
    const combo = styleByName(payload, comboName)!;
    expect(combo.comb).toBe("&");
    expect(combo.styleLess).toContain("color: rgb(255, 255, 255);");
  });
});

describe("responsive variant deltas", () => {
  it("emits only the changed declarations per breakpoint on the node combo", () => {
    const input = hero({
      breakpointStyles: {
        medium: { "0.0.0": { "font-size": "44px", color: "rgb(255, 255, 255)" } },
        small: { "0.0.0": { "font-size": "32px", color: "rgb(255, 255, 255)" } },
        tiny: {}
      },
      breakpointKeys: BP_KEYS
    });
    const { payload, stats } = capturedSectionToClipboardPayload(input);
    const headingNode = payload.payload.nodes.find((n) => n.type === "Heading")!;
    const comboName = nodeClassNames(payload, headingNode).find((n) => n.includes("_v"))!;
    const combo = styleByName(payload, comboName)!;
    expect((combo.variants.medium as { styleLess: string }).styleLess).toContain("font-size: 44px;");
    expect((combo.variants.small as { styleLess: string }).styleLess).toContain("font-size: 32px;");
    // Color never changes → never restated in a variant.
    expect(JSON.stringify(combo.variants)).not.toContain("color");
    expect(stats.responsiveClassCount).toBeGreaterThan(0);
  });

  it("keeps variants empty when no breakpoint data is supplied", () => {
    const { payload } = capturedSectionToClipboardPayload(hero());
    for (const style of payload.payload.styles) {
      expect(style.variants).toEqual({});
    }
  });
});

describe("chrome mode (navbar / footer)", () => {
  const navbar: SectionCaptureInput = {
    html:
      '<nav data-pw-key="0" class="navbar"><a data-pw-key="0.0" href="/">Home</a></nav>',
    baseStylesByKey: {
      "0": { display: "flex", "background-color": "rgb(255, 255, 255)" }
    },
    sectionId: "chrome-0",
    sectionName: "Navbar",
    chrome: true,
    label: "Navbar"
  };

  it("skips the section scaffold and keeps a {key}_component root", () => {
    const { payload } = capturedSectionToClipboardPayload(navbar);
    const names = classNames(payload);
    expect(names).not.toContain("padding-global");
    expect(names.some((name) => name.endsWith("_component"))).toBe(true);
  });

  it("keeps the chrome root's own background (spacing not stripped)", () => {
    const { payload } = capturedSectionToClipboardPayload(navbar);
    const combo = payload.payload.styles.find(
      (s) => s.comb === "&" && s.styleLess.includes("background-color: rgb(255, 255, 255);")
    );
    expect(combo).toBeDefined();
  });
});

describe("combineSections (multi-select paste)", () => {
  it("wraps sections under one labeled 'unwrap me' root", () => {
    const { payload } = combineSections([navbarInput(), hero()], {});
    const root = payload.payload.nodes.at(-1)!;
    expect((root.data as { displayName?: string })?.displayName).toBe("Pasted sections — unwrap me");
    expect(root.children?.length).toBe(2);
  });

  it("dedupes shared classes and identical combos across sections", () => {
    const { payload } = combineSections([hero(), hero({ sectionId: "section-1" })], {});
    // Both heroes reference the same shared class → one style entry.
    expect(payload.payload.styles.filter((s) => s.name === "heading-style-h1")).toHaveLength(1);
    // Identical captured heading color → one shared combo.
    const whiteCombos = payload.payload.styles.filter(
      (s) => s.comb === "&" && s.styleLess.includes("color: rgb(255, 255, 255);")
    );
    expect(whiteCombos).toHaveLength(1);
  });

  it("a single section still combines into a valid wrapped payload", () => {
    const { payload } = combineSections([hero()], {});
    expect(payload.type).toBe("@webflow/XscpData");
    expect(payload.payload.nodes.length).toBeGreaterThan(0);
  });
});

function navbarInput(): SectionCaptureInput {
  return {
    html: '<nav data-pw-key="0" class="navbar"><a data-pw-key="0.0" href="/">Home</a></nav>',
    baseStylesByKey: { "0": { display: "flex", "background-color": "rgb(255, 255, 255)" } },
    sectionId: "chrome-0",
    sectionName: "Navbar",
    chrome: true,
    label: "Navbar"
  };
}
