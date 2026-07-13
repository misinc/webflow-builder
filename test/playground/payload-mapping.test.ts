import { describe, expect, it } from "vitest";
import {
  capturedTreeToClipboardPayload,
  combineSections,
  type CapturedNode
} from "../../visual-qa/src/payload";

const el = (partial: Partial<CapturedNode> & { tag: string }): CapturedNode => ({
  attrs: {},
  styles: {},
  children: [],
  ...partial
});

const cardStyles = {
  display: "flex",
  "flex-direction": "column",
  "row-gap": "16px",
  "background-color": "rgb(24, 27, 34)"
};

function fixtureTree(): CapturedNode {
  return el({
    tag: "section",
    styles: { display: "flex", "column-gap": "24px", "padding-top": "80px" },
    children: [
      el({
        tag: "h2",
        styles: { "font-size": "40px" },
        text: "Our",
        children: [el({ tag: "span", styles: { color: "rgb(37, 99, 235)" }, text: "services" })]
      }),
      el({ tag: "div", styles: { ...cardStyles }, children: [el({ tag: "p", text: "Card one" })] }),
      el({ tag: "div", styles: { ...cardStyles }, children: [el({ tag: "p", text: "Card two" })] }),
      el({
        tag: "a",
        attrs: { href: "https://example.com/contact" },
        styles: { "padding-left": "24px", "padding-right": "24px" },
        text: "Get in touch"
      }),
      el({
        tag: "img",
        attrs: { src: "https://example.com/hero.jpg", alt: "Team" },
        styles: { width: "480px", height: "320px" }
      }),
      el({ tag: "div" }) // no styles → no class
    ]
  });
}

describe("playground payload mapping (captured tree → XscpData)", () => {
  it("dedupes identical style sets into one shared class", () => {
    const { payload, stats } = capturedTreeToClipboardPayload(fixtureTree());
    const cardClasses = payload.payload.styles.filter((style) =>
      style.styleLess.includes("background-color: rgb(24, 27, 34);")
    );
    expect(cardClasses).toHaveLength(1);
    // section, h2, card (shared), link, img — the bare div mints nothing
    expect(stats.classCount).toBe(5);
  });

  it("emits no class for style-less nodes", () => {
    const { payload } = capturedTreeToClipboardPayload(fixtureTree());
    const bareDivs = payload.payload.nodes.filter(
      (node) => node.tag === "div" && !node.text && (node.classes ?? []).length === 0
    );
    expect(bareDivs.length).toBeGreaterThan(0);
  });

  it("flattens styled inline content inside text-only elements and warns", () => {
    const { payload, warnings } = capturedTreeToClipboardPayload(fixtureTree());
    const textValues = payload.payload.nodes.filter((node) => node.text).map((node) => node.v);
    expect(textValues).toContain("Our services");
    expect(payload.payload.nodes.some((node) => node.tag === "span")).toBe(false);
    expect(warnings.some((warning) => warning.includes("flattened"))).toBe(true);
  });

  it("translates gap to the legacy grid-*-gap names via the shared serializer", () => {
    const { payload } = capturedTreeToClipboardPayload(fixtureTree());
    const sectionStyle = payload.payload.styles.find((style) =>
      style.styleLess.includes("padding-top: 80px;")
    );
    expect(sectionStyle?.styleLess).toContain("grid-column-gap: 24px;");
    expect(sectionStyle?.styleLess).not.toMatch(/(?<!grid-)column-gap:/);
    const cardStyle = payload.payload.styles.find((style) =>
      style.styleLess.includes("background-color")
    );
    expect(cardStyle?.styleLess).toContain("grid-row-gap: 16px;");
  });

  it("counts placeholder images and dropped link URLs, carrying image size in styles", () => {
    const { payload, stats, warnings } = capturedTreeToClipboardPayload(fixtureTree());
    expect(stats.placeholderImages).toBe(1);
    expect(stats.droppedLinkUrls).toBe(1);
    expect(warnings.some((warning) => warning.includes("placeholder"))).toBe(true);
    expect(warnings.some((warning) => warning.includes('reset to "#"'))).toBe(true);
    const imageNode = payload.payload.nodes.find((node) => node.type === "Image");
    expect(imageNode).toBeDefined();
    const imageStyle = payload.payload.styles.find((style) =>
      style.styleLess.includes("width: 480px;")
    );
    expect(imageStyle?.styleLess).toContain("height: 320px;");
  });

  it("names the root for the Designer Navigator", () => {
    const { payload } = capturedTreeToClipboardPayload(fixtureTree(), {
      sectionLabel: "Pasted from URL — #services"
    });
    const root = payload.payload.nodes.at(-1);
    expect((root?.data as { displayName?: string })?.displayName).toBe(
      "Pasted from URL — #services"
    );
  });
});

