import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Pencil, Plus, RefreshCw } from "lucide-react";
import { Panel } from "../components/Panel";
import { Button, IconButton } from "../components/Button";
import { Stepper, buildStepper } from "../components/Stepper";
import { SectionDetailHeader } from "../components/Headers";
import { useNavigation } from "../context/NavigationContext";
import { useAppState } from "../context/AppStateContext";
import type { BuildNode } from "../../../../src/shared/contracts.js";
import { parseSkeletonTreeText } from "../../skeleton/tree.js";

export function SkeletonReviewScreen() {
  const { navigate } = useNavigation();
  const {
    analysis,
    beginSkeletonEdit,
    regenerateSkeleton,
    selectedSection,
    skipCurrentSection,
    skeleton
  } = useAppState();
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const sourceText = (analysis?.sourceCode?.trim() || selectedSection?.sourceCode?.trim() || "");
  const sourceDerivedTree = useMemo(
    () => (sourceText ? buildPreviewTreeFromSource(sourceText) : null),
    [sourceText]
  );
  const displaySkeleton = useMemo(() => {
    if (!skeleton) {
      return null;
    }
    if (sourceDerivedTree) {
      return {
        ...skeleton,
        elementTree: sourceDerivedTree
      };
    }
    const existingClassCount = new Set(collectClassNames(skeleton.elementTree)).size;
    if (existingClassCount > 0) {
      return skeleton;
    }
    try {
      const reparsed = parseSkeletonTreeText(skeleton, skeleton.treeText);
      const reparsedClassCount = new Set(collectClassNames(reparsed.elementTree)).size;
      return reparsedClassCount > 0 ? reparsed : skeleton;
    } catch {
      return skeleton;
    }
  }, [skeleton, sourceDerivedTree]);
  const elementCount = displaySkeleton ? countNodes(displaySkeleton.elementTree) : 0;
  const classCount = displaySkeleton
    ? new Set(collectClassNames(displaySkeleton.elementTree)).size
    : 0;
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
            {elementCount} elements · {classCount} classes
          </span>
          <Button variant="primary" onClick={() => navigate("applying-styles")}>
            Insert into Webflow
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
                  onClick={() => {
                    beginSkeletonEdit();
                    navigate("skeleton-edit");
                  }}
                  aria-label="Add element"
                >
                  <Plus size={13} />
                </IconButton>
                <IconButton
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
              <div className="font-mono text-[12px] text-wb-text-tertiary">
                No skeleton generated yet.
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

function buildPreviewTreeFromSource(sourceText: string): BuildNode | null {
  const tagPattern = /<(\/?)([A-Za-z][A-Za-z0-9-]*)\b([^>]*)>/g;
  const root: BuildNode = {
    id: "preview-root",
    type: "box",
    tag: "root",
    classNames: [],
    children: []
  };
  const stack: BuildNode[] = [root];
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = tagPattern.exec(sourceText)) !== null) {
    const [, closing, rawTag, attrs] = match;
    const tag = rawTag.toLowerCase();
    if (closing) {
      while (stack.length > 1) {
        const current = stack.pop()!;
        if (current.tag === tag) {
          break;
        }
      }
      continue;
    }

    const classValue = readClassValue(attrs);
    const node: BuildNode = {
      id: `preview-node-${index++}`,
      type: inferPreviewNodeType(tag),
      tag,
      classNames: classValue ? classValue.split(/\s+/).filter(Boolean) : [],
      children: []
    };

    const parent = stack[stack.length - 1] ?? root;
    parent.children.push(node);

    const selfClosing =
      /\/\s*$/.test(attrs) ||
      ["img", "source", "br", "hr", "input", "meta", "link"].includes(tag);
    if (!selfClosing) {
      stack.push(node);
    }
  }

  return root.children.find((child) => child.tag === "section") ?? root.children[0] ?? null;
}

function readClassValue(attrs: string): string | null {
  const patterns = [
    /className\s*=\s*"([^"]+)"/,
    /className\s*=\s*'([^']+)'/,
    /class\s*=\s*"([^"]+)"/,
    /class\s*=\s*'([^']+)'/
  ];
  for (const pattern of patterns) {
    const match = attrs.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

function inferPreviewNodeType(tag: string): BuildNode["type"] {
  if (tag === "img" || tag === "video" || tag === "source") {
    return "image";
  }
  if (tag === "button" || tag === "a") {
    return "button";
  }
  if (tag === "ul" || tag === "ol") {
    return "list";
  }
  if (tag === "li" || tag === "article") {
    return "listItem";
  }
  if (/^h[1-6]$/i.test(tag)) {
    return "heading";
  }
  if (tag === "p" || tag === "span" || tag === "label") {
    return "text";
  }
  return "box";
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
