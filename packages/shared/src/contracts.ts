import { z } from "zod";

export interface BuildNode {
  id: string;
  type: string;
  tag: string;
  label?: string;
  classNames: string[];
  sourceClassNames?: string[];
  /** The source element's `id` attribute, for resolving `#id` CSS rules. */
  sourceId?: string;
  /** Stable capture key (`data-pw-key`, e.g. "0.1.2") joining this node back to
   *  its browser-computed styles after the planner restructures the tree. */
  sourceKey?: string;
  /** Safelisted inline `style` accents (color/background/border-color/…) — kept
   *  for per-instance combo classes (e.g. an icon's `currentColor` ring). */
  inlineStyles?: Record<string, string>;
  textContent?: string;
  /** Raw HTML to embed verbatim (e.g. an inline SVG icon) — rendered as a Webflow Embed. */
  embedHtml?: string;
  children: BuildNode[];
}

export const sharedClassSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  description: z.string().optional()
});

export const sharedVariableSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  value: z.string().optional(),
  group: z.string().optional()
});

export const repoTokenTypeSchema = z.enum([
  "color",
  "size",
  "fontFamily",
  "number",
  "string",
  "other"
]);

export const repoTokenSchema = z.object({
  group: z.string().min(1),
  name: z.string().min(1),
  type: repoTokenTypeSchema,
  value: z.string().min(1),
  sourceFile: z.string().min(1),
  figmaVariableId: z.string().optional()
});

export const repoTokensResponseSchema = z.object({
  repoId: z.string().min(1),
  generatedAt: z.string().datetime(),
  tokens: z.array(repoTokenSchema),
  warnings: z.array(z.string())
});

export const importVariablesInputSchema = z.object({
  tokens: z.array(repoTokenSchema)
});

export const importVariablesResultSchema = z.object({
  created: z.array(repoTokenSchema),
  reused: z.array(repoTokenSchema),
  skipped: z.array(
    z.object({
      token: repoTokenSchema,
      reason: z.string().min(1)
    })
  ),
  missingAfterImport: z.array(repoTokenSchema),
  failed: z.array(
    z.object({
      token: repoTokenSchema,
      error: z.string().min(1)
    })
  ),
  warnings: z.array(z.string())
});

export const visualQaViewportSchema = z.object({
  name: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive()
});

export const visualQaCompareRequestSchema = z.object({
  originalUrl: z.string().url(),
  webflowUrl: z.string().url(),
  selector: z.string().min(1).optional(),
  threshold: z.number().min(0).max(1).default(0.12),
  viewports: z.array(visualQaViewportSchema).min(1).default([
    { name: "desktop", width: 1440, height: 1200 },
    { name: "tablet", width: 991, height: 1200 },
    { name: "mobile", width: 390, height: 1200 }
  ])
});

export const visualQaViewportResultSchema = z.object({
  name: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mismatchRatio: z.number().min(0).max(1),
  passed: z.boolean(),
  originalScreenshot: z.string().min(1),
  webflowScreenshot: z.string().min(1),
  diffScreenshot: z.string().min(1),
  notes: z.array(z.string())
});

export const visualQaCompareResponseSchema = z.object({
  generatedAt: z.string().datetime(),
  originalUrl: z.string().url(),
  webflowUrl: z.string().url(),
  selector: z.string().optional(),
  threshold: z.number().min(0).max(1),
  passed: z.boolean(),
  averageMismatchRatio: z.number().min(0).max(1),
  results: z.array(visualQaViewportResultSchema),
  warnings: z.array(z.string())
});

// --- Capture service (URL → sections → clipboard payload) ----------------

export const captureScanRequestSchema = z.object({
  url: z.string().url()
});

export const captureCandidateSchema = z.object({
  selector: z.string().min(1),
  label: z.string(),
  kind: z.string(),
  width: z.number(),
  height: z.number(),
  screenshot: z.string().nullable()
});

export const captureScanResponseSchema = z.object({
  url: z.string(),
  candidates: z.array(captureCandidateSchema)
});

export const captureStatsSchema = z.object({
  nodeCount: z.number(),
  classCount: z.number(),
  responsiveClassCount: z.number(),
  styleGuideRefs: z.number(),
  droppedLinkUrls: z.number(),
  placeholderImages: z.number(),
  backgroundImages: z.number().default(0)
});