describe("responsive variant deltas", () => {
  // A row that stacks to a column on mobile, and a heading that shrinks.
  const row = el({ tag: "section", key: "0", styles: { display: "flex", "flex-direction": "row" } });
  const heading = el({ tag: "h2", key: "0.0", styles: { "font-size": "48px", color: "rgb(0, 0, 0)" }, text: "Hi" });
  row.children = [heading];

  const breakpointStyles = {
    medium: {
      "0": { display: "flex", "flex-direction": "row" }, // unchanged at tablet
      "0.0": { "font-size": "36px", color: "rgb(0, 0, 0)" } // shrinks
    },
    small: {
      "0": { display: "flex", "flex-direction": "column" }, // stacks
      "0.0": { "font-size": "28px", color: "rgb(0, 0, 0)" }
    },
    tiny: {
      "0": { display: "flex", "flex-direction": "column" }, // same as small → no delta
      "0.0": { "font-size": "24px", color: "rgb(0, 0, 0)" }
    }
  };

  const opts = { breakpointStyles, breakpointKeys: ["medium", "small", "tiny"] };

  it("emits only the changed declarations per breakpoint, desktop-first", () => {
    const { payload, stats } = capturedTreeToClipboardPayload(row, opts);
    const sectionStyle = payload.payload.styles.find((s) => s.styleLess.includes("display: flex;"))!;
    // Section unchanged at tablet → no medium variant; stacks at small; tiny same as small → none.
    expect(sectionStyle.variants.medium).toBeUndefined();
    expect((sectionStyle.variants.small as { styleLess: string }).styleLess).toBe(
      "flex-direction: column;"
    );
    expect(sectionStyle.variants.tiny).toBeUndefined();
    expect(stats.responsiveClassCount).toBe(2);
  });

  it("carries a cascading heading shrink across all three breakpoints", () => {
    const { payload } = capturedTreeToClipboardPayload(row, opts);
    const headingStyle = payload.payload.styles.find((s) => s.styleLess.includes("font-size: 48px;"))!;
    expect((headingStyle.variants.medium as { styleLess: string }).styleLess).toBe("font-size: 36px;");
    expect((headingStyle.variants.small as { styleLess: string }).styleLess).toBe("font-size: 28px;");
    expect((headingStyle.variants.tiny as { styleLess: string }).styleLess).toBe("font-size: 24px;");
    // color never changes → never restated in a variant
    expect(JSON.stringify(headingStyle.variants)).not.toContain("color");
  });

  it("keeps variants empty when no breakpoint data is supplied", () => {
    const { payload } = capturedTreeToClipboardPayload(row);
    for (const style of payload.payload.styles) {
      expect(style.variants).toEqual({});
    }
  });
});

