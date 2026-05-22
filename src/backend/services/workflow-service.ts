import {
  pageMappingsUpsertInputSchema,
  PageMappingsUpsertInput,
  PlannerWarning,
  sectionAnalysisSchema,
  SectionAnalysis,
  SectionMetadata,
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
  workflowSectionRequestSchema,
  WorkflowSectionRequest
} from "../../shared/contracts.js";
import { BlobStore } from "../blob/blob-store.js";
import { MisRepoExtractor } from "../extractor/mis-extractor.js";
import { RepositorySnapshot } from "../github/client.js";
import { PlanningProvider, providerWarning } from "../planner/planning-provider.js";
import { serializeSectionContext } from "../planner/section-serializer.js";
import { AppRepository } from "../repositories/app-repository.js";
import { dedupe } from "../../shared/client-first.js";
import { nowIso, stableId } from "../utils.js";
import { createProjectContext } from "./project-context.js";

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
    goals,
    content,
    recommendedMode,
    reusableClasses,
    suggestedNewClasses,
    warnings
  });
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
        lastRunId: state?.lastRunId ?? null
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
    const queue = await this.getQueue(
      request.repoId,
      request.webflowSiteId,
      request.webflowPageId,
      request.requestedBy
    );
    if (!queue.mapping?.repoPageId || !queue.repoPage) {
      throw new Error("Current Webflow page is not mapped to a repo page.");
    }

    const section = await this.repository.getSection(request.sectionId);
    if (!section || section.pageId !== queue.repoPage.id) {
      throw new Error("Selected repo section does not belong to the mapped repo page.");
    }

    const snapshot = await this.getSnapshot(request.repoId);
    const sharedStyleContext = await this.getSharedStyleContext(
      request.webflowSiteId,
      request.sharedStyleContext
    );
    const sectionContext = this.extractor.buildSectionContext({
      repoId: request.repoId,
      page: queue.repoPage,
      section,
      snapshot,
      sharedStyleContext
    });
    const serializedSection = serializeSectionContext(sectionContext);
    const metadata = {
      repoId: request.repoId,
      pageId: queue.repoPage.id,
      sectionId: section.id,
      pageName: queue.repoPage.name,
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
          queue.repoPage.id
        )
      ).find((item) => item.repoSectionId === section.id) ?? null;

    return {
      queue,
      state,
      section,
      metadata,
      projectContext,
      sharedStyleContext,
      sectionContext,
      serializedSection
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
    await this.repository.updateSectionWorkflowState({
      ...existing,
      status,
      lastRunId,
      updatedAt: nowIso(),
      completedAt,
      skippedAt
    });
  }

  async analyzeSection(request: WorkflowSectionRequest): Promise<SectionAnalysis> {
    const context = await this.getSectionStateContext(request);
    const analysis = deterministicAnalysis({
      metadata: context.metadata,
      serializedSection: context.serializedSection,
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
    const skeleton = skeletonPlanSchema.parse(
      await this.planningProvider.generateSkeleton({
        metadata: context.metadata,
        mode: request.mode,
        sectionContext: context.sectionContext,
        serializedSection: context.serializedSection,
        projectContext: context.projectContext,
        sharedStyleContext: context.sharedStyleContext,
        selectedElementId: request.selectedElementId ?? null
      })
    );
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

  async styleSection(request: WorkflowSectionRequest): Promise<StylingPlan> {
    const context = await this.getSectionStateContext(request);
    const styling = stylingPlanSchema.parse(
      await this.planningProvider.generateStylingPlan({
        metadata: context.metadata,
        mode: request.mode,
        sectionContext: context.sectionContext,
        serializedSection: context.serializedSection,
        projectContext: context.projectContext,
        sharedStyleContext: context.sharedStyleContext,
        selectedElementId: request.selectedElementId ?? null
      })
    );
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
    const verification = sectionVerificationSchema.parse(
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
    await this.persistRun(
      request,
      context.queue.repoPage!.id,
      request.sectionId,
      "verification",
      verification
    );
    return verification;
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
