import { useEffect, useMemo, useState } from "react";
import {
  PageMappingsUpsertInput,
  SectionAnalysis,
  SectionVerification,
  SharedStyleContext,
  SitePageMappingRow,
  SkeletonPlan,
  StylingPlan,
  WorkflowMode,
  WorkflowQueueResponse,
  WebflowSitePage
} from "../../src/shared/contracts.js";
import { BackendClient, summarizeSharedStyles } from "./api/client.js";
import {
  applyStylingPlan,
  executeSkeletonPlan,
  ExecutionSummary
} from "./executor/buildExecutor.js";
import { parseSkeletonTreeText } from "./skeleton/tree.js";
import {
  DesignerContext,
  getWebflowBridge,
  getWebflowBridgeLabel
} from "./webflow/bridge.js";

const backend = new BackendClient();
const bridge = getWebflowBridge();
const bridgeLabel = getWebflowBridgeLabel();
const EMPTY_REPO_PAGES: Awaited<ReturnType<BackendClient["getRepoTree"]>>["pages"] = [];

type ScreenTab = "settings" | "mappings" | "workspace";
type MappingFilter = "all" | "mapped" | "unmapped";

function usePersistentState(
  key: string,
  initialValue: string
): [string, (value: string) => void] {
  const [value, setValue] = useState(() => localStorage.getItem(key) ?? initialValue);
  useEffect(() => {
    localStorage.setItem(key, value);
  }, [key, value]);
  return [value, setValue];
}

