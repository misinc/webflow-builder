import {
  BuildNode,
  PlannerWarning,
  SectionMetadata,
  SkeletonPlan,
  StylingPlan,
  WorkflowMode,
  stylingPlanSchema
} from "@wfb/shared/contracts.js";
import { isBuilderClassName, isReservedStyleGuideClassName } from "@wfb/shared/client-first.js";
import {
  collectRawDeclarations,
  parseCompiledCss,
  resolveDeclarationsWithBindings,
  splitLayoutVisual
} from "./css-resolver.js";

// Client-first global utilities that are meant to be REUSED from the bound
// site. Section-scoped, functional classes are preferred as the styling target,
// but these base classes are used as a fallback so element/descendant
// typography (e.g. `.cbs-header h2` -> heading-style-h2) still gets defined.
const REUSABLE_BASE_CLASS =
  /^(heading-style-|text-size-|text-weight-|text-style-|text-color-|container-|padding-global$|padding-section-|page-wrapper$|page-padding$|spacer-|margin-|max-width-|background-color-)/;

function isReusableBaseClass(name: string): boolean {
  return REUSABLE_BASE_CLASS.test(name);
}

/**
 * Pick the client-first class a node's resolved CSS should attach to: prefer a
 * section-scoped functional class; fall back to a reusable base class so
 * typography still lands somewhere renderable.
 */
function targetClassFor(node: BuildNode): string | null {
  const scoped = node.classNames.find(
    (name) => isBuilderClassName(name) && !isReusableBaseClass(name)
  );
  if (scoped) {
    return scoped;
  }
  // Only headings are safe to define on a shared base class (one heading level
  // per section). Other base classes (text-size-*, container-*) are multi-role —
  // merging different elements' CSS onto them corrupts, so we skip them.
  return (
    node.classNames.find((name) => isBuilderClassName(name) && /^heading-style-/.test(name)) ?? null
  );
}

function walk(
  node: BuildNode,
  ancestorSourceClasses: Set<string>,
  visit: (node: BuildNode, ancestors: Set<string>) => void
): void {
  visit(node, ancestorSourceClasses);
  const childAncestors = new Set(ancestorSourceClasses);
  (node.sourceClassNames ?? []).forEach((name) => childAncestors.add(name));
  (node.children ?? []).forEach((child) => walk(child, childAncestors, visit));
}

/**
 * Build a styling plan by resolving each node's ORIGINAL source classes AND the
 * class-scoped element/descendant rules that apply to it against the compiled
 * stylesheet, then attaching the real declarations to the node's client-first
 * class. Deterministic — no suffix guessing.
 */
export function buildResolvedStylingFromSkeleton(input: {
  metadata: SectionMetadata;
  mode: WorkflowMode;
  skeleton: SkeletonPlan;
  cssText: string;
  inheritedWarnings?: PlannerWarning[];
}): StylingPlan {
  const parsed = parseCompiledCss(input.cssText);
  const styleDefinitions = new Map<string, Record<string, string>>();
  const variableBindings: Array<{
    nodeId: string;
    property: string;
    variableName: string;
    value: string;
  }> = [];

  walk(input.skeleton.elementTree, new Set<string>(), (node, ancestors) => {
    const raw = collectRawDeclarations(node, ancestors, parsed);
    const { properties, bindings } = resolveDeclarationsWithBindings(raw, parsed.variables);
    if (Object.keys(properties).length === 0) {
      return;
    }
    const target = targetClassFor(node);
    // First node to claim a class wins — avoids merging semantically different
    // elements (e.g. a <section> and its <header>) onto one class.
    if (!target || isReservedStyleGuideClassName(target) || styleDefinitions.has(target)) {
      return;
    }
    styleDefinitions.set(target, properties);
    for (const binding of bindings) {
      variableBindings.push({
        nodeId: node.id,
        property: binding.property,
        variableName: binding.variableName,
        value: binding.value
      });
    }
  });

  const suggestedNewClasses = [...styleDefinitions.keys()];

  return stylingPlanSchema.parse({
    sectionMetadata: input.metadata,
    mode: input.mode,
    styleDefinitions: suggestedNewClasses.map((className) => {
      const properties = styleDefinitions.get(className) ?? {};
      const { layout, visual } = splitLayoutVisual(properties);
      // Layout first (skeleton gate), then visual (styling gate) — order only.
      return { className, properties: { ...layout, ...visual }, shared: false };
    }),
    variableBindings,
    reusableClasses: [],
    suggestedNewClasses,
    requiredClassNames: [],
    notes: [
      "Styling resolved deterministically from the source compiled CSS, including class-scoped element/descendant typography (looked up, not guessed)."
    ],
    warnings: [...(input.inheritedWarnings ?? [])]
  });
}
