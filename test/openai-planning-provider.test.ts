import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAIPlanningProvider } from "@wfb/backend-core/planner/openai-planning-provider.js";
import { PlanningProviderInput } from "@wfb/backend-core/planner/planning-provider.js";

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

const JURISDICTIONS_HTML = `<section class="bg-secondary py-20"><div class="max-w-7xl mx-auto px-6 lg:px-8"><h2 class="text-3xl mb-8 text-foreground text-center">Jurisdictions Served</h2><div class="max-w-3xl mx-auto"><p class="text-center text-muted-foreground leading-relaxed mb-8">We are admitted to practice and regularly appear in the following courts:</p><div class="grid grid-cols-1 md:grid-cols-2 gap-6"><div class="bg-white p-6 rounded"><h3 class="mb-4">Trial Courts</h3><ul class="space-y-2 text-sm text-muted-foreground"><li>U.S. District Court, Central District of California</li><li>U.S. District Court, Southern District of California</li><li>Northern District of California</li><li>Superior Court of California</li></ul></div><div class="bg-white p-6 rounded"><h3 class="mb-4">Appellate Courts</h3><ul class="space-y-2 text-sm text-muted-foreground"><li>U.S. Court of Appeals, Ninth Circuit</li></ul></div></div></div></section>`;

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

  it("does not use dynamic JSX expressions, package names, or utility classes as timeout fallback text", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";

    vi.stubGlobal("fetch", vi.fn(async () => {
      throw abortError;
    }));

    const provider = new OpenAIPlanningProvider("test-key", "test-model");
    const plan = await provider.generateSkeleton({
      ...input,
      metadata: {
        ...input.metadata,
        sectionName: "Solutions"
      },
      sectionContext: {
        ...input.sectionContext,
        sectionName: "Solutions",
        sourceCode: [
          "import React from 'react';",
          "const offset = '-100px';",
          "export function SolutionsSection() {",
          "  return <section className=\"solv-section content-stretch flex flex-col items-center relative shrink-0 w-full\">",
          "    <div className=\"content-stretch flex flex-col gap-[48px] md:gap-[64px] items-start relative shrink-0 w-full max-w-[1200px]\">",
          "      <p>Solutions Tailored to Your Industry</p>",
          "      <h2>{industry.title}</h2>",
          "      <p>{industry.copy}</p>",
          "      <ul>{industries.map((industry, index) => <li key={industry.title}>{industry.title}</li>)}</ul>",
          "    </div>",
          "  </section>;",
          "}"
        ].join("\n")
      },
      serializedSection: {
        ...input.serializedSection,
        summary: "Solutions section with dynamic industry cards.",
        sourceExcerpt: "<section>",
        content: [
          { kind: "p", label: "p", value: "Solutions Tailored to Your Industry" }
        ]
      }
    });

    expect(plan.treeText).toContain('"Solutions Tailored to Your Industry"');
    expect(plan.treeText).not.toContain("industry.title");
    expect(plan.treeText).not.toContain("industry.copy");
    expect(plan.treeText).not.toContain("react");
    expect(plan.treeText).not.toContain("-100px");
    expect(plan.treeText).not.toContain("content-stretch flex");
    expect(plan.treeText).not.toContain('"Heading"');
    expect(plan.treeText).not.toContain('"Body copy"');
    expect(
      plan.warnings.some((warning) => warning.code === "unresolved-dynamic-content")
    ).toBe(true);
  });

  it("filters model-provided non-content text during skeleton normalization", async () => {
    const rawPlan = {
      sectionMetadata: {
        ...input.metadata,
        sectionName: "Solutions"
      },
      treeText: [
        "section.section_solutions",
        "  h2.heading-style-h2 \"react\"",
        "  p.text-size-medium \"content-stretch flex flex-col gap-[48px] md:gap-[64px] items-start relative shrink-0 w-full\"",
        "  p.text-size-medium \"-100px\""
      ].join("\n"),
      elementTree: {
        id: "root",
        type: "box",
        tag: "section",
        classNames: ["section_solutions"],
        children: [
          {
            id: "heading",
            type: "heading",
            tag: "h2",
            classNames: ["heading-style-h2"],
            textContent: "react",
            children: []
          },
          {
            id: "class-dump",
            type: "text",
            tag: "p",
            classNames: ["text-size-medium"],
            textContent:
              "content-stretch flex flex-col gap-[48px] md:gap-[64px] items-start relative shrink-0 w-full",
            children: []
          },
          {
            id: "animation-value",
            type: "text",
            tag: "p",
            classNames: ["text-size-medium"],
            textContent: "-100px",
            children: []
          }
        ]
      },
      reusableClasses: ["heading-style-h2", "text-size-medium"],
      suggestedNewClasses: ["section_solutions"],
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

    const provider = new OpenAIPlanningProvider("test-key", "test-model");
    const plan = await provider.generateSkeleton({
      ...input,
      metadata: {
        ...input.metadata,
        sectionName: "Solutions"
      },
      sectionContext: {
        ...input.sectionContext,
        sectionName: "Solutions",
        sourceCode: "<section><h2>{industry.title}</h2><p>{industry.copy}</p></section>"
      },
      serializedSection: {
        ...input.serializedSection,
        summary: "Solutions section with dynamic content.",
        sourceExcerpt: "<section>",
        content: []
      }
    });

    expect(plan.treeText).not.toContain('"react"');
    expect(plan.treeText).not.toContain("content-stretch flex");
    expect(plan.treeText).not.toContain('"-100px"');
  });

  it("does not hydrate skeleton text from unsafe serialized content", async () => {
    const rawPlan = {
      sectionMetadata: {
        ...input.metadata,
        sectionName: "Solutions"
      },
      treeText: [
        "section.section_solutions",
        "  h2.heading-style-h2",
        "  p.text-size-medium",
        "  ul.solutions_list",
        "    li.solutions_item",
        "      p.text-size-medium"
      ].join("\n"),
      elementTree: {
        id: "root",
        type: "box",
        tag: "section",
        classNames: ["section_solutions"],
        children: [
          {
            id: "heading",
            type: "heading",
            tag: "h2",
            classNames: ["heading-style-h2"],
            children: []
          },
          {
            id: "body",
            type: "text",
            tag: "p",
            classNames: ["text-size-medium"],
            children: []
          },
          {
            id: "list",
            type: "list",
            tag: "ul",
            classNames: ["solutions_list"],
            children: [
              {
                id: "item",
                type: "listItem",
                tag: "li",
                classNames: ["solutions_item"],
                children: [
                  {
                    id: "item-copy",
                    type: "text",
                    tag: "p",
                    classNames: ["text-size-medium"],
                    children: []
                  }
                ]
              }
            ]
          }
        ]
      },
      reusableClasses: ["heading-style-h2", "text-size-medium"],
      suggestedNewClasses: ["section_solutions"],
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

    const provider = new OpenAIPlanningProvider("test-key", "test-model");
    const plan = await provider.generateSkeleton({
      ...input,
      metadata: {
        ...input.metadata,
        sectionName: "Solutions"
      },
      serializedSection: {
        ...input.serializedSection,
        summary: "Solutions section with unsafe extracted values.",
        sourceExcerpt: "<section>",
        content: [
          { kind: "h2", label: "h2", value: "@/app/data/solutionIndustries" },
          { kind: "p", label: "p", value: "@/styles/solutions-section-variants.css" },
          { kind: "p", label: "p", value: "font-[" },
          { kind: "p", label: "p", value: "--accent" },
          {
            kind: "p",
            label: "p",
            value: "Solutions designed around how each industry actually operates."
          }
        ]
      }
    });

    expect(plan.treeText).toContain(
      '"Solutions designed around how each industry actually operates."'
    );
    expect(plan.treeText).not.toContain("@/app/data/solutionIndustries");
    expect(plan.treeText).not.toContain("@/styles/solutions-section-variants.css");
    expect(plan.treeText).not.toContain("font-[");
    expect(plan.treeText).not.toContain("--accent");
  });

  it("replaces an underfit mapped-data skeleton with repeated content cards", async () => {
    const rawPlan = {
      sectionMetadata: {
        ...input.metadata,
        sectionName: "Solutions"
      },
      treeText: [
        "section.section_solutions",
        "  div.padding-global",
        "    div.container-large",
        "      div.padding-section-medium",
        "        div.solutions_component",
        "          div.solutions_content",
        "            p.is-text-small",
        "            h2.heading-style-h2",
        "            p.text-size-medium",
        "          div.solutions_visual",
        "            ul.solutions_list",
        "              li.solutions_item",
        "                p"
      ].join("\n"),
      elementTree: {
        id: "root",
        type: "box",
        tag: "section",
        classNames: ["section_solutions"],
        children: [
          {
            id: "content",
            type: "box",
            tag: "div",
            classNames: ["solutions_content"],
            children: [
              { id: "eyebrow", type: "text", tag: "p", classNames: ["is-text-small"], children: [] },
              { id: "heading", type: "heading", tag: "h2", classNames: ["heading-style-h2"], children: [] },
              { id: "body", type: "text", tag: "p", classNames: ["text-size-medium"], children: [] }
            ]
          },
          {
            id: "visual",
            type: "box",
            tag: "div",
            classNames: ["solutions_visual"],
            children: [
              {
                id: "list",
                type: "list",
                tag: "ul",
                classNames: ["solutions_list"],
                children: [
                  {
                    id: "item",
                    type: "listItem",
                    tag: "li",
                    classNames: ["solutions_item"],
                    children: [{ id: "item-copy", type: "text", tag: "p", classNames: [], children: [] }]
                  }
                ]
              }
            ]
          }
        ]
      },
      reusableClasses: ["padding-global", "container-large", "padding-section-medium"],
      suggestedNewClasses: ["section_solutions", "solutions_component"],
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

    const provider = new OpenAIPlanningProvider("test-key", "test-model");
    const plan = await provider.generateSkeleton({
      ...input,
      metadata: {
        ...input.metadata,
        sectionName: "Solutions"
      },
      sectionContext: {
        ...input.sectionContext,
        sectionName: "Solutions",
        sourceCode: [
          "import { solutionIndustries } from '@/app/data/solutionIndustries';",
          "export function SolutionsSection() {",
          "  return <section><div>{solutionIndustries.map((industry) => <article key={industry.title}><h3>{industry.title}</h3><p>{industry.description}</p></article>)}</div></section>;",
          "}",
          "/* Imported data from src/app/data/solutionIndustries.ts */",
          "export const solutionIndustries = [",
          "  { title: 'Small Businesses', description: 'Practical website and growth systems for owner-led teams that need results without operational overhead.' },",
          "  { title: 'Real Estate', description: 'Listing-ready digital experiences, lead funnels, and CRM-connected workflows for brokers and teams.' },",
          "  { title: 'Nonprofits', description: 'Mission-first websites focused on fundraising, volunteer recruitment, and measurable community impact.' },",
          "  { title: 'Professional Services', description: 'Credibility-driven websites that support complex buying cycles for legal, financial, and consulting firms.' },",
          "  { title: 'Startups & SaaS', description: 'Conversion-focused experiences that support product positioning, activation, and scalable go-to-market growth.' },",
          "  { title: 'Retail / Ecommerce', description: 'Online storefronts, product-focused journeys, and conversion systems designed to increase revenue and repeat purchases.' }",
          "];"
        ].join("\n")
      },
      serializedSection: {
        ...input.serializedSection,
        summary: "Solutions section with imported repeated industry cards.",
        sourceExcerpt: "<section>",
        content: [
          { kind: "p", label: "p", value: "Solutions Tailored to Your Industry" },
          {
            kind: "p",
            label: "p",
            value: "Solutions designed around how each industry actually operates."
          },
          {
            kind: "p",
            label: "p",
            value:
              "Instead of presenting every audience at the same weight, this version creates a stronger entry point and a more editorial scan path."
          },
          { kind: "title", label: "title", value: "Small Businesses" },
          {
            kind: "description",
            label: "description",
            value:
              "Practical website and growth systems for owner-led teams that need results without operational overhead."
          },
          { kind: "title", label: "title", value: "Real Estate" },
          {
            kind: "description",
            label: "description",
            value:
              "Listing-ready digital experiences, lead funnels, and CRM-connected workflows for brokers and teams."
          },
          { kind: "title", label: "title", value: "Nonprofits" },
          {
            kind: "description",
            label: "description",
            value:
              "Mission-first websites focused on fundraising, volunteer recruitment, and measurable community impact."
          },
          { kind: "title", label: "title", value: "Professional Services" },
          {
            kind: "description",
            label: "description",
            value:
              "Credibility-driven websites that support complex buying cycles for legal, financial, and consulting firms."
          }
        ]
      }
    });

    expect(plan.treeText).toContain("div.solutions_grid");
    expect(plan.treeText).toContain('h3.heading-style-h3 "Small Businesses"');
    expect(plan.treeText).toContain('p.text-size-medium "Practical website and growth systems');
    expect(plan.treeText).toContain('h3.heading-style-h3 "Real Estate"');
    expect(plan.treeText).toContain('h3.heading-style-h3 "Professional Services"');
    expect(
      plan.warnings.some((warning) => warning.code === "skeleton-content-fallback")
    ).toBe(true);
  });

  it("filters unsafe content returned by analysis normalization", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    sectionMetadata: input.metadata,
                    summary: "Solutions section.",
                    sourceCode: "source",
                    goals: [],
                    content: [
                      { kind: "h2", label: "h2", value: "@/app/data/solutionIndustries" },
                      { kind: "p", label: "p", value: "@/styles/solutions-section-variants.css" },
                      { kind: "p", label: "p", value: "font-[" },
                      { kind: "p", label: "p", value: "--accent" },
                      {
                        kind: "p",
                        label: "p",
                        value: "Solutions Tailored to Your Industry"
                      }
                    ],
                    recommendedMode: "skeletonThenStyle",
                    reusableClasses: [],
                    suggestedNewClasses: [],
                    warnings: []
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    const provider = new OpenAIPlanningProvider("test-key", "test-model");
    const analysis = await provider.analyzeSection({
      ...input,
      metadata: {
        ...input.metadata,
        sectionName: "Solutions"
      }
    });
    const values = analysis.content.map((item) => item.value);

    expect(values).toEqual(["Solutions Tailored to Your Industry"]);
  });

  it("retries a transient OpenAI 429 and keeps requests deterministic and bounded", async () => {
    const rawPlan = {
      sectionMetadata: input.metadata,
      treeText: [
        "footer.section_footer",
        "  div.footer_brand",
        "    p.text-size-medium"
      ].join("\n"),
      elementTree: {
        id: "root",
        type: "box",
        tag: "footer",
        classNames: ["section_footer"],
        children: [
          {
            id: "brand",
            type: "box",
            tag: "div",
            classNames: ["footer_brand"],
            children: [
              {
                id: "copy",
                type: "text",
                tag: "p",
                classNames: ["text-size-medium"],
                children: []
              }
            ]
          }
        ]
      },
      reusableClasses: ["text-size-medium"],
      suggestedNewClasses: ["section_footer"],
      warnings: []
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("rate limited", {
          status: 429,
          headers: { "retry-after": "0.001" }
        })
      )
      .mockResolvedValueOnce(
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
      );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAIPlanningProvider("test-key", "test-model");
    const plan = await provider.generateSkeleton(input);
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      temperature: number;
      max_completion_tokens: number;
    };

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(plan.elementTree.tag).toBe("footer");
    expect(requestBody.temperature).toBe(0);
    expect(requestBody.max_completion_tokens).toBeGreaterThan(0);
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

  it("replaces an underfit provider skeleton with the richer HTML-derived structure", async () => {
    const rawPlan = {
      sectionMetadata: {
        ...input.metadata,
        sectionName: "Jurisdictions"
      },
      treeText: [
        "section.section_jurisdictions",
        "  div.container-large",
        '    h2.heading-style-h2 "Jurisdictions Served"',
        '    p.text-size-medium "We are admitted to practice and regularly appear in the following courts:"'
      ].join("\n"),
      elementTree: {
        id: "root",
        type: "box",
        tag: "section",
        classNames: ["section_jurisdictions"],
        children: [
          {
            id: "container",
            type: "box",
            tag: "div",
            classNames: ["container-large"],
            children: [
              {
                id: "heading",
                type: "heading",
                tag: "h2",
                classNames: ["heading-style-h2"],
                textContent: "Jurisdictions Served",
                children: []
              },
              {
                id: "body",
                type: "text",
                tag: "p",
                classNames: ["text-size-medium"],
                textContent:
                  "We are admitted to practice and regularly appear in the following courts:",
                children: []
              }
            ]
          }
        ]
      },
      assetBindings: [],
      reusableClasses: ["container-large", "heading-style-h2", "text-size-medium"],
      suggestedNewClasses: ["section_jurisdictions"],
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

    const provider = new OpenAIPlanningProvider("test-key", "test-model");
    const plan = await provider.generateSkeleton({
      ...input,
      metadata: {
        ...input.metadata,
        sectionName: "Jurisdictions"
      },
      sectionContext: {
        ...input.sectionContext,
        sectionName: "Jurisdictions",
        sourceCode: JURISDICTIONS_HTML
      },
      serializedSection: {
        ...input.serializedSection,
        summary: "Jurisdictions section with intro copy and two court cards.",
        sourceExcerpt: "<section>",
        layoutHints: ["grid layout appears in the source"],
        content: [
          { kind: "h2", label: "h2", value: "Jurisdictions Served" },
          {
            kind: "p",
            label: "p",
            value: "We are admitted to practice and regularly appear in the following courts:"
          },
          { kind: "h3", label: "h3", value: "Trial Courts" },
          {
            kind: "li",
            label: "li",
            value: "U.S. District Court, Central District of California"
          },
          { kind: "h3", label: "h3", value: "Appellate Courts" },
          { kind: "li", label: "li", value: "U.S. Court of Appeals, Ninth Circuit" }
        ]
      }
    });

    expect(plan.treeText).toContain("div.padding-global");
    expect(plan.treeText).toContain("div.jurisdictions_list");
    expect(plan.treeText).toContain('h3.heading-style-h3 "Trial Courts"');
    expect(plan.treeText).toContain('li.jurisdictions_item "U.S. Court of Appeals, Ninth Circuit"');
    expect(
      plan.warnings.some((warning) => warning.code === "skeleton-underfit-fallback")
    ).toBe(true);
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
