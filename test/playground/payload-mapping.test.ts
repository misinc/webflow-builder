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

  it("maps headings to heading-style-h* + a GLOBAL fidelity class (never a scoped combo)", () => {
    const { payload } = capturedSectionToClipboardPayload(hero());
    const h1 = payload.payload.nodes.find((n) => n.type === "Heading")!;
    const names = nodeClassNames(payload, h1);
    expect(names).toContain("heading-style-h1");
    expect(styleByName(payload, "heading-style-h1")!.styleLess).toBe(""); // adopts Style Guide
    const delta = payload.payload.styles.find((s) => s.styleLess.includes("color: rgb(255, 255, 255);"))!;
    expect(delta).toBeDefined();
    // Global, not a scoped combo — so Webflow attaches it to the real base (no "name 2" fork).
    expect(delta.comb).toBe("");
    // The shared base carries no combo children (that linkage is what forces the fork).
    expect(styleByName(payload, "heading-style-h1")!.children ?? []).toHaveLength(0);
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

  it("snaps the measured width to the nearest size (small / medium / large)", () => {
    const widthToContainer: Array<[string, string]> = [
      ["720px", "container-small"],
      ["1000px", "container-medium"],
      ["1280px", "container-large"],
      ["1500px", "container-large"] // still snaps to the nearest — never a custom class
    ];
    for (const [maxWidth, expected] of widthToContainer) {
      const s = hero();
      (s.tree.children[0].styles as Record<string, string>)["max-width"] = maxWidth;
      const names = classNames(capturedSectionToClipboardPayload(s).payload);
      expect(names).toContain(expected);
      expect(names.filter((n) => n.startsWith("container-"))).toEqual([expected]); // exactly one container
      expect(names.some((n) => n.startsWith("container-hero"))).toBe(false); // no custom container
    }
  });

  it("snaps the measured vertical padding to the nearest section-padding size", () => {
    const padToClass: Array<[string, string]> = [
      ["48px", "padding-section-small"],
      ["100px", "padding-section-medium"],
      ["128px", "padding-section-large"],
      ["200px", "padding-section-xlarge"]
    ];
    for (const [pad, expected] of padToClass) {
      const s = hero();
      (s.tree.styles as Record<string, string>)["padding-top"] = pad;
      (s.tree.styles as Record<string, string>)["padding-bottom"] = pad;
      const names = classNames(capturedSectionToClipboardPayload(s).payload);
      expect(names).toContain(expected);
      expect(names.filter((n) => n.startsWith("padding-section-"))).toEqual([expected]); // exactly one
    }
  });

  it("falls back to container-large only when there is no measurable width", () => {
    const input: SectionCaptureInput = {
      tree: el({
        tag: "section",
        key: "0",
        styles: { "padding-top": "80px", "padding-bottom": "80px" },
        children: [
          // A flex group with no max-width — nothing to measure.
          el({
            tag: "div",
            key: "0.0",
            styles: { display: "flex", "flex-direction": "column" },
            children: [el({ tag: "h2", key: "0.0.0", styles: { "font-size": "40px" }, text: "Full width" })]
          })
        ]
      }),
      sectionName: "Fullwidth"
    };
    const names = classNames(capturedSectionToClipboardPayload(input).payload);
    expect(names).toContain("container-large");
  });
});

/** id → node lookup, for walking the built element tree. */
const byId = (p: Payload) => new Map(p.payload.nodes.map((n) => [n._id, n]));
const firstChild = (p: Payload, node: Node): Node => byId(p).get(node.children![0])!;
const nodeWithClass = (p: Payload, cls: string): Node =>
  p.payload.nodes.find((n) => nodeClassNames(p, n).includes(cls))!;

