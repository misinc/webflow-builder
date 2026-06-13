import {
  ProjectContext,
  SharedStyleContext
} from "../../shared/contracts.js";

export function createProjectContext(
  sharedStyleContext: SharedStyleContext
): ProjectContext {
  return {
    namingRules: [
      "Use Client-First-compatible lowercase class names.",
      "Prefer functional names like section_hero, hero_content, services_list.",
      "Never use page-scoped class names."
    ],
    sharedTextClasses: sharedStyleContext.classes
      .filter((item) => item.category === "text")
      .map((item) => item.name),
    sharedHeadingClasses: sharedStyleContext.classes
      .filter((item) => item.category === "heading")
      .map((item) => item.name),
    sharedButtonClasses: sharedStyleContext.classes
      .filter((item) => item.category === "button")
      .map((item) => item.name),
    spacingVariableRules: sharedStyleContext.variables
      .filter((item) => item.category === "spacing")
      .map((item) => item.name),
    colorVariableRules: sharedStyleContext.variables
      .filter((item) => item.category === "color")
      .map((item) => item.name),
    forbiddenPatterns: ["page-specific-class-names", "hardcoded-color-values"],
    allowedNewClassPolicy:
      "New classes are allowed only for section-specific layout and visual rules that cannot be represented by existing shared utilities."
  };
}
