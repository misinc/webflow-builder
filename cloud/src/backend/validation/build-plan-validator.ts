import {
  BuildNode,
  BuildPlan,
  PlannerWarning,
  ProjectContext,
  SharedStyleContext,
  buildPlanSchema
} from "../../shared/contracts.js";
import {
  dedupe,
  inferSharedCategory,
  isClientFirstName,
  isPageScopedClassName
} from "../../shared/client-first.js";

const DISALLOWED_TAGS = new Set(["script", "style", "iframe"]);

function walkTree(node: BuildNode, visit: (node: BuildNode) => void): void {
  visit(node);
  node.children.forEach((child) => walkTree(child, visit));
}

function nodeCategory(node: BuildNode): string | null {
  if (node.type === "heading") return "heading";
  if (node.type === "text") return "text";
  if (node.type === "button") return "button";
  return null;
}

export class BuildPlanValidator {
  validate(params: {
    plan: BuildPlan;
    projectContext: ProjectContext;
    sharedStyleContext: SharedStyleContext;
  }): { validatedPlan: BuildPlan; warnings: PlannerWarning[] } {
    const parsed = buildPlanSchema.parse(params.plan);
    const warnings: PlannerWarning[] = [...parsed.warnings];
    const assignmentMap = new Map(
      parsed.classAssignments.map((assignment) => [assignment.nodeId, assignment])
    );

    walkTree(parsed.elementTree, (node) => {
      if (DISALLOWED_TAGS.has(node.tag)) {
        throw new Error(`Unsupported tag in build plan: ${node.tag}`);
      }

      node.classNames.forEach((className) => {
        if (!isClientFirstName(className)) {
          throw new Error(`Invalid Client-First class name: ${className}`);
        }
        if (isPageScopedClassName(className)) {
          throw new Error(`Page-scoped class names are not allowed: ${className}`);
        }
      });

      const category = nodeCategory(node);
      if (!category) {
        return;
      }
      const sharedCategoryExists = params.sharedStyleContext.classes.some(
        (item) => item.category === category || inferSharedCategory(item.name) === category
      );
      if (!sharedCategoryExists) {
        return;
      }

      const assignment = assignmentMap.get(node.id);
      const reusesSharedClass = assignment?.reused.some(
        (name) => inferSharedCategory(name) === category
      );
      if (!reusesSharedClass && assignment && assignment.created.length > 0) {
        throw new Error(
          `Node ${node.id} creates new ${category} classes even though shared ${category} classes exist.`
        );
      }
    });

    parsed.styleDefinitions.forEach((definition) => {
      Object.values(definition.properties).forEach((value) => {
        if (
          /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) &&
          params.sharedStyleContext.variables.some((item) => item.category === "color")
        ) {
          warnings.push({
            code: "prefer-color-variable",
            message: `Class ${definition.className} uses a hardcoded color value.`,
            level: "warning"
          });
        }
      });
    });

    return {
      validatedPlan: {
        ...parsed,
        warnings: dedupe(
          warnings.map((warning) => JSON.stringify(warning))
        ).map((warning) => JSON.parse(warning) as PlannerWarning)
      },
      warnings
    };
  }
}