export const captureExtractRequestSchema = z.object({
  url: z.string().url(),
  sections: z
    .array(
      z.object({
        selector: z.string().min(1),
        label: z.string().max(120).optional(),
        /** Scan `kind` (Navbar/Header/Footer/Bar/Section) — drives chrome mode. */
        kind: z.string().optional()
      })
    )
    .min(1)
    .max(30),
  styleGuideMode: z.boolean().optional()
});

export const captureExtractResponseSchema = z.object({
  payloadJson: z.string().min(1),
  stats: captureStatsSchema,
  warnings: z.array(z.string()),
  perSection: z.array(
    z.object({ selector: z.string(), screenshot: z.string().nullable() })
  )
});

export const sharedStyleContextSchema = z.object({
  siteId: z.string().min(1),
  capturedAt: z.string().datetime(),
  classes: z.array(sharedClassSchema),
  variables: z.array(sharedVariableSchema),
  styleIds: z.array(z.string()).default([])
});

export const siteStylePlanClassDecisionSchema = z.object({
  sourceClassName: z.string().min(1),
  action: z.enum(["reuse", "create"]),
  targetClassName: z.string().min(1),
  source: z.enum(["repo", "webflow", "inferred"]).default("repo")
});

export const siteStylePlanSchema = z.object({
  id: z.string().min(1),
  repoId: z.string().min(1),
  webflowSiteId: z.string().min(1),
  status: z.enum(["draft", "confirmed"]),
  classDecisions: z.array(siteStylePlanClassDecisionSchema),
  variableNames: z.array(z.string()),
  classCounts: z.object({
    repo: z.number().int().nonnegative(),
    webflow: z.number().int().nonnegative(),
    reuse: z.number().int().nonnegative(),
    create: z.number().int().nonnegative()
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  confirmedAt: z.string().datetime().nullable()
});

export const siteStylePlanRequestSchema = z.object({
  repoId: z.string().min(1),
  webflowSiteId: z.string().min(1),
  requestedBy: z.string().min(1),
  sharedStyleContext: sharedStyleContextSchema.optional()
});

export const repoConnectionInputSchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  repoUrl: z.string().url(),
  provider: z.literal("github").default("github"),
  requestedBy: z.string().min(1)
});

