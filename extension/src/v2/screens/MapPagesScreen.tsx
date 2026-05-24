import { Home, FileText, ArrowRight, Plus } from "lucide-react";
import { Panel, PanelContent } from "../components/Panel";
import { Button } from "../components/Button";
import { Stepper, type Step } from "../components/Stepper";
import { Spinner } from "../components/Spinner";
import { useNavigation } from "../context/NavigationContext";
import { useAppState } from "../context/AppStateContext";

const STEPS: Step[] = [
  { label: "Connect", state: "done" },
  { label: "Choose repo", state: "done" },
  { label: "Map pages", state: "active" }
];

export function MapPagesScreen() {
  const { navigate } = useNavigation();
  const {
    hasUnsavedMappings,
    isBootstrapping,
    isLoadingWorkflowState,
    isMutating,
    loadingLabel,
    mappingRows,
    repoTree,
    savePageMappings,
    updateMapping
  } = useAppState();
  const mappedCount = mappingRows.filter((row) => row.mappingStatus === "mapped").length;
  const isLoadingMappings = isBootstrapping || (isLoadingWorkflowState && mappingRows.length === 0);
  const mappingSummaryLabel = isLoadingMappings
    ? "Loading pages…"
    : `${mappedCount} of ${mappingRows.length || 0} mapped`;

  return (
    <Panel
      onClose={() => navigate("welcome")}
      footer={
        <>
          <span className="text-[11.5px] text-wb-text-tertiary">
            {loadingLabel ?? mappingSummaryLabel}
          </span>
          <div className="flex-1" />
          <Button variant="ghost" onClick={() => navigate("choose-repo")}>
            Back
          </Button>
          <Button
            variant="primary"
            disabled={isMutating}
            onClick={() => {
              if (hasUnsavedMappings) {
                void savePageMappings().then((saved) => {
                  if (saved) {
                    navigate("section-list");
                  }
                });
                return;
              }
              navigate("section-list");
            }}
          >
            {hasUnsavedMappings ? "Save & continue" : "Start building"}
          </Button>
        </>
      }
    >
      <Stepper steps={STEPS} />

      <div className="px-5 py-3 flex items-center gap-2 bg-black/[0.12] border-b border-white/[0.06]">
        <div className="text-[11px] font-semibold text-wb-text-tertiary uppercase tracking-wider flex-1">
          Page mapping
        </div>
        <span className="text-[11px] text-wb-text-tertiary tabular-nums">
          {mappingSummaryLabel}
        </span>
      </div>

      <PanelContent>
        <div className="px-5 py-3">
          <div className="grid grid-cols-[1fr_24px_1fr] gap-3 pb-2 text-[10.5px] font-semibold text-wb-text-tertiary uppercase tracking-wider">
            <div>Webflow page</div>
            <div />
            <div>Repo page</div>
          </div>
          {isLoadingMappings ? (
            <div className="py-10 flex flex-col items-center justify-center gap-3 text-center">
              <Spinner size={24} thickness={2.5} />
              <div>
                <div className="text-[12.5px] text-wb-text-primary font-medium">
                  Loading page mappings
                </div>
                <div className="text-[11.5px] text-wb-text-tertiary mt-1">
                  Pulling live Webflow pages and saved repo mappings for this site.
                </div>
              </div>
            </div>
          ) : (
            mappingRows.map((mapping, index) => (
              <div
                key={mapping.webflowPageId}
                className={`grid grid-cols-[1fr_24px_1fr] gap-3 items-center py-2.5 ${
                  index < mappingRows.length - 1 ? "border-b border-white/[0.06]" : ""
                }`}
              >
                <div className="flex items-center gap-2.5 text-[12.5px] text-wb-text-primary min-w-0">
                  <div
                    className={`w-5.5 h-5.5 rounded inline-flex items-center justify-center flex-shrink-0 bg-wb-surface-2 ${
                      mapping.mappingStatus === "unmapped"
                        ? "text-wb-warning"
                        : "text-wb-text-tertiary"
                    }`}
                  >
                    {mapping.webflowPageRoute === "/" ? (
                      <Home size={12} />
                    ) : (
                      <FileText size={12} />
                    )}
                  </div>
                  <div>
                    <div>{mapping.webflowPageName}</div>
                    <div className="text-[11px] text-wb-text-tertiary font-mono">
                      {mapping.webflowPageRoute ?? "No route"}
                    </div>
                  </div>
                </div>
                <div className="text-wb-text-disabled text-center">
                  <ArrowRight size={14} className="inline-block" />
                </div>
                <select
                  disabled={isMutating}
                  value={mapping.repoPageId ?? ""}
                  onChange={(event) =>
                    updateMapping(mapping.webflowPageId, event.target.value || null)
                  }
                  className={`w-full h-8 px-2.5 pr-7 rounded text-[12.5px] bg-wb-input border text-wb-text-primary appearance-none disabled:opacity-100 ${
                    mapping.mappingStatus === "unmapped"
                      ? "border-wb-warning/30"
                      : "border-white/[0.09]"
                  }`}
                  style={{
                    backgroundImage:
                      "linear-gradient(45deg, transparent 50%, #6e6e6e 50%), linear-gradient(135deg, #6e6e6e 50%, transparent 50%)",
                    backgroundPosition: "right 12px center, right 8px center",
                    backgroundSize: "4px 4px",
                    backgroundRepeat: "no-repeat"
                  }}
                >
                  <option value="">— Not mapped —</option>
                  {(repoTree?.pages ?? []).map((entry) => (
                    <option key={entry.page.id} value={entry.page.id}>
                      {entry.page.sourceFile}
                    </option>
                  ))}
                </select>
              </div>
            ))
          )}
        </div>

        <div className="px-5 pb-4">
          <Button block dashed onClick={() => navigate("create-page")}>
            <Plus size={14} />
            Create a new Webflow page
          </Button>
        </div>
      </PanelContent>
    </Panel>
  );
}
