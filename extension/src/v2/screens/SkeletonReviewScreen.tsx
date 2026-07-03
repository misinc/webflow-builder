import { useEffect, useMemo, useState } from "react";
import { Clipboard, ExternalLink, Pencil, Plus, RefreshCw } from "lucide-react";
import { copyWebflowPayloadToClipboard } from "../../webflow/clipboard.js";
import { Panel } from "../components/Panel";
import { Button, IconButton } from "../components/Button";
import { Stepper, buildStepper } from "../components/Stepper";
import { SectionDetailHeader } from "../components/Headers";
import { Spinner } from "../components/Spinner";
import {
  CodePreview,
  SkeletonTree,
  SplitHeader,
  collectSkeletonClassNames,
  countSkeletonNodes
} from "../components/SkeletonPanes";
import { useNavigation } from "../context/NavigationContext";
import { useAppState } from "../context/AppStateContext";
import { normalizeSkeletonPlan } from "../../skeleton/tree.js";


export function SkeletonReviewScreen() {
  const { navigate } = useNavigation();
  const {
    analysis,
    beginSkeletonEdit,
    buildClipboardPayload,
    error,
    isMutating,
    loadingLabel,
    regenerateSkeleton,
    selectedSection,
    selectedSectionId,
    setPasteScope,
    setUiHint,
    skipCurrentSection,
    skeleton
  } = useAppState();
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [copyLabel, setCopyLabel] = useState("Copy for Webflow");
  const [pendingPayload, setPendingPayload] = useState<string | null>(null);
  const [preparedSection, setPreparedSection] = useState<{ id: string; payload: string } | null>(null);

  // Prefetch the section payload so the Copy click writes the clipboard
  // synchronously (inside the browser's user-activation window).
  useEffect(() => {
    if (!selectedSectionId) {
      setPreparedSection(null);
      return;
    }
    let cancelled = false;
    setPreparedSection(null);
    void buildClipboardPayload(selectedSectionId, undefined, { silent: true }).then((result) => {
      if (!cancelled && result) {
        setPreparedSection({ id: selectedSectionId, payload: result.payload });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedSectionId, buildClipboardPayload]);

  const copySectionForWebflow = async () => {
    if (!selectedSectionId) {
      return;
    }
    // Preferred path: the background-prepared payload copies synchronously.
    let payload =
      preparedSection && preparedSection.id === selectedSectionId
        ? preparedSection.payload
        : pendingPayload;
    if (!payload) {
      const result = await buildClipboardPayload(selectedSectionId);
      if (!result) {
        return;
      }
      payload = result.payload;
    }
    try {
      copyWebflowPayloadToClipboard(payload);
      setPendingPayload(null);
      setPasteScope("section");
      setUiHint(
        "On the canvas: click where the section should go, press Cmd+V, then select the pasted section and Clean up paste."
      );
      navigate("paste-section");
    } catch {
      setPendingPayload(payload);
      setCopyLabel("Click again to copy");
    }
  };
  const sourceText = (analysis?.sourceCode?.trim() || selectedSection?.sourceCode?.trim() || "");
  const displaySkeleton = useMemo(() => {
    if (!skeleton) {
      return null;
    }
    return normalizeSkeletonPlan(skeleton);
  }, [skeleton]);
  const elementCount = displaySkeleton ? countSkeletonNodes(displaySkeleton.elementTree) : 0;
  const classCount = displaySkeleton
    ? new Set(collectSkeletonClassNames(displaySkeleton.elementTree)).size
    : 0;
  const isRefreshingSkeleton =
    Boolean(displaySkeleton) && isMutating && loadingLabel === "Generating skeleton";
  const isGeneratingSkeleton =
    !displaySkeleton &&
    isMutating &&
    (loadingLabel === "Generating skeleton" || loadingLabel === "Analyzing section" || !loadingLabel);
  const sourceLines = sourceText
    .replace(/\t/g, "  ")
    .split("\n");

  return (
    <Panel
      onClose={() => navigate("section-list")}
      footer={
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void skipCurrentSection().then((skipped) => {
                if (skipped) {
                  navigate("section-list");
                }
              });
            }}
          >
            Skip this section
          </Button>
          <div className="flex-1" />
          <span className="text-[11px] text-wb-text-tertiary mr-2">
            {isRefreshingSkeleton
              ? "Regenerating skeleton…"
              : isGeneratingSkeleton
              ? "Generating skeleton…"
              : `${elementCount} elements · ${classCount} classes`}
          </span>
          <Button
            variant="primary"
            disabled={
              !displaySkeleton || isGeneratingSkeleton || isRefreshingSkeleton || isMutating
            }
            onClick={() => {
              void copySectionForWebflow();
            }}
            title="Copies this section as a Webflow paste payload (structure + full styles + SVG icons), then walks you through the paste."
          >
            <Clipboard size={12} />
            {isMutating && loadingLabel === "Preparing section copy" ? "Preparing…" : copyLabel}
          </Button>
        </>
      }
    >
      <SectionDetailHeader
        eyebrow="Build flow"
        title={selectedSection?.title ?? "Current section"}
        onBack={() => navigate("section-list")}
        trailing={
          <Button
            variant="ghost"
            size="sm"
            disabled={isGeneratingSkeleton || isRefreshingSkeleton}
            onClick={() => {
              void regenerateSkeleton();
            }}
          >
            <RefreshCw size={12} />
            Regenerate
          </Button>
        }
      />

      <Stepper steps={buildStepper("skeleton")} />

      <div className="flex flex-1 min-h-0">
        <div className="w-1/2 border-r border-white/[0.09] flex flex-col min-w-0">
          <SplitHeader
            title="Skeleton tree"
            actions={
              <>
                <IconButton
                  disabled={isRefreshingSkeleton}
                  onClick={() => {
                    beginSkeletonEdit();
                    navigate("skeleton-edit");
                  }}
                  aria-label="Add element"
                >
                  <Plus size={13} />
                </IconButton>
                <IconButton
                  disabled={isRefreshingSkeleton}
                  onClick={() => {
                    beginSkeletonEdit();
                    navigate("skeleton-edit");
                  }}
                  aria-label="Edit tree"
                >
                  <Pencil size={13} />
                </IconButton>
              </>
            }
          />
          <div className="px-4 py-3 overflow-auto flex-1">
            {displaySkeleton ? (
              <SkeletonTree
                node={displaySkeleton.elementTree}
                collapsedIds={collapsedIds}
                onToggle={(nodeId) =>
                  setCollapsedIds((current) => {
                    const next = new Set(current);
                    if (next.has(nodeId)) {
                      next.delete(nodeId);
                    } else {
                      next.add(nodeId);
                    }
                    return next;
                  })
                }
              />
            ) : (
              <div className="h-full flex items-center justify-center">
                {isGeneratingSkeleton ? (
                  <div className="flex flex-col items-center justify-center gap-3 text-center">
                    <Spinner size={28} thickness={2.5} />
                    <div>
                      <div className="text-[15px] font-medium text-wb-text-primary">
                        {loadingLabel ?? "Generating skeleton"}
                      </div>
                      <div className="text-[12px] text-wb-text-tertiary mt-1">
                        Reading the repo section and building a Webflow-friendly tree with class names.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="font-mono text-[12px] text-wb-text-tertiary">
                    No skeleton generated yet.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="w-1/2 flex flex-col min-w-0">
          <SplitHeader
            title={`Source · ${selectedSection?.file ?? "repo source"}`}
            actions={
              <IconButton aria-label="Source reference">
                <ExternalLink size={13} />
              </IconButton>
            }
          />
          <div className="flex-1 overflow-auto p-4 font-mono text-[11.5px] text-wb-text-secondary bg-black/[0.18] leading-relaxed">
            {sourceText ? (
              <CodePreview lines={sourceLines} />
            ) : (
              <div className="text-wb-text-tertiary">// Source unavailable for this section.</div>
            )}
          </div>
        </div>
      </div>
      {error && !isGeneratingSkeleton && !isRefreshingSkeleton ? (
        <div className="px-5 py-2 text-[11.5px] text-wb-danger border-t border-white/[0.06]">
          {error}
        </div>
      ) : null}
    </Panel>
  );
}
