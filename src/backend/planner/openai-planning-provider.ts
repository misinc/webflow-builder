import {
  BuildNode,
  SectionAnalysis,
  SectionMetadata,
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

const OPENAI_REQUEST_TIMEOUT_MS = 60000;

const WEBFLOW_SITE_BUILDER_RULES = [
  "Work on one section at a time.",
  "Preserve the site's existing design system, variables, fonts, navbar, and footer.",
  "Only plan the current body section unless the section requires shared global behavior.",
  "Reuse existing Client-First wrappers and shared classes whenever possible.",
  "Any new classes must follow functional Client-First naming and must not be page-specific.",
  "Prefer functional names like section_solutions, solutions_content, solutions_list, and solutions_item.",
  "Do not use page-specific names such as home_hero, homepage_services, or section_home-hero.",
  "Do not introduce hardcoded hex colors, opacity colors, or custom properties when existing variables and standard Designer controls can handle the work.",
  "Treat fresh Relume or Client-First clones as structural scaffolding, not as the final brand system.",
  "When clone defaults conflict with the actual project design, follow the project design and existing approved site patterns.",
  "When proposing a skeleton, keep the tree shallow, readable, and section-scoped.",
  "Use the real existing class names when reusing classes.",
  "Prefer semantic content elements over generic wrappers when layout wrappers are not required.",
  "Stop at the current section and produce output that is explicit and reviewable before approval."
].join(" ");

const SKELETON_TREE_RULES = [
  "Return a faithful section skeleton tree in the style: section.section-name -> div.padding-global -> div.container-large -> div.padding-section-medium -> div.section-name_component -> div.section-name_content / div.section-name_visual.",
  "This skeleton tree is the actual Webflow insertion plan, not a JSX or source-code preview.",
  "Only use Webflow-safe skeleton elements such as section, div, h1-h6, p, span, ul, ol, li, img, video, a, and button.",
  "Do not use standalone span wrappers in the skeleton unless inline text semantics are truly required. Prefer div wrappers or plain text-bearing elements instead.",
  "Do not include source tags, svg tags, path tags, icon vector tags, or any inline SVG structure in the skeleton.",
  "Do not use semantic wrapper tags such as article, aside, figure, header, footer, nav, or main in the skeleton. Convert those wrappers to divs while preserving the class names and hierarchy.",
  "When a section follows Client-First wrapper structure, the first layout wrapper under section should usually be div.padding-global before container and inner padding wrappers, unless the source genuinely starts with media or background layers.",
  "For icon placeholders, prefer img.icon-embed-xsmall or another img.icon-embed-* class instead of a generic div.",
  "Use exactly one skeleton node per line.",
  "Never place sibling elements on the same line with separators like +, |, &, commas, or chained shorthand.",
  "Never return React-only or framework-only tags such as motion, Fragment, Link, component names, or custom JSX elements.",
  "Never copy Tailwind utility classes, arbitrary value utilities, or source-framework class dumps into the skeleton.",
  "Normalize source structure into Client-First-compatible, reusable class names and prefer existing shared classes whenever possible.",
  "Prefer existing shared wrappers such as padding-global, container-large, and padding-section-medium when they exist in the shared class inventory.",
  "If the shared class inventory contains a more exact match such as text-size-small, text-size-medium, heading-style-h2, or is-text-small, prefer that exact class over broader fuzzy matches.",
  "Do not invent navbar-specific or unrelated layout classes such as navbar wrappers for a body section unless the source section genuinely reuses them.",
  "If a class is reused, use the exact class name from the shared class inventory.",
  "If a class is new, make it functional, reusable, and Client-First compatible.",
  "Return JSON only."
].join(" ");

const STYLING_RULES = [
  "Style only the current section against the approved structure or selected section root.",
  "Prefer reusing existing shared typography, spacing, container, button, and utility classes before suggesting new classes.",
  "Use existing variables for color application instead of hardcoded values.",
  "Do not mutate unrelated sections, navbar, footer, or global styles unless explicitly required by the current section.",
  "When new classes are necessary, keep them functional and section-scoped by purpose, not by page name.",
  "Return JSON only."
].join(" ");

const VERIFICATION_RULES = [
  "Verify only the current section.",
  "Confirm existing classes were reused where possible, new classes remain Client-First-compatible, no page-specific naming was introduced, and the result is ready for section approval only if it matches the source intent.",
  "Return JSON only."
].join(" ");

const EXTENSION_OPERATING_RULES = [
  "You are operating inside a staged Webflow Designer extension workflow, not an open-ended chat session.",
  "Do not ask clarifying questions in the response. When the source is ambiguous, encode that ambiguity as warnings and keep the output reviewable.",
  "Return only machine-readable JSON that fits the requested stage contract.",
  "Do not include markdown fences, prose introductions, or extra explanation outside the contract fields.",
  "Treat the shared class inventory as the authoritative source of reusable wrappers, typography, spacing, and utility classes.",
  "Prefer exact shared class matches over approximate semantic guesses.",
  "If a requested structure or style cannot be justified from the section source and shared class inventory, warn instead of inventing extra structure."
].join(" ");

function stagePrompt(
  stage: "analysis" | "skeleton" | "styling" | "verification"
): string {
  const common = [WEBFLOW_SITE_BUILDER_RULES, EXTENSION_OPERATING_RULES].join(" ");

  if (stage === "analysis") {
    return [
      "You are the analysis step of a guided Webflow section workflow.",
      common,
      "Your job is to inspect one repo section and prepare the next extension step.",
      "Summarize the section briefly, list concrete goals, extract the most useful content items, recommend the workflow mode, and identify reusable classes already present in the bound Webflow site.",
      "Do not propose implementation details that belong to styling.",
      "If the section looks structurally complex, bias toward styleExisting or skeletonThenStyle rather than pretending full automation is safe.",
      "Return JSON with: sectionMetadata, summary, goals, content, recommendedMode, reusableClasses, suggestedNewClasses, warnings."
    ].join(" ");
  }

  if (stage === "skeleton") {
    return [
      "You are the skeleton-generation step of a guided Webflow section workflow.",
      common,
      SKELETON_TREE_RULES,
      "Your job is to propose a reviewable structural skeleton for one section before styling happens.",
      "The skeleton should preserve the source section hierarchy, reuse shared wrappers when available, and keep section-specific classes functional and reusable.",
      "Do not style the section in this step. Focus on structure, semantic content nodes, and correct shared wrapper usage.",
      "If the inventory contains exact wrappers like padding-global, container-large, or padding-section-medium, use those exact names.",
      "If the source implies lists, cards, CTAs, or media groups, represent them structurally without inventing visual styling classes.",
      "Return JSON with: sectionMetadata, treeText, elementTree, reusableClasses, suggestedNewClasses, warnings."
    ].join(" ");
  }

  if (stage === "styling") {
    return [
      "You are the styling step of a guided Webflow section workflow.",
      common,
      STYLING_RULES,
      "Your job is to style only the current section against the approved skeleton or selected section root.",
      "Preserve the existing structure. Reuse existing shared typography, spacing, container, and utility classes before suggesting any new class.",
      "Only suggest new classes when existing shared classes cannot support the section cleanly.",
      "Prefer exact shared class names such as text-size-small, text-size-medium, heading-style-h2, button, or container-large when they exist.",
      "Return JSON with: sectionMetadata, mode, styleDefinitions, variableBindings, reusableClasses, suggestedNewClasses, requiredClassNames, notes, warnings."
    ].join(" ");
  }

  return [
    "You are the verification step of a guided Webflow section workflow.",
    common,
    VERIFICATION_RULES,
    "Your job is to judge whether only the current section is ready for approval.",
    "Check structural fidelity, class reuse, Client-First naming, and whether any remaining ambiguity should block approval.",
    "Return JSON with: sectionMetadata, summary, readyForApproval, warnings."
  ].join(" ");
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (isRecord(value)) {
    for (const key of ["name", "value", "label", "title", "message", "text"]) {
      const candidate = value[key];
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  }
  return null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    const single = readString(value);
    return single ? [single] : [];
  }
  return value
    .map((item) => readString(item))
    .filter((item): item is string => Boolean(item));
}

function warningsArray(value: unknown) {
  if (!Array.isArray(value)) {
    const single = readString(value);
    return single ? [providerWarning("provider-warning", single)] : [];
  }
  return value
    .map((item, index) => {
      if (isRecord(item) && typeof item.message === "string") {
        return providerWarning(
          typeof item.code === "string" ? item.code : `provider-warning-${index}`,
          item.message,
          item.level === "error" || item.level === "info" || item.level === "warning"
            ? item.level
            : "warning"
        );
      }
      const message = readString(item);
      return message
        ? providerWarning(`provider-warning-${index}`, message)
        : null;
    })
    .filter((item): item is ReturnType<typeof providerWarning> => Boolean(item));
}

function contentArray(value: unknown) {
  const normalized = Array.isArray(value) ? value : value ? [value] : [];
  return normalized
    .map((item, index) => {
      if (isRecord(item)) {
        return {
          kind: readString(item.kind) ?? "content",
          label: readString(item.label) ?? `Item ${index + 1}`,
          value: readString(item.value) ?? readString(item.text) ?? readString(item.message) ?? ""
        };
      }
      const text = readString(item);
      if (!text) {
        return null;
      }
      return {
        kind: "content",
        label: `Item ${index + 1}`,
        value: text
      };
    })
    .filter(
      (
        item
      ): item is { kind: string; label: string; value: string } =>
        Boolean(item?.value)
    );
}

function normalizeSectionMetadata(
  value: unknown,
  fallback: SectionMetadata
): SectionMetadata {
  if (!isRecord(value)) {
    return fallback;
  }
  return {
    repoId: readString(value.repoId) ?? fallback.repoId,
    pageId: readString(value.pageId) ?? fallback.pageId,
    sectionId: readString(value.sectionId) ?? fallback.sectionId,
    pageName: readString(value.pageName) ?? fallback.pageName,
    sectionName: readString(value.sectionName) ?? fallback.sectionName,
    sourceFile: readString(value.sourceFile) ?? fallback.sourceFile
  };
}

function normalizeStyleDefinitions(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }
      const className = readString(item.className);
      const properties = isRecord(item.properties)
        ? Object.fromEntries(
            Object.entries(item.properties)
              .map(([key, val]) => [key, readString(val)])
              .filter((entry): entry is [string, string] => Boolean(entry[1]))
          )
        : {};
      if (!className) {
        return null;
      }
      return {
        className,
        properties,
        shared: item.shared === true
      };
    })
    .filter(
      (item): item is { className: string; properties: Record<string, string>; shared: boolean } =>
        Boolean(item)
    );
}

