import { useState } from "react";
import {
  Home,
  RefreshCw,
  GripVertical,
  ChevronRight,
  Clipboard,
  Clock,
  Sparkles,
  X,
  FileText,
  CheckCircle2
} from "lucide-react";
import { Panel, PanelContent } from "../components/Panel";
import { Button } from "../components/Button";
import { ListHeader, PageHeader } from "../components/Headers";
import {
  Badge,
  CompleteBadge,
  InProgressBadge,
  SkippedBadge,
  StatusDot
} from "../components/Badge";
import { useNavigation } from "../context/NavigationContext";
import { useAppState } from "../context/AppStateContext";
import { getWebflowBridge } from "../../webflow/bridge.js";
import { copyWebflowPayloadToClipboard } from "../../webflow/clipboard.js";
import type { SectionStatus } from "../types";

const bridge = getWebflowBridge();

export function SectionListScreen() {
  const { navigate } = useNavigation();
  const {
    activeMapping,
    activeQueue,
    approveAllRemainingSections,
    buildClipboardPayload,
    confirmSiteStylePlan,
    completeCurrentPage,
    componentBannerDismissed,
    componentForSection,
    componentOpportunities,
    currentSections,
    designerContext,
    dismissComponentBanner,
    insertComponentInstance,
    isMutating,
    loadingLabel,
    refreshComponentOpportunities,
    refreshSiteStylePlan,
    rescanSelectedRepo,
    selectedSection,
    selectSection,
    reinsertSection,
    siteStylePlan
  } = useAppState();
  const builtCount =
    activeQueue?.items.filter((item) => item.status === "approved").length ?? 0;
  const skippedCount =
    activeQueue?.items.filter((item) => item.status === "skipped").length ?? 0;
  const totalCount = activeQueue?.items.length ?? 0;
  const remainingCount = Math.max(totalCount - builtCount - skippedCount, 0);
  const isMapped = Boolean(activeMapping?.repoPageId);
  const isPageComplete = totalCount > 0 && remainingCount === 0;
  const canContinue = isMapped && currentSections.length > 0 && Boolean(selectedSection);
  const progressPercent =
    totalCount > 0 ? Math.round(((builtCount + skippedCount) / totalCount) * 100) : 0;

  const [copyPageLabel, setCopyPageLabel] = useState("Copy page for Webflow");
  const [cleanupLabel, setCleanupLabel] = useState("Clean up paste");
  const [hasCopiedPage, setHasCopiedPage] = useState(false);
  const [pasteHint, setPasteHint] = useState<string | null>(null);
  const [pendingPayload, setPendingPayload] = useState<string | null>(null);

  const copyPageForWebflow = async () => {
    // A slow payload fetch can outlive the click's user-activation window, in
    // which case the clipboard write is blocked — we keep the payload and the
    // second click copies it synchronously.
    // Sections whose Webflow Component already exists are left OUT of the page
    // payload — pasting would create a flattened duplicate; they get linked
    // instances via their "Insert instance" chip instead.
    const componentizedSections = currentSections.filter(
      (section) =>
        (section.status === "pending" || section.status === "in-progress") &&
        componentForSection(section)
    );
    let payload = pendingPayload;
    let sectionCount: number | null = null;
    if (!payload) {
      const result = await buildClipboardPayload(
        undefined,
        componentizedSections.map((section) => section.id)
      );
      if (!result) {
        return;
      }
      payload = result.payload;
      sectionCount = result.sections.length;
    }
    try {
      copyWebflowPayloadToClipboard(payload);
      setPendingPayload(null);
      setHasCopiedPage(true);
      setCopyPageLabel(sectionCount ? `Copied ${sectionCount} sections` : "Copied");
      setPasteHint(
        componentizedSections.length > 0
          ? `Paste on the canvas, then Clean up paste. Skipped ${componentizedSections.length} section${componentizedSections.length === 1 ? "" : "s"} with existing components — use their Insert instance chips.`
          : "On the canvas: select the page body, press Cmd+V, then select the pasted wrapper and click Clean up paste."
      );
      window.setTimeout(() => setCopyPageLabel("Copy page for Webflow"), 3200);
      window.setTimeout(() => setPasteHint(null), 12000);
    } catch {
      setPendingPayload(payload);
      setCopyPageLabel("Click again to copy");
    }
  };

  const cleanupPaste = async () => {
    setCleanupLabel("Cleaning…");
    try {
      const deduped = await bridge.dedupeSelectionStyles();
      const bound = await bridge.bindTokensInSelection();
      setCleanupLabel(
        `${deduped.swappedClasses.length} class${deduped.swappedClasses.length === 1 ? "" : "es"} · ${bound.boundProperties} token${bound.boundProperties === 1 ? "" : "s"}`
      );
      window.setTimeout(() => setCleanupLabel("Clean up paste"), 3200);
    } catch (err) {
      setCleanupLabel("Clean up paste");
      setPasteHint(err instanceof Error ? err.message : "Cleanup failed — select the pasted element first.");
      window.setTimeout(() => setPasteHint(null), 6000);
    }
  };

  return (
    <Panel>
      <PageHeader
        icon={designerContext?.pageId === activeMapping?.webflowPageId ? <Home size={16} /> : <FileText size={16} />}
        label="Currently editing"
        name={
          <>
            {designerContext?.pageName ?? "No page selected"}
            <span className="text-[11px] text-wb-text-tertiary font-normal font-mono">
              {" "}
              · {activeQueue?.repoPage?.sourceFile ?? activeMapping?.webflowPageRoute ?? "Unmapped"}
            </span>
          </>
        }
        progressPercent={progressPercent}
        progressFromTo={progressPercent > 0 && progressPercent < 100 ? { from: "#00d09c", to: "#146ef5" } : undefined}
        progressDoneText={
          isMapped
            ? `${builtCount} of ${totalCount} sections built`
            : "This Webflow page is not mapped yet"
        }
        progressRemainingText={
          isMapped
            ? `${skippedCount} skipped · ${remainingCount} remaining`
            : "Choose a repo page before building"
        }
        trailing={
          <Button
            variant="ghost"
            size="sm"
            disabled={isMutating}
            onClick={() => {
              void rescanSelectedRepo().then((rescanned) => {
                if (rescanned) {
                  void refreshComponentOpportunities();
                }
              });
            }}
          >
            <RefreshCw size={12} />
            {isMutating && loadingLabel ? loadingLabel : "Re-scan"}
          </Button>
        }
      />

      {!componentBannerDismissed && componentOpportunities.length > 0 && !isPageComplete ? (
        <div
          className="px-5 py-2.5 flex items-center gap-3 flex-shrink-0 border-b"
          style={{
            background: "rgba(180,108,255,0.06)",
            borderColor: "rgba(180,108,255,0.18)"
          }}
        >
          <div
            className="w-6.5 h-6.5 rounded-md inline-flex items-center justify-center flex-shrink-0"
            style={{
              background: "rgba(180,108,255,0.14)",
              border: "1px solid rgba(180,108,255,0.32)",
              color: "#cf9bff"
            }}
          >
            <Sparkles size={13} fill="currentColor" strokeWidth={0} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] text-wb-text-primary font-medium">
              {componentOpportunities.length} component opportunit
              {componentOpportunities.length === 1 ? "y" : "ies"} detected
            </div>
            <div className="text-[11px] text-wb-text-tertiary mt-px">
              Reusable patterns worth considering as Webflow Components for easier site maintenance.
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("component-opportunities")}
            className="h-6.5 px-2.5 text-[11.5px] font-medium rounded border inline-flex items-center justify-center transition-colors"
            style={{
              borderColor: "rgba(180,108,255,0.32)",
              color: "#cf9bff",
              background: "transparent"
            }}
          >
            Review
          </button>
          <button
            type="button"
            onClick={dismissComponentBanner}
            aria-label="Dismiss"
            className="w-6 h-6 rounded inline-flex items-center justify-center text-wb-text-tertiary hover:bg-white/[0.06] hover:text-wb-text-primary transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      ) : null}

      {isMapped && siteStylePlan ? (
        <div
          className="px-5 py-3 flex items-center gap-3 flex-shrink-0 border-b"
          style={{
            background: siteStylePlan.status === "confirmed" ? "rgba(0,208,156,0.06)" : "rgba(255,184,0,0.07)",
            borderColor: siteStylePlan.status === "confirmed" ? "rgba(0,208,156,0.18)" : "rgba(255,184,0,0.18)"
          }}
        >
          <div
            className="w-7 h-7 rounded-md inline-flex items-center justify-center flex-shrink-0"
            style={{
              background: siteStylePlan.status === "confirmed" ? "rgba(0,208,156,0.14)" : "rgba(255,184,0,0.14)",
              border: siteStylePlan.status === "confirmed" ? "1px solid rgba(0,208,156,0.28)" : "1px solid rgba(255,184,0,0.28)",
              color: siteStylePlan.status === "confirmed" ? "#00d09c" : "#ffcf4a"
            }}
          >
            {siteStylePlan.status === "confirmed" ? <CheckCircle2 size={14} /> : <Sparkles size={14} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] text-wb-text-primary font-medium">
              Site style plan {siteStylePlan.status === "confirmed" ? "confirmed" : "needs confirmation"}
            </div>
            <div className="text-[11px] text-wb-text-tertiary mt-px">
              {siteStylePlan.classCounts.reuse} reused · {siteStylePlan.classCounts.create} new · {siteStylePlan.variableNames.length} variables
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={isMutating}
            onClick={() => {
              void refreshSiteStylePlan();
            }}
          >
            <RefreshCw size={12} />
            Refresh
          </Button>
          {siteStylePlan.status !== "confirmed" ? (
            <Button
              variant="primary"
              size="sm"
              disabled={isMutating}
              onClick={() => {
                void confirmSiteStylePlan();
              }}
            >
              Confirm
            </Button>
          ) : null}
        </div>
      ) : null}

      <PanelContent>
        <ListHeader
          title="Sections in this page"
          count={isMapped ? `${currentSections.length} detected` : "Not mapped"}
        />

        <div className="px-3 py-2">
          {!isMapped ? (
            <div className="px-3 py-6 text-[12.5px] text-wb-text-tertiary">
              This page has no saved repo mapping yet.
            </div>
          ) : currentSections.length === 0 ? (
            <div className="px-3 py-6 text-[12.5px] text-wb-text-tertiary">
              No indexed sections were found for the mapped repo page.
            </div>
          ) : (
            currentSections.map((section) => (
              <SectionRow
                key={section.id}
                section={section}
                componentAvailable={
                  section.status === "pending" || section.status === "in-progress"
                    ? componentForSection(section)
                    : null
                }
                onInsertInstance={
                  isMutating
                    ? undefined
                    : () => {
                        void insertComponentInstance(section.id);
                      }
                }
                onClick={() => {
                  // Completed sections go back to the skeleton screen and rebuild
                  // from scratch; others just continue where they are.
                  if (section.status === "complete") {
                    reinsertSection(section.id);
                  } else {
                    selectSection(section.id);
                  }
                  navigate("generating-skeleton");
                }}
              />
            ))
          )}
        </div>
      </PanelContent>

      <div className="border-t border-white/[0.09] px-5 py-3 bg-black/20 flex gap-2 items-center flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={() => navigate("site-progress")}>
          <Clock size={12} />
          Site progress
        </Button>
        {pasteHint ? (
          <span className="text-[11px] text-wb-text-primary min-w-0 truncate" title={pasteHint}>
            {pasteHint}
          </span>
        ) : null}
        <div className="flex-1" />
        {isMapped && !isPageComplete ? (
          <Button
            variant="ghost"
            disabled={isMutating}
            onClick={() => {
              void cleanupPaste();
            }}
            title="Select the pasted element on the canvas first — swaps duplicated 'name 2' classes to your existing classes and relinks values to your variables."
          >
            {cleanupLabel}
          </Button>
        ) : null}
        {isMapped && hasCopiedPage && !isPageComplete ? (
          <Button
            variant="ghost"
            disabled={isMutating}
            onClick={() => {
              void approveAllRemainingSections();
            }}
            title="Mark every remaining section of this page as built (after pasting the whole page)."
          >
            Approve all
          </Button>
        ) : null}
        <Button
          variant={isMapped && !isPageComplete ? "ghost" : "primary"}
          disabled={!isMapped ? false : !canContinue && !isPageComplete}
          onClick={() => {
            if (!isMapped) {
              navigate("not-mapped");
              return;
            }
            if (!canContinue && !isPageComplete) {
              return;
            }
            if (isPageComplete) {
              void completeCurrentPage().then((complete) => {
                if (complete) {
                  navigate("page-complete");
                }
              });
              return;
            }
            navigate("generating-skeleton");
          }}
        >
          {isMapped
            ? isPageComplete
              ? "See page summary"
              : currentSections.length === 0
                ? "No sections detected"
                : selectedSection
                  ? "Continue building"
                  : "Select a section"
            : "Resolve mapping"}
        </Button>
        {isMapped && !isPageComplete && currentSections.length > 0 ? (
          <Button
            variant="primary"
            disabled={isMutating}
            onClick={() => {
              void copyPageForWebflow();
            }}
            title="Builds the whole page (all remaining sections, full styles, SVG icons) as one Webflow paste payload."
          >
            <Clipboard size={12} />
            {isMutating && loadingLabel === "Preparing page copy" ? "Preparing…" : copyPageLabel}
          </Button>
        ) : null}
      </div>
    </Panel>
  );
}

