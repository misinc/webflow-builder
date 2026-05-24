import { type ReactNode, useEffect, useState } from "react";
import {
  CreditCard,
  Heading1,
  LayoutPanelTop,
  MoveRight,
  RefreshCw,
  Code as CodeIcon
} from "lucide-react";
import { Panel } from "../components/Panel";
import { Button } from "../components/Button";
import { SectionDetailHeader } from "../components/Headers";
import { AiBadge, Badge } from "../components/Badge";
import { useNavigation } from "../context/NavigationContext";
import { useAppState } from "../context/AppStateContext";
import type { ComponentOpportunity } from "../../../../src/shared/contracts.js";

type SuggestedPropType = "image" | "text" | "link";

interface SuggestedProp {
  name: string;
  type: SuggestedPropType;
  samples: string;
  optional?: boolean;
}

export function ComponentOpportunitiesScreen() {
  const { navigate } = useNavigation();
  const {
    componentOpportunities,
    refreshComponentOpportunities,
    resetComponentBanner
  } = useAppState();
  const [activeId, setActiveId] = useState<string | null>(componentOpportunities[0]?.id ?? null);

  useEffect(() => {
    if (!componentOpportunities.some((opportunity) => opportunity.id === activeId)) {
      setActiveId(componentOpportunities[0]?.id ?? null);
    }
  }, [activeId, componentOpportunities]);

  const activeOpportunity =
    componentOpportunities.find((opportunity) => opportunity.id === activeId) ??
    componentOpportunities[0] ??
    null;
  return (
    <Panel
      onClose={() => navigate("section-list")}
      footer={
        <>
          <div className="flex-1" />
          <Button variant="primary" onClick={() => navigate("section-list")}>
            Back to sections
          </Button>
        </>
      }
    >
      <SectionDetailHeader
        eyebrow="Across all pages"
        title="Component opportunities"
        onBack={() => navigate("section-list")}
        badge={<AiBadge>AI scanned</AiBadge>}
      />

      <div className="px-5 py-3 bg-wb-surface-1 border-b border-white/[0.06] flex items-center gap-3 flex-shrink-0">
        <div className="flex-1">
          <div className="text-[12.5px] text-wb-text-primary font-medium">
            {componentOpportunities.length} reusable patterns detected across{" "}
            {countUniqueSourceFiles(componentOpportunities)} files
          </div>
          <div className="text-[11.5px] text-wb-text-tertiary mt-0.5">
            Patterns worth considering as Webflow Components for easier maintenance across your site.
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
              {componentOpportunities.length} found
            </span>
          </div>
          <div className="overflow-auto flex-1 px-2 py-1.5">
            {componentOpportunities.length === 0 ? (
              <div className="px-3 py-6 text-[12px] text-wb-text-tertiary">
                No repeating component patterns met the current threshold in the synced repo.
              </div>
            ) : (
              componentOpportunities.map((opportunity) => (
                <OpportunityRow
                  key={opportunity.id}
                  opportunity={opportunity}
                  active={opportunity.id === activeOpportunity?.id}
                  onClick={() => setActiveId(opportunity.id)}
                />
              ))
            )}
            {componentOpportunities.length > 0 ? (
              <div className="px-3 pt-3 mt-1.5 border-t border-white/[0.06] text-[11.5px] text-wb-text-tertiary leading-relaxed">
                Patterns with very low repetition are hidden by default. Lower the threshold when
                you want broader suggestions.
              </div>
            ) : null}
          </div>
        </div>

        <div className="w-[58%] flex flex-col min-w-0">
          <div className="px-4 py-2.5 border-b border-white/[0.09] text-[11px] font-semibold text-wb-text-tertiary uppercase tracking-wider bg-black/[0.12] flex-shrink-0">
            Component details
          </div>
          <div className="overflow-y-auto flex-1 px-5 py-4.5">
            {activeOpportunity ? (
              <>
                <Field label="Suggested name">
                  <div className="w-full h-9 bg-wb-input border border-white/[0.09] rounded-md px-2.5 text-wb-text-primary text-[14px] font-medium flex items-center">
                    {activeOpportunity.name}
                  </div>
                </Field>

                <Field
                  label={`Suggested props · ${buildOpportunityPreview(activeOpportunity).suggestedProps.length} detected`}
                >
                  <div className="bg-wb-surface-1 border border-white/[0.09] rounded-md overflow-hidden">
                    <div className="grid grid-cols-[110px_80px_1fr] gap-2.5 px-3 py-2 bg-black/[0.12] border-b border-white/[0.06] text-[10px] font-semibold text-wb-text-tertiary uppercase tracking-wider">
                      <div>Name</div>
                      <div>Type</div>
                      <div>Samples</div>
                    </div>
                    {buildOpportunityPreview(activeOpportunity).suggestedProps.map((prop, index) => (
                      <PropRow
                        key={`${prop.name}-${index}`}
                        prop={prop}
                        last={
                          index ===
                          buildOpportunityPreview(activeOpportunity).suggestedProps.length - 1
                        }
                      />
                    ))}
                  </div>
                  <div className="text-[10.5px] text-wb-text-tertiary mt-1.5">
                    Prop suggestions are advisory. Use them when you later turn a repeated pattern
                    into a real Webflow Component.
                  </div>
                </Field>

                <div>
                  <div className="text-[10.5px] font-semibold text-wb-text-tertiary uppercase tracking-wider mb-2">
                    Occurrences · {activeOpportunity.instances} across {activeOpportunity.files}{" "}
                    {activeOpportunity.files === 1 ? "file" : "files"}
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
  opportunity,
  active,
  onClick
}: {
  opportunity: ComponentOpportunity;
  active: boolean;
  onClick: () => void;
}) {
  const preview = buildOpportunityPreview(opportunity);

  return (
    <div
      className={`flex items-start gap-2.5 px-3 py-2.5 rounded-md cursor-pointer border mb-1 ${
        active
          ? "bg-wb-accent/10 border-wb-accent/30"
          : "border-transparent hover:bg-white/[0.03]"
      }`}
      onClick={onClick}
    >
      <div className="w-7 h-7 rounded-md bg-wb-surface-2 inline-flex items-center justify-center text-wb-text-secondary flex-shrink-0">
        {preview?.listIcon ?? <LayoutPanelTop size={14} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-[12.5px] text-wb-text-primary ${active ? "font-semibold" : "font-medium"}`}>
          {opportunity.name}
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <Badge
            tone={opportunity.confidence === "high" ? "complete" : "pending"}
            className={
              opportunity.confidence === "high"
                ? "px-1.5 py-0.5 text-[10px]"
                : "px-1.5 py-0.5 text-[10px] bg-wb-warning/10 text-[#ffd24d] border-wb-warning/30"
            }
          >
            {opportunity.confidence === "high" ? "High confidence" : "Medium"}
          </Badge>
          <span className="text-[11px] text-wb-text-tertiary font-mono">
            {opportunity.instances} instances · {opportunity.files} files
          </span>
        </div>
      </div>
    </div>
  );
}

function PropRow({
  prop,
  last
}: {
  prop: SuggestedProp;
  last: boolean;
}) {
  const tone =
    prop.type === "image" ? "ai" : prop.type === "text" ? "complete" : "in-progress";

  return (
    <div
      className={`grid grid-cols-[110px_80px_1fr] gap-2.5 px-3 py-2.5 items-center ${
        !last ? "border-b border-white/[0.06]" : ""
      }`}
    >
      <div className="font-mono text-[11.5px] text-[#ffd479]">
        {prop.name}
        {prop.optional ? <span className="text-wb-text-tertiary italic ml-1">?</span> : null}
      </div>
      <div>
        <Badge tone={tone} className="px-1.5 py-0.5 text-[10px]">
          {prop.type}
        </Badge>
      </div>
      <div className="font-mono text-[11px] text-wb-text-secondary overflow-hidden text-ellipsis whitespace-nowrap">
        {prop.samples}
      </div>
    </div>
  );
}

function Field({
  label,
  children
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mb-4.5">
      <label className="text-[10.5px] font-semibold text-wb-text-tertiary uppercase tracking-wider block mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function countUniqueSourceFiles(opportunities: ComponentOpportunity[]) {
  return new Set(opportunities.flatMap((opportunity) => opportunity.sourceFiles)).size;
}

function buildOpportunityPreview(opportunity: ComponentOpportunity) {
  const normalized = opportunity.componentName.toLowerCase();
  if (normalized.includes("card")) {
    return {
      listIcon: <LayoutPanelTop size={14} />,
      suggestedProps: [
        { name: "icon", type: "image", samples: "svg icon or CMS image" },
        { name: "title", type: "text", samples: '"Heading copy across each card"' },
        { name: "description", type: "text", samples: '"Short supporting description"' },
        { name: "href", type: "link", samples: "Optional CTA destination", optional: true }
      ] satisfies SuggestedProp[]
    };
  }

  if (normalized.includes("button")) {
    return {
      listIcon: <MoveRight size={14} />,
      suggestedProps: [
        { name: "label", type: "text", samples: '"Learn more" · "Get started"' },
        { name: "href", type: "link", samples: "Primary destination URL" },
        { name: "icon", type: "image", samples: "Arrow or icon asset", optional: true }
      ] satisfies SuggestedProp[]
    };
  }

  if (normalized.includes("pricing") || normalized.includes("tier")) {
    return {
      listIcon: <CreditCard size={14} />,
      suggestedProps: [
        { name: "tier", type: "text", samples: '"Starter" · "Growth" · "Enterprise"' },
        { name: "price", type: "text", samples: '"$29/mo" · "Contact sales"' },
        { name: "features", type: "text", samples: "List of included benefits" },
        { name: "ctaHref", type: "link", samples: "Upgrade or contact link", optional: true }
      ] satisfies SuggestedProp[]
    };
  }

  if (normalized.includes("eyebrow") || normalized.includes("label")) {
    return {
      listIcon: <Heading1 size={14} />,
      suggestedProps: [
        { name: "text", type: "text", samples: '"Features" · "Services" · "Case studies"' }
      ] satisfies SuggestedProp[]
    };
  }

  return {
    listIcon: <LayoutPanelTop size={14} />,
    suggestedProps: [
      { name: "title", type: "text", samples: '"Primary repeated copy"' },
      { name: "body", type: "text", samples: '"Supporting repeated copy"', optional: true },
      { name: "href", type: "link", samples: "Optional destination link", optional: true }
    ] satisfies SuggestedProp[]
  };
}
