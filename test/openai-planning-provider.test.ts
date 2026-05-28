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
    expect(plan.warnings.some((warning) => warning.code === "skeleton-fallback")).toBe(true);
    expect(plan.warnings.some((warning) => warning.code === "skeleton-error")).toBe(true);
    expect(
      plan.warnings.some((warning) =>
        warning.message.includes("timed out after 25 seconds")
      )
    ).toBe(true);
  });
});
