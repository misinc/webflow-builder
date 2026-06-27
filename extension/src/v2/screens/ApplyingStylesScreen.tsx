import { useEffect } from "react";
import { X } from "lucide-react";
import { Panel } from "../components/Panel";
import { Button } from "../components/Button";
import { Stepper, buildStepper } from "../components/Stepper";
import { SectionDetailHeader, ListHeader } from "../components/Headers";
import { AiBadge } from "../components/Badge";
import { Spinner } from "../components/Spinner";
import { useNavigation } from "../context/NavigationContext";
import { useAppState } from "../context/AppStateContext";

interface StyleLine {
  selector?: string;
  prop?: string;
  value?: string;
  pending?: boolean;
  message?: string;
}

export function ApplyingStylesScreen() {
  const { navigate } = useNavigation();
  const {
    applyCurrentSection,
    approveCurrentSection,
    cancelActiveWorkflow,
    error,
    isMutating,
    loadingLabel,
    rollbackCurrentExecution,
    selectedSection,
    skeleton,
    styling,
    verification
  } = useAppState();

  useEffect(() => {
    if (!styling && !verification && !isMutating && !error) {
      void applyCurrentSection();
    }
  }, [applyCurrentSection, error, isMutating, styling, verification]);

  useEffect(() => {
    return () => {
      if (isMutating) {
        void cancelActiveWorkflow();
      }
    };
  }, [cancelActiveWorkflow, isMutating]);

  const appliedLines: StyleLine[] =
    styling?.styleDefinitions.slice(0, 18).map((definition) => {
      const [prop, value] = Object.entries(definition.properties)[0] ?? [];
      return {
        selector: `.${definition.className}`,
        prop,
        value
      };
    }) ?? [];

  const requiredClassLines: StyleLine[] =
    styling?.requiredClassNames.slice(0, Math.max(0, 18 - appliedLines.length)).map((className) => ({
      selector: `.${className}`,
      prop: "applied",
      value: "section root"
    })) ?? [];
  const visibleLines = [...appliedLines, ...requiredClassLines];
  const hasBlockedVerification = Boolean(verification && !verification.readyForApproval);

  if (isMutating && visibleLines.length === 0) {
    const pendingClassName =
      skeleton?.elementTree.classNames.find((className) => className !== "section") ??
      skeleton?.elementTree.classNames[0];
    visibleLines.push({
      selector: pendingClassName ? `.${pendingClassName}` : undefined,
      pending: true,
      message: styling ? "Applying styles" : "Preparing styling plan"
    });
  }

  return (
    <Panel
      onClose={() => {
        void cancelActiveWorkflow().then(() => navigate("section-list"));
      }}
      footer={
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void rollbackCurrentExecution().then(() => navigate("skeleton-review"));
            }}
          >
            <X size={12} />
            Reject & redo
          </Button>
          <div className="flex-1" />
          {(error && !isMutating && !verification) || (!isMutating && hasBlockedVerification) ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void applyCurrentSection();
              }}
            >
              Retry styling
            </Button>
          ) : null}
          <span className="text-[11px] text-wb-text-tertiary mr-2">
            {loadingLabel ?? (verification ? (verification.readyForApproval ? "Ready for approval" : "Needs retry or redo") : "Applying styles…")}
          </span>
          <Button
            variant="primary"
            disabled={!verification?.readyForApproval || isMutating}
            onClick={() => {
              void approveCurrentSection().then((approved) => {
                if (approved) {
                  navigate("section-complete");
                }
              });
            }}
          >
            Approve section
          </Button>
        </>
      }
    >
      <SectionDetailHeader
        eyebrow="Build flow"
        title={selectedSection?.title ?? "Current section"}
        onBack={() => {
          void cancelActiveWorkflow().then(() => navigate("section-list"));
        }}
        badge={
          <AiBadge>
            {verification ? (verification.readyForApproval ? "Ready" : "Review") : "Styling"}
          </AiBadge>
        }
      />

      <Stepper steps={buildStepper("style")} />

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-6 pt-7 pb-5 text-center border-b border-white/[0.06]">
          <div className="flex justify-center mb-3.5">
            {isMutating ? <Spinner size={28} thickness={2.5} /> : null}
          </div>
          <div className="text-[15px] font-medium text-wb-text-primary mb-1.5">
            {verification
              ? verification.readyForApproval
                ? "Section styled and verified"
                : "Section needs another styling pass"
              : `Applying styles to ${selectedSection?.title ?? "current section"}`}
          </div>
          <div className="text-[12.5px] text-wb-text-secondary leading-relaxed max-w-[480px] mx-auto">
            Watch the section take shape on the canvas behind you. Approval unlocks when verification passes.
          </div>
          {error ? <div className="mt-3 text-[11.5px] text-wb-danger">{error}</div> : null}
        </div>

        <ListHeader
          title="Styles applied"
          count={
            styling
              ? `${styling.styleDefinitions.length + styling.requiredClassNames.length} classes · ${styling.variableBindings.length} variables`
              : isMutating
                ? "Generating styling plan"
                : "Waiting on styling plan"
          }
        />

        <div className="px-4 py-2 font-mono text-[11px] leading-loose">
          {visibleLines.map((line, index) => (
            <StyleLineRow key={`${line.selector}-${index}`} line={line} />
          ))}
        </div>
      </div>
    </Panel>
  );
}

function StyleLineRow({ line }: { line: StyleLine }) {
  if (line.pending) {
    return (
      <div className="flex gap-2 px-2 py-0.5 rounded text-wb-text-secondary opacity-70">
        <span className="text-wb-accent w-3 text-center">…</span>
        {line.selector ? <span className="text-[#8ad7ff]">{line.selector}</span> : null}
        <span className="text-[#ffd479]">{line.message ?? "Working…"}</span>
      </div>
    );
  }
  return (
    <div className="flex gap-2 px-2 py-0.5 rounded bg-wb-success/[0.06] text-[#cdf3e5]">
      <span className="text-wb-success w-3 text-center">+</span>
      <span className="text-[#8ad7ff]">{line.selector}</span>
      <span className="text-[#ffd479]">{line.prop}</span>
      <span className="text-wb-text-primary">: {line.value}</span>
    </div>
  );
}
