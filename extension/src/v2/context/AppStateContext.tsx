import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  ComponentOpportunity,
  type RepoConnectionInput,
  type PageMappingsUpsertInput,
  type SectionAnalysis,
  type SectionVerification,
  type SharedStyleContext,
  type SiteStylePlan,
  SitePageMappingRow,
  type SkeletonPlan,
  type StylingPlan,
  V2AvailableRepo,
  type V2BootstrapDiagnostics,
  V2Session,
  WebflowSitePage,
  WorkflowQueueItem,
  WorkflowQueueResponse,
  type WorkflowSectionDecisionInput,
  type WorkflowSectionRequest
} from "@wfb/shared/contracts.js";
import {
  BackendClient,
  RepoTreeResponse
} from "../../api/client.js";
import {
  applyStylingPlan,
  executeSkeletonPlan,
  executeSkeletonPlanIntoRoot,
  type ExecutionSummary
} from "../../executor/buildExecutor.js";
import {
  normalizeSkeletonPlan,
  parseSkeletonTreeText,
  sanitizeSkeletonPlan
} from "../../skeleton/tree.js";
import {
  mergeExecutionSummaries,
  rollbackExecutionSummary
} from "./executionRollback.js";
import { isReservedStyleGuideClassName } from "@wfb/shared/client-first.js";
import {
  type CreatePageInput,
  type DesignerContext,
  getWebflowBridge,
  type RegisteredComponent
} from "../../webflow/bridge.js";

const backend = new BackendClient();
const bridge = getWebflowBridge();
const SELECTED_REPO_STORAGE_KEY = "wb-v2-selected-repo-id";
const EMPTY_REPO_PAGES: RepoTreeResponse["pages"] = [];
const EXTENSION_BUILD_SHA = (import.meta.env.VITE_BUILD_SHA as string | undefined) ?? "unknown";

export function buildVersionWarning(backendBuildSha: string | null): string | null {
  const extensionBuildSha = EXTENSION_BUILD_SHA.trim() || "unknown";
  const normalizedBackendSha = backendBuildSha?.trim() || "unknown";
  if (
    extensionBuildSha === "unknown" ||
    normalizedBackendSha === "unknown" ||
    extensionBuildSha === normalizedBackendSha
  ) {
    return null;
  }
  return `Extension and backend were built from different commits. Extension: ${extensionBuildSha}; backend: ${normalizedBackendSha}. Rebuild and upload both artifacts together.`;
}

function mergeMappingRows(params: {
  livePages: WebflowSitePage[];
  savedMappings: SitePageMappingRow[];
  repoPageNameById: Map<string, string>;
  webflowSiteId: string | null;
}): SitePageMappingRow[] {
  const mappingByPageId = new Map(
    params.savedMappings.map((mapping) => [mapping.webflowPageId, mapping])
  );
  const rows = params.livePages.map((page) => {
    const existing = mappingByPageId.get(page.id);
    const repoPageId = existing?.repoPageId ?? null;
    return {
      webflowSiteId: params.webflowSiteId ?? existing?.webflowSiteId ?? "",
      webflowPageId: page.id,
      webflowPageName: page.name,
      webflowPageRoute: page.route ?? null,
      repoPageId,
      repoPageName: repoPageId
        ? (params.repoPageNameById.get(repoPageId) ?? existing?.repoPageName ?? null)
        : null,
      mappingStatus: repoPageId ? "mapped" : "unmapped"
    } satisfies SitePageMappingRow;
  });

  for (const saved of params.savedMappings) {
    if (!rows.find((row) => row.webflowPageId === saved.webflowPageId)) {
      rows.push(saved);
    }
  }

  return rows.sort((left, right) =>
    left.webflowPageName.localeCompare(right.webflowPageName)
  );
}

function sameDesignerContext(
  left: DesignerContext | null,
  right: DesignerContext | null
) {
  return (
    left?.siteId === right?.siteId &&
    left?.siteName === right?.siteName &&
    left?.siteDomain === right?.siteDomain &&
    left?.pageId === right?.pageId &&
    left?.pageName === right?.pageName &&
    left?.mode === right?.mode &&
    left?.selectedElementId === right?.selectedElementId
  );
}

function statusToScreenStatus(
  status: WorkflowQueueItem["status"]
): "pending" | "in-progress" | "complete" | "skipped" | "error" {
  switch (status) {
    case "approved":
      return "complete";
    case "skipped":
      return "skipped";
    case "in_progress":
    case "skeleton_ready":
    case "skeleton_placed":
    case "skeleton_approved":
    case "styled":
      return "in-progress";
    default:
      return "pending";
  }
}

function nextSectionIdFromQueue(queue: WorkflowQueueResponse | null): string | null {
  if (!queue) {
    return null;
  }
  return (
    queue.nextSectionId ??
    queue.items.find((item) => !["approved", "skipped"].includes(item.status))
      ?.repoSectionId ??
    null
  );
}

