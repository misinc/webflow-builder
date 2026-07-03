import { type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { BuildNode } from "@wfb/shared/contracts.js";
import { getSkeletonDisplayTag } from "../../skeleton/tree.js";

/** Shared split-pane building blocks for the skeleton review screens
 *  (per-section build flow and the sitewide chrome detail). */

export function SplitHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="px-4 py-2.5 border-b border-white/[0.09] text-[11px] font-semibold text-wb-text-tertiary uppercase tracking-wider flex items-center justify-between flex-shrink-0 bg-black/[0.12]">
      <span>{title}</span>
      {actions && <div className="flex gap-1">{actions}</div>}
    </div>
  );
}

export function SkeletonTree({
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

export function CodePreview({ lines }: { lines: string[] }) {
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

export function countSkeletonNodes(node: BuildNode): number {
  return 1 + node.children.reduce((total, child) => total + countSkeletonNodes(child), 0);
}

export function collectSkeletonClassNames(node: BuildNode): string[] {
  return [node.classNames, ...node.children.map(collectSkeletonClassNames)].flat();
}