export const repoSchema = z.object({
  id: z.string().min(1),
  owner: z.string().min(1),
  name: z.string().min(1),
  provider: z.literal("github"),
  repoUrl: z.string().url(),
  defaultBranch: z.string().min(1),
  status: z.enum(["connected", "syncing", "ready", "failed"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const repoSyncSchema = z.object({
  id: z.string().min(1),
  repoId: z.string().min(1),
  commitSha: z.string().min(1),
  branch: z.string().min(1),
  status: z.enum(["queued", "running", "completed", "failed"]),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  errorMessage: z.string().nullable()
});

export const repoPageSchema = z.object({
  id: z.string().min(1),
  repoId: z.string().min(1),
  name: z.string().min(1),
  route: z.string().min(1),
  sourceFile: z.string().min(1),
  sourceCode: z.string().optional(),
  sortOrder: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const repoSectionSchema = z.object({
  id: z.string().min(1),
  repoId: z.string().min(1),
  pageId: z.string().min(1),
  name: z.string().min(1),
  sectionKey: z.string().min(1),
  sourceFile: z.string().min(1),
  sourceCode: z.string().optional(),
  importPath: z.string().min(1),
  sortOrder: z.number().int().nonnegative(),
  componentName: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const sectionContextSchema = z.object({
  repoId: z.string().min(1),
  pageName: z.string().min(1),
  pageSourceFile: z.string().min(1),
  sectionName: z.string().min(1),
  sectionSourceFile: z.string().min(1),
  componentName: z.string().min(1),
  sectionOrder: z.number().int().nonnegative(),
  sourceCode: z.string().min(1),
  relevantStylesheets: z.array(
    z.object({
      path: z.string().min(1),
      content: z.string().min(1)
    })
  ),
  assetReferences: z.array(z.string()),
  contentHints: z.array(z.string()),
  relatedSharedClasses: z.array(z.string())
});

export const projectContextSchema = z.object({
  namingRules: z.array(z.string()),
  sharedTextClasses: z.array(z.string()),
  sharedHeadingClasses: z.array(z.string()),
  sharedButtonClasses: z.array(z.string()),
  spacingVariableRules: z.array(z.string()),
  colorVariableRules: z.array(z.string()),
  forbiddenPatterns: z.array(z.string()),
  allowedNewClassPolicy: z.string().min(1)
});

export const buildNodeSchema: z.ZodType<BuildNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    tag: z.string().min(1),
    label: z.string().optional(),
    classNames: z.array(z.string()),
    sourceClassNames: z.array(z.string()).optional(),
    sourceId: z.string().optional(),
    sourceKey: z.string().optional(),
    inlineStyles: z.record(z.string(), z.string()).optional(),
    textContent: z.string().optional(),
    embedHtml: z.string().optional(),
    children: z.array(buildNodeSchema)
  })
);

export const classAssignmentSchema = z.object({
  nodeId: z.string().min(1),
  classNames: z.array(z.string()),
  reused: z.array(z.string()).default([]),
  created: z.array(z.string()).default([])
});

export const styleDefinitionSchema = z.object({
  className: z.string().min(1),
  properties: z.record(z.string(), z.string()),
  shared: z.boolean().default(false),
  /** A per-instance combo/variant class (e.g. a card accent) applied on top of a
   *  shared base class. Carries only the differing declarations; created with its
   *  full (visual) styles at skeleton time so Webflow doesn't drop it as empty. */
  combo: z.boolean().optional()
});

export const variableBindingSchema = z.object({
  nodeId: z.string().min(1),
  property: z.string().min(1),
  variableName: z.string().min(1),
  // Resolved literal (e.g. #A62025) used as a fallback when the variable can't
  // be matched by name in the target Webflow site.
  value: z.string().optional()
});

export const assetBindingSchema = z.object({
  nodeId: z.string().min(1),
  source: z.string().min(1),
  fallback: z.enum(["placeholder", "warning-only"]).default("placeholder")
});

export const plannerWarningSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  level: z.enum(["info", "warning", "error"]).default("warning")
});

export const buildPlanSchema = z.object({
  sectionMetadata: z.object({
    repoId: z.string().min(1),
    pageId: z.string().min(1),
    sectionId: z.string().min(1),
    pageName: z.string().min(1),
    sectionName: z.string().min(1),
    sourceFile: z.string().min(1)
  }),
  elementTree: buildNodeSchema,
  classAssignments: z.array(classAssignmentSchema),
  styleDefinitions: z.array(styleDefinitionSchema),
  variableBindings: z.array(variableBindingSchema),
  assetBindings: z.array(assetBindingSchema),
  warnings: z.array(plannerWarningSchema)
});

export const placementModeSchema = z.enum(["append", "afterSelected"]);

export const buildPlanRequestSchema = z.object({
  repoId: z.string().min(1),
  pageId: z.string().min(1),
  sectionId: z.string().min(1),
  webflowSiteId: z.string().min(1),
  webflowPageId: z.string().min(1),
  placementMode: placementModeSchema,
  placementTarget: z.string().nullable().optional(),
  sharedStyleContext: sharedStyleContextSchema.optional()
});

export const bindSiteInputSchema = z.object({
  repoId: z.string().min(1),
  webflowSiteId: z.string().min(1),
  rulesetName: z.string().optional(),
  sharedStyleContext: sharedStyleContextSchema.optional(),
  requestedBy: z.string().min(1)
});

export const buildJobSchema = z.object({
  id: z.string().min(1),
  repoId: z.string().min(1),
  pageId: z.string().min(1),
  sectionId: z.string().min(1),
  webflowSiteId: z.string().min(1),
  webflowPageId: z.string().min(1),
  placementMode: placementModeSchema,
  placementTarget: z.string().nullable(),
  status: z.enum(["queued", "running", "completed", "failed"]),
  requestedBy: z.string().min(1),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  errorMessage: z.string().nullable()
});

export const buildResultSchema = z.object({
  id: z.string().min(1),
  buildJobId: z.string().min(1),
  success: z.boolean(),
  insertedSectionName: z.string().min(1),
  webflowPageId: z.string().min(1),
  reusedClasses: z.array(z.string()),
  createdClasses: z.array(z.string()),
  createdNodeIds: z.array(z.string()),
  warnings: z.array(plannerWarningSchema),
  missingAssets: z.array(z.string()),
  rollbackOutcome: z
    .object({
      attempted: z.boolean(),
      successful: z.boolean(),
      details: z.string()
    })
    .nullable(),
  createdAt: z.string().datetime()
});

export const completeBuildJobInputSchema = z.object({
  success: z.boolean(),
  insertedSectionName: z.string().min(1),
  webflowPageId: z.string().min(1),
  reusedClasses: z.array(z.string()),
  createdClasses: z.array(z.string()),
  createdNodeIds: z.array(z.string()),
  warnings: z.array(plannerWarningSchema),
  missingAssets: z.array(z.string()),
  rollbackOutcome: z
    .object({
      attempted: z.boolean(),
      successful: z.boolean(),
      details: z.string()
    })
    .nullable()
});

export const repoTreeResponseSchema = z.object({
  repo: repoSchema,
  pages: z.array(
    z.object({
      page: repoPageSchema,
      sections: z.array(repoSectionSchema)
    })
  )
});

export const workflowModeSchema = z.enum([
  "fullAssist",
  "skeletonThenStyle",
  "styleExisting"
]);

export const sectionWorkflowStatusSchema = z.enum([
  "not_started",
  "in_progress",
  "skeleton_ready",
  "skeleton_placed",
  "skeleton_approved",
  "styled",
  "approved",
  "skipped"
]);

export const sectionMetadataSchema = z.object({
  repoId: z.string().min(1),
  pageId: z.string().min(1),
  sectionId: z.string().min(1),
  pageName: z.string().min(1),
  sectionName: z.string().min(1),
  sourceFile: z.string().min(1),
  repoType: z.enum(["react", "html"]).optional()
});

export const sectionAnalysisSchema = z.object({
  sectionMetadata: sectionMetadataSchema,
  summary: z.string().min(1),
  sourceCode: z.string().default(""),
  goals: z.array(z.string()).default([]),
  content: z.array(
    z.object({
      kind: z.string().min(1),
      label: z.string().min(1),
      value: z.string().min(1)
    })
  ),
  recommendedMode: workflowModeSchema,
  reusableClasses: z.array(z.string()).default([]),
  suggestedNewClasses: z.array(z.string()).default([]),
  warnings: z.array(plannerWarningSchema).default([])
});

export const skeletonPlanSchema = z.object({
  sectionMetadata: sectionMetadataSchema,
  treeText: z.string().min(1),
  elementTree: buildNodeSchema,
  assetBindings: z.array(assetBindingSchema).default([]),
  reusableClasses: z.array(z.string()).default([]),
  suggestedNewClasses: z.array(z.string()).default([]),
  // Layout-only style definitions applied when the skeleton is placed, so new
  // classes are created WITH properties (Webflow drops brand-new empty classes).
  styleDefinitions: z.array(styleDefinitionSchema).optional(),
  classMappingDecisions: z.array(
    z.object({
      sourceClassName: z.string().min(1),
      targetClassName: z.string(),
      action: z.enum(["reuse", "create", "unmapped"])
    })
  ).optional(),
  warnings: z.array(plannerWarningSchema).default([])
});

export const stylingPlanSchema = z.object({
  sectionMetadata: sectionMetadataSchema,
  mode: workflowModeSchema,
  styleDefinitions: z.array(styleDefinitionSchema),
  variableBindings: z.array(variableBindingSchema).default([]),
  reusableClasses: z.array(z.string()).default([]),
  suggestedNewClasses: z.array(z.string()).default([]),
  requiredClassNames: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
  warnings: z.array(plannerWarningSchema).default([])
});

export const sectionVerificationSchema = z.object({
  sectionMetadata: sectionMetadataSchema,
  summary: z.string().min(1),
  readyForApproval: z.boolean(),
  warnings: z.array(plannerWarningSchema).default([])
});

export const webflowSitePageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  route: z.string().nullable().optional(),
  isHomepage: z.boolean().default(false)
});

export const pageMappingSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  repoId: z.string().min(1),
  webflowSiteId: z.string().min(1),
  webflowPageId: z.string().min(1),
  webflowPageName: z.string().min(1),
  webflowPageRoute: z.string().nullable(),
  repoPageId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const sitePageMappingRowSchema = z.object({
  webflowSiteId: z.string().min(1),
  webflowPageId: z.string().min(1),
  webflowPageName: z.string().min(1),
  webflowPageRoute: z.string().nullable(),
  repoPageId: z.string().nullable(),
  repoPageName: z.string().nullable(),
  mappingStatus: z.enum(["mapped", "unmapped"])
});

export const sectionWorkflowStateSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  webflowSiteId: z.string().min(1),
  webflowPageId: z.string().min(1),
  repoPageId: z.string().min(1),
  repoSectionId: z.string().min(1),
  status: sectionWorkflowStatusSchema,
  sortOrder: z.number().int().nonnegative(),
  lastRunId: z.string().nullable(),
  placedRootNodeId: z.string().nullable().default(null),
  nodeIdMap: z.record(z.string(), z.string()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  skippedAt: z.string().datetime().nullable(),
  skeletonPlacedAt: z.string().datetime().nullable().default(null),
  skeletonApprovedAt: z.string().datetime().nullable().default(null),
  styledAt: z.string().datetime().nullable().default(null)
});

