import { useState } from "react";
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
 */
export function SiteChromeScreen() {
  const { navigate } = useNavigation();
  const { buildClipboardPayload, isMutating, setPasteScope, setUiHint } = useAppState();
  const [labels, setLabels] = useState<{ header: string; footer: string }>({
    header: "Copy for Webflow",
    footer: "Copy for Webflow"
  });
  const [pending, setPending] = useState<{ kind: "header" | "footer"; payload: string } | null>(null);

  const copyChrome = async (kind: "header" | "footer") => {
    let payload = pending?.kind === kind ? pending.payload : null;
    if (!payload) {
      const result = await buildClipboardPayload(undefined, undefined, { chrome: kind });
      if (!result) {
        return;
      }
      payload = result.payload;
    }
    try {
      copyWebflowPayloadToClipboard(payload);
      setPending(null);
      setPasteScope(kind === "header" ? "chrome-header" : "chrome-footer");
      setUiHint(
        kind === "header"
          ? "Paste the navbar inside your page-wrapper, above main-wrapper."
          : "Paste the footer inside your page-wrapper, below main-wrapper."
      );
      navigate("paste-section");
    } catch {
      setPending({ kind, payload });
      setLabels((current) => ({ ...current, [kind]: "Click again to copy" }));
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
          <div className="flex-1" />
          <Button variant="primary" onClick={() => navigate("section-list")}>
            Continue to pages
            <ChevronRight size={13} />
          </Button>
        </>
      }
    >
      <PageHeader
        icon={<Layout size={16} />}
        label="Site setup"
        name="Sitewide elements"
        progressDoneText="Built once, then added to every page as Components."
        progressRemainingText="Copy → paste inside page-wrapper → Clean up paste → Create Component."
      />

      <PanelContent>
        <ListHeader title="Chrome detected around <main>" count="2 elements" />
        <div className="px-3 py-2">
          {rows.map((row) => (
            <div
              key={row.kind}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-md border border-transparent hover:bg-wb-surface-1 hover:border-white/[0.09]"
            >
              <div className="w-7 h-7 rounded-md inline-flex items-center justify-center flex-shrink-0 bg-wb-surface-2 text-wb-text-tertiary">
                {row.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-wb-text-primary mb-0.5">{row.title}</div>
                <div className="text-[11.5px] text-wb-text-tertiary font-mono">{row.detail}</div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={isMutating}
                onClick={() => {
                  void copyChrome(row.kind);
                }}
              >
                <Clipboard size={11} />
                {labels[row.kind]}
              </Button>
            </div>
          ))}
        </div>
        <div className="px-6 py-3 text-[11.5px] text-wb-text-tertiary">
          Navbar and footer are copied separately because they paste into different spots
          (above and below main-wrapper). Once each is a Component, pages only need instances.
        </div>
      </PanelContent>
    </Panel>
  );
}