function SectionRow({
  section,
  componentAvailable,
  onInsertInstance,
  onClick
}: {
  section: {
    id: string;
    title: string;
    file: string;
    elements: number | null;
    status: SectionStatus | "in-progress";
  };
  componentAvailable?: { id: string; name: string } | null;
  onInsertInstance?: () => void;
  onClick: () => void;
}) {
  const isActive = section.status === "in-progress";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-md border text-left cursor-pointer ${
        isActive
          ? "bg-wb-accent/10 border-wb-accent/30"
          : "border-transparent hover:bg-wb-surface-1 hover:border-white/[0.09]"
      }`}
    >
      <div className="w-[18px] text-wb-text-disabled flex justify-center flex-shrink-0">
        <GripVertical size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[13px] font-medium text-wb-text-primary mb-0.5">
          <StatusDot status={section.status} />
          {section.title}
          {renderBadge(section.status)}
        </div>
        <div className="text-[11.5px] text-wb-text-tertiary font-mono">
          {section.file}
          {section.elements ? ` · ${section.elements} elements` : ""}
        </div>
      </div>
      {componentAvailable && onInsertInstance ? (
        <span
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            onInsertInstance();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.stopPropagation();
              event.preventDefault();
              onInsertInstance();
            }
          }}
          title={`The component "${componentAvailable.name}" already exists for this section — insert an instance instead of rebuilding.`}
          className="flex-shrink-0 h-6.5 px-2.5 text-[11.5px] font-medium rounded border inline-flex items-center justify-center gap-1 transition-colors"
          style={{
            borderColor: "rgba(180,108,255,0.32)",
            color: "#cf9bff",
            background: "rgba(180,108,255,0.06)"
          }}
        >
          <Sparkles size={11} fill="currentColor" strokeWidth={0} />
          Insert instance
        </span>
      ) : null}
      <div className={`flex-shrink-0 ${isActive ? "text-wb-accent" : "text-wb-text-tertiary"}`}>
        <ChevronRight size={16} />
      </div>
    </button>
  );
}

function renderBadge(status: SectionStatus | "in-progress") {
  switch (status) {
    case "complete":
      return <CompleteBadge />;
    case "in-progress":
      return <InProgressBadge />;
    case "skipped":
      return <SkippedBadge />;
    case "pending":
      return <Badge tone="pending">Pending</Badge>;
    case "error":
      return <Badge tone="error">Failed</Badge>;
    default:
      return null;
  }
}