export const sectionRunSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  repoId: z.string().min(1),
  webflowSiteId: z.string().min(1),
  webflowPageId: z.string().min(1),
  repoPageId: z.string().min(1),
  repoSectionId: z.string().min(1),
  runType: z.enum(["analysis", "skeleton", "styling", "verification"]),
  payload: z.record(z.string(), z.unknown()),
  approvalOutcome: z.enum(["approved", "skipped"]).nullable(),
  createdAt: z.string().datetime(),
  approvedAt: z.string().datetime().nullable()
});

export const workflowQueueItemSchema = z.object({
  repoSectionId: z.string().min(1),
  sectionName: z.string().min(1),
  sortOrder: z.number().int().nonnegative(),
  status: sectionWorkflowStatusSchema,
  recommendedMode: workflowModeSchema,
  lastRunId: z.string().nullable(),
  placedRootNodeId: z.string().nullable().default(null),
  skeletonApprovedAt: z.string().datetime().nullable().default(null)
});

export const workflowQueueResponseSchema = z.object({
  mapping: sitePageMappingRowSchema.nullable(),
  repoPage: repoPageSchema.nullable(),
  items: z.array(workflowQueueItemSchema),
  nextSectionId: z.string().nullable()
});

export const pageMappingsUpsertInputSchema = z.object({
  repoId: z.string().min(1),
  webflowSiteId: z.string().min(1),
  requestedBy: z.string().min(1),
  mappings: z.array(
    z.object({
      webflowPageId: z.string().min(1),
      webflowPageName: z.string().min(1),
      webflowPageRoute: z.string().nullable().optional(),
      repoPageId: z.string().nullable()
    })
  )
});