function normalizeVariableBindings(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }
      const property = readString(item.property);
      const variableName = readString(item.variableName);
      const nodeId = readString(item.nodeId) ?? "selected-section";
      if (!property || !variableName) {
        return null;
      }
      return { nodeId, property, variableName };
    })
    .filter(
      (item): item is { nodeId: string; property: string; variableName: string } =>
        Boolean(item)
    );
}

function normalizeElementTree(value: unknown, fallback: BuildNode): BuildNode {
  if (!isRecord(value)) {
    return fallback;
  }

  const children = Array.isArray(value.children)
    ? value.children.map((child) => normalizeElementTree(child, fallback)).filter(Boolean)
    : [];

  return {
    id: readString(value.id) ?? fallback.id,
    type: readString(value.type) ?? fallback.type,
    tag: readString(value.tag) ?? fallback.tag,
    label: readString(value.label) ?? undefined,
    textContent: readString(value.textContent) ?? undefined,
    classNames: stringArray(value.classNames),
    children
  };
}

function countAssignedClasses(node: BuildNode): number {
  return (
    node.classNames.length +
    node.children.reduce((total, child) => total + countAssignedClasses(child), 0)
  );
}

function normalizeTagToken(token: string): string {
  return token.replace(/^<\/?/, "").replace(/\/?>$/, "").trim();
}

