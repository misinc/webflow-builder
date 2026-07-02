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
import { isReservedStyleGuideClassName } from "@wfb/shared/client-first.js";
import type { BuildNode } from "@wfb/shared/contracts.js";

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
    createComponentOnApprove,
    error,
    isMutating,
    loadingLabel,
    rollbackCurrentExecution,
    selectedSection,
    selectedSectionOpportunity,
    setCreateComponentOnApprove,
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
    styling?.styleDefinitions.filter(
      (definition) => !isReservedStyleGuideClassName(definition.className)
    ).slice(0, 18).map((definition) => {
      const [prop, value] = Object.entries(definition.properties)[0] ?? [];
      return {
        selector: `.${definition.className}`,
        prop,
        value
      };
    }) ?? [];

  const requiredClassLines: StyleLine[] =
    styling?.requiredClassNames
      .filter((className) => !isReservedStyleGuideClassName(className))
      .slice(0, Math.max(0, 18 - appliedLines.length))
      .map((className) => ({
        selector: `.${className}`,
        prop: "applied",
        value: "section root"
      })) ?? [];
  const visibleLines = [...appliedLines, ...requiredClassLines];
  const visibleStyleDefinitionCount =
    styling?.styleDefinitions.filter(
      (definition) => !isReservedStyleGuideClassName(definition.className)
    ).length ?? 0;
  const visibleRequiredClassCount =
    styling?.requiredClassNames.filter(
      (className) => !isReservedStyleGuideClassName(className)
    ).length ?? 0;
  const hasBlockedVerification = Boolean(verification && !verification.readyForApproval);
  const canApproveSection = Boolean(
    verification?.readyForApproval || (styling && hasBlockedVerification)
  );
  const statusTitle = verification
    ? verification.readyForApproval
      ? "Section styled and verified"
      : styling
        ? "Styles applied, visual review needed"
        : "Automatic verification needs another pass"
    : `Applying styles to ${selectedSection?.title ?? "current section"}`;
  const statusDescription = verification
    ? verification.readyForApproval
      ? "Automatic verification passed. Review the canvas, then approve this section."
      : verification.summary
    : "Applying the generated style plan to the selected section on the canvas.";
  const visibleVerificationWarnings = verification?.readyForApproval
    ? []
    : verification?.warnings.slice(0, 3) ?? [];

  if (isMutating && visibleLines.length === 0) {
    collectSkeletonClassNames(skeleton?.elementTree)
      .slice(0, 8)
      .forEach((className) => {
        visibleLines.push({
          selector: `.${className}`,
          pending: true,
          message: styling ? "Applying styles" : "Preparing styling plan"
        });
      });
    if (visibleLines.length === 0) {
      visibleLines.push({
        pending: true,
        message: styling ? "Applying styles" : "Preparing styling plan"
      });
    }
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
          {selectedSectionOpportunity ? (
            <label
              className="inline-flex items-center gap-2 text-[11.5px] text-wb-text-secondary whitespace-nowrap mr-2"
              title={`This section is used on ${selectedSectionOpportunity.files} pages — approving will also register it as a Webflow Component so other pages can insert instances instead of rebuilding.`}
            >
              <input
                type="checkbox"
                checked={createComponentOnApprove}
                onChange={(event) => setCreateComponentOnApprove(event.target.checked)}
                className="h-3.5 w-3.5 rounded border border-white/[0.16] bg-wb-input accent-[var(--wb-accent)]"
              />
              Create component · {selectedSectionOpportunity.files} pages
            </label>
          ) : (
            <span className="text-[11px] text-wb-text-tertiary mr-2">
              {loadingLabel ?? (verification ? (verification.readyForApproval ? "Ready for approval" : "Can retry or approve visually") : "Applying styles…")}
            </span>
          )}
          <Button
            variant="primary"
            disabled={!canApproveSection || isMutating}
            onClick={() => {
              void approveCurrentSection().then((approved) => {
                if (approved) {
                  navigate("section-complete");
                }
              });
            }}
          >
            {verification && !verification.readyForApproval ? "Approve anyway" : "Approve section"}
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
            {statusTitle}
          </div>
          <div className="text-[12.5px] text-wb-text-secondary leading-relaxed max-w-[480px] mx-auto">
            {statusDescription}
          </div>
          {visibleVerificationWarnings.length > 0 ? (
            <div className="mt-3 mx-auto max-w-[560px] space-y-1 text-left">
              {visibleVerificationWarnings.map((warning) => (
                <div
                  key={`${warning.code}-${warning.message}`}
                  className="rounded border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-[11px] leading-relaxed text-wb-text-tertiary"
                >
                  <span
                    className={
                      warning.level === "error"
                        ? "text-wb-danger"
                        : warning.level === "warning"
                          ? "text-[#ffd479]"
                          : "text-[#8ad7ff]"
                    }
                  >
                    {warning.level}
                  </span>
                  <span className="text-wb-text-tertiary"> · {warning.message}</span>
                </div>
              ))}
            </div>
          ) : null}
          {error ? <div className="mt-3 text-[11.5px] text-wb-danger">{error}</div> : null}
        </div>

        <ListHeader
          title="Styles applied"
          count={
            styling
              ? `${visibleStyleDefinitionCount + visibleRequiredClassCount} classes · ${styling.variableBindings.length} variables`
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

function collectSkeletonClassNames(node: BuildNode | undefined): string[] {
  if (!node) {
    return [];
  }
  const values = new Set<string>();
  function visit(current: BuildNode): void {
    current.classNames.forEach((className) => {
      if (className !== "section" && !isReservedStyleGuideClassName(className)) {
        values.add(className);
      }
    });
    current.children.forEach(visit);
  }
  visit(node);
  return [...values];
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
