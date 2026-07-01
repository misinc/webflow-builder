import { StylingPlan } from "@wfb/shared/contracts.js";

/**
 * Whether a provider-produced styling plan is too empty / low-signal to use, so
 * the caller should keep the deterministic (resolver-based) styling instead.
 *
 * The old site-specific "guessing" styling builder has been retired in favor of
 * the deterministic compiled-CSS resolver (see resolved-styling.ts).
 */
export function shouldFallbackStylingPlan(plan: StylingPlan): boolean {
  const hasFallbackWarning = plan.warnings.some((warning) => warning.code === "styling-fallback");
  const hasMaterialChanges =
    plan.styleDefinitions.length > 0 ||
    plan.variableBindings.length > 0 ||
    plan.requiredClassNames.length > 0;
  return hasFallbackWarning || !hasMaterialChanges;
}
