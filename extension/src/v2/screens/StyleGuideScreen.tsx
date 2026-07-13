import { useState } from "react";
import { Panel } from "../components/Panel";
import { Button } from "../components/Button";
import { useNavigation } from "../context/NavigationContext";
import { useMigration } from "../context/MigrationContext";

export function StyleGuideScreen() {
  const { navigate } = useNavigation();
  const { applyStyleGuide } = useMigration();
  const [json, setJson] = useState("");
  const [busy, setBusy] = useState(false);

  const apply = async () => {
    setBusy(true);
    try {
      await applyStyleGuide(json);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      footer={
        <>
          <Button variant="ghost" onClick={() => navigate("welcome")}>
            Back
          </Button>
          <div className="flex-1" />
          <Button variant="primary" onClick={() => void apply()} disabled={busy || json.trim().length === 0}>
            Apply Style Guide
          </Button>
        </>
      }
    >
      <div className="flex flex-col h-full min-h-0">
        <div className="px-6 pt-6 pb-3 flex-shrink-0">
          <h1 className="text-[17px] font-semibold text-wb-text-primary m-0">Style Guide</h1>
          <p className="text-[12.5px] text-wb-text-secondary mt-1.5 max-w-[560px]">
            Paste the source's Style Guide JSON spec. It creates/updates this
            project's variables (Primitives, Typography, UI Styles) and the
            client-first classes so pasted sections adopt the source's look.
          </p>
        </div>
        <div className="flex-1 min-h-0 px-6 pb-6">
          <textarea
            value={json}
            onChange={(event) => setJson(event.target.value)}
            spellCheck={false}
            placeholder="Paste the Style Guide JSON spec here…"
            className="w-full h-full resize-none rounded-md bg-black/[0.18] border border-white/[0.09] p-4 font-mono text-[11.5px] text-wb-text-secondary leading-relaxed outline-none focus:border-wb-accent"
          />
        </div>
      </div>
    </Panel>
  );
}
