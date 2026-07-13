import { Panel } from "../components/Panel";
import { Button } from "../components/Button";
import { useNavigation } from "../context/NavigationContext";
import { useMigration } from "../context/MigrationContext";

export function BuildScreen() {
  const { navigate } = useNavigation();
  const { preparedCount, preparedPayload, copyPrepared, cleanupPaste, markBuilt } = useMigration();

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
          <Button variant="primary" onClick={copyPrepared} disabled={!preparedPayload}>
            Copy for Webflow
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
