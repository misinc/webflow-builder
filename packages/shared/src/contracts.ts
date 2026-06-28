import { z } from "zod";

export interface BuildNode {
  id: string;
  type: string;
  tag: string;
  label?: string;
  classNames: string[];
  textContent?: string;
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
  value: z.string().optional()
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
    textContent: z.string().optional(),
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
  shared: z.boolean().default(false)
});

export const variableBindingSchema = z.object({
  nodeId: z.string().min(1),
  property: z.string().min(1),
  variableName: z.string().min(1)
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
  sharedStyleContext: sharedStyleContextSchema.optional()
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
  sectionCount: z.number().int().nonnegative().default(0)
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
