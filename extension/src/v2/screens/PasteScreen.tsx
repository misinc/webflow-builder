import { useState } from "react";
import { Check, Clipboard } from "lucide-react";
import { Panel } from "../components/Panel";
import { Button } from "../components/Button";
import { Stepper, buildStepper } from "../components/Stepper";
import { SectionDetailHeader } from "../components/Headers";
import { useNavigation } from "../context/NavigationContext";
import { useAppState } from "../context/AppStateContext";
import { getWebflowBridge } from "../../webflow/bridge.js";
import { copyWebflowPayloadToClipboard } from "../../webflow/clipboard.js";

const bridge = getWebflowBridge();

/**
 * Step 2 of the paste-first flow. Copy for Webflow lands here: the payload is
 * already on the clipboard, and this screen walks the paste + cleanup + done
 * gestures with the actions right where the eyes are.
 */
export function PasteScreen() {
  const { navigate } = useNavigation();
  const {
    approveAllRemainingSections,
    approveCurrentSection,
    buildClipboardPayload,
    componentForSection,
    createComponentOnApprove,
    currentSections,
    isMutating,
    pasteScope,
    selectedSection,
    selectedSectionId,
    selectedSectionOpportunity,
    setCreateComponentOnApprove,
    setUiHint
  } = useAppState();
  const isSection = pasteScope === "section";
  const isPage = pasteScope === "page";
  const isChrome = pasteScope === "chrome-header" || pasteScope === "chrome-footer";
  const scopeTitle = isSection
    ? selectedSection?.title ?? "Current section"
    : isPage
    ? "Whole page"
    : pasteScope === "chrome-header"
    ? "Navbar"
    : "Footer";
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);
  const [cleanupLabel, setCleanupLabel] = useState("Clean up paste");
  const [copyAgainLabel, setCopyAgainLabel] = useState("Copy again");

  const cleanupPaste = async () => {
    setCleanupLabel("Cleaning…");
    try {
      const deduped = await bridge.dedupeSelectionStyles();
      const bound = await bridge.bindTokensInSelection();
      const summary = `${deduped.swappedClasses.length} class${deduped.swappedClasses.length === 1 ? "" : "es"} fixed · ${bound.boundProperties} token${bound.boundProperties === 1 ? "" : "s"} bound`;
      setCleanupResult(summary);
      setCleanupLabel("Clean up again");
      setUiHint("Cleaned up. Check the section against the live site, then Mark section built.");
    } catch {
      setCleanupLabel("Clean up paste");
      setUiHint("Select the pasted section on the canvas first, then click Clean up paste.");
    }
  };

  const copyAgain = async () => {
    let result = null;
    if (isSection) {
      if (!selectedSectionId) {
        return;
      }
      result = await buildClipboardPayload(selectedSectionId);
    } else if (isPage) {
      const componentizedIds = currentSections
        .filter(
          (section) =>
            (section.status === "pending" || section.status === "in-progress") &&
            componentForSection(section)
        )
        .map((section) => section.id);
      result = await buildClipboardPayload(undefined, componentizedIds);
    } else {
      result = await buildClipboardPayload(undefined, undefined, {
        chrome: pasteScope === "chrome-header" ? "header" : "footer"
      });
    }
    if (!result) {
      return;
    }
    try {
      copyWebflowPayloadToClipboard(result.payload);
      setCopyAgainLabel("Copied");
      window.setTimeout(() => setCopyAgainLabel("Copy again"), 2600);
    } catch {
      setCopyAgainLabel("Click again to copy");
    }
  };

  const pasteTarget = isSection
    ? "Click where the section should go on the canvas"
    : isPage
    ? "Select your navbar (inside page-wrapper) so the main-wrapper lands after it"
    : pasteScope === "chrome-header"
    ? "Click inside your page-wrapper, above main-wrapper"
    : "Click inside your page-wrapper, below main-wrapper";
  const finishStep = isSection
    ? "Compare with the live site, then Mark section built"
    : isPage
    ? "Compare with the live site, then Approve all sections"
    : "Right-click the pasted element → Create Component, then Done";
  const steps: Array<{ label: string; done: boolean }> = [
    { label: pasteTarget, done: false },
    { label: "Press Cmd+V (Ctrl+V on Windows) to paste", done: false },
    { label: "Select the pasted element in the Navigator", done: false },
    { label: "Clean up paste — reuses your classes, binds your variables", done: Boolean(cleanupResult) },
    { label: finishStep, done: false }
  ];

  return (
    <Panel
      onClose={() => navigate("section-list")}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => navigate(isSection ? "skeleton-review" : "section-list")}>
            {isSection ? "Back to skeleton" : "Back to sections"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={isMutating}
            onClick={() => {
              void copyAgain();
            }}
          >
            <Clipboard size={12} />
            {copyAgainLabel}
          </Button>
          <div className="flex-1" />
          {isSection && selectedSectionOpportunity ? (
            <label
              className="inline-flex items-center gap-2 text-[11.5px] text-wb-text-secondary whitespace-nowrap mr-1"
              title={`This section is used on ${selectedSectionOpportunity.files} pages — marking it built also registers your selection as a Webflow Component so other pages can insert instances.`}
            >
              <input
                type="checkbox"
                checked={createComponentOnApprove}
                onChange={(event) => setCreateComponentOnApprove(event.target.checked)}
                className="h-3.5 w-3.5 rounded border border-white/[0.16] bg-wb-input accent-[var(--wb-accent)]"
              />
              Create component
            </label>
          ) : null}
          <Button
            variant={cleanupResult ? "ghost" : "primary"}
            disabled={isMutating}
            onClick={() => {
              void cleanupPaste();
            }}
          >
            {cleanupLabel}
          </Button>
          <Button
            variant={cleanupResult ? "primary" : "ghost"}
            disabled={isMutating}
            onClick={() => {
              if (isSection) {
                void approveCurrentSection().then((approved) => {
                  if (approved) {
                    setUiHint(null);
                    navigate("section-complete");
                  }
                });
              } else if (isPage) {
                void approveAllRemainingSections().then((approved) => {
                  if (approved) {
                    setUiHint(null);
                    navigate("section-list");
                  }
                });
              } else {
                setUiHint(null);
                navigate("section-list");
              }
            }}
          >
            {isSection ? "Mark section built" : isPage ? "Approve all sections" : "Done"}
          </Button>
        </>
      }
    >
      <SectionDetailHeader
        eyebrow="Build flow"
        title={scopeTitle}
        onBack={() => navigate(isSection ? "skeleton-review" : "section-list")}
      />

      <Stepper steps={buildStepper("style")} />

      <div className="flex-1 min-h-0 overflow-auto px-8 py-8">
        <div className="max-w-[440px] mx-auto">
          <div className="text-[15px] font-semibold text-wb-text-primary mb-1">
            The section is on your clipboard
          </div>
          <div className="text-[12.5px] text-wb-text-tertiary mb-6">
            Structure, styles, combo classes, and SVG icons — one paste.
          </div>
          <ol className="space-y-3">
            {steps.map((step, index) => (
              <li key={step.label} className="flex items-start gap-3">
                <span
                  className={`w-[22px] h-[22px] rounded-full inline-flex items-center justify-center text-[11px] font-semibold flex-shrink-0 ${
                    step.done
                      ? "bg-wb-success text-[#06281f]"
                      : "bg-wb-surface-3 text-wb-text-tertiary"
                  }`}
                >
                  {step.done ? <Check size={12} strokeWidth={3} /> : index + 1}
                </span>
                <span
                  className={`text-[13px] leading-[22px] ${
                    step.done ? "text-wb-text-tertiary line-through" : "text-wb-text-secondary"
                  }`}
                >
                  {step.label}
                </span>
              </li>
            ))}
          </ol>
          {cleanupResult ? (
            <div className="mt-6 px-3.5 py-2.5 rounded-md border border-wb-success/30 bg-wb-success/[0.07] text-[12.5px] text-wb-text-secondary">
              {cleanupResult}
            </div>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