export const workflowQueueRequestSchema = z.object({
  repoId: z.string().min(1),
  webflowSiteId: z.string().min(1),
  webflowPageId: z.string().min(1),
  requestedBy: z.string().min(1)
});

export const workflowClipboardRequestSchema = z.object({
  repoId: z.string().min(1),
  webflowSiteId: z.string().min(1),
  webflowPageId: z.string().min(1),
  /** Omit to build a payload for the WHOLE mapped page (all queued sections). */
  sectionId: z.string().min(1).optional(),
  /** Page mode: sections to leave out (e.g. ones whose Webflow Component already
   *  exists — those are inserted as linked instances instead of pasted copies). */
  excludeSectionIds: z.array(z.string().min(1)).default([]),
  /** Site chrome mode: copy everything before <main> (announcement bar + navbar),
   *  after it (footer), or both in one paste ("all") from the mapped page —
   *  built once, then componentized. */
  chrome: z.enum(["header", "footer", "all"]).optional(),
  requestedBy: z.string().min(1)
});

export const workflowClipboardResponseSchema = z.object({
  /** Serialized @webflow/XscpData JSON, ready for the clipboard. */
  payload: z.string().min(1),
  sections: z.array(
    z.object({ sectionId: z.string().min(1), sectionName: z.string().min(1) })
  ),
  classCount: z.number().int().nonnegative(),
  warnings: z.array(plannerWarningSchema).default([]),
  /** Chrome header/footer requests: the skeleton behind the payload, for the
   *  detail screen's tree view (one round trip serves review + copy). */
  skeleton: skeletonPlanSchema.optional(),
  /** Chrome header/footer requests: the sliced source markup, for review. */
  sourceCode: z.string().optional()
});

