import {
  BuildNode,
  debugSkeletonRequestSchema,
  debugSkeletonJobResponseSchema,
  debugSkeletonJobStartSchema,
  debugSkeletonJobTriggerSchema,
  DebugSkeletonRequest,
  DebugSkeletonJobResponse,
  DebugSkeletonJobStart,
  pageMappingsUpsertInputSchema,
  PageMappingsUpsertInput,
  PlannerWarning,
  sectionAnalysisSchema,
  SectionAnalysis,
  SectionMetadata,
  SectionContext,
  sectionVerificationSchema,
  SectionVerification,
  SectionWorkflowState,
  SharedStyleContext,
  sitePageMappingRowSchema,
  SitePageMappingRow,
  skeletonPlanSchema,
  SkeletonPlan,
  stylingPlanSchema,
  StylingPlan,
  WorkflowMode,
  workflowQueueResponseSchema,
  WorkflowQueueResponse,
  workflowSectionDecisionInputSchema,
  WorkflowSectionDecisionInput,
  workflowSectionPlacementInputSchema,
  WorkflowSectionPlacementInput,
  workflowSectionRequestSchema,
  WorkflowSectionRequest
} from "@wfb/shared/contracts.js";
import { BlobStore } from "../blob/blob-store.js";
import { MisRepoExtractor } from "../extractor/mis-extractor.js";
import { extractAssetReferencesFromSource } from "../extractor/asset-references.js";
import { RepositorySnapshot } from "../github/client.js";
import { HeuristicBuildPlanner } from "../planner/heuristic-planner.js";
import { PlanningProvider, providerWarning } from "../planner/planning-provider.js";
import { serializeSectionContext } from "../planner/section-serializer.js";
import {
  buildFallbackStylingFromSkeleton,
  shouldFallbackStylingPlan
} from "../planner/style-fallback.js";
import { AppRepository } from "../repositories/app-repository.js";
import { dedupe } from "@wfb/shared/client-first.js";
import { nowIso, stableId } from "../utils.js";
import { createProjectContext } from "./project-context.js";

