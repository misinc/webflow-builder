import { useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronRight, Clipboard, Copy, FileJson, RefreshCw } from "lucide-react";
import { Panel } from "../components/Panel";
import { Button } from "../components/Button";
import { Stepper, buildStepper } from "../components/Stepper";
import { SectionDetailHeader } from "../components/Headers";
import { Spinner } from "../components/Spinner";
import { useNavigation } from "../context/NavigationContext";
import { BackendClient } from "../../api/client.js";
import { executeSkeletonPlan, type ExecutionSummary } from "../../executor/buildExecutor.js";
import {
  getSkeletonDisplayTag,
  normalizeSkeletonPlan,
  serializeSkeletonTree
} from "../../skeleton/tree.js";
import { getWebflowBridge } from "../../webflow/bridge.js";
import type { BuildNode, DebugSkeletonRequest, SharedStyleContext, SkeletonPlan } from "@wfb/shared/contracts.js";
import { buildWebflowClipboardPayload } from "@wfb/shared/webflow-clipboard.js";

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
  const [includeContent, setIncludeContent] = useState(true);
  const [skeleton, setSkeleton] = useState<SkeletonPlan | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  const [insertedRootNodeId, setInsertedRootNodeId] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState("Copy skeleton");
  const [fixtureLabel, setFixtureLabel] = useState("Copy fixture");
  const [cssText, setCssText] = useState("");
  const [webflowCopyLabel, setWebflowCopyLabel] = useState("Copy for Webflow");
  const [projectStyles, setProjectStyles] = useState<Array<{ name: string; id: string }>>([]);
  const [dedupeLabel, setDedupeLabel] = useState("Fix pasted classes");
  const [bindTokensLabel, setBindTokensLabel] = useState("Bind tokens");
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [inspectedClipboard, setInspectedClipboard] = useState("");
  const [lastGeneratedInput, setLastGeneratedInput] = useState<{
    code: string;
    inputType: DebugSkeletonRequest["inputType"];
    sectionName: string;
    includeContent: boolean;
    cssText: string;
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
  const normalizedCssText = cssText.trim();
  const hasDraftChanges =
    Boolean(displaySkeleton) &&
    (
      !lastGeneratedInput ||
      lastGeneratedInput.code !== normalizedCode ||
      lastGeneratedInput.inputType !== inputType ||
      lastGeneratedInput.sectionName !== normalizedSectionName ||
      lastGeneratedInput.includeContent !== includeContent ||
      lastGeneratedInput.cssText !== normalizedCssText
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
      // Prefetched so Copy for Webflow can reference the project's REAL style ids
      // synchronously (existing classes get reused on paste instead of "name 2").
      setProjectStyles(await bridge.listStyleIds().catch(() => []));
      const nextSkeleton = normalizeSkeletonPlan(
        await backend.generateDebugSkeleton(
          {
            code: normalizedCode,
            inputType,
            sectionName: normalizedSectionName,
            pageName: "Debug playground",
            includeContent,
            sharedStyleContext,
            cssText: normalizedCssText || undefined
          },
          controller.signal
        )
      );
      setSkeleton(nextSkeleton);
      setCollapsedIds(new Set());
      setLastGeneratedInput({
        code: normalizedCode,
        inputType,
        sectionName: normalizedSectionName,
        includeContent,
        cssText: normalizedCssText
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

  const copyFixture = async () => {
    if (!displaySkeleton) {
      setError("Generate a skeleton before exporting a fixture.");
      return;
    }
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          {
            inputHtml: inputType === "html" ? normalizedCode : null,
            inputType,
            expectedSkeleton: displaySkeleton,
            expectedBuildNode: displaySkeleton.elementTree,
            warnings: displaySkeleton.warnings
          },
          null,
          2
        )
      );
      setFixtureLabel("Copied fixture");
      window.setTimeout(() => setFixtureLabel("Copy fixture"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to copy fixture JSON.");
    }
  };

  const copyForWebflow = () => {
    if (!displaySkeleton) {
      setError("Generate a skeleton before copying for Webflow.");
      return;
    }
    if (hasDraftChanges) {
      setError("Generate a new skeleton for the latest inputs before copying.");
      return;
    }
    try {
      const payload = buildWebflowClipboardPayload({
        elementTree: displaySkeleton.elementTree,
        styleDefinitions: displaySkeleton.styleDefinitions ?? [],
        existingStyles: projectStyles.map((style) => ({
          className: style.name,
          styleId: style.id
        }))
      });
      const json = JSON.stringify(payload);
      // Webflow's Designer reads the paste as the `application/json` clipboard
      // flavor — only settable from a real copy event, not navigator.clipboard.
      const onCopy = (event: ClipboardEvent) => {
        event.preventDefault();
        event.clipboardData?.setData("application/json", json);
        event.clipboardData?.setData("text/plain", json);
      };
      document.addEventListener("copy", onCopy);
      try {
        const copied = document.execCommand("copy");
        if (!copied) {
          throw new Error("The browser blocked the clipboard write. Click the button again.");
        }
      } finally {
        document.removeEventListener("copy", onCopy);
      }
      setWebflowCopyLabel("Copied");
      setCopyHint("On the canvas: click where the section should go, then press Cmd+V (Ctrl+V on Windows).");
      window.setTimeout(() => setWebflowCopyLabel("Copy for Webflow"), 2600);
      window.setTimeout(() => setCopyHint(null), 8000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to copy the Webflow payload.");
    }
  };

  const dedupePastedClasses = async () => {
    setIsMutating(true);
    setLoadingLabel("Fixing pasted classes");
    setError(null);
    try {
      const result = await bridge.dedupeSelectionStyles();
      setDedupeLabel(
        result.swappedClasses.length > 0
          ? `Fixed ${result.swappedClasses.length} class${result.swappedClasses.length === 1 ? "" : "es"}`
          : "No duplicates found"
      );
      window.setTimeout(() => setDedupeLabel("Fix pasted classes"), 2600);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fix duplicated classes in the selection."
      );
    } finally {
      setIsMutating(false);
      setLoadingLabel(null);
    }
  };

  const bindTokens = async () => {
    setIsMutating(true);
    setLoadingLabel("Binding tokens");
    setError(null);
    try {
      const result = await bridge.bindTokensInSelection();
      setBindTokensLabel(
        result.boundProperties > 0
          ? `Bound ${result.boundProperties} propert${result.boundProperties === 1 ? "y" : "ies"}`
          : "No matching tokens"
      );
      setCopyHint(
        result.bindings.length > 0 ? `Tokens: ${result.bindings.slice(0, 4).join(" · ")}${result.bindings.length > 4 ? " · …" : ""}` : null
      );
      window.setTimeout(() => setBindTokensLabel("Bind tokens"), 2600);
      window.setTimeout(() => setCopyHint(null), 8000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to bind tokens in the selection.");
    } finally {
      setIsMutating(false);
      setLoadingLabel(null);
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
          <span className={`text-[11px] mr-2 ${copyHint ? "text-wb-text-primary" : "text-wb-text-tertiary"}`}>
            {copyHint
              ? copyHint
              : hasInsertedSkeleton
              ? "Skeleton inserted into Webflow"
              : isInserting
              ? "Inserting skeleton…"
              : isGenerating
              ? "Generating skeleton…"
              : hasDraftChanges
              ? "Debug inputs changed · generate a new skeleton"
              : displaySkeleton
              ? `${elementCount} elements · ${classCount} classes`
              : "Paste code to generate a skeleton"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={!displaySkeleton || isMutating || hasDraftChanges}
            onClick={() => {
              void copySkeleton();
            }}
            aria-label="Copy skeleton JSON"
            title={copyLabel === "Copy skeleton" ? "Copy skeleton JSON" : copyLabel}
          >
            {copyLabel === "Copy skeleton" ? <Copy size={12} /> : <Check size={12} />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!displaySkeleton || isMutating || hasDraftChanges}
            onClick={() => {
              void copyFixture();
            }}
            aria-label="Copy test fixture JSON"
            title={fixtureLabel === "Copy fixture" ? "Copy test fixture JSON" : fixtureLabel}
          >
            {fixtureLabel === "Copy fixture" ? <FileJson size={12} /> : <Check size={12} />}
          </Button>
          <Button
            variant="ghost"
            disabled={!displaySkeleton || isMutating || hasDraftChanges}
            onClick={() => {
              void insertSkeleton();
            }}
            title="Fallback path: build node-by-node via the Designer API instead of pasting."
          >
            {hasInsertedSkeleton ? "Insert again" : "Insert via API"}
          </Button>
          <Button
            variant="ghost"
            disabled={isMutating}
            onClick={() => {
              void dedupePastedClasses();
            }}
            title="After pasting: select the pasted section on the canvas, then click to swap duplicated 'name 2' classes back to your project's existing classes."
          >
            {dedupeLabel}
          </Button>
          <Button
            variant="ghost"
            disabled={isMutating}
            onClick={() => {
              void bindTokens();
            }}
            title="After pasting: select the pasted section, then click to relink color values to your project variables (pasted styles arrive as literals — Webflow strips variable references on copy)."
          >
            {bindTokensLabel}
          </Button>
          <Button
            variant="primary"
            disabled={!displaySkeleton || isMutating || hasDraftChanges}
            onClick={copyForWebflow}
            title={
              (displaySkeleton?.styleDefinitions?.length ?? 0) > 0
                ? "Copies a Webflow paste payload (structure + styles + SVG embeds). Paste on the Designer canvas."
                : "Copies structure only — paste compiled CSS above and regenerate to include styles."
            }
          >
            {webflowCopyLabel === "Copied" ? <Check size={12} /> : <Clipboard size={12} />}
            {webflowCopyLabel}
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
              <div className="space-y-4">
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
                <DebugWarnings warnings={displaySkeleton.warnings} />
                <ClassMappingPanel decisions={displaySkeleton.classMappingDecisions ?? []} />
              </div>
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
          <div className="px-4 py-3 border-b border-white/[0.09] bg-black/[0.12] flex flex-col gap-3">
            <div className="flex items-center gap-3 min-w-0">
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
                className="flex-1 min-w-0 h-8 px-2.5 rounded-md bg-wb-input border border-white/[0.09] text-[12px] text-wb-text-primary outline-none focus:border-wb-accent"
              />
            </div>
            <label className="inline-flex items-center gap-2 text-[12px] text-wb-text-secondary whitespace-nowrap self-start">
              <input
                type="checkbox"
                checked={includeContent}
                onChange={(event) => {
                  setIncludeContent(event.target.checked);
                  setError(null);
                }}
                className="h-3.5 w-3.5 rounded border border-white/[0.16] bg-wb-input accent-[var(--wb-accent)]"
              />
              Insert content too
            </label>
          </div>
          <div className="flex-[3] min-h-0 overflow-hidden bg-black/[0.18]">
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
          <SplitHeader title="Compiled CSS (optional · enables styled Copy for Webflow)" />
          <div className="flex-[2] min-h-0 overflow-hidden bg-black/[0.18] border-t border-white/[0.06]">
            <textarea
              value={cssText}
              onChange={(event) => {
                setCssText(event.target.value);
                setError(null);
              }}
              spellCheck={false}
              className="w-full h-full resize-none bg-transparent p-4 font-mono text-[11.5px] text-wb-text-secondary leading-relaxed outline-none"
              placeholder="Paste the site's compiled CSS here to resolve full styles (colors, spacing, combo classes) into the Webflow paste payload."
            />
          </div>
          <SplitHeader title="Clipboard inspector (paste a Designer copy here)" />
          <div className="h-24 flex-shrink-0 overflow-hidden bg-black/[0.18] border-t border-white/[0.06]">
            <textarea
              value={inspectedClipboard}
              onChange={() => {
                /* read-only apart from paste capture */
              }}
              onPaste={(event) => {
                event.preventDefault();
                const json = event.clipboardData.getData("application/json");
                setInspectedClipboard(
                  json || "(no application/json flavor on the clipboard — copy an element inside the Webflow Designer first)"
                );
              }}
              spellCheck={false}
              className="w-full h-full resize-none bg-transparent p-4 font-mono text-[11.5px] text-wb-text-secondary leading-relaxed outline-none"
              placeholder="Copy any element in the Designer (Cmd+C), click here, then Cmd+V — Webflow's own paste payload appears for inspection. Select-all + copy to share it."
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
  const suspiciousText = Boolean(textContent && /[<>{}]|className|--|\n{2,}/.test(textContent));

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
          <span className={suspiciousText ? "text-[#ffcf4a] italic" : "text-wb-text-tertiary italic"}>
            {JSON.stringify(textContent)}
            {suspiciousText ? " suspicious" : ""}
          </span>
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

function DebugWarnings({ warnings }: { warnings: SkeletonPlan["warnings"] }) {
  if (warnings.length === 0) {
    return null;
  }
  return (
    <div className="border border-white/[0.08] rounded-md overflow-hidden">
      <div className="px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-wb-text-tertiary bg-white/[0.03]">
        Warnings
      </div>
      <div className="divide-y divide-white/[0.06]">
        {warnings.map((warning, index) => (
          <div key={`${warning.code}-${index}`} className="px-2.5 py-2">
            <div className="text-[11px] text-wb-text-primary">{warning.code}</div>
            <div className="text-[11px] text-wb-text-tertiary mt-0.5">{warning.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClassMappingPanel({
  decisions
}: {
  decisions: NonNullable<SkeletonPlan["classMappingDecisions"]>;
}) {
  if (decisions.length === 0) {
    return null;
  }
  return (
    <div className="border border-white/[0.08] rounded-md overflow-hidden">
      <div className="px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-wb-text-tertiary bg-white/[0.03]">
        Class mapping
      </div>
      <div className="divide-y divide-white/[0.06]">
        {decisions.slice(0, 80).map((decision, index) => (
          <div key={`${decision.sourceClassName}-${index}`} className="px-2.5 py-1.5 font-mono text-[11px]">
            <span className="text-[#8ad7ff]">{decision.sourceClassName}</span>
            <span className="text-wb-text-tertiary"> {decision.action} </span>
            <span className="text-wb-text-primary">{decision.targetClassName || "unmapped"}</span>
          </div>
        ))}
      </div>
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
    serializeSkeletonTree(plan.elementTree).trim(),
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
