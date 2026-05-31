import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAIPlanningProvider } from "../src/backend/planner/openai-planning-provider.js";
import { PlanningProviderInput } from "../src/backend/planner/planning-provider.js";

const input: PlanningProviderInput = {
  metadata: {
    repoId: "repo-1",
    pageId: "page-1",
    sectionId: "section-1",
    pageName: "Home",
    sectionName: "Footer",
    sourceFile: "debug://pasted-section.html"
  },
  mode: "skeletonThenStyle",
  sectionContext: {
    repoId: "repo-1",
    pageName: "Home",
    pageSourceFile: "src/pages/home.tsx",
    sectionName: "Footer",
    sectionSourceFile: "src/components/Footer.tsx",
    componentName: "Footer",
    sectionOrder: 9,
    sourceCode:
      '<footer><div><p>Federal criminal defense attorneys serving clients from investigation through appeal throughout Southern California and the Ninth Circuit.</p><h4>Quick Links</h4><a href="/">Home</a><h4>Contact</h4><p>65 N. Raymond Avenue, Suite 320</p><p>Pasadena, California 91103</p><p>(626) 792-6700</p><p>mark@windsorlaw.us</p><p>katy@windsorlaw.us</p><p>© 2026 Windsor Kimball APC. All rights reserved. | Attorney Advertising</p></div></footer>',
    relevantStylesheets: [],
    assetReferences: [],
    contentHints: [],
    relatedSharedClasses: []
  },
  serializedSection: {
    summary: "Footer with brand, quick links, contact details, and copyright.",
    content: [
      {
        kind: "p",
        label: "p",
        value:
          "Federal criminal defense attorneys serving clients from investigation through appeal throughout Southern California and the Ninth Circuit."
      },
      { kind: "h4", label: "h4", value: "Quick Links" },
      { kind: "a", label: "a", value: "Home" },
      { kind: "h4", label: "h4", value: "Contact" },
      { kind: "p", label: "p", value: "65 N. Raymond Avenue, Suite 320" },
      { kind: "p", label: "p", value: "Pasadena, California 91103" },
      { kind: "p", label: "p", value: "(626) 792-6700" },
      { kind: "p", label: "p", value: "mark@windsorlaw.us" },
      { kind: "p", label: "p", value: "katy@windsorlaw.us" },
      {
        kind: "p",
        label: "p",
        value: "© 2026 Windsor Kimball APC. All rights reserved. | Attorney Advertising"
      }
    ],
    assetReferences: [],
    layoutHints: ["footer layout appears in the source"],
    sourceExcerpt: '<footer class="bg-primary">'
  },
  projectContext: {
    namingRules: [],
    sharedTextClasses: ["text-size-medium", "text-size-small"],
    sharedHeadingClasses: ["heading-style-h4"],
    sharedButtonClasses: ["button"],
    spacingVariableRules: [],
    colorVariableRules: [],
    forbiddenPatterns: [],
    allowedNewClassPolicy: "layout-only"
  },
  sharedStyleContext: {
    siteId: "site-1",
    capturedAt: new Date().toISOString(),
    classes: [],
    variables: [],
    styleIds: []
  },
  includeContent: true,
  selectedElementId: null
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OpenAIPlanningProvider footer skeleton normalization", () => {
  it("forces a footer root and rehydrates malformed text nodes before returning treeText", async () => {
    const rawPlan = {
      sectionMetadata: input.metadata,
      treeText: [
        "section.section_footer",
        "  div.footer_brand",
        "    p.text-size-medium.criminal.defense.attorneys.serving.clients.from.investigation.through.appeal.throughout.and.the",
        "  div.footer_links-group",
        "    h4.heading-style-h4",
        "    ul.footer_links-list",
        "      li.footer_links-item",
        "        a.footer_link",
        "  div.footer_contact-group",
        "    h4.heading-style-h4",
        "    p.text-size-medium.65.320",
        "  div.footer_bottom",
        "    p.text-size-small.2026.rights"
      ].join("\n"),
      elementTree: {
        id: "root",
        type: "box",
        tag: "section",
        classNames: ["section_footer"],
        children: [
          {
            id: "brand",
            type: "box",
            tag: "div",
            classNames: ["footer_brand"],
            children: [
              {
                id: "brand-copy",
                type: "text",
                tag: "p",
                classNames: [
                  "text-size-medium",
                  "criminal",
                  "defense",
                  "attorneys",
                  "serving",
                  "clients",
                  "from",
                  "investigation",
                  "through",
                  "appeal",
                  "throughout",
                  "and",
                  "the"
                ],
                children: []
              }
            ]
          },
          {
            id: "links",
            type: "box",
            tag: "div",
            classNames: ["footer_links-group"],
            children: [
              {
                id: "links-heading",
                type: "heading",
                tag: "h4",
                classNames: ["heading-style-h4"],
                children: []
              },
              {
                id: "links-list",
                type: "list",
                tag: "ul",
                classNames: ["footer_links-list"],
                children: [
                  {
                    id: "links-item",
                    type: "listItem",
                    tag: "li",
                    classNames: ["footer_links-item"],
                    children: [
                      {
                        id: "links-anchor",
                        type: "button",
                        tag: "a",
                        classNames: ["footer_link"],
                        children: []
                      }
                    ]
                  }
                ]
              }
            ]
          },
          {
            id: "contact",
            type: "box",
            tag: "div",
            classNames: ["footer_contact-group"],
            children: [
              {
                id: "contact-heading",
                type: "heading",
                tag: "h4",
                classNames: ["heading-style-h4"],
                children: []
              },
              {
                id: "contact-copy",
                type: "text",
                tag: "p",
                classNames: ["text-size-medium", "65", "320"],
                children: []
              },
              {
                id: "contact-city",
                type: "text",
                tag: "p",
                classNames: ["text-size-medium"],
                children: []
              },
              {
                id: "contact-phone",
                type: "text",
                tag: "p",
                classNames: ["text-size-medium"],
                children: []
              },
              {
                id: "contact-email-1",
                type: "text",
                tag: "p",
                classNames: ["text-size-medium"],
                children: []
              },
              {
                id: "contact-email-2",
                type: "text",
                tag: "p",
                classNames: ["text-size-medium"],
                children: []
              }
            ]
          },
          {
            id: "bottom",
            type: "box",
            tag: "div",
            classNames: ["footer_bottom"],
            children: [
              {
                id: "copyright",
                type: "text",
                tag: "p",
                classNames: ["text-size-small", "2026", "rights"],
                children: []
              }
            ]
          }
        ]
      },
      reusableClasses: ["heading-style-h4", "text-size-medium", "text-size-small"],
      suggestedNewClasses: ["section_footer"],
      warnings: []
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify(rawPlan)
                }
              }
            ]
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      )
    );

    const provider = new OpenAIPlanningProvider("test-key", "test-model");
    const plan = await provider.generateSkeleton(input);

    expect(plan.elementTree.tag).toBe("footer");
    expect(plan.treeText).toContain("footer.section_footer");
    expect(plan.treeText).not.toContain(".criminal.defense.attorneys");
    expect(plan.elementTree.children[0]?.children[0]?.textContent).toBe(
      "Federal criminal defense attorneys serving clients from investigation through appeal throughout Southern California and the Ninth Circuit."
    );
    expect(
      plan.elementTree.children[1]?.children[0]?.textContent
    ).toBe("Quick Links");
    expect(
      plan.elementTree.children[1]?.children[1]?.children[0]?.children[0]?.textContent
    ).toBe("Home");
    expect(
      plan.elementTree.children[3]?.children[0]?.textContent
    ).toBe("© 2026 Windsor Kimball APC. All rights reserved. | Attorney Advertising");
  });

  it("returns a fallback skeleton instead of hanging until the function times out", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";

    vi.stubGlobal("fetch", vi.fn(async () => {
      throw abortError;
    }));

    const provider = new OpenAIPlanningProvider("test-key", "test-model");
    const plan = await provider.generateSkeleton(input);

    expect(plan.sectionMetadata.sectionName).toBe("Footer");
    expect(plan.elementTree.tag).toBe("footer");
    expect(plan.treeText).toContain("footer.section_footer");
    expect(
      plan.warnings.some(
        (warning) => warning.code === "skeleton-fallback" || warning.code === "skeleton-html-fallback"
      )
    ).toBe(true);
    expect(plan.warnings.some((warning) => warning.code === "skeleton-error")).toBe(true);
    expect(
      plan.warnings.some((warning) =>
        warning.message.includes("timed out after 25 seconds")
      )
    ).toBe(true);
  });

  it("builds a richer HTML-derived fallback for large pasted sections on timeout", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";

    vi.stubGlobal("fetch", vi.fn(async () => {
      throw abortError;
    }));

    const attorneysHtml = readFileSync(
      new URL("./fixtures/attorneys-debug.html", import.meta.url),
      "utf8"
    );

    const provider = new OpenAIPlanningProvider("test-key", "test-model");
    const plan = await provider.generateSkeleton({
      ...input,
      metadata: {
        ...input.metadata,
        sectionName: "Attorneys"
      },
      sectionContext: {
        ...input.sectionContext,
        sectionName: "Attorneys",
        sourceCode: attorneysHtml,
        assetReferences: [
          "/assets/Mark%20Windsor-DOtmifFO.jpg",
          "/assets/Katy%20Kimball%20Windsor-BGiwCZ2u.jpg"
        ]
      },
      serializedSection: {
        ...input.serializedSection,
        summary: "Attorneys section with repeated profile entries.",
        assetReferences: [
          "/assets/Mark%20Windsor-DOtmifFO.jpg",
          "/assets/Katy%20Kimball%20Windsor-BGiwCZ2u.jpg"
        ],
        sourceExcerpt: "<section>",
        content: [
          { kind: "h2", label: "h2", value: "Our Attorneys" },
          { kind: "h3", label: "h3", value: "Mark Windsor" },
          { kind: "p", label: "p", value: "Partner" },
          { kind: "h3", label: "h3", value: "Katy Kimball Windsor" }
        ]
      }
    });

    expect(plan.treeText).toContain("section.section_attorneys");
    expect(plan.treeText).toContain('h2.heading-style-h2 "Our Attorneys"');
    expect(plan.treeText).toContain('"Mark Windsor"');
    expect(plan.treeText).toContain('"Katy Kimball Windsor"');
    expect(plan.treeText).toContain("div.attorneys_list");
    expect(plan.treeText).toContain("img.attorneys_image");
    expect(plan.assetBindings).toEqual([
      {
        nodeId: "section-1-component-item-1-0-0-0-0",
        source: "/assets/Mark%20Windsor-DOtmifFO.jpg",
        fallback: "placeholder"
      },
      {
        nodeId: "section-1-component-item-2-0-0-0-0",
        source: "/assets/Katy%20Kimball%20Windsor-BGiwCZ2u.jpg",
        fallback: "placeholder"
      }
    ]);
    expect(plan.warnings.some((warning) => warning.code === "skeleton-html-fallback")).toBe(true);
    expect(plan.warnings.some((warning) => warning.code === "skeleton-error")).toBe(true);
  });

  it("converts JSX image components into img nodes in the timeout fallback", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";

    vi.stubGlobal("fetch", vi.fn(async () => {
      throw abortError;
    }));

    const jsxSection = `<section className="bg-white py-20"><div className="max-w-7xl mx-auto px-6 lg:px-8"><h2 className="text-3xl mb-12 text-foreground text-center">Our Attorneys</h2><div className="grid grid-cols-1 lg:grid-cols-3 gap-8"><div className="lg:col-span-1"><div className="relative aspect-[3/4] mb-6 overflow-hidden rounded"><ImageWithFallback src={markPhoto} alt="Portrait of Mark Windsor" className="w-full h-full object-cover" /></div><h3 className="text-2xl mb-2">Mark Windsor</h3><p className="text-sm text-muted-foreground mb-4">Partner</p></div></div></div></section>`;

    const provider = new OpenAIPlanningProvider("test-key", "test-model");
    const plan = await provider.generateSkeleton({
      ...input,
      metadata: {
        ...input.metadata,
        sectionName: "Attorney Profiles"
      },
      sectionContext: {
        ...input.sectionContext,
        sectionName: "Attorney Profiles",
        sourceCode: jsxSection,
        assetReferences: ["../../assets/Mark Windsor.jpg"]
      },
      serializedSection: {
        ...input.serializedSection,
        summary: "Attorney profile section with a portrait image.",
        assetReferences: ["../../assets/Mark Windsor.jpg"],
        sourceExcerpt: "<section>",
        content: [
          { kind: "h2", label: "h2", value: "Our Attorneys" },
          { kind: "img", label: "img", value: "Portrait of Mark Windsor" },
          { kind: "h3", label: "h3", value: "Mark Windsor" }
        ]
      }
    });

    expect(plan.treeText).toContain("img.attorney-profiles_image");
    expect(plan.treeText).toContain('"Mark Windsor"');
    expect(plan.assetBindings).toEqual([
      {
        nodeId: "section-1-component-1-0-0-0",
        source: "../../assets/Mark Windsor.jpg",
        fallback: "placeholder"
      }
    ]);
  });

  it("honors includeContent=false for the HTML-derived timeout fallback", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";

    vi.stubGlobal("fetch", vi.fn(async () => {
      throw abortError;
    }));

    const attorneysHtml = readFileSync(
      new URL("./fixtures/attorneys-debug.html", import.meta.url),
      "utf8"
    );

    const provider = new OpenAIPlanningProvider("test-key", "test-model");
    const plan = await provider.generateSkeleton({
      ...input,
      metadata: {
        ...input.metadata,
        sectionName: "Attorneys"
      },
      includeContent: false,
      sectionContext: {
        ...input.sectionContext,
        sectionName: "Attorneys",
        sourceCode: attorneysHtml
      },
      serializedSection: {
        ...input.serializedSection,
        summary: "Attorneys section with repeated profile entries.",
        sourceExcerpt: "<section>",
        content: []
      }
    });

    expect(plan.treeText).toContain('h2.heading-style-h2 "Heading"');
    expect(plan.treeText).toContain('h3.heading-style-h3 "Heading"');
    expect(plan.treeText).toContain('p.text-size-medium "Body copy"');
    expect(plan.treeText).toContain('li.attorneys_item "List item"');
    expect(plan.treeText).not.toContain("Mark Windsor");
    expect(plan.treeText).not.toContain("State Bar of California");
  });

  it("uses descendant heading text and drops empty accordion content wrappers in the HTML fallback", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";

    vi.stubGlobal("fetch", vi.fn(async () => {
      throw abortError;
    }));

    const faqHtml = `<section><div><div data-slot="accordion"><div data-slot="accordion-item"><h3><button type="button"><span>What should I do if federal agents contact me?</span><svg><path></path></svg></button></h3><div id="radix-:r1:" class="overflow-hidden"></div></div></div></div></section>`;

    const provider = new OpenAIPlanningProvider("test-key", "test-model");
    const plan = await provider.generateSkeleton({
      ...input,
      metadata: {
        ...input.metadata,
        sectionName: "FAQ"
      },
      sectionContext: {
        ...input.sectionContext,
        sectionName: "FAQ",
        sourceCode: faqHtml
      },
      serializedSection: {
        ...input.serializedSection,
        summary: "FAQ accordion with repeated question items.",
        sourceExcerpt: "<section>",
        content: [
          {
            kind: "h3",
            label: "h3",
            value: "What should I do if federal agents contact me?"
          }
        ]
      }
    });

    expect(plan.treeText).toContain(
      'h3.heading-style-h3 "What should I do if federal agents contact me?"'
    );
    expect(plan.treeText).not.toContain('h3.heading-style-h3 "Heading"');
    expect(plan.treeText).not.toContain("faq_group");
  });
});