describe("style-guide mode (client-first references)", () => {
  const tree = () =>
    el({
      tag: "section",
      styles: { display: "flex", "padding-top": "80px" },
      children: [
        el({ tag: "h2", styles: { "font-size": "40px" }, text: "Our Services" }),
        el({ tag: "p", styles: { "font-size": "18px", color: "rgb(0,0,0)" }, text: "Body copy" }),
        el({
          tag: "a",
          attrs: { href: "https://x.com" },
          styles: { "background-color": "rgb(255,153,0)", "padding-top": "12px", "border-top-left-radius": "8px" },
          text: "Get in touch"
        })
      ]
    });

  it("references heading-style / text-size / button by name with empty styleLess", () => {
    const { payload, stats } = capturedTreeToClipboardPayload(tree(), { styleGuideMode: true });
    const byName = Object.fromEntries(payload.payload.styles.map((s) => [s.name, s]));
    expect(byName["heading-style-h2"]?.styleLess).toBe("");
    expect(byName["text-size-medium"]?.styleLess).toBe("");
    expect(byName["button"]?.styleLess).toBe("");
    expect(stats.styleGuideRefs).toBe(3);
    // the section wrapper still carries its own captured layout class
    expect(payload.payload.styles.some((s) => s.styleLess.includes("padding-top: 80px;"))).toBe(true);
  });

  it("keeps the source text color as a combo on shared typography (direct colors)", () => {
    const dark = el({
      tag: "section",
      styles: { "background-color": "rgb(0, 18, 53)" },
      children: [el({ tag: "h2", styles: { "font-size": "40px", color: "rgb(255, 255, 255)" }, text: "On dark" })]
    });
    const { payload } = capturedTreeToClipboardPayload(dark, { styleGuideMode: true });
    const heading = payload.payload.nodes.find((n) => n.type === "Heading")!;
    const names = (heading.classes ?? []).map((id) => payload.payload.styles.find((s) => s._id === id)?.name);
    expect(names).toContain("heading-style-h2");
    const combo = payload.payload.styles.find(
      (s) => s.comb === "&" && s.styleLess.includes("color: rgb(255, 255, 255);")
    );
    expect(combo).toBeDefined();
  });

  it("does not add a color combo to buttons (they get color from the Style Guide)", () => {
    const { payload } = capturedTreeToClipboardPayload(tree(), { styleGuideMode: true });
    // the button node wears only `button`, no color combo
    const link = payload.payload.nodes.find((n) => n.type === "Link")!;
    const names = (link.classes ?? []).map((id) => payload.payload.styles.find((s) => s._id === id)?.name);
    expect(names).toEqual(["button"]);
  });

  it("leaves typography self-contained (pw-* with captured styles) when off", () => {
    const { payload, stats } = capturedTreeToClipboardPayload(tree(), { styleGuideMode: false });
    expect(stats.styleGuideRefs).toBe(0);
    expect(payload.payload.styles.some((s) => s.name === "heading-style-h2")).toBe(false);
    expect(payload.payload.styles.some((s) => s.styleLess.includes("font-size: 40px;"))).toBe(true);
  });

  it("does not map a plain (non-button) link to the button class", () => {
    const plainLink = el({
      tag: "section",
      styles: { display: "block" },
      children: [el({ tag: "a", attrs: { href: "#" }, styles: { color: "rgb(0,0,255)" }, text: "read more" })]
    });
    const { payload } = capturedTreeToClipboardPayload(plainLink, { styleGuideMode: true });
    expect(payload.payload.styles.some((s) => s.name === "button")).toBe(false);
  });
});

describe("combineSections (multi-select paste)", () => {
  const navbar = () =>
    el({ tag: "nav", styles: { display: "flex", "background-color": "rgb(255, 255, 255)" }, children: [] });
  const hero = () =>
    el({
      tag: "section",
      styles: { display: "flex", "padding-top": "80px", "background-color": "rgb(0, 18, 53)" },
      children: [el({ tag: "h1", styles: { "font-size": "56px", color: "rgb(255, 255, 255)" }, text: "Hi" })]
    });

  it("wraps sections under one labeled 'unwrap me' root", () => {
    const { payload } = combineSections([{ tree: navbar() }, { tree: hero() }], {});
    const root = payload.payload.nodes.at(-1)!;
    expect((root.data as { displayName?: string })?.displayName).toBe("Pasted sections — unwrap me");
    expect(root.children?.length).toBe(2);
  });

  it("dedupes shared classes across sections and keeps every var/style", () => {
    const { payload, stats } = combineSections(
      [
        { tree: hero(), options: { styleGuideMode: true } },
        { tree: hero(), options: { styleGuideMode: true } }
      ],
      {}
    );
    // both heroes reference the same shared heading-style-h1 → one style entry
    const headingRefs = payload.payload.styles.filter((s) => s.name === "heading-style-h1");
    expect(headingRefs).toHaveLength(1);
    // the white color combo is shared too
    const whiteCombos = payload.payload.styles.filter(
      (s) => s.comb === "&" && s.styleLess.includes("color: rgb(255, 255, 255);")
    );
    expect(whiteCombos).toHaveLength(1);
    expect(stats.styleGuideRefs).toBeGreaterThan(0);
  });

  it("a single section still combines into a valid wrapped payload", () => {
    const { payload } = combineSections([{ tree: hero() }], {});
    expect(payload.type).toBe("@webflow/XscpData");
    expect(payload.payload.nodes.length).toBeGreaterThan(0);
  });
});