describe("client-first scaffold injection (non-special sections)", () => {
  it("wraps a normal section in section_ > padding-global > container > padding-section", () => {
    const { payload } = capturedSectionToClipboardPayload(hero());
    const section = nodeWithClass(payload, "section_hero");
    const pg = firstChild(payload, section);
    expect(nodeClassNames(payload, pg)).toEqual(["padding-global"]);
    const container = firstChild(payload, pg);
    expect(nodeClassNames(payload, container)).toEqual(["container-large"]);
    const padSec = firstChild(payload, container);
    expect(nodeClassNames(payload, padSec)).toEqual(["padding-section-medium"]); // 80px → medium
    // The scaffold wrappers are bare references (adopt the project).
    expect(styleByName(payload, "padding-global")!.styleLess).toBe("");
    // The redundant source max-width wrapper was absorbed — content sits directly inside.
    const heading = payload.payload.nodes.find((n) => n.type === "Heading")!;
    expect(padSec.children).toContain(heading._id);
  });

  it("keeps a special (absolute/backdrop) section free of the scaffold", () => {
    const input: SectionCaptureInput = {
      tree: el({
        tag: "section",
        key: "0",
        styles: { position: "relative" },
        children: [
          el({
            tag: "div",
            key: "0.0",
            styles: { position: "absolute", inset: "0px" },
            children: [el({ tag: "h1", key: "0.0.0", styles: { "font-size": "56px" }, text: "Hero" })]
          })
        ]
      }),
      sectionName: "Hero"
    };
    const { payload } = capturedSectionToClipboardPayload(input);
    const names = classNames(payload);
    expect(names).not.toContain("padding-global");
    expect(names.some((n) => n.startsWith("container"))).toBe(false);
    expect(names).toContain("heading-style-h1");
  });
});

