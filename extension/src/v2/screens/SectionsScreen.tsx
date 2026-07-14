import { useEffect } from "react";
import { Panel } from "../components/Panel";
import { Button } from "../components/Button";
import { useNavigation } from "../context/NavigationContext";
import { useMigration } from "../context/MigrationContext";
import type { CaptureCandidate } from "@wfb/shared/contracts.js";

export function SectionsScreen() {
  const { navigate } = useNavigation();
  const {
    hydrated,
    candidates,
    scanning,
    scan,
    selected,
    toggleSelected,
    setAllSelected,
    built,
    preparing,
    prepareSelected
  } = useMigration();

  useEffect(() => {
    // Only auto-scan once the saved state has loaded and there's nothing stored
    // for this site. Otherwise the persisted sections show; Rescan is manual.
    if (hydrated && candidates.length === 0 && !scanning) {
      void scan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const todo = candidates.filter((c) => !built.has(c.selector));
  const builtList = candidates.filter((c) => built.has(c.selector));
  const allSelected = todo.length > 0 && todo.every((c) => selected.has(c.selector));

  const copySelected = async () => {
    const ok = await prepareSelected();
    if (ok) {
      navigate("build");
    }
  };

  const Card = ({ c, isBuilt }: { c: CaptureCandidate; isBuilt: boolean }) => {
    const isSelected = selected.has(c.selector);
    return (
      <button
        type="button"
        onClick={() => (isBuilt ? undefined : toggleSelected(c.selector))}
        className={`relative text-left rounded-lg border overflow-hidden transition-colors ${
          isBuilt
            ? "border-[rgba(52,211,153,0.35)] cursor-default"
            : isSelected
              ? "border-wb-accent"
              : "border-white/[0.09] hover:border-white/[0.2]"
        }`}
      >
        <div
          className="h-28 bg-black/30 bg-center bg-cover border-b border-white/[0.06]"
          style={{
            ...(c.screenshot ? { backgroundImage: `url(${JSON.stringify(c.screenshot)})` } : {}),
            ...(isBuilt ? { opacity: 0.55 } : {})
          }}
        />
        {isBuilt ? (
          <div
            className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center"
            style={{ background: "rgba(16,20,26,0.85)", color: "#34d399" }}
            aria-label="built"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
        ) : null}
        <div className="p-2.5 flex items-start gap-2">
          {isBuilt ? (
            <span className="mt-0.5 text-[13px] leading-none" style={{ color: "#34d399" }}>✓</span>
          ) : (
            <input type="checkbox" checked={isSelected} readOnly className="mt-0.5" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-wb-text-tertiary">{c.kind}</span>
              {isBuilt ? (
                <span className="text-[10px] font-medium" style={{ color: "#34d399" }}>Built</span>
              ) : null}
            </div>
            <div className="text-[12px] text-wb-text-primary truncate">{c.label}</div>
          </div>
        </div>
      </button>
    );
  };

  return (
    <Panel
      footer={
        <>
          <Button variant="ghost" onClick={() => navigate("welcome")}>
            Back
          </Button>
          <div className="flex-1" />
          {built.size > 0 ? (
            <Button variant="ghost" onClick={() => navigate("done")}>
              Finish
            </Button>
          ) : null}
          <Button
            variant="primary"
            onClick={() => void copySelected()}
            disabled={preparing || selected.size === 0}
          >
            {preparing ? "Capturing…" : `Copy selected (${selected.size})`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col h-full min-h-0">
        <div className="px-6 pt-5 pb-3 flex items-center gap-3 flex-shrink-0">
          <h1 className="text-[17px] font-semibold text-wb-text-primary m-0 flex-1">Sections</h1>
          <button
            type="button"
            onClick={() => setAllSelected(!allSelected)}
            disabled={todo.length === 0}
            className="text-[12px] text-wb-accent hover:underline disabled:opacity-40"
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>
          <button
            type="button"
            onClick={() => void scan()}
            disabled={scanning}
            className="text-[12px] text-wb-text-secondary hover:text-wb-text-primary disabled:opacity-40"
          >
            Rescan
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-6 pb-6">
          {scanning ? (
            <div className="text-[12.5px] text-wb-text-secondary py-8 text-center">
              Rendering the page and detecting its parts…
            </div>
          ) : candidates.length === 0 ? (
            <div className="text-[12.5px] text-wb-text-secondary py-8 text-center">
              No parts detected. Check the URL on the Welcome screen and rescan.
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {todo.length > 0 ? (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-wb-text-tertiary mb-2">
                    To build ({todo.length})
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {todo.map((c) => (
                      <Card key={c.selector} c={c} isBuilt={false} />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-[12.5px] text-wb-text-secondary text-center py-4" style={{ color: "#34d399" }}>
                  ✓ All parts built — click Finish.
                </div>
              )}

              {builtList.length > 0 ? (
                <div>
                  <div className="text-[11px] uppercase tracking-wide mb-2" style={{ color: "#34d399" }}>
                    Built ({builtList.length})
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {builtList.map((c) => (
                      <Card key={c.selector} c={c} isBuilt />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
