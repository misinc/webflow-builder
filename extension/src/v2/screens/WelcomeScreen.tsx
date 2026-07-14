import type { ReactNode } from "react";
import { Panel } from "../components/Panel";
import { Button } from "../components/Button";
import { useNavigation } from "../context/NavigationContext";
import { useMigration } from "../context/MigrationContext";

function StepBadge({ done, n }: { done: boolean; n: number }) {
  if (done) {
    return (
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
        style={{ background: "rgba(52,211,153,0.15)", color: "#34d399" }}
        aria-label="complete"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
    );
  }
  return (
    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[12px] font-semibold bg-wb-surface-2 border border-white/[0.12] text-wb-text-secondary">
      {n}
    </div>
  );
}

function Step({
  n,
  done,
  title,
  status,
  children
}: {
  n: number;
  done: boolean;
  title: string;
  status?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-lg border border-white/[0.08] bg-wb-surface-2/40 p-4">
      <StepBadge done={done} n={n} />
      <div className="flex-1 min-w-0 flex flex-col gap-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-[14px] font-semibold text-wb-text-primary m-0">{title}</h2>
          {done && status ? (
            <span className="text-[11px] font-medium" style={{ color: "#34d399" }}>
              {status}
            </span>
          ) : null}
        </div>
        <div className="text-[12.5px] text-wb-text-secondary">{children}</div>
      </div>
    </div>
  );
}

export function WelcomeScreen() {
  const { navigate } = useNavigation();
  const {
    sourceUrl,
    setSourceUrl,
    captureConfigured,
    styleGuideComplete,
    setStyleGuideComplete,
    notify
  } = useMigration();

  const startBuild = () => {
    if (!sourceUrl.trim()) {
      notify("Enter the source site URL first.", "error");
      return;
    }
    navigate("sections");
  };

  return (
    <Panel>
      <div className="flex-1 overflow-y-auto min-h-0 px-6 py-6 flex flex-col gap-5">
        <div>
          <div className="text-[11px] tracking-wide uppercase text-wb-text-tertiary mb-1">
            MIS Inc.
          </div>
          <h1 className="text-[20px] font-semibold text-wb-text-primary m-0">
            Migrate a site into Webflow
          </h1>
          <p className="text-[12.5px] text-wb-text-secondary mt-2 max-w-[520px]">
            Two steps: set up your Style Guide once, then pull in the source's
            pages section by section. Works best in a Relume-cloned project with
            the source's fonts installed.
          </p>
        </div>

        <div className="flex flex-col gap-3 max-w-[620px]">
          <Step
            n={1}
            done={styleGuideComplete}
            title="Set up the Style Guide"
            status="Complete"
          >
            Paste the source's Style Guide spec once — it creates/updates this
            project's variables and client-first classes so pasted sections adopt
            the right look.
            <div className="pt-3 flex items-center gap-3">
              <Button variant={styleGuideComplete ? "ghost" : "primary"} onClick={() => navigate("style-guide")}>
                {styleGuideComplete ? "Review / set up again" : "Set up Style Guide"}
              </Button>
              {styleGuideComplete ? (
                <button
                  type="button"
                  onClick={() => setStyleGuideComplete(false)}
                  className="text-[12px] text-wb-text-tertiary hover:text-wb-text-secondary"
                >
                  Mark not done
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setStyleGuideComplete(true);
                    notify("Marked the Style Guide as already set up for this site.", "success");
                  }}
                  className="text-[12px] text-wb-text-tertiary hover:text-wb-text-secondary"
                >
                  Already set up? Mark done
                </button>
              )}
            </div>
          </Step>

          <Step n={2} done={false} title="Build sections, page by page">
            Enter a source page URL, scan it, then pick the parts (navbar,
            sections, footer), copy and paste them onto the canvas.
            <label className="flex flex-col gap-1.5 mt-3">
              <span className="text-[12px] text-wb-text-secondary">Source page URL</span>
              <input
                type="url"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://the-site-to-migrate.com/"
                className="h-9 px-3 rounded-md bg-wb-surface-2 border border-white/[0.09] text-[12.5px] text-wb-text-primary outline-none focus:border-wb-accent"
              />
            </label>
            <div className="pt-3">
              <Button variant="primary" onClick={startBuild} disabled={!captureConfigured}>
                Build sections
              </Button>
            </div>
          </Step>
        </div>

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
