import { z } from "zod";

/**
 * Style Guide spec — the machine-readable contract for migrating a source site's
 * design tokens onto a Relume-cloneable project's Style Guide.
 *
 * An AI produces this JSON from a source site (see
 * `docs/source-style-guide-prompt.md`); the extension then updates the
 * destination Style Guide classes and variables via the Designer API. No HTML
 * style-guide page is needed — once applied, Webflow's own Relume Style Guide
 * page is the visual.
 *
 * Design-token values reference variables as `var(--token)` strings; the
 * `variables` map resolves each token to its literal value, type, and a human
 * `label` used to match it to the destination project's Webflow variable by
 * name (falling back to value-match).
 */

/** A CSS property → value map. Values may be literals (`#FF9902`, `1.5rem`) or
 *  variable references (`var(--color-primary)`). */
export const declMapSchema = z.record(z.string(), z.string());
export type DeclMap = z.infer<typeof declMapSchema>;

export const styleGuideVariableSchema = z.object({
  /** Resolved literal value, e.g. "#FF9902", "1.5rem", "Lato, sans-serif". */
  value: z.string().min(1),
  type: z.enum(["color", "size", "font", "number", "other"]),
  /** Human name for matching to a destination Webflow variable (e.g. "Primary
   *  warm accent", "Neutral Darkest"). Match by name first, value as fallback. */
  label: z.string().optional()
});
export type StyleGuideVariable = z.infer<typeof styleGuideVariableSchema>;

export const styleGuideBreakpointsSchema = z.object({
  medium: declMapSchema.optional(),
  small: declMapSchema.optional(),
  tiny: declMapSchema.optional()
});

export const styleGuideClassSchema = z.object({
  /** Desktop/base declarations for the class. */
  base: declMapSchema,
  /** Per-breakpoint overrides (deltas from the cascade above), desktop-first. */
  breakpoints: styleGuideBreakpointsSchema.optional(),
  /** Combo-class variants keyed by modifier — e.g. `button` carries
   *  `is-secondary`, `is-small`, `is-link`, `is-alternate`, `is-icon`. Each holds
   *  only the delta from the base. */
  variants: z.record(z.string(), declMapSchema).optional()
});
export type StyleGuideClass = z.infer<typeof styleGuideClassSchema>;

export const colorSchemeSchema = z.object({
  /** Human description of where the scheme is used (e.g. "Dark navy — Challenge
   *  section"). Metadata only — never applied as a CSS property. */
  label: z.string().optional(),
  /** The scheme's CSS-variable assignments (`--background-color`, `--text-color`,
   *  `--border-color`, …) that its children inherit. */
  vars: declMapSchema
});
export type ColorScheme = z.infer<typeof colorSchemeSchema>;

export const styleGuideSpecSchema = z.object({
  version: z.literal(1),
  source: z.object({ url: z.string().optional(), name: z.string().optional() }).optional(),
  /** CSS-var token (e.g. "--color-primary") → resolved value + type + label. */
  variables: z.record(z.string(), styleGuideVariableSchema),
  /** Client-first class name (e.g. "heading-style-h1", "button") → declarations. */
  classes: z.record(z.string(), styleGuideClassSchema),
  /** color-scheme-N → its CSS-variable assignments (`vars`) + an optional `label`. */
  colorSchemes: z.record(z.string(), colorSchemeSchema).optional()
});
export type StyleGuideSpec = z.infer<typeof styleGuideSpecSchema>;

/** If `value` is a `var(--token)` reference, return the token name, else null. */
export function parseVarRef(value: string): string | null {
  const match = /^\s*var\(\s*(--[A-Za-z0-9-_]+)\s*(?:,[^)]*)?\)\s*$/.exec(value);
  return match ? match[1] : null;
}

// --- Apply plan -----------------------------------------------------------
// A spec is turned into an ordered, serializable list of operations the
// Designer-API bridge executes. Kept pure here so it's unit-testable without a
// live Designer.

export type StyleGuideBreakpoint = "medium" | "small" | "tiny";

export interface StyleGuideVariableOp {
  kind: "variable";
  /** The CSS-var token, e.g. "--color-primary". */
  token: string;
  /** The Webflow variable name to create/update (token slug, e.g. "color-primary"). */
  name: string;
  type: StyleGuideVariable["type"];
  value: string;
  label?: string;
}

export interface StyleGuideStyleOp {
  kind: "style";
  className: string;
  /** null = base/desktop; otherwise the breakpoint the values apply at. */
  breakpoint: StyleGuideBreakpoint | null;
  /** Properties set to literal values. */
  literals: Record<string, string>;
  /** Properties bound to a variable — prop → token (`--color-primary`). */
  bindings: Record<string, string>;
}

export interface StyleGuideApplyPlan {
  variables: StyleGuideVariableOp[];
  styles: StyleGuideStyleOp[];
}

const STYLE_GUIDE_BREAKPOINTS: StyleGuideBreakpoint[] = ["medium", "small", "tiny"];

function tokenSlug(token: string): string {
  return token.replace(/^--/, "");
}

function splitDeclarations(map: DeclMap): {
  literals: Record<string, string>;
  bindings: Record<string, string>;
} {
  const literals: Record<string, string> = {};
  const bindings: Record<string, string> = {};
  for (const [prop, value] of Object.entries(map)) {
    const token = parseVarRef(value);
    if (token) {
      bindings[prop] = token;
    } else {
      literals[prop] = value;
    }
  }
  return { literals, bindings };
}

/**
 * Turn a validated Style Guide spec into an ordered apply plan: every variable
 * first (so class bindings can resolve), then one style op per class base, per
 * breakpoint, and per variant. `var(--token)` values become bindings; everything
 * else is a literal.
 */
export function planStyleGuideApply(spec: StyleGuideSpec): StyleGuideApplyPlan {
  const variables: StyleGuideVariableOp[] = Object.entries(spec.variables).map(
    ([token, variable]) => ({
      kind: "variable",
      token,
      name: tokenSlug(token),
      type: variable.type,
      value: variable.value,
      label: variable.label
    })
  );

  const styles: StyleGuideStyleOp[] = [];
  for (const [className, cls] of Object.entries(spec.classes)) {
    const base = splitDeclarations(cls.base);
    styles.push({ kind: "style", className, breakpoint: null, ...base });
    for (const breakpoint of STYLE_GUIDE_BREAKPOINTS) {
      const map = cls.breakpoints?.[breakpoint];
      if (map && Object.keys(map).length > 0) {
        styles.push({ kind: "style", className, breakpoint, ...splitDeclarations(map) });
      }
    }
    for (const [modifier, delta] of Object.entries(cls.variants ?? {})) {
      if (Object.keys(delta).length > 0) {
        styles.push({ kind: "style", className: modifier, breakpoint: null, ...splitDeclarations(delta) });
      }
    }
  }

  return { variables, styles };
}
