import { useEffect, useRef, useState } from "react";
import { Panel } from "../components/Panel";
import { Button } from "../components/Button";
import { useNavigation } from "../context/NavigationContext";
import { useMigration } from "../context/MigrationContext";

export function BuildScreen() {
  const { navigate } = useNavigation();
  const { preparedCount, preparedPayload, copyPrepared, cleanupPaste, markBuilt } = useMigration();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const onCopy = () => {
    copyPrepared();
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2200);
  };

  const done = () => {
    markBuilt();
    navigate("sections");
  };

  return (
    <Panel
      footer={
        <>
          <Button variant="ghost" onClick={() => navigate("sections")}>
            Back
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" onClick={() => void cleanupPaste()}>
            Clean up paste
          </Button>
          <Button
            variant={copied ? "default" : "primary"}
            onClick={onCopy}
            disabled={!preparedPayload}
            style={copied ? { background: "rgba(52,211,153,0.15)", color: "#34d399", borderColor: "rgba(52,211,153,0.4)" } : undefined}
          >
            {copied ? "✓ Copied — now paste (Cmd+V)" : "Copy for Webflow"}
          </Button>
        </>
      }
    >
      <div className="px-6 py-6 flex flex-col gap-5">
        <div>
          <h1 className="text-[17px] font-semibold text-wb-text-primary m-0">
            Paste {preparedCount} part{preparedCount === 1 ? "" : "s"}
          </h1>
          <p className="text-[12.5px] text-wb-text-secondary mt-1.5 max-w-[520px]">
            The selected parts are combined into one clipboard payload that adopts
            your Style Guide.
          </p>
        </div>

        <ol className="text-[13px] text-wb-text-secondary flex flex-col gap-2.5 m-0 pl-5">
          <li><strong className="text-wb-text-primary">Copy for Webflow</strong> — click the button, then paste on the canvas with <strong>Cmd/Ctrl+V</strong>.</li>
          <li><strong className="text-wb-text-primary">Clean up paste</strong> — with the pasted selection active, click to reuse your Style Guide classes and bind colors to variables.</li>
          <li><strong className="text-wb-text-primary">Mark built</strong> — return to the grid; if you pasted multiple parts under the "unwrap me" wrapper, unwrap it in the Navigator.</li>
        </ol>

        <div>
          <Button variant="default" onClick={done}>
            Mark built → back to sections
          </Button>
        </div>
      </div>
    </Panel>
  );
}
