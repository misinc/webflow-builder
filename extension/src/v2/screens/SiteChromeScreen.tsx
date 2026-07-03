import { useEffect, useState } from "react";
import { Clipboard, ChevronRight, Layout, PanelBottom } from "lucide-react";
import { Panel, PanelContent } from "../components/Panel";
import { Button } from "../components/Button";
import { ListHeader, PageHeader } from "../components/Headers";
import { useNavigation } from "../context/NavigationContext";
import { useAppState } from "../context/AppStateContext";
import { copyWebflowPayloadToClipboard } from "../../webflow/clipboard.js";

/**
 * Sitewide elements — the chrome that lives on EVERY page (announcement bar +
 * navbar, footer). Built once via paste, componentized, then reused as
 * instances on each page shell. Sits between page mapping and per-page work.
 *
 * Two paths, same as pages: click a row to review its skeleton and copy it
 * alone, or Copy sitewide elements to paste navbar + footer in one gesture.
 */
export function SiteChromeScreen() {
  const { navigate } = useNavigation();
  const {
    activeMapping,
    buildClipboardPayload,
    isMutating,
    loadingLabel,
    setPasteScope,
    setUiHint,
    startChromeBuild
  } = useAppState();
  const [copyAllLabel, setCopyAllLabel] = useState("Copy sitewide elements");
  const [pendingAll, setPendingAll] = useState<string | null>(null);

  // Building the combined payload takes seconds — longer than the browser's
  // clipboard user-activation window after a click. Prefetch it in the
  // background so the click copies prepared data synchronously.
  const [preparedAll, setPreparedAll] = useState<string | null>(null);
  const mappedPageId = activeMapping?.webflowPageId ?? null;
  useEffect(() => {
    if (!mappedPageId) {
      setPreparedAll(null);
      return;
    }
    let cancelled = false;
    setPreparedAll(null);
    void buildClipboardPayload(undefined, undefined, { chrome: "all", silent: true }).then(
      (result) => {
        if (!cancelled && result) {
          setPreparedAll(result.payload);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [mappedPageId, buildClipboardPayload]);

  const copyAllForWebflow = async () => {
    let payload = preparedAll ?? pendingAll;
    if (!payload) {
      const result = await buildClipboardPayload(undefined, undefined, { chrome: "all" });
      if (!result) {
        return;
      }
      payload = result.payload;
    }
    try {
      copyWebflowPayloadToClipboard(payload);
      setPendingAll(null);
      setCopyAllLabel("Copied");
      setPasteScope("chrome");
      setUiHint(
        "Paste inside your page-wrapper, then unwrap: navbar stays above, footer below — main-wrapper pastes between them later."
      );
      navigate("paste-section");
      window.setTimeout(() => setCopyAllLabel("Copy sitewide elements"), 2600);
    } catch {
      setPendingAll(payload);
      setCopyAllLabel("Click again to copy");
    }
  };

  const rows: Array<{
    kind: "header" | "footer";
    title: string;
    detail: string;
    icon: React.ReactNode;
  }> = [
    {
      kind: "header",
      title: "Navbar",
      detail: "Announcement bar + navigation — everything before <main>",
      icon: <Layout size={14} />
    },
    {
      kind: "footer",
      title: "Footer",
      detail: "Everything after <main>",
      icon: <PanelBottom size={14} />
    }
  ];

  return (
    <Panel
      onClose={() => navigate("section-list")}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => navigate("section-list")}>
            Continue to pages
            <ChevronRight size={13} />
          </Button>
          <div className="flex-1" />
          <Button
            variant="primary"
            disabled={isMutating}
            onClick={() => {
              void copyAllForWebflow();
            }}
            title="Copies navbar + footer as ONE Webflow paste payload, then walks you through the paste."
          >
            <Clipboard size={12} />
            {isMutating && loadingLabel === "Preparing page copy"
              ? "Preparing…"
              : !preparedAll && copyAllLabel === "Copy sitewide elements"
              ? "Preparing copy…"
              : copyAllLabel}
          </Button>
        </>
      }
    >
      <PageHeader
        icon={<Layout size={16} />}
        label="Site setup"
        name="Sitewide elements"
        progressDoneText="Built once, then added to every page as Components."
        progressRemainingText="Review each element → Copy → paste inside page-wrapper → Clean up paste → Create Component."
      />

      <PanelContent>
        <ListHeader title="Chrome detected around <main>" count="2 elements" />
        <div className="px-3 py-2">
          {rows.map((row) => (
            <button
              key={row.kind}
              type="button"
              disabled={isMutating}
              onClick={() => {
                void startChromeBuild(row.kind);
                navigate("chrome-detail");
              }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-md border text-left cursor-pointer border-transparent hover:bg-wb-surface-1 hover:border-white/[0.09]"
            >
              <div className="w-7 h-7 rounded-md inline-flex items-center justify-center flex-shrink-0 bg-wb-surface-2 text-wb-text-tertiary">
                {row.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-wb-text-primary mb-0.5">{row.title}</div>
                <div className="text-[11.5px] text-wb-text-tertiary font-mono">{row.detail}</div>
              </div>
              <div className="flex-shrink-0 text-wb-text-tertiary">
                <ChevronRight size={16} />
              </div>
            </button>
          ))}
        </div>
        <div className="px-6 py-3 text-[11.5px] text-wb-text-tertiary">
          Click an element to review its skeleton and copy it alone, or copy both at once below —
          they paste inside page-wrapper (navbar above main-wrapper, footer below). Once each is a
          Component, pages only need instances.
        </div>
      </PanelContent>
    </Panel>
  );
}