function inferNodeType(tag: string): BuildNode["type"] {
  if (tag === "img") return "image";
  if (tag === "button" || tag === "a") return "button";
  if (tag === "ul" || tag === "ol") return "list";
  if (tag === "li") return "listItem";
  if (/^h[1-6]$/i.test(tag)) return "heading";
  if (tag === "p" || tag === "span" || tag === "label") return "text";
  return "box";
}

function parseElementTreeFromTreeText(treeText: string, fallback: BuildNode): BuildNode | null {
  const compact = treeText.trim();
  if (!compact) {
    return null;
  }

  const expanded =
    compact.includes("\n") || !compact.includes("->")
      ? compact
      : compact
          .split(/\s*->\s*/)
          .map((part, index) => `${"  ".repeat(index)}${part.trim()}`)
          .join("\n");

  const lines = expanded
    .split("\n")
    .map((line) => line.replace(/\t/g, "  "))
    .filter((line) => line.trim().length > 0);

  if (!lines.length) {
    return null;
  }

  const lineIndent = (rawLine: string) =>
    rawLine
      .replace(/│/g, " ")
      .replace(/[├└]─\s*/g, "")
      .match(/^ */)?.[0].length ?? 0;
  const lineContent = (rawLine: string) =>
    rawLine.replace(/^[\s│]*[├└]─\s*/, "").trim();
  const indentUnit =
    Math.min(
      ...lines
        .map(lineIndent)
        .filter((indent) => indent > 0)
    ) || 2;

  const stack: Array<{ depth: number; node: BuildNode }> = [];
  let root: BuildNode | null = null;

  for (const [index, rawLine] of lines.entries()) {
    let content = lineContent(rawLine);
    const depth = Math.floor(lineIndent(rawLine) / indentUnit);
    const textMatch = content.match(/\s+"([^"]*)"$/);
    const textContent = textMatch?.[1];
    if (textMatch?.index !== undefined) {
      content = content.slice(0, textMatch.index).trim();
    }

    const tokens = content.split(/\s+/).filter(Boolean);
    const structureToken = tokens[0];
    if (!structureToken) {
      return null;
    }

    const parts = structureToken.split(".").filter(Boolean);
    const tag = normalizeTagToken(parts[0] ?? "");
    if (!tag) {
      return null;
    }

    const classNames = [
      ...parts.slice(1),
      ...tokens
        .slice(1)
        .map((token) => token.replace(/^\./, "").trim())
        .filter((token) => Boolean(token) && token !== "/" && token !== "->")
    ];

    const node: BuildNode = {
      id: `${fallback.id}-parsed-${index}`,
      type: inferNodeType(tag),
      tag,
      textContent,
      classNames,
      children: []
    };

    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }

    if (!stack.length) {
      if (root) {
        return null;
      }
      root = node;
    } else {
      stack[stack.length - 1].node.children.push(node);
    }

    stack.push({ depth, node });
  }

  return root;
}

