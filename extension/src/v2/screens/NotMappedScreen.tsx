import type { ReactNode } from "react";
import { FileText, Code as CodeIcon } from "lucide-react";
import { Panel } from "../components/Panel";
import { Button } from "../components/Button";
import { PageHeader } from "../components/Headers";
import { Callout } from "../components/Callout";
import { Badge } from "../components/Badge";
import { useNavigation } from "../context/NavigationContext";
import { useAppState } from "../context/AppStateContext";

export function NotMappedScreen() {
  const { navigate } = useNavigation();
  const {
    applySuggestionToCurrentPage,
    currentPageSuggestions,
    designerContext,
    mappingRows
  } = useAppState();
  const currentRow =
    mappingRows.find((row) => row.webflowPageId === designerContext?.pageId) ?? null;

  return (
    <Panel
      onClose={() => navigate("section-list")}
      footer={
        <>
          <div className="flex-1" />
          <Button variant="ghost">Browse repo files</Button>
          <Button variant="ghost" onClick={() => navigate("site-progress")}>
            Skip this page
          </Button>
        </>
      }
    >
      <PageHeader
        icon={<FileText size={16} className="text-wb-warning" />}
        label="Currently editing"
        name={
          <>
            {designerContext?.pageName ?? "Unknown page"}
            <span className="text-[11px] text-wb-text-tertiary font-normal font-mono">
              {" "}
              · {currentRow?.webflowPageRoute ?? "No route"}
            </span>
          </>
        }
        trailing={
          <Badge tone="pending" className="bg-wb-warning/10 text-[#ffd24d] border-wb-warning/30">
            Not mapped
          </Badge>
        }
      />

      <Callout
        tone="warning"
        title="No repo file is mapped to this page"
        className="mx-5 my-4"
      >
        Phase 2 now suggests repo files from the real synced repo and the current Webflow page
        context.
      </Callout>

      <div className="px-5 pb-5">
        <div className="text-[11px] font-semibold text-wb-text-tertiary uppercase tracking-wider mb-2">
          Suggested matches
        </div>

        {currentPageSuggestions.length === 0 ? (
          <div className="text-[12.5px] text-wb-text-tertiary py-3">
            No strong matches were found for this page yet.
          </div>
        ) : (
          currentPageSuggestions.map((suggestion, index) => (
            <SuggestedFile
              key={suggestion.repoPageId}
              repoPageId={suggestion.repoPageId}
              path={suggestion.sourceFile}
              matchBadge={
                <Badge tone={index === 0 ? "ai" : "pending"}>
                  {Math.round(suggestion.score * 100)}% match
                </Badge>
              }
              meta={`${suggestion.sectionCount} sections detected`}
              primary={index === 0}
            />
          ))
        )}
      </div>
    </Panel>
  );
}

function SuggestedFile({
  repoPageId,
  path,
  matchBadge,
  meta,
  primary
}: {
  repoPageId: string;
  path: string;
  matchBadge: ReactNode;
  meta: string;
  primary?: boolean;
}) {
  const { navigate } = useNavigation();
  const { applySuggestionToCurrentPage } = useAppState();
  return (
    <div className="bg-wb-surface-1 border border-white/[0.09] rounded-md p-2.5 px-3 flex items-center gap-3 mb-1.5">
      <div className="w-7 h-7 rounded-md bg-wb-surface-2 flex items-center justify-center text-wb-text-secondary flex-shrink-0">
        <CodeIcon size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-wb-text-primary">{path}</div>
        <div className="flex items-center gap-2.5 mt-0.5 text-[11px] text-wb-text-tertiary">
          {matchBadge}
          <span>{meta}</span>
        </div>
      </div>
      <Button
        variant={primary ? "primary" : "ghost"}
        size="sm"
        onClick={() => {
          void applySuggestionToCurrentPage(repoPageId).then((saved) => {
            if (saved) {
              navigate("section-list");
            }
          });
        }}
      >
        Use this
      </Button>
    </div>
  );
}
