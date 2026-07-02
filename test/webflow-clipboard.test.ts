import { describe, expect, it } from "vitest";
import {
  buildWebflowClipboardPayload,
  type WebflowClipboardStyleInput
} from "@wfb/shared/webflow-clipboard.js";
import type { BuildNode } from "@wfb/shared/contracts.js";

const SVG = `<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>`;

const tree: BuildNode = {
  id: "s",
  type: "section",
  tag: "section",
  classNames: ["section_services"],
  children: [
    {
      id: "s-h",
      type: "heading",
      tag: "h2",
      classNames: ["heading-style-h2"],
      textContent: "Websites That Convert",
      children: []
    },
    {
      id: "s-cta",
      type: "button",
      tag: "a",
      classNames: ["services_link"],
      children: [
        {
          id: "s-cta-t",
          type: "text",
          tag: "p",
          classNames: [],
          textContent: "Book a Call",
          children: []
        },
        {
          id: "s-cta-i",
          type: "embed",
          tag: "div",
          classNames: ["icon-embed-xsmall"],
          embedHtml: SVG,
          children: []
        }
      ]
    },
    {
      id: "s-card2",
      type: "box",
      tag: "div",
      classNames: ["services_card", "services_card_v2"],
      children: []
    }
  ]
};

const styleDefinitions: WebflowClipboardStyleInput[] = [
  { className: "section_services", properties: { background: "#ffefcf", padding: "96px 20px" } },
  { className: "services_card", properties: { display: "grid", "border-left": "8px solid #ff9902" } },
  { className: "services_card_v2", properties: { "border-left": "8px solid #a62025" }, combo: true }
];

describe("webflow clipboard serializer", () => {
  const payload = buildWebflowClipboardPayload({ elementTree: tree, styleDefinitions });
  const { nodes, styles } = payload.payload;
  const nodeById = new Map(nodes.map((n) => [n._id, n]));
  const styleByName = new Map(styles.map((s) => [s.name, s]));

  it("produces a well-formed XscpData envelope", () => {
    expect(payload.type).toBe("@webflow/XscpData");
    expect(payload.meta.unlinkedSymbolCount).toBe(0);
    expect(Array.isArray(payload.payload.assets)).toBe(true);
  });

  it("keeps referential integrity (every child/class id exists)", () => {
    const styleIds = new Set(styles.map((s) => s._id));
    for (const node of nodes) {
      for (const childId of node.children ?? []) {
        expect(nodeById.has(childId)).toBe(true);
      }
      for (const classId of node.classes ?? []) {
        expect(styleIds.has(classId)).toBe(true);
      }
    }
  });

  it("maps tags to Webflow node types and nests text as text nodes", () => {
    const heading = nodes.find((n) => n.type === "Heading")!;
    expect(heading.tag).toBe("h2");
    const headingText = nodeById.get(heading.children![0])!;
    expect(headingText.text).toBe(true);
    expect(headingText.v).toBe("Websites That Convert");

    const link = nodes.find((n) => n.type === "Link")!;
    expect(link.children).toHaveLength(2);
    expect((link.data as { block: string }).block).toBe("block");
  });

  it("carries inline SVG as an HtmlEmbed", () => {
    const embed = nodes.find((n) => n.type === "HtmlEmbed")!;
    expect(embed.v).toBe(SVG);
    const meta = (embed.data as { embed: { meta: { html: string } } }).embed.meta;
    expect(meta.html).toBe(SVG);
  });

  it("emits combo styles with comb:'&' and base styles with styleLess CSS", () => {
    expect(styleByName.get("services_card")!.comb).toBe("");
    expect(styleByName.get("services_card")!.styleLess).toContain("border-left: 8px solid #ff9902;");
    expect(styleByName.get("services_card_v2")!.comb).toBe("&");
    expect(styleByName.get("services_card_v2")!.styleLess).toBe("border-left: 8px solid #a62025;");
    // class with no definition (heading-style-h2) still gets an entry so Webflow
    // can match it by name to the project's existing class
    expect(styleByName.get("heading-style-h2")!.styleLess).toBe("");
    // the varied card references base + combo in order
    const card = nodes.find((n) => (n.classes ?? []).length === 2)!;
    expect(card.classes![0]).toBe(styleByName.get("services_card")!._id);
    expect(card.classes![1]).toBe(styleByName.get("services_card_v2")!._id);
  });

  it("is deterministic (same input → identical payload)", () => {
    const again = buildWebflowClipboardPayload({ elementTree: tree, styleDefinitions });
    expect(JSON.stringify(again)).toBe(JSON.stringify(payload));
  });

  it("references existing project styles by their REAL id (no 'name 2' dupes)", () => {
    const withProject = buildWebflowClipboardPayload({
      elementTree: tree,
      styleDefinitions,
      existingStyles: [
        { className: "heading-style-h2", styleId: "aaaabbbbccccddddeeeeffff" },
        // exists in project AND we resolved styles for it — project wins, no restyle
        { className: "section_services", styleId: "111122223333444455556666" }
      ]
    });
    const projectStyles = new Map(withProject.payload.styles.map((s) => [s.name, s]));
    expect(projectStyles.get("heading-style-h2")!._id).toBe("aaaabbbbccccddddeeeeffff");
    expect(projectStyles.get("section_services")!._id).toBe("111122223333444455556666");
    // never restyle an existing project class
    expect(projectStyles.get("section_services")!.styleLess).toBe("");
    // new classes still ship their resolved styles
    expect(projectStyles.get("services_card")!.styleLess).toContain("display: grid;");
    // nodes reference the real id
    const heading = withProject.payload.nodes.find((n) => n.type === "Heading")!;
    expect(heading.classes).toContain("aaaabbbbccccddddeeeeffff");
  });
});