function normalizeAnalysis(raw: unknown, fallback: SectionAnalysis): SectionAnalysis {
  if (!isRecord(raw)) {
    return fallback;
  }
  return {
    sectionMetadata: normalizeSectionMetadata(raw.sectionMetadata, fallback.sectionMetadata),
    summary: readString(raw.summary) ?? fallback.summary,
    sourceCode: readString(raw.sourceCode) ?? fallback.sourceCode,
    goals: stringArray(raw.goals),
    content: contentArray(raw.content),
    recommendedMode:
      raw.recommendedMode === "fullAssist" ||
      raw.recommendedMode === "skeletonThenStyle" ||
      raw.recommendedMode === "styleExisting"
        ? raw.recommendedMode
        : fallback.recommendedMode,
    reusableClasses: stringArray(raw.reusableClasses),
    suggestedNewClasses: stringArray(raw.suggestedNewClasses),
    warnings: warningsArray(raw.warnings)
  };
}

function normalizeSkeleton(raw: unknown, fallback: SkeletonPlan): SkeletonPlan {
  if (!isRecord(raw)) {
    return fallback;
  }
  const treeText = readString(raw.treeText) ?? fallback.treeText;
  const elementTree = normalizeElementTree(raw.elementTree, fallback.elementTree);
  const recoveredElementTree =
    countAssignedClasses(elementTree) === 0
      ? parseElementTreeFromTreeText(treeText, fallback.elementTree) ?? elementTree
      : elementTree;

  return {
    sectionMetadata: normalizeSectionMetadata(raw.sectionMetadata, fallback.sectionMetadata),
    treeText,
    elementTree: recoveredElementTree,
    reusableClasses: stringArray(raw.reusableClasses),
    suggestedNewClasses: stringArray(raw.suggestedNewClasses),
    warnings: warningsArray(raw.warnings)
  };
}

