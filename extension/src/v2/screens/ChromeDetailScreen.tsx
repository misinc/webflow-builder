import { useMemo, useState } from "react";
import { Clipboard, Pencil, Plus, RefreshCw } from "lucide-react";
import { copyWebflowPayloadToClipboard } from "../../webflow/clipboard.js";
import { Panel } from "../components/Panel";
import { Button, IconButton } from "../components/Button";
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

/**
 * Sitewide element detail — same review surface as a page section: skeleton
 * tree (editable) + sliced source, then Copy for Webflow → paste/cleanup.
 * The skeleton + payload were prepared together by startChromeBuild, so the
 * Copy click writes the clipboard synchronously.
 */
export function ChromeDetailScreen() {
  const { navigate } = useNavigation();
  const {
    beginSkeletonEdit,
    error,
    isMutating,
    loadingLabel,
    selectedChrome,
    setPasteScope,
    setUiHint,
    skeleton,
    startChromeBuild
  } = useAppState();
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [copyLabel, setCopyLabel] = useState("Copy for Webflow");

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
  const isGenerating = isMutating && loadingLabel === "Generating skeleton";
  const title = selectedChrome?.title ?? "Sitewide element";
  const sourceLines = (selectedChrome?.sourceCode ?? "").replace(/\t/g, "  ").split("\n");

  const copyForWebflow = () => {
    if (!selectedChrome) {
      return;
    }
    try {
      copyWebflowPayloadToClipboard(selectedChrome.payload);
      setPasteScope(selectedChrome.kind === "header" ? "chrome-header" : "chrome-footer");
      setUiHint(
        selectedChrome.kind === "header"
          ? "Paste the navbar inside your page-wrapper, above main-wrapper."
          : "Paste the footer inside your page-wrapper, below main-wrapper."
      );
      navigate("paste-section");
    } catch {
      setCopyLabel("Click again to copy");
    }
  };

  return (
    <Panel
      onClose={() => navigate("site-chrome")}
      footer={
        <>
          <div className="flex-1" />
          <span className="text-[11px] text-wb-text-tertiary mr-2">
            {isGenerating
              ? "Generating skeleton…"
              : `${elementCount} elements · ${classCount} classes`}
          </span>
          <Button
            variant="primary"
            disabled={!selectedChrome || isGenerating || isMutating}
            onClick={copyForWebflow}
            title="Copies this sitewide element as a Webflow paste payload (structure + full styles + SVG icons), then walks you through the paste."
          >
            <Clipboard size={12} />
            {copyLabel}
          </Button>
        </>
      }
    >
      <SectionDetailHeader
        eyebrow="Site setup"
        title={title}
        onBack={() => navigate("site-chrome")}
        trailing={
          <Button
            variant="ghost"
            size="sm"
            disabled={isGenerating || !selectedChrome}
            onClick={() => {
              if (selectedChrome) {
                void startChromeBuild(selectedChrome.kind);
              }
            }}
          >
            <RefreshCw size={12} />
            Regenerate
          </Button>
        }
      />

      <div className="flex flex-1 min-h-0">
        <div className="w-1/2 border-r border-white/[0.09] flex flex-col min-w-0">
          <SplitHeader
            title="Skeleton tree"
            actions={
              <>
                <IconButton
                  disabled={isGenerating || !displaySkeleton}
                  onClick={() => {
                    beginSkeletonEdit();
                    navigate("skeleton-edit");
                  }}
                  aria-label="Add element"
                >
                  <Plus size={13} />
                </IconButton>
                <IconButton
                  disabled={isGenerating || !displaySkeleton}
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
                {isGenerating ? (
                  <div className="flex flex-col items-center justify-center gap-3 text-center">
                    <Spinner size={28} thickness={2.5} />
                    <div>
                      <div className="text-[15px] font-medium text-wb-text-primary">
                        Generating skeleton
                      </div>
                      <div className="text-[12px] text-wb-text-tertiary mt-1">
                        Slicing the chrome around &lt;main&gt; and resolving its styles.
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
          <SplitHeader title={`Source · around <main>`} />
          <div className="flex-1 overflow-auto p-4 font-mono text-[11.5px] text-wb-text-secondary bg-black/[0.18] leading-relaxed">
            {selectedChrome?.sourceCode ? (
              <CodePreview lines={sourceLines} />
            ) : (
              <div className="text-wb-text-tertiary">// Source unavailable.</div>
            )}
          </div>
        </div>
      </div>
      {error && !isGenerating ? (
        <div className="px-5 py-2 text-[11.5px] text-wb-danger border-t border-white/[0.06]">
          {error}
        </div>
      ) : null}
    </Panel>
  );
}