describe("clean Style-Guide adoption (no duplicate combos)", () => {
  it("references shared typography bare when there is no visual delta", () => {
    const input: SectionCaptureInput = {
      tree: el({
        tag: "section",
        key: "0",
        styles: { "padding-top": "80px", "padding-bottom": "80px" },
        children: [
          el({
            tag: "div",
            key: "0.0",
            styles: { "max-width": "1280px", "margin-left": "auto", "margin-right": "auto" },
            children: [
              el({
                tag: "p",
                key: "0.0.0",
                styles: { "font-size": "18px", "line-height": "1.5", "font-weight": "400", margin: "0px" },
                text: "Body copy"
              })
            ]
          })
        ]
      }),
      sectionName: "Body"
    };
    const { payload } = capturedSectionToClipboardPayload(input);
    const p = payload.payload.nodes.find((n) => n.type === "Paragraph")!;
    // Size/line-height/weight are owned by text-size-medium → bare, single class.
    expect(nodeClassNames(payload, p)).toEqual(["text-size-medium"]);
  });

  it("stays bare for default ink + sub-pixel tracking, combos only real color", () => {
    const input: SectionCaptureInput = {
      tree: el({
        tag: "section",
        key: "0",
        styles: { "padding-top": "80px", "padding-bottom": "80px" },
        children: [
          el({
            tag: "div",
            key: "0.0",
            styles: { "max-width": "1280px", "margin-left": "auto", "margin-right": "auto" },
            children: [
              // Green eyebrow → a real color delta.
              el({ tag: "p", key: "0.0.0", styles: { "font-size": "18px", color: "rgb(118, 160, 54)", "letter-spacing": "2px" }, text: "Eyebrow" }),
              // Default dark heading + sub-pixel tracking → no delta → bare.
              el({ tag: "h2", key: "0.0.1", styles: { "font-size": "40px", color: "rgb(0, 12, 35)", "letter-spacing": "0.15px" }, text: "Title" }),
              // Default dark body → bare.
              el({ tag: "p", key: "0.0.2", styles: { "font-size": "18px", color: "rgb(12, 12, 35)", "letter-spacing": "0.15px" }, text: "Body" })
            ]
          })
        ]
      }),
      sectionName: "Copy"
    };
    const { payload } = capturedSectionToClipboardPayload(input);
    // Default-ink heading + sub-pixel tracking → bare, no combo.
    const heading = payload.payload.nodes.find((n) => n.type === "Heading")!;
    expect(nodeClassNames(payload, heading)).toEqual(["heading-style-h2"]);
    // Two paragraphs: default dark body → bare; green eyebrow → base + one combo.
    const paras = payload.payload.nodes
      .filter((n) => n.type === "Paragraph")
      .map((n) => nodeClassNames(payload, n));
    const bare = paras.find((c) => c.length === 1);
    const combo = paras.find((c) => c.length === 2);
    expect(bare).toEqual(["text-size-medium"]);
    expect(combo?.[0]).toBe("text-size-medium");
    expect(styleByName(payload, combo![1])!.styleLess).toContain("color: rgb(118, 160, 54);");
    expect(styleByName(payload, combo![1])!.styleLess).toContain("letter-spacing: 2px;"); // real tracking kept
  });

  it("keeps exactly one combo for a genuine delta and never a numbered duplicate", () => {
    const { payload } = capturedSectionToClipboardPayload(hero());
    const h1 = payload.payload.nodes.find((n) => n.type === "Heading")!;
    const names = nodeClassNames(payload, h1);
    expect(names[0]).toBe("heading-style-h1");
    expect(names).toHaveLength(2);
    expect(names[1]).toMatch(/^heading-style-h1_v/);
    // The combo carries only the color delta, not font-size/line-height.
    expect(styleByName(payload, names[1])!.styleLess).toBe("color: rgb(255, 255, 255);");
    expect(names.some((n) => / \d+$/.test(n))).toBe(false);
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
  it("keeps responsive deltas for real visual props but drops shared-owned size", () => {
    const input = hero({
      breakpointStyles: {
        // font-size shrinks (owned by the project scale) and color changes (a real delta).
        medium: { "0.0.0": { "font-size": "40px", color: "rgb(142, 196, 65)" } }
      },
      breakpointKeys: ["medium", "small", "tiny"]
    });
    const { payload } = capturedSectionToClipboardPayload(input);
    const h1 = payload.payload.nodes.find((n) => n.type === "Heading")!;
    const comboName = nodeClassNames(payload, h1).find((n) => n.includes("_v"))!;
    const combo = styleByName(payload, comboName)!;
    const medium = (combo.variants.medium as { styleLess: string }).styleLess;
    expect(medium).toContain("color: rgb(142, 196, 65);"); // real delta rides the combo
    expect(medium).not.toContain("font-size"); // heading-style-h1 owns the responsive size
  });
});

describe("existingStyles binding (no name-2 forks on paste)", () => {
  const project = [
    { className: "text-size-medium", styleId: "proj-tsm" },
    { className: "heading-style-h1", styleId: "proj-h1" },
    { className: "padding-global", styleId: "proj-pg" },
    { className: "container-large", styleId: "proj-cl" },
    { className: "button", styleId: "proj-btn" }
  ];

  it("references the project's real style id for shared classes (empty styleLess)", () => {
    const { payload } = capturedSectionToClipboardPayload(hero(), project);
    for (const { className, styleId } of project) {
      const style = styleByName(payload, className);
      expect(style, className).toBeDefined();
      expect(style!._id).toBe(styleId); // real project id, not a synthetic hash → Webflow reuses it
      expect(style!.styleLess).toBe(""); // shared class is referenced, never restyled
    }
    // The per-node fidelity combo is still a fresh class (not a project id).
    const combo = classNames(payload).find((n) => n.startsWith("heading-style-h1_v"));
    expect(combo).toBeDefined();
    expect(styleByName(payload, combo!)!._id).not.toBe("proj-h1");
  });

  it("combineSections forwards existingStyles to every section", () => {
    const { payload } = combineSections([hero(), hero({ sectionName: "Two" })], {
      existingStyles: project
    });
    expect(styleByName(payload, "text-size-medium")!._id).toBe("proj-tsm");
  });
});

describe("section-wide background image (issue #3)", () => {
  it("hoists a full-bleed backdrop onto the section root, not an inner div", () => {
    const input: SectionCaptureInput = {
      tree: el({
        tag: "section",
        key: "0",
        styles: { position: "relative" },
        children: [
          el({
            tag: "img",
            key: "0.0",
            attrs: { src: "https://cdn.example.com/bg.jpg", alt: "bg" },
            styles: { position: "absolute", "object-fit": "cover" }
          }),
          el({
            tag: "div",
            key: "0.1",
            styles: { "max-width": "1280px", "margin-left": "auto", "margin-right": "auto" },
            children: [el({ tag: "h2", key: "0.1.0", styles: { "font-size": "40px" }, text: "Overlaid" })]
          })
        ]
      }),
      sectionName: "Backdrop"
    };
    const { payload, stats } = capturedSectionToClipboardPayload(input);
    expect(stats.backgroundImages).toBe(1);
    const section = styleByName(payload, "section_backdrop")!;
    expect(section.styleLess).toContain('background-image: url("https://cdn.example.com/bg.jpg")');
    expect(section.styleLess).toContain("background-size: cover;");
    // Backdrop is a CSS background — no standalone Image node / bg div.
    expect(payload.payload.nodes.some((n) => n.type === "Image")).toBe(false);
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

  it("maps a source dropdown to the native Dropdown structure", () => {
    const withDropdown: SectionCaptureInput = {
      tree: el({
        tag: "header",
        key: "0",
        styles: { "background-color": "rgb(0, 18, 53)" },
        children: [
          el({
            tag: "nav",
            key: "0.0",
            children: [
              el({ tag: "div", key: "0.0.0", children: [el({ tag: "a", key: "0.0.0.0", attrs: { href: "/home" }, text: "Home" })] }),
              el({
                tag: "div",
                key: "0.0.1",
                children: [
                  el({ tag: "a", key: "0.0.1.0", attrs: { href: "/products" }, text: "Products" }),
                  el({
                    tag: "div",
                    key: "0.0.1.1",
                    children: [
                      el({ tag: "a", key: "0.0.1.1.0", attrs: { href: "/p1" }, text: "Product One" }),
                      el({ tag: "a", key: "0.0.1.1.1", attrs: { href: "/p2" }, text: "Product Two" })
                    ]
                  })
                ]
              })
            ]
          })
        ]
      }),
      sectionName: "Navbar",
      kind: "Header",
      label: "Navbar"
    };
    const { payload } = capturedSectionToClipboardPayload(withDropdown);
    const types = new Set(payload.payload.nodes.map((n) => n.type));
    expect(types).toContain("DropdownWrapper");
    expect(types).toContain("DropdownToggle");
    expect(types).toContain("DropdownList");
    expect(types).toContain("DropdownLink");
    const names = classNames(payload);
    expect(names).toEqual(
      expect.arrayContaining(["navbar_menu-dropdown", "navbar_dropdown-toggle", "navbar_dropdown-list", "navbar_dropdown-link"])
    );
    const texts = payload.payload.nodes.filter((n) => n.text).map((n) => n.v);
    expect(texts).toEqual(expect.arrayContaining(["Home", "Products", "Product One", "Product Two"]));
  });

  it("treats a nav link with a chevron but no submenu as an empty dropdown", () => {
    const withChevron: SectionCaptureInput = {
      tree: el({
        tag: "header",
        key: "0",
        children: [
          el({
            tag: "nav",
            key: "0.0",
            children: [
              el({ tag: "a", key: "0.0.0", attrs: { href: "/" }, children: [el({ tag: "div", key: "0.0.0.0", embedHtml: "<svg></svg>" })] }),
              el({ tag: "a", key: "0.0.1", attrs: { href: "/home" }, text: "Home" }),
              el({ tag: "a", key: "0.0.2", attrs: { href: "/services" }, text: "Services", children: [el({ tag: "div", key: "0.0.2.0", embedHtml: "<svg></svg>" })] }),
              el({ tag: "a", key: "0.0.3", attrs: { href: "/about" }, text: "About" })
            ]
          })
        ]
      }),
      sectionName: "Navbar",
      kind: "Header",
      label: "Navbar"
    };
    const { payload, warnings } = capturedSectionToClipboardPayload(withChevron);
    expect(payload.payload.nodes.some((n) => n.type === "DropdownWrapper")).toBe(true);
    const texts = payload.payload.nodes.filter((n) => n.text).map((n) => n.v);
    expect(texts).toContain("Services"); // toggle label
    expect(texts).toContain("Menu item"); // placeholder submenu link
    expect(texts).toContain("Home"); // plain link, not a dropdown
    expect(warnings.some((w) => w.includes("dropdown chevron"))).toBe(true);
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
