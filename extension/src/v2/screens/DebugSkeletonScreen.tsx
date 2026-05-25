import { useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Copy, RefreshCw } from "lucide-react";
import { Panel } from "../components/Panel";
import { Button } from "../components/Button";
import { Stepper, buildStepper } from "../components/Stepper";
import { SectionDetailHeader } from "../components/Headers";
import { Spinner } from "../components/Spinner";
import { useNavigation } from "../context/NavigationContext";
import { BackendClient } from "../../api/client.js";
import { executeSkeletonPlan, type ExecutionSummary } from "../../executor/buildExecutor.js";
import { normalizeSkeletonPlan } from "../../skeleton/tree.js";
import { getWebflowBridge } from "../../webflow/bridge.js";
import type { BuildNode, DebugSkeletonRequest, SharedStyleContext, SkeletonPlan } from "../../../../src/shared/contracts.js";

const backend = new BackendClient();
const bridge = getWebflowBridge();

const DEFAULT_CODE = `export function HeroSection() {
  return (
    <section className="section_hero">
      <div className="hero_background-media">
        <video autoPlay muted loop playsInline />
      </div>
      <div className="container-large">
        <div className="padding-section-large">
          <div className="hero_component">
            <div className="hero_content">
              <p className="text-style-tagline">Built for modern teams</p>
              <h1 className="hero_heading">This is the pasted-code playground</h1>
              <p className="text-size-medium">Paste HTML or TSX here and refine the skeleton generation rules until the output is reliable.</p>
              <div className="button-group">
                <a className="button is-primary">Primary action</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}`;

