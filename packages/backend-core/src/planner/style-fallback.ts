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
import postcss from "postcss";
import { HTMLElement, NodeType, parse } from "node-html-parser";

function walkTree(
  node: BuildNode,
  visit: (node: BuildNode, parent: BuildNode | null) => void,
  parent: BuildNode | null = null
): void {
  visit(node, parent);
  node.children.forEach((child) => walkTree(child, visit, node));
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

const SAFE_CSS_PROPERTIES = new Set([
  "align-items",
  "background",
  "background-color",
  "border",
  "border-color",
  "border-radius",
  "box-shadow",
  "color",
  "display",
  "flex",
  "flex-wrap",
  "font-family",
  "font-size",
  "font-weight",
  "gap",
  "grid-template-columns",
  "grid-template-rows",
  "height",
  "justify-content",
  "justify-items",
  "justify-self",
  "letter-spacing",
  "line-height",
  "margin",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-width",
  "min-height",
  "overflow",
  "padding",
  "position",
  "text-align",
  "text-decoration",
  "transition",
  "width"
]);

interface CssRule {
  selector: string;
  declarations: Record<string, string>;
}

interface CssStyleContext {
  sourceClassNames: Set<string>;
  variables: Map<string, string>;
  rules: CssRule[];
}

type CssTarget = "self" | "heading" | "paragraph" | "svg" | "descendant";

function sourceClassesFromHtml(sourceCode: string): Set<string> {
  const classNames = new Set<string>();
  const document = parse(sourceCode, {
    comment: false,
    lowerCaseTagName: true,
    blockTextElements: {
      script: true,
      style: true,
      pre: false
    }
  });
  function visit(element: HTMLElement): void {
    const rawClass = element.getAttribute("class") ?? "";
    rawClass.split(/\s+/).filter(Boolean).forEach((className) => classNames.add(className));
    element.childNodes.forEach((child) => {
      if (child.nodeType === NodeType.ELEMENT_NODE) {
        visit(child as HTMLElement);
      }
    });
  }
  visit(document);
  return classNames;
}

function selectorMatchesClass(selector: string, className: string): boolean {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-zA-Z0-9_-])\\.${escaped}(?![a-zA-Z0-9_-])`).test(selector);
}

function selectorTarget(selector: string, className: string): CssTarget {
  const classIndex = selector.indexOf(`.${className}`);
  const afterClass = classIndex >= 0 ? selector.slice(classIndex + className.length + 1) : "";
  if (/\bsvg\b/i.test(afterClass)) {
    return "svg";
  }
  if (/\bh[1-6]\b/i.test(afterClass)) {
    return "heading";
  }
  if (/\bp\b/i.test(afterClass)) {
    return "paragraph";
  }
  if (/^\s*[>+~\s]/.test(afterClass)) {
    return "descendant";
  }
  return "self";
}

function splitSelectors(selector: string): string[] {
  return selector.split(",").map((value) => value.trim()).filter(Boolean);
}

function resolveCssValue(value: string, variables: Map<string, string>): string {
  return value.replace(/var\(\s*(--[a-zA-Z0-9_-]+)(?:\s*,\s*([^)]+))?\s*\)/g, (_match, name: string, fallback: string | undefined) => {
    return variables.get(name) ?? fallback?.trim() ?? "";
  });
}

function parseCssStyleContext(sectionContext: SectionContext): CssStyleContext {
  const sourceClassNames = sourceClassesFromHtml(sectionContext.sourceCode);
  const variables = new Map<string, string>();
  const rules: CssRule[] = [];

  for (const stylesheet of sectionContext.relevantStylesheets) {
    let root: postcss.Root;
    try {
      root = postcss.parse(stylesheet.content, { from: stylesheet.path });
    } catch {
      continue;
    }

    root.walkDecls((decl) => {
      if (decl.parent?.type === "rule" && (decl.parent as postcss.Rule).selector.includes(":root")) {
        if (decl.prop.startsWith("--")) {
          variables.set(decl.prop, decl.value);
        }
      }
    });

    root.walkRules((rule) => {
      if (rule.selector.includes(":") && !rule.selector.includes(":root")) {
        return;
      }
      let parent: postcss.Node | undefined = rule.parent;
      while (parent) {
        if (parent.type === "atrule") {
          const atRule = parent as postcss.AtRule;
          if (/^(media|supports|container|keyframes)$/i.test(atRule.name)) {
            return;
          }
        }
        parent = parent.parent;
      }
      const declarations: Record<string, string> = {};
      rule.walkDecls((decl) => {
        const prop = decl.prop.toLowerCase();
        if (!SAFE_CSS_PROPERTIES.has(prop)) {
          return;
        }
        const value = resolveCssValue(decl.value, variables).trim();
        if (!value || /url\(/i.test(value) || /!important/i.test(value)) {
          return;
        }
        declarations[prop] = value;
      });
      if (Object.keys(declarations).length === 0) {
        return;
      }
      splitSelectors(rule.selector).forEach((selector) => {
        rules.push({ selector, declarations });
      });
    });
  }

  return { sourceClassNames, variables, rules };
}

function roleForGeneratedClass(className: string): {
  sourcePattern: RegExp;
  target: CssTarget;
} | null {
  if (className.startsWith("section_")) {
    return { sourcePattern: /section/i, target: "self" };
  }
  if (className.endsWith("_grid")) {
    return { sourcePattern: /(?:mosaic-)?grid$/i, target: "self" };
  }
  if (className.endsWith("_feature")) {
    return { sourcePattern: /(?:mosaic-)?(?:lead|feature|story|aside)$/i, target: "self" };
  }
  if (className.endsWith("_feature_heading")) {
    return { sourcePattern: /(?:mosaic-)?(?:lead|feature|story|aside)$/i, target: "heading" };
  }
  if (className.endsWith("_feature_text")) {
    return { sourcePattern: /(?:mosaic-)?(?:lead|feature|story|aside)$/i, target: "paragraph" };
  }
  if (className.endsWith("_pill_list")) {
    return { sourcePattern: /(?:mini-)?(?:stack|pill-list|pills)$/i, target: "self" };
  }
  if (className.endsWith("_pill")) {
    return { sourcePattern: /(?:mini-)?pill$/i, target: "self" };
  }
  if (className.endsWith("_card_list")) {
    return { sourcePattern: /(?:mosaic-)?cards$/i, target: "self" };
  }
  if (className.endsWith("_card_heading")) {
    return { sourcePattern: /(?:card(?:__|-)?title|(?:mosaic-)?card)$/i, target: "heading" };
  }
  if (className.endsWith("_card_title")) {
    return { sourcePattern: /(?:card(?:__|-)?title)$/i, target: "self" };
  }
  if (className.endsWith("_card_text")) {
    return { sourcePattern: /(?:mosaic-)?card$/i, target: "paragraph" };
  }
  if (className.endsWith("_card")) {
    return { sourcePattern: /(?:mosaic-)?card$/i, target: "self" };
  }
  return null;
}

function cssPropertiesForGeneratedClass(
  className: string,
  node: BuildNode,
  cssContext: CssStyleContext
): Record<string, string> {
  const role = roleForGeneratedClass(className);
  if (!role) {
    return {};
  }
  const localSourceClassNames = node.sourceClassNames ?? [];
  const candidateClasses = (localSourceClassNames.length > 0
    ? localSourceClassNames
    : [...cssContext.sourceClassNames]).filter((sourceClassName) => role.sourcePattern.test(sourceClassName));
  const properties: Record<string, string> = {};

  for (const sourceClassName of candidateClasses) {
    for (const rule of cssContext.rules) {
      if (!selectorMatchesClass(rule.selector, sourceClassName)) {
        continue;
      }
      if (selectorTarget(rule.selector, sourceClassName) !== role.target) {
        continue;
      }
      Object.assign(properties, rule.declarations);
    }
  }

  return properties;
}

function inferStyleProperties(
  node: BuildNode,
  sectionContext: SectionContext,
  parent: BuildNode | null,
  cssContext: CssStyleContext
): Record<string, string> {
  const sourceCode = sectionContext.sourceCode;
  const properties: Record<string, string> = {};
  const nodeClassNames = node.classNames;

  if (node.tag === "section" && nodeClassNames.some((className) => className.startsWith("section_"))) {
    properties.width = "100%";
    properties["background-color"] = "#fffdf9";
    const background = sectionBackgroundFromSource(sourceCode);
    if (background) {
      properties["background-color"] = background;
    }
  }

  if (classSuffix(node, "_component")) {
    properties.display = "grid";
    properties.gap = gapFromSource(sourceCode, "4rem");
    properties["justify-items"] = "stretch";
  }

  if (classSuffix(node, "_grid")) {
    properties.display = "grid";
    properties.gap = "1.25rem";
    properties["grid-template-columns"] = "1.02fr 1.38fr";
    properties["align-items"] = "stretch";
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

  if (classSuffix(node, "_feature")) {
    properties.display = "grid";
    properties.gap = "1rem";
    properties["grid-template-rows"] = "auto auto 1fr auto";
    properties.height = "100%";
    properties.padding = "2.125rem";
    properties["border-radius"] = "30px";
    properties.overflow = "hidden";
    properties.position = "relative";
    properties["background-color"] = "#ffefcf";
    properties.background =
      "radial-gradient(circle at top right, rgba(255,153,2,0.20), transparent 28%), linear-gradient(160deg, #fff8ef, #ffefcf)";
    properties.border = "1px solid rgba(166,32,37,0.12)";
    properties["box-shadow"] = "0 22px 46px rgba(107,74,30,0.09)";
  }

  if (classSuffix(node, "_feature_heading")) {
    properties["font-family"] = "Manrope, sans-serif";
    properties["font-weight"] = "300";
    properties["font-size"] = "3.8rem";
    properties["line-height"] = "0.96";
    properties["letter-spacing"] = "-0.04em";
    properties.color = "#6b4a1e";
    properties.margin = "0";
  }

  if (classSuffix(node, "_feature_text")) {
    properties["font-size"] = "1rem";
    properties["line-height"] = "1.7";
    properties.color = "#8f6a35";
    properties.margin = "0";
    properties["max-width"] = "28ch";
  }

  if (classSuffix(node, "_pill_list")) {
    properties.display = "flex";
    properties["flex-wrap"] = "wrap";
    properties["align-items"] = "flex-start";
    properties.gap = "0.5rem";
    properties["justify-self"] = "start";
    properties["margin-top"] = "1.125rem";
    properties["max-width"] = "360px";
  }

  if (classSuffix(node, "_pill")) {
    properties.display = "inline-flex";
    properties["align-items"] = "center";
    properties.gap = "0.5rem";
    properties.padding = "0.5625rem 0.8125rem";
    properties["border-radius"] = "999px";
    properties.border = "1px solid rgba(166,32,37,0.12)";
    properties["background-color"] = "rgba(255,255,255,0.70)";
    properties.color = "#6b4a1e";
    properties["font-size"] = "0.96rem";
    properties["text-decoration"] = "none";
  }

  if (classSuffix(node, "_card_list")) {
    properties.display = "grid";
    properties.gap = "1.25rem";
    properties["grid-template-columns"] = "repeat(2, minmax(0, 1fr))";
    properties["grid-template-rows"] = "repeat(3, minmax(0, 1fr))";
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
    if (classSuffix(node, "_card")) {
      properties["background-color"] = "#ffffff";
      properties.border = "1px solid rgba(166,32,37,0.12)";
      properties["box-shadow"] = "0 16px 36px rgba(107,74,30,0.07)";
      properties["min-height"] = "205px";
      properties.padding = "1.375rem";
      properties["border-radius"] = "30px";
      properties.overflow = "hidden";
      properties.position = "relative";
      properties["text-decoration"] = "none";
      properties.color = "#6b4a1e";
    } else if (parent && classSuffix(parent, "_card")) {
      properties.gap = "1rem";
    } else if (/\bbg-white\b/.test(sourceCode)) {
      properties["background-color"] = "#ffffff";
    }
    const padding = paddingFromSource(sourceCode);
    if (padding && !classSuffix(node, "_card")) {
      properties.padding = padding;
    }
    const radius = radiusFromSource(sourceCode);
    if (radius && !classSuffix(node, "_card")) {
      properties["border-radius"] = radius;
    }
    properties["text-align"] = "left";
  }

  if (classSuffix(node, "_card_heading")) {
    properties["font-family"] = "Manrope, sans-serif";
    properties["font-weight"] = "300";
    properties["font-size"] = "2rem";
    properties["line-height"] = "1.08";
    properties["letter-spacing"] = "-0.04em";
    properties.color = "#6b4a1e";
    properties.margin = "0";
  }

  if (classSuffix(node, "_card_text")) {
    properties["font-size"] = "1rem";
    properties["line-height"] = "1.7";
    properties.color = "#8f6a35";
    properties.margin = "0";
    properties["max-width"] = "31ch";
  }

  if (classSuffix(node, "_card_title")) {
    properties.display = "flex";
    properties["align-items"] = "center";
    properties.gap = "0.75rem";
  }

  const cssProperties = nodeClassNames.reduce<Record<string, string>>((acc, className) => {
    Object.assign(acc, cssPropertiesForGeneratedClass(className, node, cssContext));
    return acc;
  }, {});

  return {
    ...properties,
    ...cssProperties
  };
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
  const cssContext = parseCssStyleContext(input.sectionContext);

  walkTree(input.skeleton.elementTree, (node, parent) => {
    for (const className of node.classNames) {
      if (
        isReservedStyleGuideClassName(className) ||
        shared.has(className) ||
        styleDefinitions.has(className)
      ) {
        continue;
      }
      const properties = inferStyleProperties(node, input.sectionContext, parent, cssContext);
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