export const workflowSectionRequestSchema = z.object({
  repoId: z.string().min(1),
  webflowSiteId: z.string().min(1),
  webflowPageId: z.string().min(1),
  sectionId: z.string().min(1),
  requestedBy: z.string().min(1),
  mode: workflowModeSchema.default("fullAssist"),
  selectedElementId: z.string().nullable().optional(),
  sharedStyleContext: sharedStyleContextSchema.optional()
});

export const debugSkeletonRequestSchema = z.object({
  code: z.string().min(1),
  inputType: z.enum(["html", "jsx"]),
  sectionName: z.string().min(1).default("Debug section"),
  pageName: z.string().min(1).default("Debug playground"),
  includeContent: z.boolean().default(true),
  sharedStyleContext: sharedStyleContextSchema.optional(),
  /** Compiled CSS to resolve full styling against (enables Copy for Webflow). */
  cssText: z.string().optional()
});

export const debugSkeletonJobStartSchema = z.object({
  jobId: z.string().min(1),
  status: z.literal("pending"),
  pollAfterMs: z.number().int().positive().default(1500)
});

export const debugSkeletonJobTriggerSchema = z.object({
  jobId: z.string().min(1)
});

export const debugSkeletonJobPendingSchema = z.object({
  jobId: z.string().min(1),
  status: z.enum(["pending", "running"]),
  pollAfterMs: z.number().int().positive().default(1500)
});

export const debugSkeletonJobCompletedSchema = z.object({
  jobId: z.string().min(1),
  status: z.literal("completed"),
  skeleton: skeletonPlanSchema
});

export const debugSkeletonJobFailedSchema = z.object({
  jobId: z.string().min(1),
  status: z.literal("failed"),
  error: z.string().min(1)
});

export const debugSkeletonJobResponseSchema = z.discriminatedUnion("status", [
  debugSkeletonJobPendingSchema,
  debugSkeletonJobCompletedSchema,
  debugSkeletonJobFailedSchema
]);

export const workflowSectionPlanJobStartSchema = z.object({
  jobId: z.string().min(1),
  status: z.enum(["pending", "running"]),
  pollAfterMs: z.number().int().positive()
});

export const workflowSectionPlanJobResponseSchema = z.discriminatedUnion("status", [
  z.object({
    jobId: z.string().min(1),
    status: z.enum(["pending", "running"]),
    pollAfterMs: z.number().int().positive()
  }),
  z.object({
    jobId: z.string().min(1),
    status: z.literal("completed"),
    skeleton: skeletonPlanSchema.optional(),
    styling: stylingPlanSchema.optional()
  }),
  z.object({
    jobId: z.string().min(1),
    status: z.literal("failed"),
    error: z.string().min(1)
  })
]);

export const workflowSectionDecisionInputSchema = z.object({
  repoId: z.string().min(1),
  webflowSiteId: z.string().min(1),
  webflowPageId: z.string().min(1),
  sectionId: z.string().min(1),
  requestedBy: z.string().min(1)
});

export const workflowSectionPlacementInputSchema = workflowSectionDecisionInputSchema.extend({
  rootNodeId: z.string().min(1),
  nodeIdMap: z.record(z.string(), z.string()).default({})
});

export const workflowPageCompleteInputSchema = z.object({
  repoId: z.string().min(1),
  webflowSiteId: z.string().min(1),
  webflowPageId: z.string().min(1),
  requestedBy: z.string().min(1)
});

