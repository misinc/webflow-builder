import { useEffect, useMemo, useState } from "react";
import { Check, Clipboard, ExternalLink } from "lucide-react";
import { Panel } from "../components/Panel";
import { Button } from "../components/Button";
import { Stepper, buildStepper } from "../components/Stepper";
import { SectionDetailHeader } from "../components/Headers";
import { useNavigation } from "../context/NavigationContext";
import { useAppState } from "../context/AppStateContext";
import { getWebflowBridge } from "../../webflow/bridge.js";
import { copyWebflowPayloadToClipboard } from "../../webflow/clipboard.js";
import { VisualQaClient } from "../../api/client.js";
import type { VisualQaCompareResponse } from "@wfb/shared/contracts.js";

const bridge = getWebflowBridge();
const visualQaClient = new VisualQaClient();

function firstSectionSelector(sourceCode: string | null | undefined): string {
  if (!sourceCode) {
    return "";
  }
  const idMatch = sourceCode.match(/<section\b[^>]*\bid=["']([^"']+)["']/i);
  if (idMatch?.[1]) {
    return `#${idMatch[1]}`;
  }
  const classMatch = sourceCode.match(/<section\b[^>]*\bclass=["']([^"']+)["']/i);
  const firstClass = classMatch?.[1]?.split(/\s+/).find(Boolean);
  return firstClass ? `.${firstClass}` : "";
}

