import { Panel } from "../components/Panel";
import { Button } from "../components/Button";
import { useNavigation } from "../context/NavigationContext";
import { useMigration } from "../context/MigrationContext";

export function WelcomeScreen() {
  const { navigate } = useNavigation();
  const { sourceUrl, setSourceUrl, captureConfigured, notify } = useMigration();

  const startBuild = () => {
    if (!sourceUrl.trim()) {
      notify("Enter the source site URL first.", "error");
      return;
    }
    navigate("sections");
  };

  return (
    <Panel
      footer={
        <>
          <div className="flex-1" />
          <Button variant="ghost" onClick={() => navigate("style-guide")}>
            Set up Style Guide
          </Button>
          <Button variant="primary" onClick={startBuild} disabled={!captureConfigured}>
            Build sections
          </Button>
        </>
      }
    >
      <div className="flex-1 overflow-y-auto min-h-0 px-6 py-6 flex flex-col gap-5">
        <div>
          <div className="text-[11px] tracking-wide uppercase text-wb-text-tertiary mb-1">
            MIS Inc.
          </div>
          <h1 className="text-[20px] font-semibold text-wb-text-primary m-0">
            Migrate a site into Webflow
          </h1>
          <p className="text-[12.5px] text-wb-text-secondary mt-2 max-w-[520px]">
            Enter the source site URL, then set up your Style Guide once and build
            its sections. Works best in a Relume-cloned project with the source's
            fonts installed.
          </p>
        </div>

        <label className="flex flex-col gap-1.5 max-w-[560px]">
          <span className="text-[12px] text-wb-text-secondary">Source site URL</span>
          <input
            type="url"
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://the-site-to-migrate.com/"
            className="h-9 px-3 rounded-md bg-wb-surface-2 border border-white/[0.09] text-[12.5px] text-wb-text-primary outline-none focus:border-wb-accent"
          />
        </label>

        <ol className="text-[12.5px] text-wb-text-secondary flex flex-col gap-1.5 m-0 pl-5">
          <li><strong className="text-wb-text-primary">Set up Style Guide</strong> — paste the source's spec once; it updates this project's variables and classes.</li>
          <li><strong className="text-wb-text-primary">Build sections</strong> — scan the URL, pick the parts (navbar, sections, footer), copy and paste them in.</li>
        </ol>

        {!captureConfigured ? (
          <div
            className="text-[12px] rounded-md px-3 py-2 border max-w-[560px]"
            style={{ background: "rgba(245,166,53,0.10)", borderColor: "rgba(245,166,53,0.3)", color: "#f4c98a" }}
          >
            Capture service isn't configured — set <code>VITE_VISUAL_QA_BASE_URL</code> and rebuild the bundle to enable "Build sections."
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
