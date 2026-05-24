import { type ReactNode, useEffect, useState } from "react";
import { LayoutPanelTop, RefreshCw, Check, Code as CodeIcon, Route } from "lucide-react";
import { Panel } from "../components/Panel";
import { Button } from "../components/Button";
import { SectionDetailHeader } from "../components/Headers";
import { AiBadge, Badge } from "../components/Badge";
import { useNavigation } from "../context/NavigationContext";
import { useAppState } from "../context/AppStateContext";

export function ComponentOpportunitiesScreen() {
  const { navigate } = useNavigation();
  const {
    componentOpportunities,
    createComponentsFromOpportunities,
    createdComponentsByOpportunityId,
    isMutating,
    loadingLabel,
    refreshComponentOpportunities,
    resetComponentBanner
  } = useAppState();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(componentOpportunities[0]?.id ?? null);

  useEffect(() => {
    setSelectedIds(
      componentOpportunities
        .filter(
          (opportunity) =>
            opportunity.selectedByDefault && !createdComponentsByOpportunityId[opportunity.id]
        )
        .map((opportunity) => opportunity.id)
    );
    setActiveId(componentOpportunities[0]?.id ?? null);
  }, [componentOpportunities, createdComponentsByOpportunityId]);

  const creatableSelectedIds = selectedIds.filter(
    (id) => !createdComponentsByOpportunityId[id]
  );

  const activeOpportunity =
    componentOpportunities.find((opportunity) => opportunity.id === activeId) ??
    componentOpportunities[0] ??
    null;

  return (
    <Panel
      onClose={() => navigate("section-list")}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => navigate("section-list")}>
            Skip for now
          </Button>
          <div className="flex-1" />
          <span className="text-[11px] text-wb-text-tertiary mr-2">
            {loadingLabel ?? `${creatableSelectedIds.length} components selected`}
          </span>
          <Button
            variant="primary"
            disabled={creatableSelectedIds.length === 0 || isMutating}
            onClick={() => {
              void createComponentsFromOpportunities(creatableSelectedIds);
            }}
          >
            Create {creatableSelectedIds.length} components
          </Button>
        </>
      }
    >
      <SectionDetailHeader
        eyebrow="Setup · across all pages"
        title="Component opportunities"
        onBack={() => navigate("section-list")}
        badge={<AiBadge>AI scanned</AiBadge>}
      />

      <div className="px-5 py-3 bg-wb-surface-1 border-b border-white/[0.06] flex items-center gap-3 flex-shrink-0">
        <div className="flex-1">
          <div className="text-[12.5px] text-wb-text-primary font-medium">
            {componentOpportunities.length} reusable patterns detected in the synced repo
          </div>
          <div className="text-[11.5px] text-wb-text-tertiary mt-0.5">
            Detected patterns can now be promoted into Webflow components from this screen.
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            resetComponentBanner();
            void refreshComponentOpportunities();
          }}
        >
          <RefreshCw size={12} />
          Rescan
        </Button>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-[42%] border-r border-white/[0.09] flex flex-col min-w-0">
          <div className="px-4 py-2.5 border-b border-white/[0.09] text-[11px] font-semibold text-wb-text-tertiary uppercase tracking-wider flex items-center justify-between flex-shrink-0 bg-black/[0.12]">
              <span>Detected patterns</span>
              <span className="text-[10.5px] text-wb-text-tertiary font-medium normal-case tracking-normal">
              {creatableSelectedIds.length} of {componentOpportunities.length} selected
            </span>
          </div>
          <div className="overflow-auto flex-1 px-2 py-1.5">
            {componentOpportunities.length === 0 ? (
              <div className="px-3 py-6 text-[12px] text-wb-text-tertiary">
                No repeating component patterns met the threshold in the current repo.
              </div>
            ) : (
              componentOpportunities.map((opportunity) => (
                <OpportunityRow
                  key={opportunity.id}
                  active={activeId === opportunity.id}
                  checked={selectedIds.includes(opportunity.id)}
                  name={opportunity.name}
                  confidence={opportunity.confidence}
                  instances={opportunity.instances}
                  files={opportunity.files}
                  created={Boolean(createdComponentsByOpportunityId[opportunity.id])}
                  onClick={() => setActiveId(opportunity.id)}
                  onToggle={() =>
                    setSelectedIds((current) =>
                      current.includes(opportunity.id)
                        ? current.filter((id) => id !== opportunity.id)
                        : [...current, opportunity.id]
                    )
                  }
                />
              ))
            )}
          </div>
        </div>

        <div className="w-[58%] flex flex-col min-w-0">
          <div className="px-4 py-2.5 border-b border-white/[0.09] text-[11px] font-semibold text-wb-text-tertiary uppercase tracking-wider bg-black/[0.12] flex-shrink-0">
            Component details
          </div>
          <div className="overflow-y-auto flex-1 px-5 py-4.5">
            {activeOpportunity ? (
              <>
                <Field label="Component name">
                  <input
                    type="text"
                    value={activeOpportunity.name}
                    readOnly
                    className="w-full h-9 bg-wb-input border border-white/[0.09] rounded-md px-2.5 text-wb-text-primary text-[14px] font-medium outline-none"
                  />
                </Field>

                <Field label="Signals">
                  <div className="bg-wb-surface-1 border border-white/[0.09] rounded-md p-3 text-[12px] text-wb-text-secondary space-y-2">
                    <div>
                      Confidence:{" "}
                      <span className="text-wb-text-primary capitalize">
                        {activeOpportunity.confidence}
                      </span>
                    </div>
                    <div>
                      Instances:{" "}
                      <span className="text-wb-text-primary">{activeOpportunity.instances}</span>
                    </div>
                    <div>
                      Files: <span className="text-wb-text-primary">{activeOpportunity.files}</span>
                    </div>
                  </div>
                </Field>

                <Field label={`Routes · ${activeOpportunity.sampleRoutes.length}`}>
                  <div className="flex flex-col gap-1.5">
                    {activeOpportunity.sampleRoutes.map((route) => (
                      <div
                        key={route}
                        className="flex items-center gap-2 px-2.5 py-1.5 bg-white/[0.02] rounded text-[11.5px] text-wb-text-secondary font-mono"
                      >
                        <Route size={12} className="text-wb-text-tertiary flex-shrink-0" />
                        <span>{route}</span>
                      </div>
                    ))}
                  </div>
                </Field>

                <div>
                  <div className="text-[10.5px] font-semibold text-wb-text-tertiary uppercase tracking-wider mb-2">
                    Occurrences · {activeOpportunity.sourceFiles.length} page files
                  </div>
                  <div className="flex flex-col gap-1 font-mono text-[11.5px] text-wb-text-secondary">
                    {activeOpportunity.sourceFiles.map((path) => (
                      <div
                        key={path}
                        className="flex items-center gap-2 px-2.5 py-1.5 bg-white/[0.02] rounded"
                      >
                        <CodeIcon size={12} className="text-wb-text-tertiary flex-shrink-0" />
                        <span className="flex-1">{path}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-[12.5px] text-wb-text-tertiary">
                No component opportunities are available for this repo yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function OpportunityRow({
  active,
  checked,
  confidence,
  files,
  instances,
  name,
  created,
  onClick,
  onToggle
}: {
  active: boolean;
  checked: boolean;
  confidence: "high" | "medium";
  files: number;
  instances: number;
  name: string;
  created: boolean;
  onClick: () => void;
  onToggle: () => void;
}) {
  return (
    <div
      className={`flex items-start gap-2.5 px-3 py-2.5 rounded-md cursor-pointer border mb-1 ${
        active ? "bg-wb-accent/10 border-wb-accent/30" : "border-transparent hover:bg-white/[0.03]"
      }`}
      onClick={onClick}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        className={`w-4 h-4 mt-0.5 rounded border inline-flex items-center justify-center ${
          checked ? "bg-wb-accent border-wb-accent text-black" : "border-white/[0.16] text-transparent"
        }`}
      >
        <Check size={11} strokeWidth={3} />
      </button>
      <div className="w-7 h-7 rounded-md bg-wb-surface-2 inline-flex items-center justify-center text-wb-text-secondary flex-shrink-0">
        <LayoutPanelTop size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-[12.5px] text-wb-text-primary ${active ? "font-semibold" : "font-medium"}`}>
          {name}
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <Badge tone={confidence === "high" ? "complete" : "pending"} className="px-1.5 py-0.5 text-[10px]">
            {confidence === "high" ? "High confidence" : "Medium"}
          </Badge>
          {created ? (
            <Badge tone="complete" className="px-1.5 py-0.5 text-[10px]">
              Created
            </Badge>
          ) : null}
          <span className="text-[11px] text-wb-text-tertiary font-mono">
            {instances} instances · {files} files
          </span>
        </div>
      </div>
    </div>
  );
}

function Field({
  children,
  label
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="mb-4">
      <div className="text-[10.5px] font-semibold text-wb-text-tertiary uppercase tracking-wider mb-2">
        {label}
      </div>
      {children}
    </div>
  );
}
