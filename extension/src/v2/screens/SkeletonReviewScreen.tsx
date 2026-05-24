import { RefreshCw, Pencil } from "lucide-react";
import { Panel } from "../components/Panel";
import { Button, IconButton } from "../components/Button";
import { Stepper, buildStepper } from "../components/Stepper";
import { SectionDetailHeader } from "../components/Headers";
import { useNavigation } from "../context/NavigationContext";
import { useAppState } from "../context/AppStateContext";

export function SkeletonReviewScreen() {
  const { navigate } = useNavigation();
  const {
    beginSkeletonEdit,
    regenerateSkeleton,
    selectedSection,
    skipCurrentSection,
    skeleton
  } = useAppState();

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
            {skeleton?.reusableClasses.length ?? 0} reused classes
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
              <IconButton
                onClick={() => {
                  beginSkeletonEdit();
                  navigate("skeleton-edit");
                }}
                aria-label="Edit tree"
              >
                <Pencil size={13} />
              </IconButton>
            }
          />
          <textarea
            readOnly
            value={skeleton?.treeText ?? "No skeleton generated yet."}
            className="px-4 py-3 overflow-auto flex-1 bg-transparent font-mono text-[12px] text-wb-text-secondary leading-relaxed outline-none resize-none"
          />
        </div>

        <div className="w-1/2 flex flex-col min-w-0">
          <SplitHeader title={`Source · ${selectedSection?.file ?? "repo source"}`} />
          <div className="flex-1 overflow-auto p-4 font-mono text-[11.5px] text-wb-text-secondary bg-black/[0.18] leading-relaxed">
            <div className="text-wb-text-tertiary mb-2">{`// Section context`}</div>
            <div>{selectedSection?.title ?? "Current section"}</div>
            <div>{selectedSection?.file ?? "Unknown file"}</div>
            <div className="mt-4 text-wb-text-tertiary">{`// Generated warnings`}</div>
            {(skeleton?.warnings.length ?? 0) === 0 ? (
              <div>No warnings.</div>
            ) : (
              skeleton?.warnings.map((warning) => (
                <div key={`${warning.code}-${warning.message}`}>{warning.message}</div>
              ))
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
