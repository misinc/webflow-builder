import {
  BuildNode,
  PlannerWarning,
  SectionContext,
  SectionMetadata,
  SharedStyleContext,
  SkeletonPlan,
  StylingPlan,
  WorkflowMode,
  stylingPlanSchema
} from "@wfb/shared/contracts.js";
import { dedupe, isReservedStyleGuideClassName } from "@wfb/shared/client-first.js";

function walkTree(node: BuildNode, visit: (node: BuildNode) => void): void {
  visit(node);
  node.children.forEach((child) => walkTree(child, visit));
}

function classSuffix(node: BuildNode, suffix: string): boolean {
  return node.classNames.some((className) => className.endsWith(suffix));
}

function sharedClassSet(sharedStyleContext: SharedStyleContext): Set<string> {
  return new Set(
    sharedStyleContext.classes
      .map((item) => item.name)
      .filter((name) => !isReservedStyleGuideClassName(name))
  );
}

function maxWidthFromSource(sourceCode: string): string | null {
  const match = sourceCode.match(/\bmax-w-(2xl|3xl|4xl)\b/);
  switch (match?.[1]) {
    case "2xl":
      return "42rem";
    case "3xl":
      return "48rem";
    case "4xl":
      return "56rem";
    default:
      return null;
  }
}

function sectionBackgroundFromSource(sourceCode: string): string | null {
  if (/\bbg-secondary\b/.test(sourceCode)) {
    return "#f5f5f5";
  }
  if (/\bbg-white\b/.test(sourceCode)) {
    return "#ffffff";
  }
  return null;
}

function gapFromSource(sourceCode: string, fallback: string): string {
  if (/\bgap-12\b/.test(sourceCode)) return "3rem";
  if (/\bgap-8\b/.test(sourceCode)) return "2rem";
  if (/\bgap-6\b/.test(sourceCode)) return "1.5rem";
  if (/\bgap-4\b/.test(sourceCode)) return "1rem";
  return fallback;
}

function paddingFromSource(sourceCode: string): string | null {
  if (/\bp-8\b/.test(sourceCode)) return "2rem";
  if (/\bp-6\b/.test(sourceCode)) return "1.5rem";
  if (/\bp-4\b/.test(sourceCode)) return "1rem";
  return null;
}

function radiusFromSource(sourceCode: string): string | null {
  if (/\brounded-\[28px\]\b/.test(sourceCode)) return "28px";
  if (/\brounded-xl\b/.test(sourceCode)) return "0.75rem";
  if (/\brounded-lg\b/.test(sourceCode)) return "0.5rem";
  if (/\brounded\b/.test(sourceCode)) return "0.75rem";
  return null;
}

function inferStyleProperties(
  node: BuildNode,
  sectionContext: SectionContext
): Record<string, string> {
  const sourceCode = sectionContext.sourceCode;
  const properties: Record<string, string> = {};
  const nodeClassNames = node.classNames;

  if (node.tag === "section" && nodeClassNames.some((className) => className.startsWith("section_"))) {
    properties.width = "100%";
    const background = sectionBackgroundFromSource(sourceCode);
    if (background) {
      properties["background-color"] = background;
    }
  }

  if (classSuffix(node, "_component")) {
    properties.display = "grid";
    properties.gap = gapFromSource(sourceCode, "3rem");
    properties["justify-items"] = "stretch";
  }

  if (classSuffix(node, "_content")) {
    properties.display = "grid";
    properties.gap = gapFromSource(sourceCode, "2rem");
    properties["justify-items"] = /\btext-center\b/.test(sourceCode) ? "center" : "stretch";
    if (/\btext-center\b/.test(sourceCode)) {
      properties["text-align"] = "center";
    }
    const maxWidth = maxWidthFromSource(sourceCode);
    if (maxWidth) {
      properties["max-width"] = maxWidth;
      properties["margin-left"] = "auto";
      properties["margin-right"] = "auto";
    }
  }

  if (classSuffix(node, "_visual")) {
    properties.width = "100%";
  }

  if (classSuffix(node, "_list")) {
    const hasItemChildren = node.children.some((child) => classSuffix(child, "_item"));
    properties.display = "grid";
    properties.gap =
      node.tag === "ul" || node.tag === "ol"
        ? "0.5rem"
        : gapFromSource(sourceCode, hasItemChildren ? "1.5rem" : "1rem");
    if (hasItemChildren) {
      properties.width = "100%";
      if (/\bgrid-cols-1\b/.test(sourceCode) && /\bmd:grid-cols-2\b/.test(sourceCode)) {
        properties["grid-template-columns"] = "repeat(2, minmax(0, 1fr))";
      }
      properties["align-items"] = "start";
    }
  }

  if (classSuffix(node, "_item") || classSuffix(node, "_card")) {
    properties.display = "grid";
    properties.gap = "1rem";
    if (/\bbg-white\b/.test(sourceCode)) {
      properties["background-color"] = "#ffffff";
    }
    const padding = paddingFromSource(sourceCode);
    if (padding) {
      properties.padding = padding;
    }
    const radius = radiusFromSource(sourceCode);
    if (radius) {
      properties["border-radius"] = radius;
    }
    properties["text-align"] = "left";
  }

  return properties;
}

export function shouldFallbackStylingPlan(plan: StylingPlan): boolean {
  const hasFallbackWarning = plan.warnings.some((warning) => warning.code === "styling-fallback");
  const hasMaterialChanges =
    plan.styleDefinitions.length > 0 ||
    plan.variableBindings.length > 0 ||
    plan.requiredClassNames.length > 0;
  return hasFallbackWarning || !hasMaterialChanges;
}

export function buildFallbackStylingFromSkeleton(input: {
  metadata: SectionMetadata;
  mode: WorkflowMode;
  sectionContext: SectionContext;
  sharedStyleContext: SharedStyleContext;
  skeleton: SkeletonPlan;
  inheritedWarnings?: PlannerWarning[];
}): StylingPlan {
  const shared = sharedClassSet(input.sharedStyleContext);
  const styleDefinitions = new Map<string, Record<string, string>>();

  walkTree(input.skeleton.elementTree, (node) => {
    for (const className of node.classNames) {
      if (
        isReservedStyleGuideClassName(className) ||
        shared.has(className) ||
        styleDefinitions.has(className)
      ) {
        continue;
      }
      const properties = inferStyleProperties(node, input.sectionContext);
      if (Object.keys(properties).length > 0) {
        styleDefinitions.set(className, properties);
      }
    }
  });

  const reusableClasses = dedupe(
    input.skeleton.elementTree.classNames.filter((className) => shared.has(className))
  );
  const suggestedNewClasses = [...styleDefinitions.keys()];

  return stylingPlanSchema.parse({
    sectionMetadata: input.metadata,
    mode: input.mode,
    styleDefinitions: suggestedNewClasses.map((className) => ({
      className,
      properties: styleDefinitions.get(className) ?? { display: "block" },
      shared: false
    })),
    variableBindings: [],
    reusableClasses,
    suggestedNewClasses,
    requiredClassNames: [],
    notes: [
      "Used a deterministic styling fallback derived from the generated skeleton and source utilities.",
      "Review spacing and color details visually before approval."
    ],
    warnings: [
      ...(input.inheritedWarnings ?? []),
      {
        code: "styling-html-fallback",
        message:
          "A deterministic styling fallback was used because the provider styling plan was empty or unavailable.",
        level: "warning"
      }
    ]
  });
}