function normalizeStyling(raw: unknown, fallback: StylingPlan): StylingPlan {
  if (!isRecord(raw)) {
    return fallback;
  }
  return {
    sectionMetadata: normalizeSectionMetadata(raw.sectionMetadata, fallback.sectionMetadata),
    mode:
      raw.mode === "fullAssist" ||
      raw.mode === "skeletonThenStyle" ||
      raw.mode === "styleExisting"
        ? raw.mode
        : fallback.mode,
    styleDefinitions: normalizeStyleDefinitions(raw.styleDefinitions),
    variableBindings: normalizeVariableBindings(raw.variableBindings),
    reusableClasses: stringArray(raw.reusableClasses),
    suggestedNewClasses: stringArray(raw.suggestedNewClasses),
    requiredClassNames: stringArray(raw.requiredClassNames),
    notes: stringArray(raw.notes),
    warnings: warningsArray(raw.warnings)
  };
}

function normalizeVerification(
  raw: unknown,
  fallback: SectionVerification
): SectionVerification {
  if (!isRecord(raw)) {
    return fallback;
  }
  return {
    sectionMetadata: normalizeSectionMetadata(raw.sectionMetadata, fallback.sectionMetadata),
    summary: readString(raw.summary) ?? fallback.summary,
    readyForApproval:
      typeof raw.readyForApproval === "boolean"
        ? raw.readyForApproval
        : fallback.readyForApproval,
    warnings: warningsArray(raw.warnings)
  };
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OPENAI_REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
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
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(
          `OpenAI ${name} timed out after ${Math.round(
            OPENAI_REQUEST_TIMEOUT_MS / 1000
          )} seconds.`
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

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
      sourceCode: input.sectionContext.sourceCode,
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
      const raw = await this.requestJson<unknown>(
        "section_analysis",
        stagePrompt("analysis"),
        input
      );
      return normalizeAnalysis(raw, fallback);
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
      const raw = await this.requestJson<unknown>(
        "skeleton_plan",
        stagePrompt("skeleton"),
        input
      );
      return normalizeSkeleton(raw, fallback);
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "OpenAI skeleton generation failed."
      );
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
      const raw = await this.requestJson<unknown>(
        "styling_plan",
        stagePrompt("styling"),
        input
      );
      return normalizeStyling(raw, fallback);
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "OpenAI styling generation failed."
      );
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
      const raw = await this.requestJson<unknown>(
        "section_verification",
        stagePrompt("verification"),
        input
      );
      return normalizeVerification(raw, fallback);
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