function joinUrl(base: string, route: string | null | undefined): string {
  const normalizedBase = base.replace(/\/+$/, "");
  const normalizedRoute = route && route !== "/" ? `/${route.replace(/^\/+/, "")}` : "";
  return `${normalizedBase}${normalizedRoute}`;
}

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
    activeMapping,
    designerContext,
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
  const isChrome =
    pasteScope === "chrome-header" || pasteScope === "chrome-footer" || pasteScope === "chrome";
  const scopeTitle = isSection
    ? selectedSection?.title ?? "Current section"
    : isPage
    ? "Whole page"
    : pasteScope === "chrome-header"
    ? "Navbar"
    : pasteScope === "chrome-footer"
    ? "Footer"
    : "Navbar + Footer";
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);
  const [cleanupLabel, setCleanupLabel] = useState("Clean up paste");
  const [copyAgainLabel, setCopyAgainLabel] = useState("Copy again");
  const defaultWebflowUrl = useMemo(() => {
    if (!designerContext?.siteDomain) {
      return "";
    }
    const domain = designerContext.siteDomain.startsWith("http")
      ? designerContext.siteDomain
      : `https://${designerContext.siteDomain}`;
    return joinUrl(domain, activeMapping?.webflowPageRoute);
  }, [activeMapping?.webflowPageRoute, designerContext?.siteDomain]);
  const defaultSelector = useMemo(
    () => firstSectionSelector(isSection ? selectedSection?.sourceCode : null),
    [isSection, selectedSection?.sourceCode]
  );
  const [originalUrl, setOriginalUrl] = useState("");
  const [webflowUrl, setWebflowUrl] = useState(defaultWebflowUrl);
  const [selector, setSelector] = useState(defaultSelector);
  const [visualQaResult, setVisualQaResult] = useState<VisualQaCompareResponse | null>(null);
  const [visualQaError, setVisualQaError] = useState<string | null>(null);
  const [isRunningVisualQa, setIsRunningVisualQa] = useState(false);

  useEffect(() => {
    if (!webflowUrl && defaultWebflowUrl) {
      setWebflowUrl(defaultWebflowUrl);
    }
  }, [defaultWebflowUrl, webflowUrl]);

  useEffect(() => {
    if (!selector && defaultSelector) {
      setSelector(defaultSelector);
    }
  }, [defaultSelector, selector]);

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
        chrome:
          pasteScope === "chrome-header"
            ? "header"
            : pasteScope === "chrome-footer"
              ? "footer"
              : "all"
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

  const runVisualQa = async () => {
    setVisualQaError(null);
    setVisualQaResult(null);
    setIsRunningVisualQa(true);
    try {
      const result = await visualQaClient.compare({
        originalUrl: originalUrl.trim(),
        webflowUrl: webflowUrl.trim(),
        selector: selector.trim() || undefined,
        threshold: 0.12,
        viewports: [
          { name: "desktop", width: 1440, height: 1200 },
          { name: "tablet", width: 991, height: 1200 },
          { name: "mobile", width: 390, height: 1200 }
        ]
      });
      setVisualQaResult(result);
      setUiHint(
        result.passed
          ? "Visual QA passed. Review the screenshots, then mark the section built."
          : "Visual QA found drift. Review the diff links before approving this section."
      );
    } catch (error) {
      setVisualQaError(error instanceof Error ? error.message : "Visual QA failed.");
    } finally {
      setIsRunningVisualQa(false);
    }
  };

  const pasteTarget = isSection
    ? "Click where the section should go on the canvas"
    : isPage
    ? "Select your navbar (inside page-wrapper) so the main-wrapper lands after it"
    : pasteScope === "chrome-header"
    ? "Click inside your page-wrapper, above main-wrapper"
    : pasteScope === "chrome-footer"
    ? "Click inside your page-wrapper, below main-wrapper"
    : "Click inside your page-wrapper";
  const finishStep = isSection
    ? "Compare with the live site, then Mark section built"
    : isPage
    ? "Compare with the live site, then Approve all sections"
    : pasteScope === "chrome"
    ? "Create a Component from the navbar and one from the footer, then Done"
    : "Right-click the pasted element → Create Component, then Done";
  const steps: Array<{ label: string; done: boolean }> = [
    { label: pasteTarget, done: false },
    { label: "Press Cmd+V (Ctrl+V on Windows) to paste", done: false },
    { label: "Select the pasted element in the Navigator", done: false },
    { label: "Clean up paste — reuses your classes, binds your variables", done: Boolean(cleanupResult) },
    ...(pasteScope === "chrome"
      ? [
          {
            label:
              "Unwrap: move the navbar and footer out of the pasted wrapper, delete the wrapper (main-wrapper pastes between them later)",
            done: false
          }
        ]
      : []),
    { label: finishStep, done: false }
  ];

  return (
    <Panel
      onClose={() => navigate("section-list")}
      footer={
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              navigate(isSection ? "skeleton-review" : isChrome ? "site-chrome" : "section-list")
            }
          >
            {isSection
              ? "Back to skeleton"
              : isChrome
              ? "Back to sitewide elements"
              : "Back to sections"}
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
                navigate(isChrome ? "site-chrome" : "section-list");
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
        onBack={() =>
          navigate(isSection ? "skeleton-review" : isChrome ? "site-chrome" : "section-list")
        }
      />

      <Stepper steps={buildStepper("style")} />

      <div className="flex-1 min-h-0 overflow-auto px-8 py-8">
        <div className="max-w-[520px] mx-auto">
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
          {cleanupResult ? (
            <div className="mt-5 rounded-lg border border-white/[0.09] bg-wb-surface-1 p-4 text-left">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="text-[13px] font-semibold text-wb-text-primary">
                    Visual QA
                  </div>
                  <div className="text-[11.5px] text-wb-text-tertiary mt-0.5">
                    Compare the original HTML preview against the imported Webflow page.
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={
                    isRunningVisualQa ||
                    !originalUrl.trim() ||
                    !webflowUrl.trim() ||
                    !visualQaClient.isConfigured()
                  }
                  onClick={() => {
                    void runVisualQa();
                  }}
                >
                  {isRunningVisualQa ? "Running..." : "Run visual QA"}
                </Button>
              </div>
              {!visualQaClient.isConfigured() ? (
                <div className="mb-3 rounded-md border border-wb-warning/30 bg-wb-warning/[0.08] px-3 py-2 text-[11.5px] text-wb-text-secondary">
                  Set <span className="font-mono">VITE_VISUAL_QA_BASE_URL</span> before
                  building the extension to enable this.
                </div>
              ) : null}
              <div className="space-y-2">
                <label className="block">
                  <span className="block text-[10.5px] uppercase tracking-wider font-semibold text-wb-text-tertiary mb-1">
                    Original HTML URL
                  </span>
                  <input
                    value={originalUrl}
                    onChange={(event) => setOriginalUrl(event.target.value)}
                    placeholder="https://your-html-preview.example.com/"
                    className="w-full h-8 rounded-md bg-wb-input border border-white/[0.09] px-2.5 text-[12px] text-wb-text-primary outline-none focus:border-wb-accent/60"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10.5px] uppercase tracking-wider font-semibold text-wb-text-tertiary mb-1">
                    Webflow URL
                  </span>
                  <input
                    value={webflowUrl}
                    onChange={(event) => setWebflowUrl(event.target.value)}
                    placeholder="https://site.webflow.io/page"
                    className="w-full h-8 rounded-md bg-wb-input border border-white/[0.09] px-2.5 text-[12px] text-wb-text-primary outline-none focus:border-wb-accent/60"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10.5px] uppercase tracking-wider font-semibold text-wb-text-tertiary mb-1">
                    Selector
                  </span>
                  <input
                    value={selector}
                    onChange={(event) => setSelector(event.target.value)}
                    placeholder="#hero or .section_hero"
                    className="w-full h-8 rounded-md bg-wb-input border border-white/[0.09] px-2.5 text-[12px] text-wb-text-primary outline-none focus:border-wb-accent/60"
                  />
                </label>
              </div>
              {visualQaError ? (
                <div className="mt-3 rounded-md border border-wb-danger/30 bg-wb-danger/[0.07] px-3 py-2 text-[11.5px] text-[#ff9b9b]">
                  {visualQaError}
                </div>
              ) : null}
              {visualQaResult ? (
                <div className="mt-3 rounded-md border border-white/[0.09] bg-black/10 px-3 py-2">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span
                      className={`text-[12px] font-semibold ${
                        visualQaResult.passed ? "text-wb-success" : "text-wb-warning"
                      }`}
                    >
                      {visualQaResult.passed ? "Passed" : "Needs review"}
                    </span>
                    <span className="text-[11px] text-wb-text-tertiary">
                      {Math.round(visualQaResult.averageMismatchRatio * 100)}% average drift
                    </span>
                  </div>
                  <div className="space-y-2">
                    {visualQaResult.results.map((result) => (
                      <div
                        key={result.name}
                        className="flex items-center justify-between gap-3 text-[11.5px] text-wb-text-secondary"
                      >
                        <span>
                          {result.name}: {Math.round(result.mismatchRatio * 100)}%
                        </span>
                        <a
                          href={result.diffScreenshot}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-wb-accent hover:underline"
                        >
                          Diff <ExternalLink size={11} />
                        </a>
                      </div>
                    ))}
                  </div>
                  {visualQaResult.results.flatMap((result) => result.notes).length ? (
                    <ul className="mt-2 space-y-1 text-[11px] text-wb-text-tertiary">
                      {visualQaResult.results.flatMap((result) => result.notes).map((note, index) => (
                        <li key={`${note}-${index}`}>{note}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