export const v2SessionAccountSchema = z.object({
  id: z.string().min(1),
  login: z.string().min(1),
  displayName: z.string().min(1),
  kind: z.enum(["installation", "user", "local", "stored"])
});

export const v2SessionSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().min(1),
  login: z.string().min(1),
  source: z.enum([
    "github-app",
    "github-token",
    "local-repo",
    "stored-repo",
    "anonymous"
  ]),
  canListRepos: z.boolean(),
  accounts: z.array(v2SessionAccountSchema),
  selectedAccountId: z.string().nullable()
});

export const v2AvailableRepoSchema = z.object({
  id: z.string().min(1),
  owner: z.string().min(1),
  name: z.string().min(1),
  fullName: z.string().min(1),
  repoUrl: z.string().url(),
  defaultBranch: z.string().min(1),
  status: z.enum(["connected", "syncing", "ready", "failed", "available"]),
  source: z.enum(["connected", "installation", "local-fixture", "fallback"]),
  updatedAt: z.string().datetime().nullable(),
  lastSyncedAt: z.string().datetime().nullable(),
  pageCount: z.number().int().nonnegative().default(0),
  sectionCount: z.number().int().nonnegative().default(0),
  needsResync: z.boolean().default(false)
});

export const v2BootstrapDiagnosticsSchema = z.object({
  repoAccessMode: z.enum(["github-app", "github-token", "local-repo", "stored-repo", "none"]),
  repoListingError: z.string().nullable(),
  repoListingAttempted: z.boolean()
});

export const v2BootstrapResponseSchema = z.object({
  session: v2SessionSchema,
  repos: z.array(v2AvailableRepoSchema),
  diagnostics: v2BootstrapDiagnosticsSchema
});

export const componentOpportunitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  componentName: z.string().min(1),
  confidence: z.enum(["high", "medium"]),
  instances: z.number().int().positive(),
  files: z.number().int().positive(),
  sourceFiles: z.array(z.string().min(1)),
  sampleRoutes: z.array(z.string().min(1)),
  selectedByDefault: z.boolean().default(true)
});

export const componentOpportunitiesResponseSchema = z.object({
  repoId: z.string().min(1),
  generatedAt: z.string().datetime(),
  opportunities: z.array(componentOpportunitySchema)
});

export type SharedClass = z.infer<typeof sharedClassSchema>;
export type SharedVariable = z.infer<typeof sharedVariableSchema>;
export type SharedStyleContext = z.infer<typeof sharedStyleContextSchema>;
export type RepoTokenType = z.infer<typeof repoTokenTypeSchema>;
export type RepoToken = z.infer<typeof repoTokenSchema>;
export type RepoTokensResponse = z.infer<typeof repoTokensResponseSchema>;
export type ImportVariablesInput = z.infer<typeof importVariablesInputSchema>;
export type ImportVariablesResult = z.infer<typeof importVariablesResultSchema>;
export type VisualQaViewport = z.infer<typeof visualQaViewportSchema>;
export type VisualQaCompareRequest = z.infer<typeof visualQaCompareRequestSchema>;
export type VisualQaViewportResult = z.infer<typeof visualQaViewportResultSchema>;
export type VisualQaCompareResponse = z.infer<typeof visualQaCompareResponseSchema>;
export type CaptureScanRequest = z.infer<typeof captureScanRequestSchema>;
export type CaptureCandidate = z.infer<typeof captureCandidateSchema>;
export type CaptureScanResponse = z.infer<typeof captureScanResponseSchema>;
export type CaptureExtractRequest = z.infer<typeof captureExtractRequestSchema>;
export type CaptureExtractResponse = z.infer<typeof captureExtractResponseSchema>;
export type SiteStylePlanClassDecision = z.infer<
  typeof siteStylePlanClassDecisionSchema
