import { useEffect } from "react";
import { Check } from "lucide-react";
import { Panel } from "../components/Panel";
import { Button } from "../components/Button";
import { Stepper, buildStepper } from "../components/Stepper";
import { SectionDetailHeader } from "../components/Headers";
import { AiBadge } from "../components/Badge";
import { Spinner } from "../components/Spinner";
import { useNavigation } from "../context/NavigationContext";
import { useAppState } from "../context/AppStateContext";

export function GeneratingSkeletonScreen() {
  const { navigate } = useNavigation();
  const {
    activeSectionError,
    analysis,
    cancelActiveWorkflow,
    error,
    isMutating,
    loadingLabel,
    selectedSection,
    skeleton,
    startSectionBuild
  } = useAppState();

  useEffect(() => {
    if (skeleton) {
      navigate("skeleton-review");
      return;
    }
    if (activeSectionError || error) {
      navigate("error");
      return;
    }
    if (!isMutating) {
      void startSectionBuild();
    }
  }, [activeSectionError, error, isMutating, navigate, skeleton, startSectionBuild]);

  return (
    <Panel
      onClose={() => {
        void cancelActiveWorkflow().then(() => navigate("section-list"));
      }}
      footer={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void cancelActiveWorkflow();
            navigate("section-list");
          }}
        >
          Cancel
        </Button>
      }
    >
      <SectionDetailHeader
        eyebrow="Build flow"
        title={
          <>
            {selectedSection?.title ?? "Current section"}
            <span className="text-[11px] font-normal text-wb-text-tertiary font-mono">
              {` ${selectedSection?.file ?? ""}`}
            </span>
          </>
        }
        badge={<AiBadge>AI working</AiBadge>}
        onBack={() => {
          void cancelActiveWorkflow().then(() => navigate("section-list"));
        }}
      />

      <Stepper steps={buildStepper("skeleton")} />

      <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-3.5">
        <Spinner size={28} thickness={2.5} />
        <div>
          <div className="text-[15px] font-medium text-wb-text-primary mb-1.5">
            {loadingLabel ?? "Generating skeleton"}
          </div>
          <div className="text-[12.5px] text-wb-text-secondary leading-relaxed max-w-[460px] mx-auto">
            Reading the mapped repo section and turning it into a Webflow-friendly tree with class names.
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-2 text-[11.5px] text-wb-text-tertiary font-mono">
          <div className="flex items-center gap-2">
            <Check size={12} strokeWidth={3} className="text-wb-success" />
            Loaded {selectedSection?.file ?? "repo section"}
          </div>
          <div className="flex items-center gap-2">
            {analysis ? (
              <>
                <Check size={12} strokeWidth={3} className="text-wb-success" />
                Section analysis complete
              </>
            ) : (
              <>
                <Spinner size={10} thickness={1.5} />
                Analyzing structure…
              </>
            )}
          </div>
          <div className="flex items-center gap-2 text-wb-text-secondary">
            {skeleton ? (
              <>
                <Check size={12} strokeWidth={3} className="text-wb-success" />
                Skeleton ready
              </>
            ) : (
              <>
                <Spinner size={10} thickness={1.5} />
                Generating class names…
              </>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}
