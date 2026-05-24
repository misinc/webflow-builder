import {
  Home,
  RefreshCw,
  GripVertical,
  MoreVertical,
  ChevronRight,
  Clock,
  Sparkles,
  X,
  FileText
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
import type { SectionStatus } from "../types";

export function SectionListScreen() {
  const { navigate } = useNavigation();
  const {
    activeMapping,
    activeQueue,
    completeCurrentPage,
    componentBannerDismissed,
    componentOpportunities,
    createdComponentsByOpportunityId,
    currentSections,
    designerContext,
    dismissComponentBanner,
    refreshComponentOpportunities,
    selectSection
  } = useAppState();
  const builtCount =
    activeQueue?.items.filter((item) => item.status === "approved").length ?? 0;
  const skippedCount =
    activeQueue?.items.filter((item) => item.status === "skipped").length ?? 0;
  const totalCount = activeQueue?.items.length ?? 0;
  const remainingCount = Math.max(totalCount - builtCount - skippedCount, 0);
  const isMapped = Boolean(activeMapping?.repoPageId);
  const isPageComplete = totalCount > 0 && remainingCount === 0;
  const progressPercent =
    totalCount > 0 ? Math.round(((builtCount + skippedCount) / totalCount) * 100) : 0;
  const pendingOpportunities = componentOpportunities.filter(
    (opportunity) => !createdComponentsByOpportunityId[opportunity.id]
  );

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
          <Button variant="ghost" size="sm" onClick={() => void refreshComponentOpportunities()}>
            <RefreshCw size={12} />
            Re-scan
          </Button>
        }
      />

      {!componentBannerDismissed && pendingOpportunities.length > 0 && !isPageComplete ? (
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
              {pendingOpportunities.length} component opportunit
              {pendingOpportunities.length === 1 ? "y" : "ies"} detected
            </div>
            <div className="text-[11px] text-wb-text-tertiary mt-px">
              Repeating patterns were found in the synced repo. Review them before building this page.
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
                onClick={() => {
                  selectSection(section.id);
                  if (section.status === "complete" || section.status === "skipped") {
                    navigate("section-complete");
                    return;
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
        <div className="flex-1" />
        <Button
          variant="primary"
          onClick={() => {
            if (!isMapped) {
              navigate("not-mapped");
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
              : "Continue building"
            : "Resolve mapping"}
        </Button>
      </div>
    </Panel>
  );
}

function SectionRow({
  section,
  onClick
}: {
  section: {
    id: string;
    title: string;
    file: string;
    elements: number | null;
    status: SectionStatus | "in-progress";
  };
  onClick: () => void;
}) {
  const isActive = section.status === "in-progress";
  const clickable = section.status !== "complete" && section.status !== "skipped";

  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-md border text-left ${
        isActive
          ? "bg-wb-accent/10 border-wb-accent/30 cursor-pointer"
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
      <div className={`flex-shrink-0 ${isActive ? "text-wb-accent" : "text-wb-text-tertiary"}`}>
        {section.status === "complete" || section.status === "skipped" ? (
          <MoreVertical size={16} />
        ) : (
          <ChevronRight size={16} />
        )}
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
