import { Pencil } from "lucide-react";
import { Panel } from "../components/Panel";
import { Button } from "../components/Button";
import { Stepper, buildStepper } from "../components/Stepper";
import { SectionDetailHeader } from "../components/Headers";
import { Badge } from "../components/Badge";
import { useNavigation } from "../context/NavigationContext";
import { useAppState } from "../context/AppStateContext";

export function SkeletonEditScreen() {
  const { navigate } = useNavigation();
  const {
    discardSkeletonChanges,
    error,
    hasSkeletonChanges,
    saveSkeletonChanges,
    saveSkeletonDraft,
    selectedChrome,
    selectedSection,
    skeletonDraft
  } = useAppState();
  // A chrome skeleton (navbar/footer) returns to its own detail screen.
  const reviewScreen = selectedChrome ? "chrome-detail" : "skeleton-review";
  const subjectTitle = selectedChrome?.title ?? selectedSection?.title ?? "Current section";

  return (
    <Panel
      onClose={() => navigate(reviewScreen)}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              discardSkeletonChanges();
              navigate(reviewScreen);
            }}
          >
            Discard changes
          </Button>
          <div className="flex-1" />
          <span className="text-[11px] text-wb-text-tertiary mr-2">
            {error
              ? error
              : hasSkeletonChanges
                ? "Unsaved edits"
                : "No unsaved edits"}
          </span>
          <Button
            variant="primary"
            onClick={() => {
              if (saveSkeletonChanges()) {
                navigate(reviewScreen);
              }
            }}
          >
            Save changes
          </Button>
        </>
      }
    >
      <SectionDetailHeader
        eyebrow={`Editing skeleton · ${subjectTitle}`}
        title="Edit skeleton tree"
        onBack={() => navigate(reviewScreen)}
        badge={
          <Badge tone="in-progress">
            <Pencil size={10} />
            Editing
          </Badge>
        }
      />

      <Stepper steps={buildStepper("skeleton")} />

      <div className="flex flex-1 min-h-0">
        <div className="w-1/2 border-r border-white/[0.09] flex flex-col min-w-0">
          <div className="px-4 py-2.5 border-b border-white/[0.09] text-[11px] font-semibold text-wb-text-tertiary uppercase tracking-wider bg-black/[0.12]">
            Editable tree text
          </div>
          <textarea
            value={skeletonDraft}
            onChange={(event) => saveSkeletonDraft(event.target.value)}
            className="flex-1 bg-transparent px-4 py-3 font-mono text-[12px] text-wb-text-secondary leading-relaxed outline-none resize-none"
          />
        </div>

        <div className="w-1/2 flex flex-col min-w-0">
          <div className="px-4 py-2.5 border-b border-white/[0.09] text-[11px] font-semibold text-wb-text-tertiary uppercase tracking-wider bg-black/[0.12]">
            Editing notes
          </div>
          <div className="px-5 py-4.5 overflow-y-auto flex-1 text-[12px] text-wb-text-secondary leading-relaxed">
            <p>Use one element per line. Indentation controls nesting.</p>
            <p>Format each node as <span className="font-mono text-wb-text-primary">tag.class-name</span>.</p>
            <p>Append quoted text at the end of a line to create text content.</p>
            <p>Save changes to update the skeleton used for insertion and styling in this run.</p>
          </div>
        </div>
      </div>
    </Panel>
  );
}