interface DebugSkeletonJobRecord {
  jobId: string;
  status: "pending" | "running" | "completed" | "failed";
  request: DebugSkeletonRequest;
  skeleton?: SkeletonPlan;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

function emptySharedStyleContext(siteId: string): SharedStyleContext {
  return {
    siteId,
    capturedAt: new Date().toISOString(),
    classes: [],
    variables: [],
    styleIds: []
  };
}

function titleCaseSectionKey(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function summarizeLayout(contentCount: number, layoutHints: string[]): string {
  const hints = layoutHints.map((hint) => hint.toLowerCase());
  const parts: string[] = [];
  if (hints.some((hint) => hint.includes("heading"))) {
    parts.push("a heading");
  }
  if (contentCount > 0) {
    parts.push(`about ${contentCount} extracted content items`);
  }
  if (hints.some((hint) => hint.includes("card"))) {
    parts.push("card-based groups");
  }
  if (hints.some((hint) => hint.includes("grid"))) {
    parts.push("a grid layout");
  }
  if (hints.some((hint) => hint.includes("flex"))) {
    parts.push("flex-driven layout");
  }
  if (hints.some((hint) => hint.includes("cta"))) {
    parts.push("CTA affordances");
  }
  return parts.length ? parts.join(", ") : "custom section structure";
}

function deterministicAnalysis(input: {
  metadata: SectionMetadata;
  sourceCode: string;
  serializedSection: {
    summary: string;
    content: Array<{ kind: string; label: string; value: string }>;
    layoutHints: string[];
    sourceExcerpt: string;
  };
  section: { name: string; sectionKey: string };
  sharedStyleContext: SharedStyleContext;
}): SectionAnalysis {
  const { metadata, serializedSection, section, sharedStyleContext } = input;
  const lowerSource = serializedSection.sourceExcerpt.toLowerCase();
  const content = serializedSection.content.slice(0, 12);
  const recommendedMode =
    section.sectionKey === "hero" ? "fullAssist" : "styleExisting";

  const reusableClasses = dedupe(
    sharedStyleContext.classes
      .map((item) => item.name)
      .filter((name) => {
        const lower = name.toLowerCase();
        return (
          lower.includes("heading") ||
          lower.includes("text") ||
          lower.includes("padding") ||
          lower.includes("margin") ||
          lower.includes("container") ||
          lower.includes("wrapper") ||
          lower.includes("tag")
        );
      })
  ).slice(0, 16);

  const suggestedNewClasses = dedupe([
    `section_${section.sectionKey}`,
    `${section.sectionKey}_layout`,
    `${section.sectionKey}_content`,
    serializedSection.layoutHints.some((hint) => hint.includes("grid"))
      ? `${section.sectionKey}_grid`
      : null,
    serializedSection.layoutHints.some((hint) => hint.includes("card"))
      ? `${section.sectionKey}_card`
      : null
  ].filter((value): value is string => Boolean(value)));

  const warnings = dedupe([
    lowerSource.includes("#")
      ? "Source includes hardcoded color values. Prefer project color variables or approved text/color classes."
      : null,
    /class(name)?=.*(home|page|solv-|hero-|services-)/i.test(serializedSection.sourceExcerpt)
      ? "Source uses page- or section-scoped class patterns. Rename them to Client-First-compatible functional classes in Webflow."
      : null,
    lowerSource.includes("motion") || lowerSource.includes("whileinview")
      ? "React motion settings will not transfer directly. Recreate only if needed after layout is correct."
      : null,
    serializedSection.layoutHints.some((hint) => hint.includes("card"))
      ? "This section has structural card patterns, so styling an existing skeleton is likely faster than one-shot generation."
      : null
  ].filter((value): value is string => Boolean(value))).map((message, index) =>
    providerWarning(`deterministic-analysis-${index}`, message)
  );

  const summary = `${titleCaseSectionKey(section.sectionKey)} section with ${summarizeLayout(
    content.length,
    serializedSection.layoutHints
  )}.`;

  const goals = dedupe([
    "Preserve the section hierarchy from the repo source before styling.",
    recommendedMode === "styleExisting"
      ? "Use the current Webflow structure as the styling target to move faster."
      : "Generate a lightweight skeleton only where structure is still missing.",
    "Reuse shared typography, spacing, and utility classes where possible.",
    "Keep new classes Client-First-compatible and section-functional."
  ]);

  return sectionAnalysisSchema.parse({
    sectionMetadata: metadata,
    summary,
    sourceCode: input.sourceCode,
    goals,
    content,
    recommendedMode,
    reusableClasses,
    suggestedNewClasses,
    warnings
  });
}

function hasProviderFallbackWarning(
  warnings: PlannerWarning[],
  stage: "skeleton" | "styling" | "verification"
) {
  return warnings.some(
    (warning) =>
      warning.code === `${stage}-fallback` ||
      warning.code === `${stage}-error`
  );
}

function describeNodeTree(
  node: BuildNode,
  depth = 0
): string[] {
  const indent = "  ".repeat(depth);
  const classSuffix = node.classNames.length ? `.${node.classNames.join(".")}` : "";
  const labelSuffix = node.textContent ? ` "${node.textContent}"` : "";
  const current = `${indent}${node.tag}${classSuffix}${labelSuffix}`;
  return [current, ...node.children.flatMap((child) => describeNodeTree(child, depth + 1))];
}

function countAssignedClasses(node: BuildNode): number {
  return (
    node.classNames.length +
    node.children.reduce((total, child) => total + countAssignedClasses(child), 0)
  );
}

function deterministicSkeleton(input: {
  metadata: SectionMetadata;
  sectionContext: SectionContext;
  projectContext: ReturnType<typeof createProjectContext>;
  sharedStyleContext: SharedStyleContext;
  inheritedWarnings?: PlannerWarning[];
}): SkeletonPlan {
  const planner = new HeuristicBuildPlanner();
  const plan = planner.plan({
    pageId: input.metadata.pageId,
    sectionId: input.metadata.sectionId,
    sectionContext: input.sectionContext,
    projectContext: input.projectContext,
    sharedStyleContext: input.sharedStyleContext
  });

  const reusableClasses = dedupe(
    plan.classAssignments.flatMap((assignment) => assignment.reused)
  );
  const suggestedNewClasses = dedupe(
    plan.classAssignments.flatMap((assignment) => assignment.created)
  );

  return skeletonPlanSchema.parse({
    sectionMetadata: input.metadata,
    treeText: describeNodeTree(plan.elementTree).join("\n"),
    elementTree: plan.elementTree,
    assetBindings: plan.assetBindings,
    reusableClasses,
    suggestedNewClasses,
    warnings: [
      providerWarning(
        "deterministic-skeleton-primary",
        "Skeleton structure and classes were generated deterministically from the repo index and shared site styles.",
        "info"
      ),
      ...(input.inheritedWarnings ?? []),
      ...plan.warnings
    ]
  });
}

function deterministicStyling(input: {
  metadata: SectionMetadata;
  mode: WorkflowMode;
  sectionContext: SectionContext;
  projectContext: ReturnType<typeof createProjectContext>;
  sharedStyleContext: SharedStyleContext;
  inheritedWarnings?: PlannerWarning[];
}): StylingPlan {
  const planner = new HeuristicBuildPlanner();
  const plan = planner.plan({
    pageId: input.metadata.pageId,
    sectionId: input.metadata.sectionId,
    sectionContext: input.sectionContext,
    projectContext: input.projectContext,
    sharedStyleContext: input.sharedStyleContext
  });

  const reusableClasses = dedupe(
    plan.classAssignments.flatMap((assignment) => assignment.reused)
  );
  const suggestedNewClasses = dedupe(
    plan.classAssignments.flatMap((assignment) => assignment.created)
  );

  return stylingPlanSchema.parse({
    sectionMetadata: input.metadata,
    mode: input.mode,
    styleDefinitions: plan.styleDefinitions,
    variableBindings: plan.variableBindings,
    reusableClasses,
    suggestedNewClasses,
    requiredClassNames: suggestedNewClasses,
    notes: [
      "Using deterministic styling fallback derived from repo structure and shared site classes.",
      "Review the styled section visually before approval."
    ],
    warnings: [...(input.inheritedWarnings ?? []), ...plan.warnings]
  });
}

function deterministicVerification(input: {
  metadata: SectionMetadata;
  inheritedWarnings?: PlannerWarning[];
}): SectionVerification {
  return sectionVerificationSchema.parse({
    sectionMetadata: input.metadata,
    summary:
      "Automated verification fallback was used. Review the current section visually, then approve if it matches the source intent.",
    readyForApproval: true,
    warnings: [
      ...(input.inheritedWarnings ?? []),
      providerWarning(
        "verification-manual-review",
        "OpenAI verification was unavailable, so approval has been unlocked for manual review."
      )
    ]
  });
}

function warnOnOutOfPlanClasses(
  styling: StylingPlan,
  allowedClassNames: Set<string>
): StylingPlan {
  const plannedWarnings = styling.warnings.filter(
    (warning) => warning.code !== "style-plan-unplanned-class"
  );
  const plannedClasses = dedupe([
    ...styling.styleDefinitions.map((definition) => definition.className),
    ...styling.requiredClassNames,
    ...styling.suggestedNewClasses
  ]);
  const unplanned = plannedClasses.filter((className) => !allowedClassNames.has(className));
  if (unplanned.length === 0) {
    return {
      ...styling,
      warnings: plannedWarnings
    };
  }
  return {
    ...styling,
    warnings: [
      ...plannedWarnings,
      providerWarning(
        "style-plan-unplanned-class",
        `Styling references classes outside the confirmed site style plan: ${unplanned.slice(0, 12).join(", ")}. Confirm the global plan before creating these classes.`,
        "warning"
      )
    ]
  };
}

export class WorkflowService {
  constructor(
    private readonly repository: AppRepository,
    private readonly blobStore: BlobStore,
    private readonly extractor: MisRepoExtractor,
    private readonly planningProvider: PlanningProvider
  ) {}

  private async getSnapshot(repoId: string): Promise<RepositorySnapshot> {
    const snapshot = await this.blobStore.getJson<RepositorySnapshot>(
      `repos/${repoId}/snapshots/latest.json`
    );
    if (!snapshot) {
      throw new Error("Repo has not been synced yet.");
    }
    return snapshot;
  }

  private async getSharedStyleContext(
    siteId: string,
    incoming?: SharedStyleContext
  ): Promise<SharedStyleContext> {
    if (incoming) {
      await this.repository.saveSharedStyleContext(siteId, incoming);
      return incoming;
    }
    return (
      (await this.repository.getSharedStyleContext(siteId)) ??
      emptySharedStyleContext(siteId)
    );
  }

  private async assertSiteBinding(
    repoId: string,
    userId: string,
    siteId: string
  ): Promise<void> {
    const binding = await this.repository.getSiteBinding(repoId, userId);
    if (binding?.webflowSiteId === siteId) {
      return;
    }
    if (binding && binding.webflowSiteId !== siteId) {
      throw new Error("Requested Webflow site does not match the bound site.");
    }

    const mappings = await this.repository.getPageMappings(repoId, siteId, userId);
    if (mappings.length > 0) {
      await this.repository.upsertSiteBinding({
        repoId,
        webflowSiteId: siteId,
        requestedBy: userId,
        rulesetName: "recovered-from-page-mappings"
      });
      return;
    }

    throw new Error("Repo is not bound to a Webflow site for this user.");
  }

  private async toSitePageMappingRows(
    repoId: string,
    webflowSiteId: string,
    userId: string
  ): Promise<SitePageMappingRow[]> {
    const [mappings, pages] = await Promise.all([
      this.repository.getPageMappings(repoId, webflowSiteId, userId),
      this.repository.getPages(repoId)
    ]);
    const pageNameById = new Map(pages.map((page) => [page.id, page.name]));
    return mappings.map((mapping) =>
      sitePageMappingRowSchema.parse({
        webflowSiteId,
        webflowPageId: mapping.webflowPageId,
        webflowPageName: mapping.webflowPageName,
        webflowPageRoute: mapping.webflowPageRoute,
        repoPageId: mapping.repoPageId,
        repoPageName: mapping.repoPageId
          ? (pageNameById.get(mapping.repoPageId) ?? null)
          : null,
        mappingStatus: mapping.repoPageId ? "mapped" : "unmapped"
      })
    );
  }

  async getSitePages(
    repoId: string,
    webflowSiteId: string,
    userId: string
  ): Promise<SitePageMappingRow[]> {
    await this.assertSiteBinding(repoId, userId, webflowSiteId);
    return this.toSitePageMappingRows(repoId, webflowSiteId, userId);
  }

  async upsertPageMappings(input: PageMappingsUpsertInput): Promise<SitePageMappingRow[]> {
    pageMappingsUpsertInputSchema.parse(input);
    await this.assertSiteBinding(input.repoId, input.requestedBy, input.webflowSiteId);
    await this.repository.upsertPageMappings(input);
    return this.toSitePageMappingRows(
      input.repoId,
      input.webflowSiteId,
      input.requestedBy
    );
  }

  async getPageMappings(
    repoId: string,
    webflowSiteId: string,
    userId: string
  ): Promise<SitePageMappingRow[]> {
    await this.assertSiteBinding(repoId, userId, webflowSiteId);
    return this.toSitePageMappingRows(repoId, webflowSiteId, userId);
  }

  async getQueue(
    repoId: string,
    webflowSiteId: string,
    webflowPageId: string,
    userId: string
  ): Promise<WorkflowQueueResponse> {
    await this.assertSiteBinding(repoId, userId, webflowSiteId);
    const [rows, sections] = await Promise.all([
      this.toSitePageMappingRows(repoId, webflowSiteId, userId),
      this.repository.getSections(repoId)
    ]);
    const mapping = rows.find((row) => row.webflowPageId === webflowPageId) ?? null;
    if (!mapping || !mapping.repoPageId) {
      return workflowQueueResponseSchema.parse({
        mapping,
        repoPage: null,
        items: [],
        nextSectionId: null
      });
    }

    const repoPage = await this.repository.getPage(mapping.repoPageId);
    if (!repoPage) {
      throw new Error("Mapped repo page no longer exists.");
    }

    const pageSections = sections
      .filter((section) => section.pageId === repoPage.id)
      .sort((left, right) => left.sortOrder - right.sortOrder);
    const states = await this.repository.replaceSectionWorkflowStates(
      userId,
      webflowSiteId,
      webflowPageId,
      repoPage.id,
      pageSections.map((section) => ({
        repoSectionId: section.id,
        sortOrder: section.sortOrder
      }))
    );
    const stateBySection = new Map(states.map((state) => [state.repoSectionId, state]));
    const items = pageSections.map((section) => {
      const state = stateBySection.get(section.id);
      return {
        repoSectionId: section.id,
        sectionName: section.name,
        sortOrder: section.sortOrder,
        status: state?.status ?? "not_started",
        recommendedMode:
          section.sectionKey === "hero" ? "fullAssist" : "styleExisting",
        lastRunId: state?.lastRunId ?? null,
        placedRootNodeId: state?.placedRootNodeId ?? null,
        skeletonApprovedAt: state?.skeletonApprovedAt ?? null
      };
    });
    const nextItem =
      items.find((item) => !["approved", "skipped"].includes(item.status)) ?? null;

    return workflowQueueResponseSchema.parse({
      mapping,
      repoPage,
      items,
      nextSectionId: nextItem?.repoSectionId ?? null
    });
  }

  private async getSectionStateContext(request: WorkflowSectionRequest) {
    workflowSectionRequestSchema.parse(request);
    await this.assertSiteBinding(
      request.repoId,
      request.requestedBy,
      request.webflowSiteId
    );

    const mappings = await this.repository.getPageMappings(
      request.repoId,
      request.webflowSiteId,
      request.requestedBy
    );
    const mapping =
      mappings.find((item) => item.webflowPageId === request.webflowPageId) ?? null;
    if (!mapping?.repoPageId) {
      throw new Error("Current Webflow page is not mapped to a repo page.");
    }

    const repoPage = await this.repository.getPage(mapping.repoPageId);
    if (!repoPage) {
      throw new Error("Mapped repo page no longer exists.");
    }

    const section = await this.repository.getSection(request.sectionId);
    if (!section || section.pageId !== repoPage.id) {
      throw new Error("Selected repo section does not belong to the mapped repo page.");
    }

    const snapshot = await this.getSnapshot(request.repoId);
    const sharedStyleContext = await this.getSharedStyleContext(
      request.webflowSiteId,
      request.sharedStyleContext
    );
    const sectionContext = this.extractor.buildSectionContext({
      repoId: request.repoId,
      page: repoPage,
      section,
      snapshot,
      sharedStyleContext
    });
    const serializedSection = serializeSectionContext(sectionContext);
    const metadata = {
      repoId: request.repoId,
      pageId: repoPage.id,
      sectionId: section.id,
      pageName: repoPage.name,
      sectionName: section.name,
      sourceFile: section.sourceFile
    };
    const projectContext = createProjectContext(sharedStyleContext);
    const state =
      (
        await this.repository.getSectionWorkflowStates(
          request.requestedBy,
          request.webflowSiteId,
          request.webflowPageId,
          repoPage.id
        )
      ).find((item) => item.repoSectionId === section.id) ?? null;

    return {
      queue: {
        mapping: {
          id: mapping.id,
          webflowSiteId: mapping.webflowSiteId,
          webflowPageId: mapping.webflowPageId,
          webflowPageName: mapping.webflowPageName,
          webflowPageRoute: mapping.webflowPageRoute,
          repoId: mapping.repoId,
          repoPageId: mapping.repoPageId,
          userId: mapping.userId
        },
        repoPage,
        items: [],
        nextSectionId: null
      },
      state,
      section,
      metadata,
      projectContext,
      sharedStyleContext,
      sectionContext,
      serializedSection
    };
  }

  private async getLightweightSectionContext(request: WorkflowSectionRequest) {
    workflowSectionRequestSchema.parse(request);
    await this.assertSiteBinding(
      request.repoId,
      request.requestedBy,
      request.webflowSiteId
    );

    const mappings = await this.repository.getPageMappings(
      request.repoId,
      request.webflowSiteId,
      request.requestedBy
    );
    const mapping =
      mappings.find((item) => item.webflowPageId === request.webflowPageId) ?? null;
    if (!mapping?.repoPageId) {
      throw new Error("Current Webflow page is not mapped to a repo page.");
    }

    const repoPage = await this.repository.getPage(mapping.repoPageId);
    if (!repoPage) {
      throw new Error("Mapped repo page no longer exists.");
    }

    const section = await this.repository.getSection(request.sectionId);
    if (!section || section.pageId !== repoPage.id) {
      throw new Error("Selected repo section does not belong to the mapped repo page.");
    }

    const snapshot = await this.getSnapshot(request.repoId);
    const sharedStyleContext = await this.getSharedStyleContext(request.webflowSiteId);
    const sectionContext = this.extractor.buildSectionContext({
      repoId: request.repoId,
      page: repoPage,
      section,
      snapshot,
      sharedStyleContext
    });
    const metadata = {
      repoId: request.repoId,
      pageId: repoPage.id,
      sectionId: section.id,
      pageName: repoPage.name,
      sectionName: section.name,
      sourceFile: section.sourceFile
    };
    const state =
      (
        await this.repository.getSectionWorkflowStates(
          request.requestedBy,
          request.webflowSiteId,
          request.webflowPageId,
          repoPage.id
        )
      ).find((item) => item.repoSectionId === section.id) ?? null;

    return {
      queue: {
        mapping: {
          id: mapping.id,
          webflowSiteId: mapping.webflowSiteId,
          webflowPageId: mapping.webflowPageId,
          webflowPageName: mapping.webflowPageName,
          webflowPageRoute: mapping.webflowPageRoute,
          repoId: mapping.repoId,
          repoPageId: mapping.repoPageId,
          userId: mapping.userId
        },
        repoPage,
        items: [],
        nextSectionId: null
      },
      state,
      section,
      metadata,
      sectionContext,
      sharedStyleContext
    };
  }

  private minimalSerializedSection(input: {
    pageName: string;
    pageSourceFile: string;
    section: {
      name: string;
      sectionKey: string;
      sourceFile: string;
      componentName: string;
      sortOrder: number;
      metadata: Record<string, unknown>;
    };
  }) {
    return {
      summary: `${input.section.name} on ${input.pageName}. Use indexed repo structure and shared site classes to guide the workflow.`,
      content: [],
      assetReferences: [],
      layoutHints: [
        `section family: ${input.section.sectionKey}`,
        `component: ${input.section.componentName}`
      ],
      sourceExcerpt: JSON.stringify(input.section.metadata ?? {})
    };
  }

  private minimalSectionContext(input: {
    repoId: string;
    pageName: string;
    pageSourceFile: string;
    section: {
      name: string;
      sourceFile: string;
      componentName: string;
      sortOrder: number;
    };
  }): SectionContext {
    return {
      repoId: input.repoId,
      pageName: input.pageName,
      pageSourceFile: input.pageSourceFile,
      sectionName: input.section.name,
      sectionSourceFile: input.section.sourceFile,
      componentName: input.section.componentName,
      sectionOrder: input.section.sortOrder,
      sourceCode: "deterministic skeleton fallback",
      relevantStylesheets: [],
      assetReferences: [],
      contentHints: [],
      relatedSharedClasses: []
    };
  }

  private async persistRun(
    request: WorkflowSectionRequest,
    repoPageId: string,
    sectionId: string,
    runType: "analysis" | "skeleton" | "styling" | "verification",
    payload: Record<string, unknown>
  ): Promise<string> {
    const runId = stableId(
      request.requestedBy,
      request.webflowPageId,
      sectionId,
      runType,
      nowIso()
    );
    await this.repository.saveSectionRun({
      id: runId,
      userId: request.requestedBy,
      repoId: request.repoId,
      webflowSiteId: request.webflowSiteId,
      webflowPageId: request.webflowPageId,
      repoPageId,
      repoSectionId: sectionId,
      runType,
      payload,
      approvalOutcome: null,
      createdAt: nowIso(),
      approvedAt: null
    });
    return runId;
  }

  private async updateState(
    existing: SectionWorkflowState | null,
    status: SectionWorkflowState["status"],
    lastRunId: string | null
  ): Promise<void> {
    if (!existing) {
      return;
    }
    const completedAt = status === "approved" ? nowIso() : existing.completedAt;
    const skippedAt = status === "skipped" ? nowIso() : existing.skippedAt;
    const skeletonPlacedAt =
      status === "skeleton_placed" ? nowIso() : existing.skeletonPlacedAt;
    const skeletonApprovedAt =
      status === "skeleton_approved" ? nowIso() : existing.skeletonApprovedAt;
    const styledAt = status === "styled" ? nowIso() : existing.styledAt;
    await this.repository.updateSectionWorkflowState({
      ...existing,
      status,
      lastRunId,
      updatedAt: nowIso(),
      completedAt,
      skippedAt,
      skeletonPlacedAt,
      skeletonApprovedAt,
      styledAt
    });
  }

  async analyzeSection(request: WorkflowSectionRequest): Promise<SectionAnalysis> {
    const context = await this.getLightweightSectionContext(request);
    const analysis = deterministicAnalysis({
      metadata: context.metadata,
      sourceCode: context.sectionContext.sourceCode,
      serializedSection: this.minimalSerializedSection({
        pageName: context.queue.repoPage!.name,
        pageSourceFile: context.queue.repoPage!.sourceFile,
        section: context.section
      }),
      section: {
        name: context.section.name,
        sectionKey: context.section.sectionKey
      },
      sharedStyleContext: context.sharedStyleContext
    });
    const runId = await this.persistRun(
      request,
      context.queue.repoPage!.id,
      request.sectionId,
      "analysis",
      analysis
    );
    await this.updateState(context.state, "in_progress", runId);
    return analysis;
  }

  async generateSkeleton(request: WorkflowSectionRequest): Promise<SkeletonPlan> {
    const context = await this.getSectionStateContext(request);
    const skeleton = deterministicSkeleton({
      metadata: context.metadata,
      sectionContext: context.sectionContext,
      projectContext: context.projectContext,
      sharedStyleContext: context.sharedStyleContext
    });

    const runId = await this.persistRun(
      request,
      context.queue.repoPage!.id,
      request.sectionId,
      "skeleton",
      skeleton
    );
    await this.updateState(context.state, "skeleton_ready", runId);
    return skeleton;
  }

  async generateDebugSkeleton(input: DebugSkeletonRequest): Promise<SkeletonPlan> {
    const request = debugSkeletonRequestSchema.parse(input);
    return this.generateDebugSkeletonDirect(request);
  }

  private debugSkeletonJobKey(jobId: string): string {
    return `debug-skeleton-job:${jobId}`;
  }

  private async saveDebugSkeletonJob(job: DebugSkeletonJobRecord): Promise<void> {
    await this.blobStore.putJson(this.debugSkeletonJobKey(job.jobId), job);
  }

  private async getDebugSkeletonJobRecord(jobId: string): Promise<DebugSkeletonJobRecord | null> {
    return this.blobStore.getJson<DebugSkeletonJobRecord>(this.debugSkeletonJobKey(jobId));
  }

  private buildDebugSkeletonProviderInput(request: DebugSkeletonRequest) {
    const sharedStyleContext =
      request.sharedStyleContext ?? emptySharedStyleContext("debug-site");
    const componentName = request.sectionName
      .replace(/[^a-z0-9]+/gi, " ")
      .trim()
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("") || "DebugSection";
    const sourceFile =
      request.inputType === "html"
        ? "debug://pasted-section.html"
        : "debug://PastedSection.tsx";
    const assetReferences = dedupe(
      extractAssetReferencesFromSource({
        sourceCode: request.code
      })
    );
    const sectionContext = {
      repoId: "debug-playground",
      pageName: request.pageName,
      pageSourceFile: "debug://page",
      sectionName: request.sectionName,
      sectionSourceFile: sourceFile,
      componentName,
      sectionOrder: 0,
      sourceCode: request.code,
      relevantStylesheets: [],
      assetReferences,
      contentHints: [],
      relatedSharedClasses: sharedStyleContext.classes.map((item) => item.name).slice(0, 60)
    } satisfies SectionContext;
    const metadata = {
      repoId: "debug-playground",
      pageId: stableId("debug-page", request.pageName),
      sectionId: stableId("debug-section", request.sectionName, request.inputType, request.code),
      pageName: request.pageName,
      sectionName: request.sectionName,
      sourceFile
    };
    return {
      metadata,
      mode: "fullAssist" as const,
      sectionContext,
      serializedSection: serializeSectionContext(sectionContext, {
        includeContent: request.includeContent
      }),
      projectContext: createProjectContext(sharedStyleContext),
      sharedStyleContext,
      includeContent: request.includeContent,
      selectedElementId: null
    };
  }

  private async generateDebugSkeletonDirect(
    request: DebugSkeletonRequest,
    options?: { openAiTimeoutMs?: number }
  ): Promise<SkeletonPlan> {
    const providerInput = {
      ...this.buildDebugSkeletonProviderInput(request),
      openAiTimeoutMs: options?.openAiTimeoutMs
    };
    const skeleton = skeletonPlanSchema.parse(
      await this.planningProvider.generateSkeleton(providerInput)
    );

    if (countAssignedClasses(skeleton.elementTree) === 0) {
      throw new Error(
        "OpenAI skeleton output omitted class names. Use Regenerate to retry."
      );
    }

    return skeleton;
  }

  async startDebugSkeletonJob(input: DebugSkeletonRequest): Promise<DebugSkeletonJobStart> {
    const request = debugSkeletonRequestSchema.parse(input);
    const jobId = stableId("debug-skeleton", request.sectionName, request.inputType, request.code, nowIso());
    const now = nowIso();
    await this.saveDebugSkeletonJob({
      jobId,
      status: "pending",
      request,
      createdAt: now,
      updatedAt: now
    });
    return debugSkeletonJobStartSchema.parse({
      jobId,
      status: "pending",
      pollAfterMs: 1500
    });
  }

  async runDebugSkeletonJob(input: { jobId: string }): Promise<void> {
    const trigger = debugSkeletonJobTriggerSchema.parse(input);
    const existing = await this.getDebugSkeletonJobRecord(trigger.jobId);
    if (!existing) {
      throw new Error("Unknown debug skeleton job.");
    }

    await this.saveDebugSkeletonJob({
      ...existing,
      status: "running",
      error: undefined,
      updatedAt: nowIso()
    });

    try {
      const skeleton = await this.generateDebugSkeletonDirect(existing.request, {
        openAiTimeoutMs: 120000
      });
      await this.saveDebugSkeletonJob({
        ...existing,
        status: "completed",
        skeleton,
        error: undefined,
        updatedAt: nowIso()
      });
    } catch (error) {
      await this.saveDebugSkeletonJob({
        ...existing,
        status: "failed",
        skeleton: undefined,
        error: error instanceof Error ? error.message : "Debug skeleton generation failed.",
        updatedAt: nowIso()
      });
    }
  }

  async getDebugSkeletonJob(jobId: string): Promise<DebugSkeletonJobResponse> {
    const job = await this.getDebugSkeletonJobRecord(jobId);
    if (!job) {
      return debugSkeletonJobResponseSchema.parse({
        jobId,
        status: "pending",
        pollAfterMs: 1500
      });
    }
    if (job.status === "completed" && job.skeleton) {
      return debugSkeletonJobResponseSchema.parse({
        jobId,
        status: "completed",
        skeleton: job.skeleton
      });
    }
    if (job.status === "failed") {
      return debugSkeletonJobResponseSchema.parse({
        jobId,
        status: "failed",
        error: job.error ?? "Debug skeleton generation failed."
      });
    }
    return debugSkeletonJobResponseSchema.parse({
      jobId,
      status: job.status,
      pollAfterMs: 1500
    });
  }

  async styleSection(request: WorkflowSectionRequest): Promise<StylingPlan> {
    const context = await this.getSectionStateContext(request);
    if (context.state?.status !== "skeleton_approved") {
      throw new Error("Approve the placed skeleton before applying styles.");
    }
    const latestSkeletonRun = await this.repository.getLatestSectionRun(
      request.requestedBy,
      request.webflowSiteId,
      request.webflowPageId,
      request.sectionId,
      "skeleton"
    );
    const latestSkeleton =
      latestSkeletonRun?.payload
        ? skeletonPlanSchema.safeParse(latestSkeletonRun.payload).data ?? null
        : null;

    const providerInput = {
      metadata: context.metadata,
      mode: request.mode,
      sectionContext: context.sectionContext,
      serializedSection: context.serializedSection,
      projectContext: context.projectContext,
      sharedStyleContext: context.sharedStyleContext,
      selectedElementId: request.selectedElementId ?? null
    };

    const deterministicPrimary = latestSkeleton
      ? buildFallbackStylingFromSkeleton({
          metadata: context.metadata,
          mode: request.mode,
          sectionContext: context.sectionContext,
          sharedStyleContext: context.sharedStyleContext,
          skeleton: latestSkeleton,
          inheritedWarnings: [
            providerWarning(
              "deterministic-styling-primary",
              "Styling was derived deterministically from the latest skeleton and repo source before provider refinement.",
              "info"
            )
          ]
        })
      : deterministicStyling({
          metadata: context.metadata,
          mode: request.mode,
          sectionContext: context.sectionContext,
          projectContext: context.projectContext,
          sharedStyleContext: context.sharedStyleContext,
          inheritedWarnings: [
            providerWarning(
              "deterministic-styling-primary",
              "Styling was derived deterministically from the repo source before provider refinement.",
              "info"
            )
          ]
        });

    let styling: StylingPlan = deterministicPrimary;
    try {
      const providerStyling = stylingPlanSchema.parse(
        await this.planningProvider.generateStylingPlan(providerInput)
      );
      if (!shouldFallbackStylingPlan(providerStyling)) {
        styling = {
          ...providerStyling,
          styleDefinitions:
            providerStyling.styleDefinitions.length > 0
              ? providerStyling.styleDefinitions
              : deterministicPrimary.styleDefinitions,
          variableBindings:
            providerStyling.variableBindings.length > 0
              ? providerStyling.variableBindings
              : deterministicPrimary.variableBindings,
          requiredClassNames: dedupe([
            ...deterministicPrimary.requiredClassNames,
            ...providerStyling.requiredClassNames
          ]),
          reusableClasses: dedupe([
            ...deterministicPrimary.reusableClasses,
            ...providerStyling.reusableClasses
          ]),
          suggestedNewClasses: dedupe([
            ...deterministicPrimary.suggestedNewClasses,
            ...providerStyling.suggestedNewClasses
          ]),
          warnings: [...deterministicPrimary.warnings, ...providerStyling.warnings],
          notes: [...deterministicPrimary.notes, ...providerStyling.notes]
        };
      }
    } catch (error) {
      styling = {
        ...deterministicPrimary,
        warnings: [
          ...deterministicPrimary.warnings,
          providerWarning(
            "styling-error",
            error instanceof Error ? error.message : "OpenAI styling generation failed."
          )
        ]
      };
    }
    const siteStylePlan = await this.repository.getSiteStylePlan(
      request.repoId,
      request.webflowSiteId
    );
    if (siteStylePlan?.status === "confirmed") {
      styling = warnOnOutOfPlanClasses(
        styling,
        new Set(
          siteStylePlan.classDecisions.map((decision) => decision.targetClassName)
        )
      );
    }
    const runId = await this.persistRun(
      request,
      context.queue.repoPage!.id,
      request.sectionId,
      "styling",
      styling
    );
    await this.updateState(context.state, "styled", runId);
    return styling;
  }

  async verifySection(request: WorkflowSectionRequest): Promise<SectionVerification> {
    const context = await this.getSectionStateContext(request);
    const providerVerification = sectionVerificationSchema.parse(
      await this.planningProvider.verifySection({
        metadata: context.metadata,
        mode: request.mode,
        sectionContext: context.sectionContext,
        serializedSection: context.serializedSection,
        projectContext: context.projectContext,
        sharedStyleContext: context.sharedStyleContext,
        selectedElementId: request.selectedElementId ?? null
      })
    );
    const verification = hasProviderFallbackWarning(
      providerVerification.warnings,
      "verification"
    )
      ? deterministicVerification({
          metadata: context.metadata,
          inheritedWarnings: providerVerification.warnings
        })
      : providerVerification;
    await this.persistRun(
      request,
      context.queue.repoPage!.id,
      request.sectionId,
      "verification",
      verification
    );
    return verification;
  }

  async recordSkeletonPlacement(
    input: WorkflowSectionPlacementInput
  ): Promise<WorkflowQueueResponse> {
    const placement = workflowSectionPlacementInputSchema.parse(input);
    const queue = await this.getQueue(
      placement.repoId,
      placement.webflowSiteId,
      placement.webflowPageId,
      placement.requestedBy
    );
    if (!queue.mapping?.repoPageId) {
      throw new Error("Current Webflow page is not mapped to a repo page.");
    }
    const states = await this.repository.getSectionWorkflowStates(
      placement.requestedBy,
      placement.webflowSiteId,
      placement.webflowPageId,
      queue.mapping.repoPageId
    );
    const state = states.find((item) => item.repoSectionId === placement.sectionId);
    if (!state) {
      throw new Error("Section workflow state was not found.");
    }
    const timestamp = nowIso();
    await this.repository.updateSectionWorkflowState({
      ...state,
      status: "skeleton_placed",
      placedRootNodeId: placement.rootNodeId,
      nodeIdMap: placement.nodeIdMap,
      updatedAt: timestamp,
      skeletonPlacedAt: timestamp
    });
    return this.getQueue(
      placement.repoId,
      placement.webflowSiteId,
      placement.webflowPageId,
      placement.requestedBy
    );
  }

  async approveSkeleton(
    input: WorkflowSectionDecisionInput
  ): Promise<WorkflowQueueResponse> {
    workflowSectionDecisionInputSchema.parse(input);
    const queue = await this.getQueue(
      input.repoId,
      input.webflowSiteId,
      input.webflowPageId,
      input.requestedBy
    );
    if (!queue.mapping?.repoPageId) {
      throw new Error("Current Webflow page is not mapped to a repo page.");
    }
    const states = await this.repository.getSectionWorkflowStates(
      input.requestedBy,
      input.webflowSiteId,
      input.webflowPageId,
      queue.mapping.repoPageId
    );
    const state = states.find((item) => item.repoSectionId === input.sectionId);
    if (!state) {
      throw new Error("Section workflow state was not found.");
    }
    if (!state.placedRootNodeId) {
      throw new Error("Place the skeleton on the canvas before approval.");
    }
    const timestamp = nowIso();
    await this.repository.updateSectionWorkflowState({
      ...state,
      status: "skeleton_approved",
      updatedAt: timestamp,
      skeletonApprovedAt: timestamp
    });
    return this.getQueue(
      input.repoId,
      input.webflowSiteId,
      input.webflowPageId,
      input.requestedBy
    );
  }

  private async markDecision(
    input: WorkflowSectionDecisionInput,
    status: "approved" | "skipped"
  ): Promise<WorkflowQueueResponse> {
    workflowSectionDecisionInputSchema.parse(input);
    await this.assertSiteBinding(input.repoId, input.requestedBy, input.webflowSiteId);
    const queue = await this.getQueue(
      input.repoId,
      input.webflowSiteId,
      input.webflowPageId,
      input.requestedBy
    );
    if (!queue.mapping?.repoPageId) {
      throw new Error("Current Webflow page is not mapped to a repo page.");
    }

    const states = await this.repository.getSectionWorkflowStates(
      input.requestedBy,
      input.webflowSiteId,
      input.webflowPageId,
      queue.mapping.repoPageId
    );
    const state = states.find((item) => item.repoSectionId === input.sectionId);
    if (!state) {
      throw new Error("Section workflow state was not found.");
    }

    const latestRun = await this.repository.getLatestSectionRun(
      input.requestedBy,
      input.webflowSiteId,
      input.webflowPageId,
      input.sectionId
    );
    if (latestRun) {
      await this.repository.saveSectionRun({
        ...latestRun,
        approvalOutcome: status,
        approvedAt: nowIso()
      });
    }

    await this.repository.updateSectionWorkflowState({
      ...state,
      status,
      updatedAt: nowIso(),
      completedAt: status === "approved" ? nowIso() : state.completedAt,
      skippedAt: status === "skipped" ? nowIso() : state.skippedAt
    });

    return this.getQueue(
      input.repoId,
      input.webflowSiteId,
      input.webflowPageId,
      input.requestedBy
    );
  }

  async approveSection(input: WorkflowSectionDecisionInput): Promise<WorkflowQueueResponse> {
    return this.markDecision(input, "approved");
  }

  async skipSection(input: WorkflowSectionDecisionInput): Promise<WorkflowQueueResponse> {
    return this.markDecision(input, "skipped");
  }

  async completePage(
    repoId: string,
    webflowSiteId: string,
    webflowPageId: string,
    userId: string
  ): Promise<WorkflowQueueResponse> {
    const queue = await this.getQueue(repoId, webflowSiteId, webflowPageId, userId);
    const unfinished = queue.items.filter(
      (item) => !["approved", "skipped"].includes(item.status)
    );
    if (unfinished.length > 0) {
      throw new Error("Page still has unfinished sections.");
    }
    return queue;
  }
}