function scoreMappingSuggestion(
  page: WebflowSitePage,
  repoPage: RepoTreeResponse["pages"][number]["page"]
) {
  const normalizedPageName = page.name.trim().toLowerCase();
  const normalizedRepoName = repoPage.name.trim().toLowerCase();
  if (page.route && repoPage.route === page.route) {
    return 0.94;
  }
  if (normalizedPageName === normalizedRepoName) {
    return 0.82;
  }
  const pageTokens = new Set(normalizedPageName.split(/[\s/-]+/).filter(Boolean));
  const repoTokens = new Set(normalizedRepoName.split(/[\s/-]+/).filter(Boolean));
  let overlap = 0;
  pageTokens.forEach((token) => {
    if (repoTokens.has(token)) {
      overlap += 1;
    }
  });
  if (overlap === 0) {
    return 0;
  }
  return 0.5 + overlap / Math.max(pageTokens.size, repoTokens.size, 1) / 2;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function stylingHasMaterialChanges(plan: StylingPlan): boolean {
  return (
    plan.styleDefinitions.some(
      (definition) =>
        !isReservedStyleGuideClassName(definition.className) &&
        Object.keys(definition.properties).length > 0
    ) ||
    plan.variableBindings.length > 0 ||
    plan.requiredClassNames.some(
      (className) => !isReservedStyleGuideClassName(className)
    )
  );
}

function serializeMappings(rows: SitePageMappingRow[]) {
  return JSON.stringify(
    rows.map((row) => ({
      pageId: row.webflowPageId,
      repoPageId: row.repoPageId
    }))
  );
}

interface V2PageProgressRow {
  webflowPageId: string;
  webflowPageName: string;
  webflowPageRoute: string | null;
  repoPageId: string | null;
  repoPageName: string | null;
  mapped: boolean;
  active: boolean;
  doneCount: number;
  inProgressCount: number;
  skippedCount: number;
  remainingCount: number;
  totalCount: number;
  percent: number;
}

interface CurrentSectionRow {
  id: string;
  title: string;
  file: string;
  sourceCode: string | null;
  elements: number | null;
  status: "pending" | "in-progress" | "complete" | "skipped" | "error";
}

interface SuggestionRow {
  repoPageId: string;
  name: string;
  sourceFile: string;
  score: number;
  sectionCount: number;
}

interface ExecutionRunRecord {
  summary: ExecutionSummary;
  seededComponentId: string | null;
}

interface SectionOutcomeSummary {
  id: string;
  title: string;
  file: string;
}

interface AppStateContextValue {
  isBootstrapping: boolean;
  isLoadingWorkflowState: boolean;
  isMutating: boolean;
  loadingLabel: string | null;
  error: string | null;
  session: V2Session | null;
  bootstrapDiagnostics: V2BootstrapDiagnostics | null;
  versionSkewWarning: string | null;
  repos: V2AvailableRepo[];
  selectedRepoId: string | null;
  selectedRepo: V2AvailableRepo | null;
  selectRepo: (repoId: string) => void;
  connectAndSyncRepo: (input: Pick<RepoConnectionInput, "owner" | "name" | "repoUrl">) => Promise<boolean>;
  ensureSelectedRepoReady: () => Promise<boolean>;
  rescanSelectedRepo: () => Promise<boolean>;
  refreshBootstrap: () => Promise<void>;
  designerContext: DesignerContext | null;
  livePages: WebflowSitePage[];
  repoTree: RepoTreeResponse | null;
  mappingRows: SitePageMappingRow[];
  hasUnsavedMappings: boolean;
  updateMapping: (webflowPageId: string, repoPageId: string | null) => void;
  savePageMappings: () => Promise<boolean>;
  createPage: (
    input: CreatePageInput & {
      repoPageId?: string | null;
    }
  ) => Promise<WebflowSitePage | null>;
  activeMapping: SitePageMappingRow | null;
  activeQueue: WorkflowQueueResponse | null;
  siteStylePlan: SiteStylePlan | null;
  refreshSiteStylePlan: () => Promise<void>;
  confirmSiteStylePlan: () => Promise<boolean>;
  currentSections: CurrentSectionRow[];
  selectedSectionId: string | null;
  selectedSection: CurrentSectionRow | null;
  lastCompletedSection: SectionOutcomeSummary | null;
  activeSectionError: string | null;
  selectSection: (sectionId: string) => void;
  startSectionBuild: (
    sectionId?: string,
    options?: {
      preserveState?: boolean;
    }
  ) => Promise<boolean>;
  regenerateSkeleton: () => Promise<boolean>;
  beginSkeletonEdit: () => void;
  discardSkeletonChanges: () => void;
  saveSkeletonChanges: () => boolean;
  saveSkeletonDraft: (value: string) => void;
  isEditingSkeleton: boolean;
  skeletonDraft: string;
  hasSkeletonChanges: boolean;
  analysis: SectionAnalysis | null;
  skeleton: SkeletonPlan | null;
  insertCurrentSkeleton: () => Promise<boolean>;
  approveCurrentSkeleton: () => Promise<boolean>;
  styling: StylingPlan | null;
  verification: SectionVerification | null;
  lastExecution: ExecutionSummary | null;
  currentTargetNodeId: string | null;
  applyCurrentSection: () => Promise<boolean>;
  approveCurrentSection: () => Promise<boolean>;
  skipCurrentSection: () => Promise<boolean>;
  completeCurrentPage: () => Promise<boolean>;
  cancelActiveWorkflow: () => Promise<void>;
  rollbackCurrentExecution: () => Promise<void>;
  pageProgressRows: V2PageProgressRow[];
  componentOpportunities: ComponentOpportunity[];
  componentBannerDismissed: boolean;
  dismissComponentBanner: () => void;
  resetComponentBanner: () => void;
  refreshComponentOpportunities: () => Promise<void>;
  createComponentsFromOpportunities: (opportunityIds: string[]) => Promise<number>;
  createdComponentsByOpportunityId: Record<string, RegisteredComponent>;
  switchToPage: (pageId: string) => Promise<void>;
  currentPageSuggestions: SuggestionRow[];
  applySuggestionToCurrentPage: (repoPageId: string) => Promise<boolean>;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isLoadingWorkflowState, setIsLoadingWorkflowState] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<V2Session | null>(null);
  const [bootstrapDiagnostics, setBootstrapDiagnostics] = useState<V2BootstrapDiagnostics | null>(null);
  const [versionSkewWarning, setVersionSkewWarning] = useState<string | null>(null);
  const [repos, setRepos] = useState<V2AvailableRepo[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [designerContext, setDesignerContext] = useState<DesignerContext | null>(null);
  const [livePages, setLivePages] = useState<WebflowSitePage[]>([]);
  const [repoTree, setRepoTree] = useState<RepoTreeResponse | null>(null);
  const [mappingRows, setMappingRows] = useState<SitePageMappingRow[]>([]);
  const [savedMappingsSnapshot, setSavedMappingsSnapshot] = useState("[]");
  const [queueByPageId, setQueueByPageId] = useState<Record<string, WorkflowQueueResponse>>({});
  const [componentOpportunities, setComponentOpportunities] = useState<ComponentOpportunity[]>([]);
  const [componentBannerDismissed, setComponentBannerDismissed] = useState(false);
  const [createdComponentsByOpportunityId, setCreatedComponentsByOpportunityId] = useState<
    Record<string, RegisteredComponent>
  >({});
  const [seededComponentIds, setSeededComponentIds] = useState<Record<string, boolean>>({});
  const [sharedStyleContext, setSharedStyleContext] = useState<SharedStyleContext | null>(null);
  const [siteStylePlan, setSiteStylePlan] = useState<SiteStylePlan | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<SectionAnalysis | null>(null);
  const [skeleton, setSkeleton] = useState<SkeletonPlan | null>(null);
  const [skeletonDraft, setSkeletonDraft] = useState("");
  const [isEditingSkeleton, setIsEditingSkeleton] = useState(false);
  const [styling, setStyling] = useState<StylingPlan | null>(null);
  const [verification, setVerification] = useState<SectionVerification | null>(null);
  const [lastExecution, setLastExecution] = useState<ExecutionSummary | null>(null);
  const [currentTargetNodeId, setCurrentTargetNodeId] = useState<string | null>(null);
  const [lastCompletedSection, setLastCompletedSection] = useState<SectionOutcomeSummary | null>(null);
  const [sectionErrorsById, setSectionErrorsById] = useState<Record<string, string>>({});
  const [activeAbortController, setActiveAbortController] = useState<AbortController | null>(null);
  const activeExecutionRecordRef = useRef<ExecutionRunRecord | null>(null);
  const lastExecutionRecordRef = useRef<ExecutionRunRecord | null>(null);
  const mutationLockRef = useRef(0);

  const selectedRepo = repos.find((repo) => repo.id === selectedRepoId) ?? null;
  const repoPages = repoTree?.pages ?? EMPTY_REPO_PAGES;
  const repoPageNameById = useMemo(
    () =>
      new Map(repoPages.map((entry) => [entry.page.id, entry.page.name] as const)),
    [repoPages]
  );
  const repoSectionById = useMemo(() => {
    const map = new Map<
      string,
      RepoTreeResponse["pages"][number]["sections"][number]
    >();
    repoPages.forEach((entry) => {
      entry.sections.forEach((section) => {
        map.set(section.id, section);
      });
    });
    return map;
  }, [repoPages]);
  const activeMapping =
    mappingRows.find((row) => row.webflowPageId === designerContext?.pageId) ?? null;
  const activeQueue = designerContext?.pageId
    ? queueByPageId[designerContext.pageId] ?? null
    : null;
  const hasUnsavedMappings = serializeMappings(mappingRows) !== savedMappingsSnapshot;

  const resetSectionRunState = useCallback((nextSectionId: string | null = null) => {
    setSelectedSectionId(nextSectionId);
    setAnalysis(null);
    setSkeleton(null);
    setSkeletonDraft("");
    setIsEditingSkeleton(false);
    setStyling(null);
    setVerification(null);
    setLastExecution(null);
    setCurrentTargetNodeId(null);
    activeExecutionRecordRef.current = null;
    lastExecutionRecordRef.current = null;
  }, []);

  const captureSharedStyles = useCallback(async (siteId: string) => {
    const styles = await bridge.inspectSharedStyles(siteId);
    setSharedStyleContext(styles);
    return styles;
  }, []);

  const syncDesignerContext = useCallback(async () => {
    const context = await bridge.getContext();
    setDesignerContext((current) =>
      sameDesignerContext(current, context) ? current : context
    );
    if (context.siteId) {
      setLivePages(await bridge.getSitePages(context.siteId));
    }
    return context;
  }, []);

  const ensureSiteBound = useCallback(async () => {
    if (!selectedRepoId || !session?.userId || !designerContext?.siteId) {
      throw new Error("Connect a repo and open a Webflow site first.");
    }
    const styles =
      sharedStyleContext?.siteId === designerContext.siteId
        ? sharedStyleContext
        : await captureSharedStyles(designerContext.siteId);
    await backend.bindSite({
      repoId: selectedRepoId,
      webflowSiteId: designerContext.siteId,
      requestedBy: session.userId,
      sharedStyleContext: styles
    });
    return styles;
  }, [
    captureSharedStyles,
    designerContext?.siteId,
    selectedRepoId,
    session?.userId,
    sharedStyleContext
  ]);

  const refreshSiteStylePlan = useCallback(async () => {
    if (!selectedRepoId || !session?.userId || !designerContext?.siteId) {
      setSiteStylePlan(null);
      return;
    }
    const styles =
      sharedStyleContext?.siteId === designerContext.siteId
        ? sharedStyleContext
        : await captureSharedStyles(designerContext.siteId);
    const plan = await backend.rebuildSiteStylePlan({
      repoId: selectedRepoId,
      webflowSiteId: designerContext.siteId,
      requestedBy: session.userId,
      sharedStyleContext: styles
    });
    setSiteStylePlan(plan);
  }, [
    captureSharedStyles,
    designerContext?.siteId,
    selectedRepoId,
    session?.userId,
    sharedStyleContext
  ]);

  const refreshComponentOpportunities = useCallback(async () => {
    if (!selectedRepoId) {
      setComponentOpportunities([]);
      return;
    }
    const response = await backend.getComponentOpportunities(selectedRepoId);
    setComponentOpportunities(response.opportunities);
    setComponentBannerDismissed(false);
  }, [selectedRepoId]);

  const refreshRepoData = useCallback(async (
    repoId: string,
    options?: { shouldSkipApply?: () => boolean }
  ) => {
    const [tree, opportunitiesResponse] = await Promise.all([
      backend.getRepoTree(repoId).catch(() => null),
      backend
        .getComponentOpportunities(repoId)
        .catch(() => ({ opportunities: [] as ComponentOpportunity[] }))
    ]);
    if (options?.shouldSkipApply?.()) {
      return tree;
    }
    setRepoTree(tree);
    setComponentOpportunities(opportunitiesResponse.opportunities);
    setComponentBannerDismissed(false);
    return tree;
  }, []);

  const refreshWorkflowState = useCallback(async (repoIdOverride?: string) => {
    const effectiveRepoId = repoIdOverride ?? selectedRepoId;
    if (!effectiveRepoId || !session?.userId || !designerContext?.siteId) {
      setMappingRows([]);
      setSavedMappingsSnapshot("[]");
      setQueueByPageId({});
      resetSectionRunState(null);
      return;
    }

    const currentLivePages = await bridge.getSitePages(designerContext.siteId);
    setLivePages(currentLivePages);

    const savedMappings = await backend
      .getPageMappings(effectiveRepoId, designerContext.siteId, session.userId)
      .catch(() => [] as SitePageMappingRow[]);

    const mergedRows = mergeMappingRows({
      livePages: currentLivePages,
      savedMappings,
      repoPageNameById,
      webflowSiteId: designerContext.siteId
    });
    setMappingRows(mergedRows);
    setSavedMappingsSnapshot(serializeMappings(mergedRows));

    const mappedRows = mergedRows.filter((row) => row.repoPageId);
    const queueEntries = await Promise.all(
      mappedRows.map(async (row) => {
        const queue = await backend
          .getWorkflowQueue(
            effectiveRepoId,
            designerContext.siteId!,
            row.webflowPageId,
            session.userId!
          )
          .catch(() => null);
        return queue ? ([row.webflowPageId, queue] as const) : null;
      })
    );

    const nextQueueByPageId = Object.fromEntries(
      queueEntries.filter(
        (entry): entry is readonly [string, WorkflowQueueResponse] => Boolean(entry)
      )
    );
    setQueueByPageId(nextQueueByPageId);
    const nextActiveQueue =
      (designerContext.pageId ? nextQueueByPageId[designerContext.pageId] : null) ?? null;
    setSelectedSectionId((current) => {
      if (current && nextActiveQueue?.items.some((item) => item.repoSectionId === current)) {
        return current;
      }
      return nextSectionIdFromQueue(nextActiveQueue);
    });
  }, [
    designerContext?.pageId,
    designerContext?.siteId,
    repoPageNameById,
    resetSectionRunState,
    session?.userId
  ]);

  const bootstrapState = useCallback(async () => {
    const [bootstrapPayload, context, debugEnvStatus] = await Promise.all([
      backend.getV2Bootstrap(),
      bridge.getContext(),
      backend.getDebugEnvStatus().catch(() => ({ buildSha: "unknown" }))
    ]);

    setSession(bootstrapPayload.session);
    setBootstrapDiagnostics(bootstrapPayload.diagnostics);
    setVersionSkewWarning(buildVersionWarning(debugEnvStatus.buildSha));
    setRepos(bootstrapPayload.repos);
    setDesignerContext((current) =>
      sameDesignerContext(current, context) ? current : context
    );

    const persistedRepoId = localStorage.getItem(SELECTED_REPO_STORAGE_KEY);
    const initialRepoId =
      (persistedRepoId &&
      bootstrapPayload.repos.some((repo) => repo.id === persistedRepoId)
        ? persistedRepoId
        : bootstrapPayload.repos[0]?.id) ?? null;
    setSelectedRepoId(initialRepoId);

    if (context.siteId) {
      setLivePages(await bridge.getSitePages(context.siteId));
    }

    return { bootstrapPayload, context };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setIsBootstrapping(true);
      try {
        const { bootstrapPayload, context } = await bootstrapState();
        if (cancelled) {
          return;
        }
        if (!cancelled && context.siteId) {
          const nextPages = await bridge.getSitePages(context.siteId);
          if (!cancelled) {
            setLivePages(nextPages);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to bootstrap the V2 extension state."
          );
        }
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [bootstrapState]);

  useEffect(() => {
    const unsubscribe = bridge.subscribeToCurrentPage(() => {
      void bridge.getContext().then((context) => {
        setDesignerContext((current) =>
          sameDesignerContext(current, context) ? current : context
        );
        if (context.siteId) {
          void bridge.getSitePages(context.siteId).then(setLivePages).catch(() => undefined);
        }
      });
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!selectedRepoId) {
      return;
    }
    localStorage.setItem(SELECTED_REPO_STORAGE_KEY, selectedRepoId);
  }, [selectedRepoId]);

  useEffect(() => {
    if (!selectedRepoId) {
      setRepoTree(null);
      setComponentOpportunities([]);
      setComponentBannerDismissed(false);
      resetSectionRunState(null);
      return;
    }

    let cancelled = false;
    const repoId = selectedRepoId;

    async function loadRepoData() {
      try {
        await refreshRepoData(repoId, { shouldSkipApply: () => cancelled });
        if (cancelled) {
          return;
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load repo data for the V2 shell."
          );
        }
      }
    }

    void loadRepoData();

    return () => {
      cancelled = true;
    };
  }, [
    resetSectionRunState,
    refreshRepoData,
    selectedRepo?.lastSyncedAt,
    selectedRepo?.pageCount,
    selectedRepo?.status,
    selectedRepoId
  ]);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingWorkflowState(true);

    async function loadWorkflowData() {
      try {
        await refreshWorkflowState();
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load mappings and workflow progress."
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingWorkflowState(false);
        }
      }
    }
    void loadWorkflowData();
    return () => {
      cancelled = true;
    };
  }, [
    refreshWorkflowState,
    selectedRepo?.lastSyncedAt,
    selectedRepo?.pageCount,
    selectedRepo?.status
  ]);

  useEffect(() => {
    void refreshSiteStylePlan().catch(() => undefined);
  }, [refreshSiteStylePlan, selectedRepo?.lastSyncedAt]);

  const currentSections = useMemo(() => {
    if (!activeQueue?.repoPage) {
      return [];
    }
    const sectionEntries =
      repoTree?.pages.find((entry) => entry.page.id === activeQueue.repoPage?.id)?.sections ?? [];
    const sectionById = new Map(sectionEntries.map((section) => [section.id, section]));

    return activeQueue.items.map((item) => {
      const section = sectionById.get(item.repoSectionId);
      const localError = sectionErrorsById[item.repoSectionId];
      return {
        id: item.repoSectionId,
        title: item.sectionName,
        file: section?.sourceFile ?? activeQueue.repoPage?.sourceFile ?? "Unknown file",
        sourceCode: section?.sourceCode ?? null,
        elements: null,
        status: localError ? "error" : statusToScreenStatus(item.status)
      } satisfies CurrentSectionRow;
    });
  }, [activeQueue, repoTree, sectionErrorsById]);

  const selectedSection =
    currentSections.find((section) => section.id === selectedSectionId) ?? null;
  const selectedWorkflowItem =
    activeQueue?.items.find((item) => item.repoSectionId === selectedSectionId) ?? null;
  const selectedSectionRecord = selectedSectionId
    ? repoSectionById.get(selectedSectionId) ?? null
    : null;

  useEffect(() => {
    if (selectedWorkflowItem?.placedRootNodeId) {
      setCurrentTargetNodeId(selectedWorkflowItem.placedRootNodeId);
    }
  }, [selectedWorkflowItem?.placedRootNodeId]);

  const pageProgressRows = useMemo(() => {
    return mappingRows.map((row) => {
      const queue = queueByPageId[row.webflowPageId];
      const doneCount =
        queue?.items.filter((item) => item.status === "approved").length ?? 0;
      const skippedCount =
        queue?.items.filter((item) => item.status === "skipped").length ?? 0;
      const inProgressCount =
        queue?.items.filter((item) =>
          ["in_progress", "skeleton_ready", "skeleton_placed", "skeleton_approved", "styled"].includes(item.status)
        ).length ?? 0;
      const totalCount = queue?.items.length ?? 0;
      const remainingCount = Math.max(totalCount - doneCount - skippedCount, 0);
      const percent =
        totalCount > 0
          ? Math.round(((doneCount + skippedCount) / totalCount) * 100)
          : 0;

      return {
        webflowPageId: row.webflowPageId,
        webflowPageName: row.webflowPageName,
        webflowPageRoute: row.webflowPageRoute ?? null,
        repoPageId: row.repoPageId,
        repoPageName: row.repoPageName,
        mapped: row.mappingStatus === "mapped",
        active: row.webflowPageId === designerContext?.pageId,
        doneCount,
        inProgressCount,
        skippedCount,
        remainingCount,
        totalCount,
        percent
      } satisfies V2PageProgressRow;
    });
  }, [designerContext?.pageId, mappingRows, queueByPageId]);

  const currentPageSuggestions = useMemo(() => {
    const currentPage = livePages.find((page) => page.id === designerContext?.pageId);
    if (!currentPage || !repoTree) {
      return [];
    }

    return repoTree.pages
      .map((entry) => ({
        repoPageId: entry.page.id,
        name: entry.page.name,
        sourceFile: entry.page.sourceFile,
        score: scoreMappingSuggestion(currentPage, entry.page),
        sectionCount: entry.sections.length
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3);
  }, [designerContext?.pageId, livePages, repoTree]);

  const updateMapping = useCallback((webflowPageId: string, repoPageId: string | null) => {
    setMappingRows((rows) =>
      rows.map((row) =>
        row.webflowPageId === webflowPageId
          ? {
              ...row,
              repoPageId,
              repoPageName: repoPageId ? repoPageNameById.get(repoPageId) ?? null : null,
              mappingStatus: repoPageId ? "mapped" : "unmapped"
            }
          : row
      )
    );
  }, [repoPageNameById]);

  const withMutation = useCallback(async <T,>(
    label: string,
    fn: () => Promise<T>
  ): Promise<T> => {
    mutationLockRef.current += 1;
    setIsMutating(true);
    setLoadingLabel(label);
    setError(null);
    try {
      return await fn();
    } finally {
      mutationLockRef.current = Math.max(0, mutationLockRef.current - 1);
      if (mutationLockRef.current === 0) {
        setIsMutating(false);
        setLoadingLabel(null);
      }
    }
  }, []);

  const confirmSiteStylePlan = useCallback(async () => {
    if (!selectedRepoId || !session?.userId || !designerContext?.siteId) {
      setError("Open a Webflow site and choose a repo first.");
      return false;
    }
    try {
      return await withMutation("Confirming style plan", async () => {
        const styles = await ensureSiteBound();
        const plan = await backend.confirmSiteStylePlan({
          repoId: selectedRepoId,
          webflowSiteId: designerContext.siteId!,
          requestedBy: session.userId,
          sharedStyleContext: styles
        });
        setSiteStylePlan(plan);
        return true;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm the style plan.");
      return false;
    }
  }, [
    designerContext?.siteId,
    ensureSiteBound,
    selectedRepoId,
    session?.userId,
    withMutation
  ]);

  const savePageMappings = useCallback(async () => {
    if (!selectedRepoId || !session?.userId || !designerContext?.siteId) {
      setError("Open a Webflow site and choose a repo first.");
      return false;
    }
    try {
      await withMutation("Saving page mappings", async () => {
        await ensureSiteBound();
        const input: PageMappingsUpsertInput = {
          repoId: selectedRepoId,
          webflowSiteId: designerContext.siteId!,
          requestedBy: session.userId,
          mappings: mappingRows.map((row) => ({
            webflowPageId: row.webflowPageId,
            webflowPageName: row.webflowPageName,
            webflowPageRoute: row.webflowPageRoute,
            repoPageId: row.repoPageId
          }))
        };
        await backend.savePageMappings(input);
        await refreshWorkflowState();
      });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save page mappings.");
      return false;
    }
  }, [
    designerContext?.siteId,
    ensureSiteBound,
    mappingRows,
    refreshWorkflowState,
    selectedRepoId,
    session?.userId,
    withMutation
  ]);

  const createPage = useCallback(async (input: CreatePageInput & { repoPageId?: string | null }) => {
    if (!selectedRepoId || !session?.userId || !designerContext?.siteId) {
      setError("Open a Webflow site and choose a repo first.");
      return null;
    }
    try {
      return await withMutation("Creating Webflow page", async () => {
        const createdPage = await bridge.createPage(input);
        const syncedContext = await syncDesignerContext();
        const siteId = syncedContext?.siteId ?? designerContext.siteId!;
        const nextLivePages = await bridge.getSitePages(siteId);
        setLivePages(nextLivePages);

        const nextRows: SitePageMappingRow[] = mergeMappingRows({
          livePages: nextLivePages,
          savedMappings: mappingRows,
          repoPageNameById,
          webflowSiteId: siteId
        }).map((row) =>
          row.webflowPageId === createdPage.id
            ? {
                ...row,
                repoPageId: input.repoPageId ?? null,
                repoPageName: input.repoPageId
                  ? repoPageNameById.get(input.repoPageId) ?? null
                  : null,
                mappingStatus: (input.repoPageId ? "mapped" : "unmapped") as
                  | "mapped"
                  | "unmapped"
              } satisfies SitePageMappingRow
            : row
        );
        setMappingRows(nextRows);

        if (input.repoPageId) {
          await ensureSiteBound();
          await backend.savePageMappings({
            repoId: selectedRepoId,
            webflowSiteId: siteId,
            requestedBy: session.userId,
            mappings: nextRows.map((row) => ({
              webflowPageId: row.webflowPageId,
              webflowPageName: row.webflowPageName,
              webflowPageRoute: row.webflowPageRoute,
              repoPageId: row.repoPageId
            }))
          });
          await refreshWorkflowState();
        } else {
          setSavedMappingsSnapshot(serializeMappings(nextRows));
        }
        return createdPage;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create the Webflow page.");
      return null;
    }
  }, [
    designerContext?.siteId,
    ensureSiteBound,
    mappingRows,
    refreshWorkflowState,
    repoPageNameById,
    selectedRepoId,
    session?.userId,
    syncDesignerContext,
    withMutation
  ]);

  const applySuggestionToCurrentPage = useCallback(async (repoPageId: string) => {
    if (!designerContext?.pageId) {
      setError("Open a Webflow page first.");
      return false;
    }
    updateMapping(designerContext.pageId, repoPageId);
    return savePageMappings();
  }, [designerContext?.pageId, savePageMappings, updateMapping]);

  const currentWorkflowRequest = useCallback((sectionId: string): WorkflowSectionRequest => {
    if (!selectedRepoId || !session?.userId || !designerContext?.siteId || !designerContext.pageId) {
      throw new Error("Open a mapped Webflow page first.");
    }
    return {
      repoId: selectedRepoId,
      webflowSiteId: designerContext.siteId,
      webflowPageId: designerContext.pageId,
      sectionId,
      requestedBy: session.userId,
      mode: "fullAssist",
      selectedElementId: currentTargetNodeId ?? designerContext.selectedElementId
    };
  }, [
    currentTargetNodeId,
    designerContext?.pageId,
    designerContext?.selectedElementId,
    designerContext?.siteId,
    selectedRepoId,
    session?.userId
  ]);

  const startSectionBuild = useCallback(async (
    sectionId?: string,
    options?: {
      preserveState?: boolean;
    }
  ) => {
    const nextSectionId = sectionId ?? selectedSectionId ?? nextSectionIdFromQueue(activeQueue);
    if (!nextSectionId) {
      setError("Choose a section first.");
      return false;
    }
    const preserveState = options?.preserveState === true;
    try {
      return await withMutation("Generating skeleton", async () => {
        const controller = new AbortController();
        setActiveAbortController(controller);
        if (!preserveState) {
          resetSectionRunState(nextSectionId);
        }
        setSectionErrorsById((current) => {
          const next = { ...current };
          delete next[nextSectionId];
          return next;
        });
        await ensureSiteBound();
        const request = currentWorkflowRequest(nextSectionId);
        const nextAnalysis = await backend.analyzeSection(request, controller.signal);
        setAnalysis(nextAnalysis);
        const nextSkeleton = normalizeSkeletonPlan(
          await backend.generateSkeleton(request, controller.signal),
          { siteStylePlan }
        );
        setSkeleton(nextSkeleton);
        setSkeletonDraft(nextSkeleton.treeText);
        return true;
      });
    } catch (err) {
      if (isAbortError(err)) {
        return false;
      }
      const sectionError =
        err instanceof Error ? err.message : "Failed to generate the section skeleton.";
      setSectionErrorsById((current) => ({
        ...current,
        [nextSectionId]: sectionError
      }));
      setError(sectionError);
      return false;
    } finally {
      setActiveAbortController(null);
    }
  }, [
    activeQueue,
    currentWorkflowRequest,
    ensureSiteBound,
    resetSectionRunState,
    selectedSectionId,
    siteStylePlan,
    withMutation
  ]);

  const regenerateSkeleton = useCallback(async () => {
    return startSectionBuild(selectedSectionId ?? undefined, { preserveState: true });
  }, [selectedSectionId, startSectionBuild]);

  const beginSkeletonEdit = useCallback(() => {
    if (!skeleton) {
      return;
    }
    setSkeletonDraft(skeleton.treeText);
    setIsEditingSkeleton(true);
  }, [skeleton]);

  const saveSkeletonDraft = useCallback((value: string) => {
    setSkeletonDraft(value);
  }, []);

  const discardSkeletonChanges = useCallback(() => {
    setSkeletonDraft(skeleton?.treeText ?? "");
    setIsEditingSkeleton(false);
  }, [skeleton?.treeText]);

  const saveSkeletonChanges = useCallback(() => {
    if (!skeleton) {
      return false;
    }
    try {
      const parsed = normalizeSkeletonPlan(
        parseSkeletonTreeText(skeleton, skeletonDraft || skeleton.treeText)
      );
      setSkeleton(parsed);
      setSkeletonDraft(parsed.treeText);
      setIsEditingSkeleton(false);
      setError(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse skeleton changes.");
      return false;
    }
  }, [skeleton, skeletonDraft]);

  const rollbackCurrentExecution = useCallback(async () => {
    const executionRecord = activeExecutionRecordRef.current ?? lastExecutionRecordRef.current;
    if (!executionRecord) {
      setCurrentTargetNodeId(null);
      setStyling(null);
      setVerification(null);
      return;
    }
    let rollbackSucceeded = false;
    try {
      await rollbackExecutionSummary(bridge, executionRecord.summary);
      rollbackSucceeded = true;
    } finally {
      activeExecutionRecordRef.current = null;
      lastExecutionRecordRef.current = null;
      setLastExecution(null);
      setCurrentTargetNodeId(null);
      setStyling(null);
      setVerification(null);
      if (rollbackSucceeded && executionRecord.seededComponentId) {
        setSeededComponentIds((current) => {
          const next = { ...current };
          delete next[executionRecord.seededComponentId!];
          return next;
        });
      }
    }
  }, []);

  const insertCurrentSkeleton = useCallback(async () => {
    if (!skeleton) {
      setError("Generate a skeleton before inserting it into Webflow.");
      return false;
    }
    try {
      return await withMutation("Inserting skeleton", async () => {
        const controller = new AbortController();
        setActiveAbortController(controller);
        if (currentTargetNodeId) {
          await rollbackCurrentExecution();
        }
        const context = await bridge.getContext();
        if (!context.siteId) {
          throw new Error("No active Webflow site.");
        }
        await ensureSiteBound();
        const nextSkeleton =
          isEditingSkeleton && skeletonDraft.trim()
            ? normalizeSkeletonPlan(parseSkeletonTreeText(skeleton, skeletonDraft))
            : normalizeSkeletonPlan(skeleton, { siteStylePlan });
        const nodeExecution = await executeSkeletonPlan({
          bridge,
          context,
          plan: nextSkeleton,
          placementMode: "append",
          placementTarget: null,
          signal: controller.signal
        });
        if (!nodeExecution.success) {
          throw new Error(
            nodeExecution.warnings.find((warning) => warning.level === "error")?.message ??
              "Failed to insert the generated skeleton."
          );
        }
        setSkeleton(nextSkeleton);
        setSkeletonDraft(nextSkeleton.treeText);
        setCurrentTargetNodeId(nodeExecution.rootNodeId ?? null);
        setStyling(null);
        setVerification(null);
        const summary = mergeExecutionSummaries([nodeExecution]);
        if (summary) {
          const record = {
            summary,
            seededComponentId: null
          } satisfies ExecutionRunRecord;
          lastExecutionRecordRef.current = record;
          activeExecutionRecordRef.current = null;
          setLastExecution(summary);
        }
        if (!selectedRepoId || !session?.userId || !context.pageId || !nodeExecution.rootNodeId || !selectedSectionId) {
          throw new Error("Unable to persist skeleton placement state.");
        }
        const nextQueue = await backend.placeSkeleton({
          repoId: selectedRepoId,
          webflowSiteId: context.siteId,
          webflowPageId: context.pageId,
          sectionId: selectedSectionId,
          requestedBy: session.userId,
          rootNodeId: nodeExecution.rootNodeId,
          nodeIdMap: nodeExecution.nodeIdMap ?? {}
        });
        setQueueByPageId((current) => ({
          ...current,
          [context.pageId!]: nextQueue
        }));
        return true;
      });
    } catch (err) {
      if (isAbortError(err)) {
        return false;
      }
      setError(err instanceof Error ? err.message : "Failed to insert the skeleton.");
      return false;
    } finally {
      setActiveAbortController(null);
    }
  }, [
    currentTargetNodeId,
    ensureSiteBound,
    isEditingSkeleton,
    rollbackCurrentExecution,
    selectedRepoId,
    selectedSectionId,
    session?.userId,
    skeleton,
    skeletonDraft,
    siteStylePlan,
    withMutation
  ]);

  const approveCurrentSkeleton = useCallback(async () => {
    if (!selectedSectionId || !selectedRepoId || !session?.userId || !designerContext?.siteId || !designerContext.pageId) {
      setError("Place a skeleton on the current Webflow page before approval.");
      return false;
    }
    if (!(currentTargetNodeId ?? selectedWorkflowItem?.placedRootNodeId)) {
      setError("Place the skeleton on the canvas before approval.");
      return false;
    }
    try {
      return await withMutation("Approving skeleton", async () => {
        const pageId = designerContext.pageId!;
        const nextQueue = await backend.approveSkeleton({
          repoId: selectedRepoId,
          webflowSiteId: designerContext.siteId!,
          webflowPageId: pageId,
          sectionId: selectedSectionId,
          requestedBy: session.userId
        });
        setQueueByPageId((current) => ({
          ...current,
          [pageId]: nextQueue
        }));
        return true;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve skeleton.");
      return false;
    }
  }, [
    currentTargetNodeId,
    designerContext?.pageId,
    designerContext?.siteId,
    selectedRepoId,
    selectedSectionId,
    selectedWorkflowItem?.placedRootNodeId,
    session?.userId,
    withMutation
  ]);

  const applyCurrentSection = useCallback(async () => {
    if (!selectedSectionId || !skeleton) {
      setError("Generate a skeleton before applying styles.");
      return false;
    }
    try {
      return await withMutation("Applying styles", async () => {
        const controller = new AbortController();
        setActiveAbortController(controller);
        activeExecutionRecordRef.current = null;
        const context = await bridge.getContext();
        if (!context.siteId) {
          throw new Error("No active Webflow site.");
        }
        if (siteStylePlan?.status !== "confirmed") {
          await refreshSiteStylePlan();
          throw new Error("Confirm the site style plan before applying styles.");
        }
        const styles =
          sharedStyleContext?.siteId === context.siteId
            ? sharedStyleContext
            : await captureSharedStyles(context.siteId);
        const request = {
          ...currentWorkflowRequest(selectedSectionId),
          sharedStyleContext: styles
        };

        const targetNodeId = currentTargetNodeId ?? selectedWorkflowItem?.placedRootNodeId ?? null;
        const executionParts: ExecutionSummary[] = [];

        if (!targetNodeId) {
          throw new Error("Place and approve the skeleton before applying styles.");
        }

        const stylingRequest = {
          ...request,
          selectedElementId: targetNodeId
        };
        const nextStyling = await backend.styleSection(stylingRequest, controller.signal);
        setStyling(nextStyling);
        if (!stylingHasMaterialChanges(nextStyling)) {
          throw new Error(
            "Styling produced no class changes, variable bindings, or class applications. Retry styling or reject and redo the skeleton."
          );
        }

        const stylingExecution = await applyStylingPlan({
          bridge,
          context,
          plan: nextStyling,
          targetNodeId,
          signal: controller.signal
        });
        if (!stylingExecution.success) {
          throw new Error(
            stylingExecution.warnings.find((warning) => warning.level === "error")?.message ??
              "Failed to apply section styles."
          );
        }
        executionParts.push(stylingExecution);
        const styledSummary = mergeExecutionSummaries(executionParts);
        if (styledSummary) {
          const record = {
            summary: styledSummary,
            seededComponentId: null
          } satisfies ExecutionRunRecord;
          lastExecutionRecordRef.current = record;
          activeExecutionRecordRef.current = null;
          setLastExecution(styledSummary);
        }

        const verificationResult = await backend.verifySection(
          {
            ...request,
            selectedElementId: targetNodeId
          },
          controller.signal
        );
        setVerification(verificationResult);
        const finalSummary = mergeExecutionSummaries([
          ...executionParts,
          {
            success: true,
            createdNodeIds: [],
            createdStyleIds: [],
            reusedClasses: [],
            createdClasses: [],
            warnings: verificationResult.warnings,
            missingAssets: [],
            rollbackOutcome: null,
            rootNodeId: targetNodeId
          }
        ]);
        if (finalSummary) {
          const record = {
            summary: finalSummary,
            seededComponentId: null
          } satisfies ExecutionRunRecord;
          lastExecutionRecordRef.current = record;
          activeExecutionRecordRef.current = null;
          setLastExecution(finalSummary);
        }
        return true;
      });
    } catch (err) {
      if (activeExecutionRecordRef.current) {
        try {
          await rollbackCurrentExecution();
        } catch (rollbackError) {
          const failureMessage =
            err instanceof Error ? err.message : "Failed to apply the section.";
          const rollbackMessage =
            rollbackError instanceof Error ? rollbackError.message : "Rollback failed.";
          setError(`${failureMessage} ${rollbackMessage}`);
          return false;
        }
      }
      if (isAbortError(err)) {
        return false;
      }
      setError(err instanceof Error ? err.message : "Failed to apply the section.");
      return false;
    } finally {
      setActiveAbortController(null);
    }
  }, [
    captureSharedStyles,
    currentTargetNodeId,
    currentWorkflowRequest,
    selectedSectionId,
    selectedWorkflowItem?.placedRootNodeId,
    sharedStyleContext,
    skeleton,
    refreshSiteStylePlan,
    rollbackCurrentExecution,
    siteStylePlan?.status,
    withMutation
  ]);

  const approveCurrentSection = useCallback(async () => {
    if (!selectedSectionId || !selectedRepoId || !session?.userId || !designerContext?.siteId || !designerContext.pageId) {
      setError("Choose a current section first.");
      return false;
    }
    try {
      return await withMutation("Approving section", async () => {
        const siteId = designerContext.siteId!;
        const pageId = designerContext.pageId!;
        const input: WorkflowSectionDecisionInput = {
          repoId: selectedRepoId,
          webflowSiteId: siteId,
          webflowPageId: pageId,
          sectionId: selectedSectionId,
          requestedBy: session.userId
        };
        const nextQueue = await backend.approveSection(input);
        setQueueByPageId((current) => ({
          ...current,
          [pageId]: nextQueue
        }));
        if (selectedSection) {
          setLastCompletedSection({
            id: selectedSection.id,
            title: selectedSection.title,
            file: selectedSection.file
          });
        }
        resetSectionRunState(nextSectionIdFromQueue(nextQueue));
        await refreshComponentOpportunities();
        return true;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve section.");
      return false;
    }
  }, [
    designerContext?.pageId,
    designerContext?.siteId,
    refreshComponentOpportunities,
    resetSectionRunState,
    selectedRepoId,
    selectedSection,
    selectedSectionId,
    session?.userId,
    withMutation
  ]);

  const skipCurrentSection = useCallback(async () => {
    if (!selectedSectionId || !selectedRepoId || !session?.userId || !designerContext?.siteId || !designerContext.pageId) {
      setError("Choose a current section first.");
      return false;
    }
    try {
      return await withMutation("Skipping section", async () => {
        await rollbackCurrentExecution().catch(() => undefined);
        const siteId = designerContext.siteId!;
        const pageId = designerContext.pageId!;
        const input: WorkflowSectionDecisionInput = {
          repoId: selectedRepoId,
          webflowSiteId: siteId,
          webflowPageId: pageId,
          sectionId: selectedSectionId,
          requestedBy: session.userId
        };
        const nextQueue = await backend.skipSection(input);
        setQueueByPageId((current) => ({
          ...current,
          [pageId]: nextQueue
        }));
        resetSectionRunState(nextSectionIdFromQueue(nextQueue));
        return true;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to skip section.");
      return false;
    }
  }, [
    designerContext?.pageId,
    designerContext?.siteId,
    resetSectionRunState,
    rollbackCurrentExecution,
    selectedRepoId,
    selectedSectionId,
    session?.userId,
    withMutation
  ]);

  const completeCurrentPage = useCallback(async () => {
    if (!selectedRepoId || !session?.userId || !designerContext?.siteId || !designerContext.pageId) {
      setError("Open a mapped page first.");
      return false;
    }
    try {
      return await withMutation("Completing page", async () => {
        const siteId = designerContext.siteId!;
        const pageId = designerContext.pageId!;
        const nextQueue = await backend.completePage({
          repoId: selectedRepoId,
          webflowSiteId: siteId,
          webflowPageId: pageId,
          requestedBy: session.userId
        });
        setQueueByPageId((current) => ({
          ...current,
          [pageId]: nextQueue
        }));
        setSelectedSectionId(nextSectionIdFromQueue(nextQueue));
        return true;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark page complete.");
      return false;
    }
  }, [
    designerContext?.pageId,
    designerContext?.siteId,
    selectedRepoId,
    session?.userId,
    withMutation
  ]);

  const cancelActiveWorkflow = useCallback(async () => {
    activeAbortController?.abort();
    setActiveAbortController(null);
    setLoadingLabel(null);
    setIsMutating(false);
    if (activeExecutionRecordRef.current) {
      await rollbackCurrentExecution().catch(() => undefined);
    }
    if (!skeleton) {
      resetSectionRunState(selectedSectionId);
    }
  }, [
    activeAbortController,
    resetSectionRunState,
    rollbackCurrentExecution,
    selectedSectionId,
    skeleton
  ]);

  const createComponentsFromOpportunities = useCallback(async (opportunityIds: string[]) => {
    if (opportunityIds.length > 0) {
      setError("Automated Webflow Component creation is disabled. Review opportunities after the build and componentize manually.");
    }
    return 0;
  }, []);

  const connectAndSyncRepo = useCallback(
    async (input: Pick<RepoConnectionInput, "owner" | "name" | "repoUrl">) => {
      const owner = input.owner.trim();
      const name = input.name.trim();
      const repoUrl = input.repoUrl.trim();
      if (!owner || !name || !repoUrl) {
        setError("Owner, repository name, and GitHub URL are required.");
        return false;
      }

      try {
        return await withMutation("Connecting repository", async () => {
          const requestedBy = session?.userId ?? "webflow-builder";
          const connected = await backend.connectRepo({
            owner,
            name,
            repoUrl,
            provider: "github",
            requestedBy
          });
          await backend.syncRepo(connected.repo.id);
          const { bootstrapPayload } = await bootstrapState();
          const nextRepoId =
            bootstrapPayload.repos.find((repo) => repo.fullName === `${owner}/${name}`)?.id ??
            connected.repo.id;
          setSelectedRepoId(nextRepoId);
          setError(null);
          return true;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to connect and sync the repository.");
        return false;
      }
    },
    [bootstrapState, session?.userId, withMutation]
  );

  const ensureSelectedRepoReady = useCallback(async () => {
    if (!selectedRepo) {
      setError("Choose a repository first.");
      return false;
    }

    const needsConnect = selectedRepo.status === "available";
    const needsSync =
      needsConnect ||
      selectedRepo.status === "syncing" ||
      selectedRepo.status === "failed" ||
      !selectedRepo.lastSyncedAt ||
      selectedRepo.needsResync ||
      selectedRepo.pageCount === 0;

    if (!needsSync) {
      setError(null);
      return true;
    }

    try {
      return await withMutation(
        needsConnect ? "Connecting repository" : "Syncing repository",
        async () => {
          let repoId = selectedRepo.id;
          if (needsConnect) {
            const requestedBy = session?.userId ?? "webflow-builder";
            const connected = await backend.connectRepo({
              owner: selectedRepo.owner,
              name: selectedRepo.name,
              repoUrl: selectedRepo.repoUrl,
              provider: "github",
              requestedBy
            });
            repoId = connected.repo.id;
          }

          await backend.syncRepo(repoId);
          const { bootstrapPayload } = await bootstrapState();
          const nextRepoId =
            bootstrapPayload.repos.find((repo) => repo.fullName === selectedRepo.fullName)?.id ??
            repoId;
          setSelectedRepoId(nextRepoId);
          setError(null);
          return true;
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to prepare the repository.");
      return false;
    }
  }, [bootstrapState, selectedRepo, session?.userId, withMutation]);

  const rescanSelectedRepo = useCallback(async () => {
    if (!selectedRepo) {
      setError("Choose a repository first.");
      return false;
    }

    try {
      return await withMutation("Re-scanning repository", async () => {
        let repoId = selectedRepo.id;
        if (selectedRepo.status === "available") {
          const requestedBy = session?.userId ?? "webflow-builder";
          const connected = await backend.connectRepo({
            owner: selectedRepo.owner,
            name: selectedRepo.name,
            repoUrl: selectedRepo.repoUrl,
            provider: "github",
            requestedBy
          });
          repoId = connected.repo.id;
        }

        await backend.syncRepo(repoId);
        const { bootstrapPayload } = await bootstrapState();
        const nextRepoId =
          bootstrapPayload.repos.find((repo) => repo.fullName === selectedRepo.fullName)?.id ??
          repoId;
        setSelectedRepoId(nextRepoId);
        await refreshRepoData(nextRepoId);
        await refreshWorkflowState(nextRepoId);
        setError(null);
        return true;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to re-scan the repository.");
      return false;
    }
  }, [bootstrapState, refreshRepoData, refreshWorkflowState, selectedRepo, session?.userId, withMutation]);

  const value = useMemo<AppStateContextValue>(
    () => ({
      isBootstrapping,
      isLoadingWorkflowState,
      isMutating,
      loadingLabel,
      error,
      session,
      bootstrapDiagnostics,
      versionSkewWarning,
      repos,
      selectedRepoId,
      selectedRepo,
      selectRepo: (repoId: string) => {
        setSelectedRepoId(repoId);
        resetSectionRunState(null);
      },
      connectAndSyncRepo,
      ensureSelectedRepoReady,
      rescanSelectedRepo,
      refreshBootstrap: async () => {
        await withMutation("Refreshing repository access", async () => {
          await bootstrapState();
        });
      },
      designerContext,
      livePages,
      repoTree,
      mappingRows,
      hasUnsavedMappings,
      updateMapping,
      savePageMappings,
      createPage,
      activeMapping,
      activeQueue,
      siteStylePlan,
      refreshSiteStylePlan,
      confirmSiteStylePlan,
      currentSections,
      selectedSectionId,
      selectedSection,
      lastCompletedSection,
      activeSectionError:
        (selectedSectionId ? sectionErrorsById[selectedSectionId] : null) ?? error,
      selectSection: (sectionId: string) => setSelectedSectionId(sectionId),
      startSectionBuild,
      regenerateSkeleton,
      beginSkeletonEdit,
      discardSkeletonChanges,
      saveSkeletonChanges,
      saveSkeletonDraft,
      isEditingSkeleton,
      skeletonDraft,
      hasSkeletonChanges:
        Boolean(skeleton) &&
        skeletonDraft.trim() !== "" &&
        skeletonDraft !== skeleton?.treeText,
      analysis,
      skeleton,
      insertCurrentSkeleton,
      approveCurrentSkeleton,
      styling,
      verification,
      lastExecution,
      currentTargetNodeId,
      applyCurrentSection,
      approveCurrentSection,
      skipCurrentSection,
      completeCurrentPage,
      cancelActiveWorkflow,
      rollbackCurrentExecution,
      pageProgressRows,
      componentOpportunities,
      componentBannerDismissed,
      dismissComponentBanner: () => setComponentBannerDismissed(true),
      resetComponentBanner: () => setComponentBannerDismissed(false),
      refreshComponentOpportunities,
      createComponentsFromOpportunities,
      createdComponentsByOpportunityId,
      switchToPage: async (pageId: string) => {
        await bridge.switchToPage(pageId);
        await syncDesignerContext();
      },
      currentPageSuggestions,
      applySuggestionToCurrentPage
    }),
    [
      activeMapping,
      activeQueue,
      analysis,
      applyCurrentSection,
      applySuggestionToCurrentPage,
      approveCurrentSkeleton,
      beginSkeletonEdit,
      cancelActiveWorkflow,
      completeCurrentPage,
      bootstrapDiagnostics,
      connectAndSyncRepo,
      confirmSiteStylePlan,
      ensureSelectedRepoReady,
      rescanSelectedRepo,
      componentBannerDismissed,
      componentOpportunities,
      createComponentsFromOpportunities,
      createPage,
      createdComponentsByOpportunityId,
      currentPageSuggestions,
      currentSections,
      currentTargetNodeId,
      designerContext,
      discardSkeletonChanges,
      error,
      hasUnsavedMappings,
      isBootstrapping,
      isEditingSkeleton,
      isLoadingWorkflowState,
      insertCurrentSkeleton,
      isMutating,
      lastExecution,
      lastCompletedSection,
      livePages,
      loadingLabel,
      mappingRows,
      pageProgressRows,
      refreshSiteStylePlan,
      refreshComponentOpportunities,
      bootstrapDiagnostics,
      versionSkewWarning,
      regenerateSkeleton,
      repoTree,
      repos,
      rollbackCurrentExecution,
      savePageMappings,
      saveSkeletonChanges,
      saveSkeletonDraft,
      selectedRepo,
      selectedRepoId,
      selectedSection,
      selectedSectionId,
      session,
      siteStylePlan,
      skeleton,
      skeletonDraft,
      skipCurrentSection,
      startSectionBuild,
      styling,
      syncDesignerContext,
      updateMapping,
      withMutation,
      verification
    ]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used within AppStateProvider");
  }
  return context;
}
