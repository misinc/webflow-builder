import { Check } from "lucide-react";
import { Panel } from "../components/Panel";
import { Button } from "../components/Button";
import { useNavigation } from "../context/NavigationContext";
import { useAppState } from "../context/AppStateContext";

export function SectionCompleteScreen() {
  const { navigate } = useNavigation();
  const { activeQueue, lastCompletedSection } = useAppState();
  const builtCount =
    activeQueue?.items.filter((item) => item.status === "approved").length ?? 0;
  const skippedCount =
    activeQueue?.items.filter((item) => item.status === "skipped").length ?? 0;
  const totalCount = activeQueue?.items.length ?? 0;

  return (
    <Panel onClose={() => navigate("section-list")}>
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-[460px] text-center">
          <div
            className="w-16 h-16 rounded-2xl inline-flex items-center justify-center mb-5"
            style={{
              background: "rgba(0,208,156,0.12)",
              border: "1px solid rgba(0,208,156,0.32)",
              color: "#00d09c"
            }}
          >
            <Check size={32} strokeWidth={2.5} />
          </div>

          <h2 className="text-[20px] font-semibold text-wb-text-primary tracking-tight mb-2.5">
            {lastCompletedSection?.title ?? "Current section"} is done
          </h2>
          <p className="text-[13.5px] text-wb-text-secondary leading-relaxed mb-6">
            The section was approved and the persisted workflow queue has advanced to the next item.
          </p>

          <div className="bg-wb-surface-1 border border-white/[0.09] rounded-lg p-4 mb-5 text-left">
            {lastCompletedSection ? (
              <div className="text-[11px] text-wb-text-tertiary font-mono mb-3">
                {lastCompletedSection.file}
              </div>
            ) : null}
            <div className="flex gap-4 text-[11.5px] text-wb-text-secondary">
              <StatBlock value={String(builtCount)} label="sections built" color="text-wb-success" />
              <StatBlock value={String(skippedCount)} label="skipped" color="text-wb-skipped" />
              <StatBlock value={String(totalCount)} label="tracked total" color="text-wb-text-primary" />
            </div>
          </div>

          <div className="flex gap-2 justify-center">
            <Button variant="ghost" onClick={() => navigate("section-list")}>
              Back to sections
            </Button>
            <Button variant="primary" onClick={() => navigate("page-complete")}>
              See page summary
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function StatBlock({
  value,
  label,
  color
}: {
  value: string;
  label: string;
  color: string;
}) {
  return (
    <div className="flex-1">
      <span className={`font-semibold text-[13px] ${color}`}>{value}</span>
      <br />
      <span className="text-[10.5px] text-wb-text-tertiary uppercase tracking-wider font-semibold">
        {label}
      </span>
    </div>
  );
}
