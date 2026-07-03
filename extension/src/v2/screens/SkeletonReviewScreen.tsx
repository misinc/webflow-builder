import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Clipboard, ExternalLink, Pencil, Plus, RefreshCw } from "lucide-react";
import { copyWebflowPayloadToClipboard } from "../../webflow/clipboard.js";
import { Panel } from "../components/Panel";
import { Button, IconButton } from "../components/Button";
import { Stepper, buildStepper } from "../components/Stepper";
import { SectionDetailHeader } from "../components/Headers";
import { Spinner } from "../components/Spinner";
import { useNavigation } from "../context/NavigationContext";
import { useAppState } from "../context/AppStateContext";
import type { BuildNode } from "@wfb/shared/contracts.js";
import { getSkeletonDisplayTag, normalizeSkeletonPlan } from "../../skeleton/tree.js";


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
  const elementCount = displaySkeleton ? countNodes(displaySkeleton.elementTree) : 0;
  const classCount = displaySkeleton
    ? new Set(collectClassNames(displaySkeleton.elementTree)).size
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

function SplitHeader({
  title,
  actions
}: {
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="px-4 py-2.5 border-b border-white/[0.09] text-[11px] font-semibold text-wb-text-tertiary uppercase tracking-wider flex items-center justify-between flex-shrink-0 bg-black/[0.12]">
      <span>{title}</span>
      {actions && <div className="flex gap-1">{actions}</div>}
    </div>
  );
}

function SkeletonTree({
  node,
  collapsedIds,
  onToggle
}: {
  node: BuildNode;
  collapsedIds: Set<string>;
  onToggle: (nodeId: string) => void;
}) {
  return (
    <div className="font-mono text-[12px] text-wb-text-secondary leading-relaxed">
      <TreeNodeLine node={node} collapsedIds={collapsedIds} onToggle={onToggle} />
    </div>
  );
}

function TreeNodeLine({
  node,
  collapsedIds,
  onToggle,
  depth = 0
}: {
  node: BuildNode;
  collapsedIds: Set<string>;
  onToggle: (nodeId: string) => void;
  depth?: number;
}) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsedIds.has(node.id);
  const textContent = node.textContent?.trim();

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-default ${
          depth === 0 ? "text-wb-text-primary" : "hover:bg-white/[0.03]"
        }`}
      >
        <button
          type="button"
          className="w-3.5 text-wb-text-tertiary inline-flex flex-shrink-0 items-center justify-center"
          onClick={() => {
            if (hasChildren) {
              onToggle(node.id);
            }
          }}
          aria-label={hasChildren ? (isCollapsed ? "Expand node" : "Collapse node") : "Leaf node"}
        >
          {hasChildren ? (isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />) : null}
        </button>
        <span className="text-[#ff80b5]">{`<${getSkeletonDisplayTag(node)}>`}</span>
        {node.classNames.length > 0 ? (
          <span className="text-[#8ad7ff]">{node.classNames.map((name) => `.${name}`).join("")}</span>
        ) : null}
        {textContent ? (
          <span className="text-wb-text-tertiary italic">{JSON.stringify(textContent)}</span>
        ) : null}
      </div>
      {hasChildren && !isCollapsed ? (
        <div className="pl-4 ml-1.5 border-l border-dashed border-white/[0.08]">
          {node.children.map((child) => (
            <TreeNodeLine
              key={child.id}
              node={child}
              collapsedIds={collapsedIds}
              onToggle={onToggle}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CodePreview({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((line, index) => (
        <div key={`${index}-${line}`} className="flex gap-3.5">
          <span className="text-wb-text-disabled w-5 text-right select-none flex-shrink-0">
            {index + 1}
          </span>
          <span className="whitespace-pre-wrap break-words flex-1">
            {highlightSourceLine(line)}
          </span>
        </div>
      ))}
    </>
  );
}

function highlightSourceLine(line: string) {
  const segments: ReactNode[] = [];
  const pattern =
    /(&lt;|<\/|<|>|\/>)|(\bclassName\b|\bmap\b)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(\{[^}]*\})/g;
  let cursor = 0;
  let key = 0;

  const pushPlain = (value: string) => {
    if (!value) {
      return;
    }
    segments.push(<span key={`plain-${key++}`}>{value}</span>);
  };

  for (const match of line.matchAll(pattern)) {
    const start = match.index ?? 0;
    pushPlain(line.slice(cursor, start));
    const [token, tag, attr, str, expr] = match;
    if (tag) {
      segments.push(
        <span key={`tag-${key++}`} className="text-[#ff80b5]">
          {token}
        </span>
      );
    } else if (attr) {
      segments.push(
        <span key={`attr-${key++}`} className="text-[#ffd479]">
          {token}
        </span>
      );
    } else if (str) {
      segments.push(
        <span key={`str-${key++}`} className="text-[#8ad7ff]">
          {token}
        </span>
      );
    } else if (expr) {
      segments.push(
        <span key={`expr-${key++}`} className="text-[#b3e88c]">
          {token}
        </span>
      );
    }
    cursor = start + token.length;
  }

  pushPlain(line.slice(cursor));
  return segments.length > 0 ? segments : line;
}

function countNodes(node: BuildNode): number {
  return 1 + node.children.reduce((total, child) => total + countNodes(child), 0);
}

function collectClassNames(node: BuildNode): string[] {
  return [node.classNames, ...node.children.map(collectClassNames)].flat();
}
