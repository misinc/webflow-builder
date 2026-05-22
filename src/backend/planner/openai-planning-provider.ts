import {
  BuildNode,
  SectionAnalysis,
  SectionVerification,
  SkeletonPlan,
  StylingPlan
} from "../../shared/contracts.js";
import {
  PlanningProvider,
  PlanningProviderInput,
  providerWarning
} from "./planning-provider.js";

interface OpenAIMessage {
  role: "system" | "user";
  content: string;
}

function safeJsonParse<T>(content: string): T {
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Planner returned invalid JSON: ${error.message}`
        : "Planner returned invalid JSON."
    );
  }
}

function extractHeading(
  input: PlanningProviderInput,
  fallback: string
): string {
  return (
    input.serializedSection.content.find((item) =>
      ["title", "heading", "h1", "h2", "subtitle"].includes(item.kind)
    )?.value ?? fallback
  );
}

function extractBody(input: PlanningProviderInput): string {
  return (
    input.serializedSection.content.find((item) =>
      ["description", "body", "copy", "p"].includes(item.kind)
    )?.value ?? input.serializedSection.summary
  );
}

function defaultElementTree(input: PlanningProviderInput): BuildNode {
  const title = extractHeading(
    input,
    `${input.metadata.sectionName} section`
  );
  const body = extractBody(input);
  return {
    id: `${input.metadata.sectionId}-root`,
    type: "box",
    tag: "section",
    label: input.metadata.sectionName,
    classNames: [
      "section",
      `section_${input.metadata.sectionName.toLowerCase().replace(/\s+/g, "-")}`
    ],
    children: [
      {
        id: `${input.metadata.sectionId}-content`,
        type: "box",
        tag: "div",
        classNames: ["container-large", "layout_stack-large"],
        children: [
          {
            id: `${input.metadata.sectionId}-heading`,
            type: "text",
            tag: "h2",
            textContent: title,
            classNames: ["heading-style-h2"],
            children: []
          },
          {
            id: `${input.metadata.sectionId}-body`,
            type: "text",
            tag: "p",
            textContent: body,
            classNames: ["text-size-medium"],
            children: []
          }
        ]
      }
    ]
  };
}

function userContext(input: PlanningProviderInput): string {
  return JSON.stringify(
    {
      metadata: input.metadata,
      mode: input.mode,
      serializedSection: input.serializedSection,
      sharedClasses: input.sharedStyleContext.classes.slice(0, 60),
      sharedVariables: input.sharedStyleContext.variables.slice(0, 60),
      projectContext: input.projectContext,
      selectedElementId: input.selectedElementId ?? null
    },
    null,
    2
  );
}

export class OpenAIPlanningProvider implements PlanningProvider {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly model: string
  ) {}

  private ensureConfigured() {
    if (!this.apiKey) {
      throw new Error("OpenAI planner is not configured. Set OPENAI_API_KEY.");
    }
  }

  private async requestJson<T>(
    name: string,
    systemPrompt: string,
    input: PlanningProviderInput
  ): Promise<T> {
    this.ensureConfigured();

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Return only JSON for ${name}.\n${userContext(input)}`
          }
        ] satisfies OpenAIMessage[]
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `OpenAI request failed: ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string | Array<{ type: string; text?: string }>;
        };
      }>;
    };

    const content = payload.choices?.[0]?.message?.content;
    const text =
      typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content
              .map((item) => item.text ?? "")
              .join("")
              .trim()
          : "";

    if (!text) {
      throw new Error("OpenAI planner returned an empty response.");
    }

    return safeJsonParse<T>(text);
  }

  async analyzeSection(input: PlanningProviderInput): Promise<SectionAnalysis> {
    const fallback: SectionAnalysis = {
      sectionMetadata: input.metadata,
      summary: input.serializedSection.summary,
      goals: input.serializedSection.layoutHints,
      content: input.serializedSection.content,
      recommendedMode: input.mode,
      reusableClasses: input.projectContext.sharedHeadingClasses.slice(0, 2),
      suggestedNewClasses: [],
      warnings: [
        providerWarning(
          "analysis-fallback",
          "OpenAI analysis was not available. Using serialized section context."
        )
      ]
    };

    try {
      return await this.requestJson<SectionAnalysis>(
        "section_analysis",
        [
          "You are planning a Webflow Designer section workflow.",
          "Analyze the provided repo section and recommend the best workflow mode.",
          "Prefer reusing existing shared classes and preserving Client-First naming.",
          "Return JSON with sectionMetadata, summary, goals, content, recommendedMode, reusableClasses, suggestedNewClasses, warnings."
        ].join(" "),
        input
      );
    } catch (error) {
      return {
        ...fallback,
        warnings: [
          ...fallback.warnings,
          providerWarning(
            "analysis-error",
            error instanceof Error ? error.message : "OpenAI analysis failed."
          )
        ]
      };
    }
  }

  async generateSkeleton(input: PlanningProviderInput): Promise<SkeletonPlan> {
    const fallback: SkeletonPlan = {
      sectionMetadata: input.metadata,
      treeText: [
        `section ${input.metadata.sectionName}`,
        "  div container-large layout_stack-large",
        "    h2 heading-style-h2",
        "    p text-size-medium"
      ].join("\n"),
      elementTree: defaultElementTree(input),
      reusableClasses: ["container-large", "heading-style-h2", "text-size-medium"],
      suggestedNewClasses: [
        `section_${input.metadata.sectionName.toLowerCase().replace(/\s+/g, "-")}`
      ],
      warnings: [
        providerWarning(
          "skeleton-fallback",
          "OpenAI skeleton generation was not available. Using a conservative fallback skeleton."
        )
      ]
    };

    try {
      return await this.requestJson<SkeletonPlan>(
        "skeleton_plan",
        [
          "You are generating an approved-first Webflow section skeleton.",
          "Return a compact, faithful skeleton tree for the provided section.",
          "Prefer existing shared classes. Only propose minimal new Client-First-compatible classes.",
          "Return JSON with sectionMetadata, treeText, elementTree, reusableClasses, suggestedNewClasses, warnings."
        ].join(" "),
        input
      );
    } catch (error) {
      return {
        ...fallback,
        warnings: [
          ...fallback.warnings,
          providerWarning(
            "skeleton-error",
            error instanceof Error ? error.message : "OpenAI skeleton generation failed."
          )
        ]
      };
    }
  }

  async generateStylingPlan(input: PlanningProviderInput): Promise<StylingPlan> {
    const fallback: StylingPlan = {
      sectionMetadata: input.metadata,
      mode: input.mode,
      styleDefinitions: [],
      variableBindings: [],
      reusableClasses: [
        ...input.projectContext.sharedHeadingClasses.slice(0, 1),
        ...input.projectContext.sharedTextClasses.slice(0, 1)
      ],
      suggestedNewClasses: [],
      requiredClassNames: [],
      notes: [
        "Review the section visually after applying the style plan.",
        "Prefer styling an existing skeleton or selected section root."
      ],
      warnings: [
        providerWarning(
          "styling-fallback",
          "OpenAI styling generation was not available. Returning a review-only styling plan."
        )
      ]
    };

    try {
      return await this.requestJson<StylingPlan>(
        "styling_plan",
        [
          "You are generating a Webflow section styling plan.",
          "Preserve the site's existing design system, variables, and reusable classes.",
          "Prefer updating existing shared classes over introducing new ones.",
          "Return JSON with sectionMetadata, mode, styleDefinitions, variableBindings, reusableClasses, suggestedNewClasses, requiredClassNames, notes, warnings."
        ].join(" "),
        input
      );
    } catch (error) {
      return {
        ...fallback,
        warnings: [
          ...fallback.warnings,
          providerWarning(
            "styling-error",
            error instanceof Error ? error.message : "OpenAI styling generation failed."
          )
        ]
      };
    }
  }

  async verifySection(input: PlanningProviderInput): Promise<SectionVerification> {
    const fallback: SectionVerification = {
      sectionMetadata: input.metadata,
      summary: "Verification is pending. Review the current section against the source.",
      readyForApproval: false,
      warnings: [
        providerWarning(
          "verification-fallback",
          "OpenAI verification was not available. Use manual review before approval."
        )
      ]
    };

    try {
      return await this.requestJson<SectionVerification>(
        "section_verification",
        [
          "You are verifying whether the current section work is ready for approval.",
          "Assess the provided section context and workflow mode.",
          "Return JSON with sectionMetadata, summary, readyForApproval, warnings."
        ].join(" "),
        input
      );
    } catch (error) {
      return {
        ...fallback,
        warnings: [
          ...fallback.warnings,
          providerWarning(
            "verification-error",
            error instanceof Error ? error.message : "OpenAI verification failed."
          )
        ]
      };
    }
  }
}
