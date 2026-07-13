import { describe, expect, it } from "vitest";
import {
  capturedSectionToClipboardPayload,
  combineSections,
  type CapturedNode,
  type SectionCaptureInput
} from "../../visual-qa/src/payload";

const el = (partial: Partial<CapturedNode> & { tag: string }): CapturedNode => ({
  attrs: {},
  styles: {},
  children: [],
  ...partial
});

type Payload = ReturnType<typeof capturedSectionToClipboardPayload>["payload"];
type Node = Payload["payload"]["nodes"][number];

const classNames = (p: Payload): string[] => p.payload.styles.map((s) => s.name);
const nodeClassNames = (p: Payload, node: Node): string[] =>
  (node.classes ?? [])
    .map((id) => p.payload.styles.find((s) => s._id === id)?.name)
    .filter((n): n is string => Boolean(n));
const styleByName = (p: Payload, name: string) => p.payload.styles.find((s) => s.name === name);

/** A dark hero: section bg + centered container + heading, body, CTA. */
function hero(overrides: Partial<SectionCaptureInput> = {}): SectionCaptureInput {
  return {
    tree: el({
      tag: "section",
      key: "0",
      styles: { "background-color": "rgb(0, 18, 53)", "padding-top": "80px", "padding-bottom": "80px" },
      children: [
        el({
          tag: "div",
          key: "0.0",
          styles: { "max-width": "1280px", "margin-left": "auto", "margin-right": "auto" },
          children: [
            el({ tag: "h1", key: "0.0.0", styles: { "font-size": "56px", color: "rgb(255, 255, 255)" }, text: "Human + AI" }),
            el({ tag: "p", key: "0.0.1", styles: { "font-size": "18px", color: "rgb(255, 255, 255)" }, text: "We combine expertise" }),
            el({
              tag: "a",
              key: "0.0.2",
              attrs: { href: "https://x.com" },
              styles: { "background-color": "rgb(142, 196, 65)", "padding-top": "8px", "border-top-left-radius": "8px" },
              text: "Meet with bAI Lab"
            })
          ]
        })
      ]
    }),
    sectionName: "Hero",
    label: "Hero",
    ...overrides
  };
}

describe("fidelity-first client-first naming (captured tree → XscpData)", () => {
  it("names the section root section_{key} and never emits pw-* classes", () => {
    const { payload } = capturedSectionToClipboardPayload(hero());
    const names = classNames(payload);
    expect(names).toContain("section_hero");
    expect(names.some((n) => /^pw-/.test(n))).toBe(false);
  });

  it("keeps the section's own background (fidelity) on section_hero", () => {
    const { payload } = capturedSectionToClipboardPayload(hero());
    const section = styleByName(payload, "section_hero")!;
    expect(section.styleLess).toContain("background-color: rgb(0, 18, 53);");
  });

  it("maps headings to heading-style-h* + a fidelity combo", () => {
    const { payload } = capturedSectionToClipboardPayload(hero());
    const h1 = payload.payload.nodes.find((n) => n.type === "Heading")!;
    const names = nodeClassNames(payload, h1);
    expect(names).toContain("heading-style-h1");
    expect(styleByName(payload, "heading-style-h1")!.styleLess).toBe(""); // adopts Style Guide
    const combo = payload.payload.styles.find(
      (s) => s.comb === "&" && s.styleLess.includes("color: rgb(255, 255, 255);")
    );
    expect(combo).toBeDefined();
  });

  it("maps paragraphs to the nearest text-size and buttons to button", () => {
    const { payload } = capturedSectionToClipboardPayload(hero());
    const names = classNames(payload);
    expect(names).toContain("text-size-medium"); // 18px → medium
    expect(names).toContain("button");
  });
});

describe("container + section-padding size matching", () => {
  it("adopts the nearest standard container by measured max-width", () => {
    const { payload } = capturedSectionToClipboardPayload(hero()); // 1280 → container-large
    const names = classNames(payload);
    expect(names).toContain("container-large");
    expect(names).not.toContain("container-small");
    // Bare reference — adopts the project's width.
    expect(styleByName(payload, "container-large")!.styleLess).toBe("");
  });

  it("skips container/padding naming on special sections (absolute hero)", () => {
    const input: SectionCaptureInput = {
      tree: el({
        tag: "section",
        key: "0",
        styles: { position: "relative", "padding-top": "80px", "padding-bottom": "80px" },
        children: [
          el({
            tag: "div",
            key: "0.0",
            styles: { position: "absolute", "max-width": "1280px" }, // would-be container, but absolute
            children: [el({ tag: "h1", key: "0.0.0", styles: { "font-size": "56px" }, text: "Hero" })]
          })
        ]
      }),
      sectionName: "Hero"
    };
    const { payload } = capturedSectionToClipboardPayload(input);
    const names = classNames(payload);
    expect(names.some((n) => n.startsWith("container"))).toBe(false);
    expect(names.some((n) => n.startsWith("padding-section"))).toBe(false);
    // Still gets client-first typography naming.
    expect(names).toContain("heading-style-h1");
  });

  it("mints a custom container when no standard size fits", () => {
    const wide = hero();
    (wide.tree.children[0].styles as Record<string, string>)["max-width"] = "1500px";
    const { payload } = capturedSectionToClipboardPayload(wide);
    const names = classNames(payload);
    expect(names.some((n) => n === "container-hero")).toBe(true);
    expect(styleByName(payload, "container-hero")!.styleLess).toContain("max-width: 1500px;");
    expect(names).not.toContain("container-large");
  });
});