describe("OpenAIPlanningProvider blockquote normalization", () => {
  it("converts blockquote-class paragraphs into native blockquote nodes", async () => {
    const provider = new OpenAIPlanningProvider("test-key", "gpt-test");
    const rawPlan = {
      sectionMetadata: input.metadata,
      treeText: 'section.section_testimonial\n  p.blockquote.text-style-italic "Quoted disclaimer copy"',
      elementTree: {
        id: "root",
        type: "box",
        tag: "section",
        classNames: ["section_testimonial"],
        children: [
          {
            id: "quote",
            type: "text",
            tag: "p",
            classNames: ["blockquote", "text-style-italic"],
            textContent: "Quoted disclaimer copy",
            children: []
          }
        ]
      },
      reusableClasses: ["blockquote", "text-style-italic"],
      suggestedNewClasses: ["section_testimonial"],
      warnings: []
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify(rawPlan)
                }
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    const result = await provider.generateSkeleton({
      ...input,
      metadata: {
        ...input.metadata,
        sectionName: "Testimonial"
      },
      sectionContext: {
        ...input.sectionContext,
        sourceCode:
          '<section><blockquote class="blockquote text-style-italic">Quoted disclaimer copy</blockquote></section>'
      },
      serializedSection: {
        ...input.serializedSection,
        summary: "Testimonial quote section.",
        sourceExcerpt: '<blockquote class="blockquote text-style-italic">'
      }
    });

    expect(result.elementTree.children[0]?.tag).toBe("blockquote");
    expect(result.treeText).toContain(
      'blockquote.blockquote.text-style-italic "Quoted disclaimer copy"'
    );
  });
});