>;
export type SiteStylePlan = z.infer<typeof siteStylePlanSchema>;
export type SiteStylePlanRequest = z.infer<typeof siteStylePlanRequestSchema>;
export type RepoConnectionInput = z.infer<typeof repoConnectionInputSchema>;
export type RepoRecord = z.infer<typeof repoSchema>;
export type RepoSyncRecord = z.infer<typeof repoSyncSchema>;
export type RepoPageRecord = z.infer<typeof repoPageSchema>;
export type RepoSectionRecord = z.infer<typeof repoSectionSchema>;
export type SectionContext = z.infer<typeof sectionContextSchema>;
export type ProjectContext = z.infer<typeof projectContextSchema>;
export type BuildPlan = z.infer<typeof buildPlanSchema>;
export type BuildPlanRequest = z.infer<typeof buildPlanRequestSchema>;
export type BuildJobRecord = z.infer<typeof buildJobSchema>;
export type BuildResultRecord = z.infer<typeof buildResultSchema>;
export type PlannerWarning = z.infer<typeof plannerWarningSchema>;
export type PlacementMode = z.infer<typeof placementModeSchema>;
export type BindSiteInput = z.infer<typeof bindSiteInputSchema>;
export type CompleteBuildJobInput = z.infer<typeof completeBuildJobInputSchema>;
export type WorkflowMode = z.infer<typeof workflowModeSchema>;
export type SectionWorkflowStatus = z.infer<typeof sectionWorkflowStatusSchema>;
export type SectionMetadata = z.infer<typeof sectionMetadataSchema>;
export type SectionAnalysis = z.infer<typeof sectionAnalysisSchema>;
export type SkeletonPlan = z.infer<typeof skeletonPlanSchema>;
export type StylingPlan = z.infer<typeof stylingPlanSchema>;
export type SectionVerification = z.infer<typeof sectionVerificationSchema>;
export type WebflowSitePage = z.infer<typeof webflowSitePageSchema>;
export type PageMapping = z.infer<typeof pageMappingSchema>;
export type SitePageMappingRow = z.infer<typeof sitePageMappingRowSchema>;
export type SectionWorkflowState = z.infer<typeof sectionWorkflowStateSchema>;
export type SectionRunRecord = z.infer<typeof sectionRunSchema>;
export type WorkflowQueueItem = z.infer<typeof workflowQueueItemSchema>;
export type WorkflowQueueResponse = z.infer<typeof workflowQueueResponseSchema>;
export type PageMappingsUpsertInput = z.infer<typeof pageMappingsUpsertInputSchema>;
export type WorkflowQueueRequest = z.infer<typeof workflowQueueRequestSchema>;
export type WorkflowSectionRequest = z.infer<typeof workflowSectionRequestSchema>;
export type WorkflowClipboardRequest = z.infer<typeof workflowClipboardRequestSchema>;
export type WorkflowClipboardResponse = z.infer<typeof workflowClipboardResponseSchema>;
export type DebugSkeletonRequest = z.infer<typeof debugSkeletonRequestSchema>;
export type DebugSkeletonJobStart = z.infer<typeof debugSkeletonJobStartSchema>;
export type DebugSkeletonJobTrigger = z.infer<typeof debugSkeletonJobTriggerSchema>;
export type DebugSkeletonJobResponse = z.infer<typeof debugSkeletonJobResponseSchema>;
export type WorkflowSectionPlanJobStart = z.infer<
  typeof workflowSectionPlanJobStartSchema
>;
export type WorkflowSectionPlanJobResponse = z.infer<
  typeof workflowSectionPlanJobResponseSchema
>;
export type WorkflowSectionDecisionInput = z.infer<
  typeof workflowSectionDecisionInputSchema
>;
export type WorkflowSectionPlacementInput = z.infer<
  typeof workflowSectionPlacementInputSchema
>;
export type WorkflowPageCompleteInput = z.infer<
  typeof workflowPageCompleteInputSchema
>;
export type V2SessionAccount = z.infer<typeof v2SessionAccountSchema>;
export type V2Session = z.infer<typeof v2SessionSchema>;
export type V2AvailableRepo = z.infer<typeof v2AvailableRepoSchema>;
export type V2BootstrapDiagnostics = z.infer<typeof v2BootstrapDiagnosticsSchema>;
export type V2BootstrapResponse = z.infer<typeof v2BootstrapResponseSchema>;
export type ComponentOpportunity = z.infer<typeof componentOpportunitySchema>;
export type ComponentOpportunitiesResponse = z.infer<
  typeof componentOpportunitiesResponseSchema
>;