describe("full-bleed images → CSS background-image", () => {
  it("converts an absolute/cover <img> to a div with background-image", () => {
    const input: SectionCaptureInput = {
      tree: el({
        tag: "section",
        key: "0",
        styles: { position: "relative" },
        children: [
          el({
            tag: "img",
            key: "0.0",
            attrs: { src: "https://cdn.example.com/brain.jpg", alt: "brain" },
            styles: { position: "absolute", "object-fit": "cover", width: "1630px", height: "917px" }
          })
        ]
      }),
      sectionName: "Hero"
    };
    const { payload, stats } = capturedSectionToClipboardPayload(input);
    expect(stats.backgroundImages).toBe(1);
    const bg = payload.payload.styles.find((s) => s.styleLess.includes("background-image"));
    expect(bg?.styleLess).toContain('url("https://cdn.example.com/brain.jpg")');
    expect(bg?.styleLess).toContain("background-size: cover;");
    // No Image node — it became a div.
    expect(payload.payload.nodes.some((n) => n.type === "Image")).toBe(false);
  });
});

describe("responsive variants", () => {
  it("emits per-breakpoint deltas on the node combo", () => {
    const input = hero({
      breakpointStyles: {
        medium: { "0.0.0": { "font-size": "40px", color: "rgb(255, 255, 255)" } },
        small: { "0.0.0": { "font-size": "32px", color: "rgb(255, 255, 255)" } }
      },
      breakpointKeys: ["medium", "small", "tiny"]
    });
    const { payload } = capturedSectionToClipboardPayload(input);
    const h1 = payload.payload.nodes.find((n) => n.type === "Heading")!;
    const comboName = nodeClassNames(payload, h1).find((n) => n.includes("_v"))!;
    const combo = styleByName(payload, comboName)!;
    expect((combo.variants.medium as { styleLess: string }).styleLess).toContain("font-size: 40px;");
    expect((combo.variants.small as { styleLess: string }).styleLess).toContain("font-size: 32px;");
  });
});

describe("navbar → native Webflow Navbar element", () => {
  function navbar(): SectionCaptureInput {
    return {
      tree: el({
        tag: "header",
        key: "0",
        styles: { "background-color": "rgb(0, 18, 53)" },
        children: [
          el({
            tag: "nav",
            key: "0.0",
            styles: { display: "flex" },
            children: [
              el({
                tag: "a",
                key: "0.0.0",
                attrs: { href: "/" },
                children: [el({ tag: "div", key: "0.0.0.0", embedHtml: "<svg></svg>" })]
              }),
              el({ tag: "a", key: "0.0.1", attrs: { href: "/home" }, styles: { color: "rgb(255,255,255)" }, text: "Home" }),
              el({ tag: "a", key: "0.0.2", attrs: { href: "/about" }, styles: { color: "rgb(255,255,255)" }, text: "About" }),
              el({
                tag: "a",
                key: "0.0.3",
                attrs: { href: "/contact" },
                styles: { "background-color": "rgb(142,196,65)", "padding-top": "8px", "border-top-left-radius": "8px" },
                text: "Get in touch"
              })
            ]
          })
        ]
      }),
      sectionName: "Navbar",
      kind: "Header",
      label: "Navbar"
    };
  }

  it("emits native navbar node types (working responsive menu)", () => {
    const { payload } = capturedSectionToClipboardPayload(navbar());
    const types = new Set(payload.payload.nodes.map((n) => n.type));
    expect(types).toContain("NavbarWrapper");
    expect(types).toContain("NavbarBrand");
    expect(types).toContain("NavbarMenu");
    expect(types).toContain("NavbarLink");
    expect(types).toContain("NavbarButton");
    // NavbarWrapper carries the built-in collapse config.
    const wrapper = payload.payload.nodes.find((n) => n.type === "NavbarWrapper")!;
    expect((wrapper.data as any)?.navbar?.type).toBe("wrapper");
  });

  it("uses generic navbar_* classes with source styling and the hamburger", () => {
    const { payload } = capturedSectionToClipboardPayload(navbar());
    const names = classNames(payload);
    expect(names).toEqual(
      expect.arrayContaining([
        "navbar_component",
        "navbar_container",
        "navbar_logo-link",
        "navbar_logo",
        "navbar_menu",
        "navbar_menu-links",
        "navbar_link",
        "navbar_menu-buttons",
        "button",
        "navbar_menu-button",
        "menu-icon"
      ])
    );
    // Source navbar background rides on navbar_component.
    expect(styleByName(payload, "navbar_component")!.styleLess).toContain("background-color: rgb(0, 18, 53);");
    // Nav links carry their text; CTA becomes a button.
    const linkTexts = payload.payload.nodes.filter((n) => n.text).map((n) => n.v);
    expect(linkTexts).toEqual(expect.arrayContaining(["Home", "About", "Get in touch"]));
  });
});

describe("combineSections wraps in main-wrapper", () => {
  it("wraps multiple sections in a main-wrapper root", () => {
    const { payload } = combineSections([hero(), hero({ sectionName: "Philosophy" })]);
    const root = payload.payload.nodes.at(-1)!;
    expect(nodeClassNames(payload, root)).toContain("main-wrapper");
    expect((root.data as { displayName?: string })?.displayName).toBe("main-wrapper");
    expect(root.children?.length).toBe(2);
  });

  it("dedupes shared classes across sections", () => {
    const { payload } = combineSections([hero(), hero({ sectionName: "Hero" })]);
    expect(payload.payload.styles.filter((s) => s.name === "heading-style-h1")).toHaveLength(1);
  });

  it("a single section pastes bare (drop into main-wrapper yourself)", () => {
    const { payload } = capturedSectionToClipboardPayload(hero());
    const root = payload.payload.nodes.at(-1)!;
    expect((root.data as { displayName?: string })?.displayName).toBe("Hero");
    expect(nodeClassNames(payload, root)).toContain("section_hero");
  });
});