async function computeStableRepoId(owner: string, name: string): Promise<string> {
  const input = new TextEncoder().encode(`${owner}::${name}`);
  const digest = await crypto.subtle.digest("SHA-1", input);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
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

function warningList(items: Array<{ message: string; level?: string }> | undefined) {
  return items?.map((item, index) => (
    <li key={`${item.message}-${index}`}>
      {item.level === "error" ? "Error: " : ""}
      {item.message}
    </li>
  ));
}

function modeLabel(mode: WorkflowMode) {
  switch (mode) {
    case "fullAssist":
      return "Full assist";
    case "skeletonThenStyle":
      return "Skeleton then style";
    case "styleExisting":
      return "Style existing section";
  }
}

function statusLabel(value: string | null | undefined) {
  return value ? value.replace(/_/g, " ") : "—";
}

function truncateTarget(value: string | null | undefined) {
  if (!value) {
    return "None";
  }
  return value.length > 52 ? `${value.slice(0, 52)}…` : value;
}

function StepStatusIcon({
  state
}: {
  state: "complete" | "active" | "pending" | "skipped";
}) {
  if (state === "complete") {
    return (
      <span className="wf-step-icon is-complete" aria-hidden="true">
        <svg viewBox="0 0 16 16" focusable="false">
          <path
            d="M6.4 11.7 3.2 8.5l1.1-1.1 2.1 2.1 5.3-5.3 1.1 1.1-6.4 6.4Z"
            fill="currentColor"
          />
        </svg>
      </span>
    );
  }
  if (state === "skipped") {
    return <span className="wf-step-badge is-muted">Skipped</span>;
  }
  if (state === "active") {
    return <span className="wf-step-badge is-active">Current</span>;
  }
  return null;
}

function queueStatusTone(status: string) {
  if (status === "approved") {
    return "complete";
  }
  if (status === "skipped") {
    return "skipped";
  }
  if (status === "in_progress" || status === "styled" || status === "skeleton_ready") {
    return "active";
  }
  return "pending";
}

function sameDesignerContext(
  left: DesignerContext | null,
  right: DesignerContext | null
) {
  return (
    left?.siteId === right?.siteId &&
    left?.siteName === right?.siteName &&
    left?.pageId === right?.pageId &&
    left?.pageName === right?.pageName &&
    left?.mode === right?.mode &&
    left?.selectedElementId === right?.selectedElementId
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ScreenTab>("settings");
  const [mappingFilter, setMappingFilter] = useState<MappingFilter>("all");
  const [userId, setUserId] = usePersistentState("builder-user-id", "karim");
  const [repoOwner, setRepoOwner] = usePersistentState("builder-repo-owner", "misinc");
  const [repoName, setRepoName] = usePersistentState("builder-repo-name", "misinc-2026");
  const [repoUrl, setRepoUrl] = usePersistentState(
    "builder-repo-url",
    "https://github.com/misinc/misinc-2026"
  );
  const [persistedRepoId, setPersistedRepoId] = usePersistentState("builder-repo-id", "");
  const [workflowMode, setWorkflowMode] = usePersistentState(
    "builder-workflow-mode",
    "fullAssist"
  );
  const [repoId, setRepoId] = useState<string | null>(persistedRepoId || null);
  const [repoTree, setRepoTree] = useState<Awaited<
    ReturnType<BackendClient["getRepoTree"]>
  > | null>(null);
  const [designerContext, setDesignerContext] = useState<DesignerContext | null>(null);
  const [sharedStyleContext, setSharedStyleContext] = useState<SharedStyleContext | null>(null);
  const [sharedStyleSummary, setSharedStyleSummary] = useState<string>("");
  const [livePages, setLivePages] = useState<WebflowSitePage[]>([]);
  const [mappingRows, setMappingRows] = useState<SitePageMappingRow[]>([]);
  const [queue, setQueue] = useState<WorkflowQueueResponse | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [placementMode, setPlacementMode] = useState<"append" | "afterSelected">("append");
  const [analysis, setAnalysis] = useState<SectionAnalysis | null>(null);
  const [skeleton, setSkeleton] = useState<SkeletonPlan | null>(null);
  const [skeletonDraft, setSkeletonDraft] = useState("");
  const [isEditingSkeleton, setIsEditingSkeleton] = useState(false);
  const [styling, setStyling] = useState<StylingPlan | null>(null);
  const [verification, setVerification] = useState<SectionVerification | null>(null);
  const [lastExecution, setLastExecution] = useState<ExecutionSummary | null>(null);
  const [currentTargetNodeId, setCurrentTargetNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasBootstrappedRepo, setHasBootstrappedRepo] = useState(false);

  const repoPages = useMemo(() => repoTree?.pages ?? EMPTY_REPO_PAGES, [repoTree]);
  const repoPageNameById = useMemo(
    () =>
      new Map(
        repoPages.map((entry) => [entry.page.id, entry.page.name] as const)
      ),
    [repoPages]
  );

  const currentMapping = mappingRows.find(
    (row) => row.webflowPageId === designerContext?.pageId
  );
  const currentQueueItem =
    queue?.items.find((item) => item.repoSectionId === selectedSectionId) ?? null;
  const filteredMappingRows = mappingRows.filter((row) =>
    mappingFilter === "all" ? true : row.mappingStatus === mappingFilter
  );
  const currentPageReady =
    Boolean(currentMapping?.repoPageId) && Boolean(queue?.repoPage);
  const completedCount =
    queue?.items.filter((item) => ["approved", "skipped"].includes(item.status)).length ?? 0;
  const totalCount = queue?.items.length ?? 0;
  const hasReviewContent =
    Boolean(analysis || skeleton || styling || verification || lastExecution);
  const analysisComplete = Boolean(analysis);
  const skeletonComplete = Boolean(skeleton);
  const skeletonEdited =
    Boolean(skeleton?.treeText) &&
    skeletonDraft.trim() !== "" &&
    skeletonDraft !== skeleton?.treeText;
  const insertionComplete = Boolean(currentTargetNodeId);
  const stylingComplete = Boolean(styling);
  const verificationComplete = Boolean(verification?.readyForApproval);

  const primaryAction = useMemo(() => {
    if (!currentQueueItem) {
      return null;
    }
    if (!analysis) {
      return {
        label: "Analyze source section",
        action: analyzeCurrentSection
      };
    }
    if (workflowMode !== "styleExisting" && !skeleton) {
      return {
        label: "Generate skeleton",
        action: generateCurrentSkeleton
      };
    }
    if (workflowMode !== "styleExisting" && skeleton && !currentTargetNodeId) {
      return {
        label: "Insert skeleton",
        action: insertSkeleton
      };
    }
    if (!styling || !verification?.readyForApproval) {
      return {
        label: styling ? "Refine styling" : "Style current section",
        action: styleCurrentSection
      };
    }
    return {
      label: "Approve and next",
      action: approveAndNext
    };
  }, [
    analysis,
    approveAndNext,
    currentQueueItem,
    currentTargetNodeId,
    generateCurrentSkeleton,
    insertSkeleton,
    skeleton,
    styleCurrentSection,
    styling,
    verification?.readyForApproval,
    workflowMode
  ]);

  async function refreshDesignerContext() {
    try {
      const context = await bridge.getContext();
      setDesignerContext((current) =>
        sameDesignerContext(current, context) ? current : context
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read Webflow context.");
    }
  }

  async function refreshLivePages(siteId: string) {
    const pages = await bridge.getSitePages(siteId);
    setLivePages(pages);
    return pages;
  }

  async function captureSharedStyles(siteId: string) {
    const sharedStyles = await bridge.inspectSharedStyles(siteId);
    setSharedStyleContext(sharedStyles);
    setSharedStyleSummary(summarizeSharedStyles(sharedStyles));
    return sharedStyles;
  }

  async function loadMappingsAndQueue(
    nextRepoId: string,
    nextSiteId: string,
    nextPageId: string | null,
    nextLivePages?: WebflowSitePage[]
  ) {
    const [savedMappings, latestLivePages] = await Promise.all([
      backend.getPageMappings(nextRepoId, nextSiteId, userId),
      nextLivePages ? Promise.resolve(nextLivePages) : refreshLivePages(nextSiteId)
    ]);

    const mergedRows = mergeMappingRows({
      livePages: latestLivePages,
      savedMappings,
      repoPageNameById,
      webflowSiteId: nextSiteId
    });
    setMappingRows(mergedRows);

    if (!nextPageId) {
      setQueue(null);
      setSelectedSectionId(null);
      return;
    }

    const nextQueue = await backend.getWorkflowQueue(
      nextRepoId,
      nextSiteId,
      nextPageId,
      userId
    );
    setQueue(nextQueue);
    setSelectedSectionId(nextSectionIdFromQueue(nextQueue));
    setActiveTab(nextQueue.mapping?.repoPageId ? "workspace" : "mappings");
  }

  useEffect(() => {
    refreshDesignerContext();
  }, []);

  useEffect(() => {
    if (!repoId || !designerContext?.siteId) {
      return;
    }
    loadMappingsAndQueue(repoId, designerContext.siteId, designerContext.pageId).catch(
      (err) => {
        setError(err instanceof Error ? err.message : "Failed to load workflow data.");
      }
    );
  }, [repoId, designerContext?.siteId, designerContext?.pageId, userId, repoPageNameById]);

  useEffect(() => {
    if (!repoId || !designerContext?.siteId || sharedStyleSummary) {
      return;
    }

    let cancelled = false;

    captureSharedStyles(designerContext.siteId).catch(() => {
      if (!cancelled) {
        setSharedStyleContext(null);
        setSharedStyleSummary("");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [repoId, designerContext?.siteId, sharedStyleSummary]);

  useEffect(() => {
    if (skeleton) {
      setSkeletonDraft(skeleton.treeText);
      setIsEditingSkeleton(false);
    } else {
      setSkeletonDraft("");
      setIsEditingSkeleton(false);
    }
  }, [skeleton]);

  useEffect(() => {
    if (hasBootstrappedRepo || repoId) {
      return;
    }
    if (!repoOwner || !repoName || !userId) {
      setHasBootstrappedRepo(true);
      return;
    }

    let cancelled = false;

    async function restoreRepoSession() {
      try {
        const derivedRepoId = persistedRepoId || (await computeStableRepoId(repoOwner, repoName));
        if (cancelled) {
          return;
        }
        setRepoId(derivedRepoId);
        setPersistedRepoId(derivedRepoId);

        if (!repoUrl) {
          return;
        }
        setLoading((current) => current ?? "Restoring workspace");
        const repoResponse = await backend.connectRepo({
          owner: repoOwner,
          name: repoName,
          repoUrl,
          provider: "github",
          requestedBy: userId
        });
        if (cancelled) {
          return;
        }
        setRepoId(repoResponse.repo.id);
        setPersistedRepoId(repoResponse.repo.id);
        try {
          const nextTree = await backend.getRepoTree(repoResponse.repo.id);
          if (!cancelled) {
            setRepoTree(nextTree);
          }
        } catch {
          if (!cancelled) {
            setRepoTree(null);
          }
        }
      } catch {
        // Keep startup tolerant. The explicit connect action can recover later.
      } finally {
        if (!cancelled) {
          setHasBootstrappedRepo(true);
          setLoading((current) =>
            current === "Restoring workspace" ? null : current
          );
        }
      }
    }

    restoreRepoSession();

    return () => {
      cancelled = true;
    };
  }, [
    hasBootstrappedRepo,
    persistedRepoId,
    repoId,
    repoOwner,
    repoName,
    repoUrl,
    userId,
    setPersistedRepoId
  ]);

  async function connectAndSyncRepo() {
    setLoading("Connecting repo");
    setError(null);
    try {
      const repoResponse = await backend.connectRepo({
        owner: repoOwner,
        name: repoName,
        repoUrl,
        provider: "github",
        requestedBy: userId
      });
      setRepoId(repoResponse.repo.id);
      setPersistedRepoId(repoResponse.repo.id);
      let nextTree = null;
      try {
        nextTree = await backend.getRepoTree(repoResponse.repo.id);
      } catch {
        nextTree = null;
      }

      if (!nextTree || nextTree.pages.length === 0) {
        setLoading("Syncing repo");
        await backend.syncRepo(repoResponse.repo.id);
        nextTree = await backend.getRepoTree(repoResponse.repo.id);
      }

      setRepoTree(nextTree);
      setActiveTab("mappings");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect repo.");
    } finally {
      setLoading(null);
    }
  }

  async function bindCurrentSite() {
    if (!repoId || !designerContext?.siteId) {
      setError("Connect a repo and open a Webflow site first.");
      return;
    }
    setLoading("Binding site");
    setError(null);
    try {
      const styles = await captureSharedStyles(designerContext.siteId);
      await backend.bindSite({
        repoId,
        webflowSiteId: designerContext.siteId,
        requestedBy: userId,
        sharedStyleContext: styles
      });
      const pages = await refreshLivePages(designerContext.siteId);
      await loadMappingsAndQueue(
        repoId,
        designerContext.siteId,
        designerContext.pageId,
        pages
      );
      setActiveTab("mappings");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to bind site.");
    } finally {
      setLoading(null);
    }
  }

  function updateMappingRow(webflowPageId: string, repoPageId: string | null) {
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
  }

  async function savePageMappings() {
    if (!repoId || !designerContext?.siteId) {
      setError("Bind the active site before saving page mappings.");
      return;
    }
    setLoading("Saving page mappings");
    setError(null);
    try {
      const input: PageMappingsUpsertInput = {
        repoId,
        webflowSiteId: designerContext.siteId,
        requestedBy: userId,
        mappings: mappingRows.map((row) => ({
          webflowPageId: row.webflowPageId,
          webflowPageName: row.webflowPageName,
          webflowPageRoute: row.webflowPageRoute,
          repoPageId: row.repoPageId
        }))
      };
      const savedRows = await backend.savePageMappings(input);
      const pages = await refreshLivePages(designerContext.siteId);
      setMappingRows(
        mergeMappingRows({
          livePages: pages,
          savedMappings: savedRows,
          repoPageNameById,
          webflowSiteId: designerContext.siteId
        })
      );
      if (designerContext.pageId) {
        const nextQueue = await backend.getWorkflowQueue(
          repoId,
          designerContext.siteId,
          designerContext.pageId,
          userId
        );
        setQueue(nextQueue);
        setSelectedSectionId(nextSectionIdFromQueue(nextQueue));
      }
      setActiveTab("workspace");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save page mappings.");
    } finally {
      setLoading(null);
    }
  }

  function currentWorkflowRequest(): {
    repoId: string;
    webflowSiteId: string;
    webflowPageId: string;
    sectionId: string;
    requestedBy: string;
    mode: WorkflowMode;
    selectedElementId: string | null;
  } {
    if (!repoId || !designerContext?.siteId || !designerContext.pageId || !selectedSectionId) {
      throw new Error("Choose a mapped page and current section first.");
    }
    return {
      repoId,
      webflowSiteId: designerContext.siteId,
      webflowPageId: designerContext.pageId,
      sectionId: selectedSectionId,
      requestedBy: userId,
      mode: workflowMode as WorkflowMode,
      selectedElementId: designerContext.selectedElementId
    };
  }

  async function analyzeCurrentSection() {
    setLoading("Analyzing section");
    setError(null);
    try {
      if (designerContext?.siteId && sharedStyleContext?.siteId !== designerContext.siteId) {
        await captureSharedStyles(designerContext.siteId);
      }
      const request = currentWorkflowRequest();
      const nextAnalysis = await backend.analyzeSection(request);
      setAnalysis(nextAnalysis);
      setVerification(null);
      setActiveTab("workspace");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze section.");
    } finally {
      setLoading(null);
    }
  }

  async function generateCurrentSkeleton() {
    setLoading("Generating skeleton");
    setError(null);
    try {
      if (designerContext?.siteId && sharedStyleContext?.siteId !== designerContext.siteId) {
        await captureSharedStyles(designerContext.siteId);
      }
      const request = currentWorkflowRequest();
      const nextSkeleton = await backend.generateSkeleton(request);
      setSkeleton(nextSkeleton);
      setVerification(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate skeleton.");
    } finally {
      setLoading(null);
    }
  }

  async function insertSkeleton() {
    if (!designerContext || !skeleton) {
      setError("Generate a skeleton before inserting it.");
      return;
    }
    setLoading("Inserting skeleton");
    setError(null);
    try {
      const editableSkeleton = isEditingSkeleton && skeletonEdited
        ? parseSkeletonTreeText(skeleton, skeletonDraft || skeleton.treeText)
        : skeleton;
      const context = await bridge.getContext();
      const placementTarget =
        placementMode === "afterSelected" ? context.selectedElementId : null;
      const result = await executeSkeletonPlan({
        bridge,
        context,
        plan: editableSkeleton,
        placementMode,
        placementTarget
      });
      setSkeleton(editableSkeleton);
      setLastExecution(result);
      setCurrentTargetNodeId(result.rootNodeId ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to insert skeleton.");
    } finally {
      setLoading(null);
    }
  }

  async function styleCurrentSection() {
    setLoading("Styling section");
    setError(null);
    try {
      const context = await bridge.getContext();
      const siteId = context.siteId;
      if (!siteId) {
        throw new Error("No active Webflow site.");
      }
      await captureSharedStyles(siteId);
      const request = {
        ...currentWorkflowRequest(),
        selectedElementId: currentTargetNodeId ?? context.selectedElementId
      };

      let targetNodeId = currentTargetNodeId ?? context.selectedElementId;
      if (workflowMode === "fullAssist" && !targetNodeId) {
        const nextSkeleton = skeleton
          ? isEditingSkeleton && skeletonEdited
            ? parseSkeletonTreeText(skeleton, skeletonDraft || skeleton.treeText)
            : skeleton
          : await backend.generateSkeleton(request);
        setSkeleton(nextSkeleton);
        const skeletonExecution = await executeSkeletonPlan({
          bridge,
          context,
          plan: nextSkeleton,
          placementMode,
          placementTarget:
            placementMode === "afterSelected" ? context.selectedElementId : null
        });
        setLastExecution(skeletonExecution);
        targetNodeId = skeletonExecution.rootNodeId ?? null;
        setCurrentTargetNodeId(targetNodeId);
      }

      if (workflowMode === "styleExisting" && !targetNodeId) {
        throw new Error("Select an existing section root in Designer first.");
      }

      const nextStyling = await backend.styleSection(request);
      setStyling(nextStyling);
      const stylingExecution = await applyStylingPlan({
        bridge,
        context,
        plan: nextStyling,
        targetNodeId
      });
      setLastExecution(stylingExecution);
      setVerification(await backend.verifySection(request));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to style section.");
    } finally {
      setLoading(null);
    }
  }

  async function approveAndNext() {
    if (!repoId || !designerContext?.siteId || !designerContext.pageId || !selectedSectionId) {
      setError("Choose a current section first.");
      return;
    }
    setLoading("Approving section");
    setError(null);
    try {
      const nextQueue = await backend.approveSection({
        repoId,
        webflowSiteId: designerContext.siteId,
        webflowPageId: designerContext.pageId,
        sectionId: selectedSectionId,
        requestedBy: userId
      });
      setQueue(nextQueue);
      setSelectedSectionId(nextSectionIdFromQueue(nextQueue));
      setAnalysis(null);
      setSkeleton(null);
      setStyling(null);
      setVerification(null);
      setLastExecution(null);
      setCurrentTargetNodeId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve section.");
    } finally {
      setLoading(null);
    }
  }

  async function skipCurrentSection() {
    if (!repoId || !designerContext?.siteId || !designerContext.pageId || !selectedSectionId) {
      setError("Choose a current section first.");
      return;
    }
    setLoading("Skipping section");
    setError(null);
    try {
      const nextQueue = await backend.skipSection({
        repoId,
        webflowSiteId: designerContext.siteId,
        webflowPageId: designerContext.pageId,
        sectionId: selectedSectionId,
        requestedBy: userId
      });
      setQueue(nextQueue);
      setSelectedSectionId(nextSectionIdFromQueue(nextQueue));
      setAnalysis(null);
      setSkeleton(null);
      setStyling(null);
      setVerification(null);
      setLastExecution(null);
      setCurrentTargetNodeId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to skip section.");
    } finally {
      setLoading(null);
    }
  }

  async function markPageComplete() {
    if (!repoId || !designerContext?.siteId || !designerContext.pageId) {
      setError("Open a mapped page first.");
      return;
    }
    setLoading("Completing page");
    setError(null);
    try {
      const nextQueue = await backend.completePage({
        repoId,
        webflowSiteId: designerContext.siteId,
        webflowPageId: designerContext.pageId,
        requestedBy: userId
      });
      setQueue(nextQueue);
      setSelectedSectionId(nextSectionIdFromQueue(nextQueue));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark page complete.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <main className="wf-app-shell">
      <header className="wf-app-header">
        <div>
          <p className="wf-app-kicker">Webflow Builder</p>
          <h1>Guided section workflow</h1>
          <p className="wf-app-subtle">
            Connect once, map the site, and work through sections in source order.
          </p>
        </div>
        <div className="wf-context-card">
          <span
            className={`wf-status-pill ${
              ["design", "build", "edit"].includes(designerContext?.mode ?? "")
                ? "is-success"
                : "is-muted"
            }`}
          >
            {["design", "build", "edit"].includes(designerContext?.mode ?? "")
              ? "Editable Designer"
              : "Designer not ready"}
          </span>
          <div className="wf-context-list">
            <span>Bridge</span>
            <span>{bridgeLabel}</span>
            <span>Site</span>
            <span>{designerContext?.siteName ?? designerContext?.siteId ?? "Unavailable"}</span>
            <span>Page</span>
            <span>{designerContext?.pageName ?? designerContext?.pageId ?? "Unavailable"}</span>
            <span>Selection</span>
            <span>{designerContext?.selectedElementId ?? "None"}</span>
            <span>Shared inventory</span>
            <span>{sharedStyleSummary || "Not captured"}</span>
          </div>
        </div>
      </header>

      <nav className="wf-tab-bar" aria-label="Workflow screens">
        {[
          ["settings", "Settings"],
          ["mappings", "Page mappings"],
          ["workspace", "Workspace"]
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={activeTab === id ? "is-active" : ""}
            onClick={() => setActiveTab(id as ScreenTab)}
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab !== "workspace" && loading ? (
        <p className="wf-banner wf-banner-info">{loading}…</p>
      ) : null}
      {activeTab !== "workspace" && error ? (
        <p className="wf-banner wf-banner-error">{error}</p>
      ) : null}

      {activeTab === "settings" ? (
        <section className="wf-panel-stack">
          <article className="wf-panel">
            <div className="wf-panel-header">
              <div>
                <h2>Repository and session</h2>
                <p>Connect the repo and sync supported pages and sections.</p>
              </div>
            </div>
            <div className="wf-form-grid">
              <label>
                User ID
                <input value={userId} onChange={(event) => setUserId(event.target.value)} />
              </label>
              <label>
                Repo owner
                <input value={repoOwner} onChange={(event) => setRepoOwner(event.target.value)} />
              </label>
              <label>
                Repo name
                <input value={repoName} onChange={(event) => setRepoName(event.target.value)} />
              </label>
              <label>
                Repo URL
                <input value={repoUrl} onChange={(event) => setRepoUrl(event.target.value)} />
              </label>
            </div>
            <div className="wf-actions">
              <button type="button" onClick={connectAndSyncRepo}>
                Connect and sync repo
              </button>
            </div>
          </article>

          <article className="wf-panel">
            <div className="wf-panel-header">
              <div>
                <h2>Designer site</h2>
                <p>Bind the active Webflow site and capture its shared classes and variables.</p>
              </div>
            </div>
            <div className="wf-detail-list">
              <span>Active site</span>
              <span>{designerContext?.siteName ?? designerContext?.siteId ?? "Unavailable"}</span>
              <span>Active page</span>
              <span>{designerContext?.pageName ?? designerContext?.pageId ?? "Unavailable"}</span>
            </div>
            <div className="wf-actions">
              <button type="button" onClick={bindCurrentSite} disabled={!repoId}>
                Bind active site
              </button>
              <button type="button" className="wf-secondary" onClick={refreshDesignerContext}>
                Refresh Designer context
              </button>
            </div>
          </article>

          <article className="wf-panel">
            <div className="wf-panel-header">
              <div>
                <h2>Workflow defaults</h2>
                <p>Choose how the current page should progress section by section.</p>
              </div>
            </div>
            <label>
              Default workflow mode
              <select
                value={workflowMode}
                onChange={(event) => setWorkflowMode(event.target.value)}
              >
                <option value="fullAssist">Full assist</option>
                <option value="skeletonThenStyle">Skeleton then style</option>
                <option value="styleExisting">Style existing section</option>
              </select>
            </label>
          </article>
        </section>
      ) : null}

      {activeTab === "mappings" ? (
        <section className="wf-panel-stack">
          <article className="wf-panel">
            <div className="wf-panel-header">
              <div>
                <h2>Site-wide page mappings</h2>
                <p>Map every Webflow page to a repo page once, then reuse it automatically.</p>
              </div>
              <div className="wf-inline-controls">
                <label className="wf-inline-field">
                  Filter
                  <select
                    value={mappingFilter}
                    onChange={(event) => setMappingFilter(event.target.value as MappingFilter)}
                  >
                    <option value="all">All pages</option>
                    <option value="mapped">Mapped</option>
                    <option value="unmapped">Unmapped</option>
                  </select>
                </label>
              </div>
            </div>

            {filteredMappingRows.length === 0 ? (
              <p className="wf-empty-state">
                Bind the active site to load Webflow pages for mapping.
              </p>
            ) : (
              <div className="wf-mapping-table" role="table" aria-label="Page mappings">
                <div className="wf-mapping-row wf-mapping-head" role="row">
                  <span>Webflow page</span>
                  <span>Route</span>
                  <span>Repo page</span>
                  <span>Status</span>
                </div>
                {filteredMappingRows.map((row) => (
                  <div className="wf-mapping-row" role="row" key={row.webflowPageId}>
                    <span>{row.webflowPageName}</span>
                    <span>{row.webflowPageRoute ?? "—"}</span>
                    <span>
                      <select
                        value={row.repoPageId ?? ""}
                        onChange={(event) =>
                          updateMappingRow(
                            row.webflowPageId,
                            event.target.value || null
                          )
                        }
                      >
                        <option value="">Unmapped</option>
                        {repoPages.map((entry) => (
                          <option key={entry.page.id} value={entry.page.id}>
                            {entry.page.name}
                          </option>
                        ))}
                      </select>
                    </span>
                    <span>{row.mappingStatus === "mapped" ? "Mapped" : "Unmapped"}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="wf-actions">
              <button type="button" onClick={savePageMappings} disabled={!repoId || !designerContext?.siteId}>
                Save mappings
              </button>
            </div>
          </article>
        </section>
      ) : null}

      {activeTab === "workspace" ? (
        <section className="wf-workspace-grid">
          <div className="wf-panel-stack">
            <article className="wf-panel">
              <div className="wf-panel-header">
                <div>
                  <h2>Current page</h2>
                  <p>Use the mapped repo page to walk sections in order.</p>
                </div>
                <div className="wf-inline-controls">
                  <button
                    type="button"
                    className="wf-secondary"
                    onClick={refreshDesignerContext}
                  >
                    Refresh Designer context
                  </button>
                  <span className="wf-status-pill">{completedCount}/{totalCount || 0} done</span>
                </div>
              </div>
              <div className="wf-detail-list">
                <span>Webflow page</span>
                <span>{designerContext?.pageName ?? designerContext?.pageId ?? "Unavailable"}</span>
                <span>Mapped repo page</span>
                <span>{queue?.repoPage?.name ?? currentMapping?.repoPageName ?? "Unmapped"}</span>
                <span>Current mode</span>
                <span>{modeLabel(workflowMode as WorkflowMode)}</span>
              </div>
              {!currentPageReady ? (
                <p className="wf-empty-state">
                  This Webflow page is not mapped yet. Open Page mappings and choose a repo page.
                </p>
              ) : null}
            </article>

            <article className="wf-panel">
              <div className="wf-panel-header">
                <div>
                  <h2>Section queue</h2>
                  <p>Select a section or continue from the next unfinished one.</p>
                </div>
              </div>
              {queue?.items.length ? (
                <div className="wf-queue-list">
                  {queue.items.map((item) => (
                    <button
                      type="button"
                      key={item.repoSectionId}
                      className={`wf-queue-item ${
                        selectedSectionId === item.repoSectionId ? "is-active" : ""
                      }`}
                      onClick={() => setSelectedSectionId(item.repoSectionId)}
                    >
                      <span>{item.sectionName}</span>
                      <span className="wf-queue-status">
                        <StepStatusIcon state={queueStatusTone(item.status)} />
                        <span>{statusLabel(item.status)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="wf-empty-state">No queued sections for the current page.</p>
              )}
            </article>
          </div>

          <div className="wf-workspace-focus">
            <article className="wf-panel">
              <div className="wf-panel-header">
                <div>
                  <h2>Current section</h2>
                  <p>One clear next step with compact controls.</p>
                </div>
                {currentQueueItem ? (
                  <span className="wf-status-pill">{statusLabel(currentQueueItem.status)}</span>
                ) : null}
              </div>

              {error ? (
                <p className="wf-banner wf-banner-error wf-banner-inline">{error}</p>
              ) : null}
              {loading ? (
                <p className="wf-banner wf-banner-info wf-banner-inline">{loading}…</p>
              ) : null}

              <div className="wf-current-section-grid">
                <div className="wf-detail-list">
                  <span>Section</span>
                  <span>{currentQueueItem?.sectionName ?? "None selected"}</span>
                  <span>Designer target</span>
                  <span title={currentTargetNodeId ?? designerContext?.selectedElementId ?? ""}>
                    {truncateTarget(currentTargetNodeId ?? designerContext?.selectedElementId)}
                  </span>
                  <span>Placement</span>
                  <span>{placementMode === "append" ? "Append to page body" : "Insert after selection"}</span>
                </div>

                <label>
                  Placement
                  <select
                    value={placementMode}
                    onChange={(event) =>
                      setPlacementMode(event.target.value as "append" | "afterSelected")
                    }
                  >
                    <option value="append">Append to page body</option>
                    <option value="afterSelected">Insert after selected element</option>
                  </select>
                </label>
              </div>

              <div className="wf-primary-action">
                <button
                  type="button"
                  className={`wf-primary-button ${
                    primaryAction?.label === "Analyze source section" && analysisComplete
                      ? "is-complete"
                      : primaryAction?.label === "Generate skeleton" && skeletonComplete
                        ? "is-complete"
                        : primaryAction?.label === "Style current section" && stylingComplete
                          ? "is-complete"
                          : ""
                  }`}
                  onClick={primaryAction?.action}
                  disabled={!primaryAction || !currentQueueItem || Boolean(loading)}
                >
                  <span className="wf-button-label">
                    {primaryAction?.label ? (
                      <StepStatusIcon
                        state={
                          primaryAction.label === "Analyze source section" && analysisComplete
                            ? "complete"
                            : primaryAction.label === "Generate skeleton" && skeletonComplete
                              ? "complete"
                              : primaryAction.label === "Style current section" &&
                                  stylingComplete
                                ? "complete"
                                : "active"
                        }
                      />
                    ) : null}
                    <span>{primaryAction?.label ?? "Choose a section"}</span>
                  </span>
                </button>
              </div>

              <div className="wf-secondary-actions">
                <button
                  type="button"
                  className={`wf-secondary wf-action-chip ${
                    skeletonComplete ? "is-complete" : ""
                  }`}
                  onClick={generateCurrentSkeleton}
                  disabled={!currentQueueItem || Boolean(loading)}
                >
                  <span className="wf-button-label">
                    <StepStatusIcon state={skeletonComplete ? "complete" : "pending"} />
                    <span>Generate skeleton</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={`wf-secondary wf-action-chip ${
                    insertionComplete ? "is-complete" : ""
                  }`}
                  onClick={insertSkeleton}
                  disabled={!skeleton || Boolean(loading)}
                >
                  <span className="wf-button-label">
                    <StepStatusIcon state={insertionComplete ? "complete" : "pending"} />
                    <span>Insert skeleton</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={`wf-secondary wf-action-chip ${
                    stylingComplete ? "is-complete" : ""
                  }`}
                  onClick={styleCurrentSection}
                  disabled={!currentQueueItem || Boolean(loading)}
                >
                  <span className="wf-button-label">
                    <StepStatusIcon state={stylingComplete ? "complete" : "pending"} />
                    <span>Style current section</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="wf-secondary wf-action-chip"
                  onClick={approveAndNext}
                  disabled={!currentQueueItem || Boolean(loading)}
                >
                  <span className="wf-button-label">
                    <StepStatusIcon state="pending" />
                    <span>Approve and next</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="wf-secondary wf-action-chip"
                  onClick={skipCurrentSection}
                  disabled={!currentQueueItem || Boolean(loading)}
                >
                  <span className="wf-button-label">
                    <StepStatusIcon state="skipped" />
                    <span>Skip</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="wf-secondary wf-action-chip is-wide"
                  onClick={markPageComplete}
                  disabled={!queue?.items.length || Boolean(loading)}
                >
                  <span className="wf-button-label">
                    <StepStatusIcon
                      state={completedCount === totalCount && totalCount > 0 ? "complete" : "pending"}
                    />
                    <span>Mark page complete</span>
                  </span>
                </button>
              </div>
            </article>

            <article className="wf-panel wf-review-panel">
              <div className="wf-panel-header">
                <div>
                  <h2>Review</h2>
                  <p>Analysis explains the source structure, recommends the next mode, and prepares the rest of the workflow.</p>
                </div>
              </div>

              {!hasReviewContent ? (
                <p className="wf-empty-state">
                  Run the next step for this section to populate the review panel.
                </p>
              ) : null}

              <div className="wf-review-stack">
                <section className="wf-review-block">
                  <h3>Analysis</h3>
                  {analysis ? (
                    <>
                      <p>{analysis.summary}</p>
                      {analysis.goals.length ? (
                        <ul>{analysis.goals.map((goal) => <li key={goal}>{goal}</li>)}</ul>
                      ) : null}
                      {analysis.warnings.length ? <ul>{warningList(analysis.warnings)}</ul> : null}
                    </>
                  ) : (
                    <p className="wf-empty-state">No analysis yet.</p>
                  )}
                </section>

                <section className="wf-review-block">
                  <h3>Skeleton</h3>
                  {skeleton ? (
                    <>
                      <div className="wf-review-inline-actions">
                        <p className="wf-review-hint">
                          Insert the generated skeleton as-is, or open editing if you want to correct structure or class names first.
                        </p>
                        {isEditingSkeleton ? (
                          <>
                            <button
                              type="button"
                              className="wf-tertiary"
                              disabled={!skeletonEdited}
                              onClick={() => setSkeletonDraft(skeleton.treeText)}
                            >
                              Reset edits
                            </button>
                            <button
                              type="button"
                              className="wf-tertiary"
                              onClick={() => setIsEditingSkeleton(false)}
                            >
                              Done editing
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="wf-tertiary"
                            onClick={() => setIsEditingSkeleton(true)}
                          >
                            Edit skeleton
                          </button>
                        )}
                      </div>
                      {isEditingSkeleton ? (
                        <textarea
                          className="wf-skeleton-editor"
                          value={skeletonDraft}
                          onChange={(event) => setSkeletonDraft(event.target.value)}
                          spellCheck={false}
                        />
                      ) : (
                        <pre className="wf-skeleton-preview">{skeleton.treeText}</pre>
                      )}
                      {skeleton.warnings.length ? <ul>{warningList(skeleton.warnings)}</ul> : null}
                    </>
                  ) : (
                    <p className="wf-empty-state">No skeleton generated yet.</p>
                  )}
                </section>

                <section className="wf-review-block">
                  <h3>Styling</h3>
                  {styling ? (
                    <>
                      <p>
                        {styling.reusableClasses.length} reusable classes,{" "}
                        {styling.suggestedNewClasses.length} suggested new classes,{" "}
                        {styling.styleDefinitions.length} style definitions.
                      </p>
                      {styling.notes.length ? (
                        <ul>{styling.notes.map((note) => <li key={note}>{note}</li>)}</ul>
                      ) : null}
                      {styling.warnings.length ? <ul>{warningList(styling.warnings)}</ul> : null}
                    </>
                  ) : (
                    <p className="wf-empty-state">No styling plan yet.</p>
                  )}
                </section>

                <section className="wf-review-block">
                  <h3>Execution</h3>
                  {lastExecution ? (
                    <>
                      <p>{lastExecution.success ? "Last action succeeded." : "Last action failed."}</p>
                      <p>
                        Created nodes: {lastExecution.createdNodeIds.length}. Created classes:{" "}
                        {lastExecution.createdClasses.length}.
                      </p>
                      {lastExecution.warnings.length ? (
                        <ul>{warningList(lastExecution.warnings)}</ul>
                      ) : null}
                      {lastExecution.rollbackOutcome ? (
                        <p>{lastExecution.rollbackOutcome.details}</p>
                      ) : null}
                    </>
                  ) : (
                    <p className="wf-empty-state">No execution results yet.</p>
                  )}
                </section>

                <section className="wf-review-block">
                  <h3>Verification</h3>
                  {verification ? (
                    <>
                      <p>{verification.summary}</p>
                      <p>
                        {verification.readyForApproval
                          ? "This section is ready for approval."
                          : "Review this section before approval."}
                      </p>
                      {verification.warnings.length ? (
                        <ul>{warningList(verification.warnings)}</ul>
                      ) : null}
                    </>
                  ) : (
                    <p className="wf-empty-state">No verification yet.</p>
                  )}
                </section>
              </div>
            </article>
          </div>
        </section>
      ) : null}
    </main>
  );
}