export function DebugSkeletonScreen() {
  const { navigate } = useNavigation();
  const [inputType, setInputType] = useState<DebugSkeletonRequest["inputType"]>("jsx");
  const [sectionName, setSectionName] = useState("Hero");
  const [code, setCode] = useState(DEFAULT_CODE);
  const [skeleton, setSkeleton] = useState<SkeletonPlan | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  const [insertedRootNodeId, setInsertedRootNodeId] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState("Copy skeleton");
  const [lastGeneratedInput, setLastGeneratedInput] = useState<{
    code: string;
    inputType: DebugSkeletonRequest["inputType"];
    sectionName: string;
  } | null>(null);
  const insertedNodeIdsRef = useRef<string[]>([]);
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const copyResetTimeoutRef = useRef<number | null>(null);

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
  const isGenerating = isMutating && loadingLabel === "Generating skeleton";
  const isInserting = isMutating && loadingLabel === "Inserting skeleton";
  const hasInsertedSkeleton = Boolean(insertedRootNodeId);
  const normalizedSectionName = sectionName.trim() || "Debug section";
  const normalizedCode = code.trim();
  const hasDraftChanges =
    Boolean(displaySkeleton) &&
    (
      !lastGeneratedInput ||
      lastGeneratedInput.code !== normalizedCode ||
      lastGeneratedInput.inputType !== inputType ||
      lastGeneratedInput.sectionName !== normalizedSectionName
    );
  const canGenerate = !isMutating && Boolean(normalizedCode);
  const generateLabel = displaySkeleton
    ? hasDraftChanges
      ? "Generate new skeleton"
      : "Regenerate"
    : "Generate skeleton";

  const generateSkeleton = async () => {
    if (!normalizedCode) {
      setError("Paste some HTML or TSX first.");
      return;
    }
    activeAbortControllerRef.current?.abort();
    const controller = new AbortController();
    activeAbortControllerRef.current = controller;
    setIsMutating(true);
    setLoadingLabel("Generating skeleton");
    setError(null);
    try {
      const context = await bridge.getContext().catch(() => null);
      let sharedStyleContext: SharedStyleContext | undefined;
      if (context?.siteId) {
        sharedStyleContext = await bridge.inspectSharedStyles(context.siteId).catch(() => undefined);
      }
      const nextSkeleton = normalizeSkeletonPlan(
        await backend.generateDebugSkeleton(
          {
            code: normalizedCode,
            inputType,
            sectionName: normalizedSectionName,
            pageName: "Debug playground",
            sharedStyleContext
          },
          controller.signal
        )
      );
      setSkeleton(nextSkeleton);
      setCollapsedIds(new Set());
      setLastGeneratedInput({
        code: normalizedCode,
        inputType,
        sectionName: normalizedSectionName
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to generate the debug skeleton.");
    } finally {
      if (activeAbortControllerRef.current === controller) {
        activeAbortControllerRef.current = null;
      }
      setIsMutating(false);
      setLoadingLabel(null);
    }
  };

  const insertSkeleton = async () => {
    if (!displaySkeleton) {
      setError("Generate a skeleton before inserting it into Webflow.");
      return;
    }
    if (hasDraftChanges) {
      setError("Generate a new skeleton for the latest pasted code before inserting.");
      return;
    }
    const controller = new AbortController();
    activeAbortControllerRef.current = controller;
    setIsMutating(true);
    setLoadingLabel("Inserting skeleton");
    setError(null);
    try {
      if (insertedNodeIdsRef.current.length > 0) {
        await bridge.deleteNodes([...insertedNodeIdsRef.current].reverse());
        insertedNodeIdsRef.current = [];
        setInsertedRootNodeId(null);
      }

      const context = await bridge.getContext();
      const execution = await executeSkeletonPlan({
        bridge,
        context,
        plan: displaySkeleton,
        placementMode: "append",
        placementTarget: null,
        signal: controller.signal
      });
      if (!execution.success) {
        throw new Error(extractExecutionError(execution));
      }
      insertedNodeIdsRef.current = execution.createdNodeIds;
      setInsertedRootNodeId(execution.rootNodeId ?? null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to insert the debug skeleton.");
    } finally {
      if (activeAbortControllerRef.current === controller) {
        activeAbortControllerRef.current = null;
      }
      setIsMutating(false);
      setLoadingLabel(null);
    }
  };

  const copySkeleton = async () => {
    if (!displaySkeleton) {
      setError("Generate a skeleton before copying it.");
      return;
    }
    if (hasDraftChanges) {
      setError("Generate a new skeleton for the latest pasted code before copying.");
      return;
    }

    try {
      await navigator.clipboard.writeText(serializeSkeletonForClipboard(displaySkeleton));
      setCopyLabel("Copied");
      if (copyResetTimeoutRef.current) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
      copyResetTimeoutRef.current = window.setTimeout(() => {
        setCopyLabel("Copy skeleton");
        copyResetTimeoutRef.current = null;
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to copy the skeleton.");
    }
  };

  return (
    <Panel
      onClose={() => navigate("welcome")}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => navigate("welcome")}>
            Back to welcome
          </Button>
          <div className="flex-1" />
          <span className="text-[11px] text-wb-text-tertiary mr-2">
            {hasInsertedSkeleton
              ? "Skeleton inserted into Webflow"
              : isInserting
              ? "Inserting skeleton…"
              : isGenerating
              ? "Generating skeleton…"
              : hasDraftChanges
              ? "Pasted code changed · generate a new skeleton"
              : displaySkeleton
              ? `${elementCount} elements · ${classCount} classes`
              : "Paste code to generate a skeleton"}
          </span>
          <Button
            variant="ghost"
            disabled={!canGenerate}
            onClick={() => {
              void generateSkeleton();
            }}
          >
            {generateLabel}
          </Button>
          <Button
            variant="ghost"
            disabled={!displaySkeleton || isMutating || hasDraftChanges}
            onClick={() => {
              void copySkeleton();
            }}
          >
            <Copy size={12} />
            {copyLabel}
          </Button>
          <Button
            variant="primary"
            disabled={!displaySkeleton || isMutating || hasDraftChanges}
            onClick={() => {
              void insertSkeleton();
            }}
          >
            {hasInsertedSkeleton ? "Insert again" : "Insert into Webflow"}
          </Button>
        </>
      }
    >
      <SectionDetailHeader
        eyebrow="Debug mode"
        title="Paste code playground"
        onBack={() => navigate("welcome")}
        trailing={
          <Button
            variant="ghost"
            size="sm"
            disabled={!canGenerate}
            onClick={() => {
              void generateSkeleton();
            }}
          >
            <RefreshCw size={12} />
            {generateLabel}
          </Button>
        }
      />

      <Stepper steps={buildStepper("skeleton")} />

      <div className="flex flex-1 min-h-0">
        <div className="w-1/2 border-r border-white/[0.09] flex flex-col min-w-0">
          <SplitHeader title="Skeleton tree" />
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
                        {loadingLabel ?? "Generating skeleton"}
                      </div>
                      <div className="text-[12px] text-wb-text-tertiary mt-1 max-w-[300px]">
                        Using the same planner and Webflow insertion pipeline, but with pasted code instead of a repo section.
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
          <SplitHeader title="Pasted source" />
          <div className="px-4 py-3 border-b border-white/[0.09] bg-black/[0.12] flex items-center gap-3">
            <label className="text-[11px] font-semibold text-wb-text-tertiary uppercase tracking-wider">
              Input
            </label>
            <select
              value={inputType}
              onChange={(event) => setInputType(event.target.value as DebugSkeletonRequest["inputType"])}
              className="h-8 px-2.5 rounded-md text-[12px] bg-wb-input border border-white/[0.09] text-wb-text-primary"
            >
              <option value="jsx">React / TSX</option>
              <option value="html">HTML</option>
            </select>
            <label className="text-[11px] font-semibold text-wb-text-tertiary uppercase tracking-wider ml-2">
              Section name
            </label>
            <input
              type="text"
              value={sectionName}
              onChange={(event) => setSectionName(event.target.value)}
              className="flex-1 h-8 px-2.5 rounded-md bg-wb-input border border-white/[0.09] text-[12px] text-wb-text-primary outline-none focus:border-wb-accent"
            />
          </div>
          <div className="flex-1 overflow-hidden bg-black/[0.18]">
            <textarea
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                setError(null);
              }}
              spellCheck={false}
              className="w-full h-full resize-none bg-transparent p-4 font-mono text-[11.5px] text-wb-text-secondary leading-relaxed outline-none"
              placeholder="Paste a section in HTML or TSX here."
            />
          </div>
        </div>
      </div>
      {error ? (
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
        <span className="text-[#ff80b5]">{`<${node.tag}>`}</span>
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

function countNodes(node: BuildNode): number {
  return 1 + node.children.reduce((total, child) => total + countNodes(child), 0);
}

function collectClassNames(node: BuildNode): string[] {
  return [node.classNames, ...node.children.map(collectClassNames)].flat();
}

function extractExecutionError(execution: ExecutionSummary): string {
  return (
    execution.warnings.find((warning) => warning.level === "error")?.message ??
    "Failed to insert the generated skeleton."
  );
}

function serializeSkeletonForClipboard(plan: SkeletonPlan): string {
  return [
    "# Skeleton Tree",
    plan.treeText.trim(),
    "",
    "# Skeleton JSON",
    JSON.stringify(
      {
        sectionMetadata: plan.sectionMetadata,
        elementTree: plan.elementTree,
        reusableClasses: plan.reusableClasses,
        suggestedNewClasses: plan.suggestedNewClasses,
        warnings: plan.warnings
      },
      null,
      2
    )
  ].join("\n");
}
