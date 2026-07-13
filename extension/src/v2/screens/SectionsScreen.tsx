import { useEffect } from "react";
import { Panel } from "../components/Panel";
import { Button } from "../components/Button";
import { useNavigation } from "../context/NavigationContext";
import { useMigration } from "../context/MigrationContext";

export function SectionsScreen() {
  const { navigate } = useNavigation();
  const {
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
    if (candidates.length === 0 && !scanning) {
      void scan();
    }
    // Run once on entry; subsequent scans are manual via Rescan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allSelected = candidates.length > 0 && selected.size === candidates.length;

  const copySelected = async () => {
    const ok = await prepareSelected();
    if (ok) {
      navigate("build");
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
            disabled={candidates.length === 0}
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
            <div className="grid grid-cols-2 gap-3">
              {candidates.map((c) => {
                const isSelected = selected.has(c.selector);
                const isBuilt = built.has(c.selector);
                return (
                  <button
                    key={c.selector}
                    type="button"
                    onClick={() => toggleSelected(c.selector)}
                    className={`text-left rounded-lg border overflow-hidden transition-colors ${
                      isSelected ? "border-wb-accent" : "border-white/[0.09] hover:border-white/[0.2]"
                    }`}
                  >
                    <div
                      className="h-28 bg-black/30 bg-center bg-cover border-b border-white/[0.06]"
                      style={c.screenshot ? { backgroundImage: `url(${JSON.stringify(c.screenshot)})` } : undefined}
                    />
                    <div className="p-2.5 flex items-start gap-2">
                      <input type="checkbox" checked={isSelected} readOnly className="mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] uppercase tracking-wide text-wb-text-tertiary">{c.kind}</span>
                          {isBuilt ? (
                            <span className="text-[10px] text-wb-accent">· built</span>
                          ) : null}
                        </div>
                        <div className="text-[12px] text-wb-text-primary truncate">{c.label}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
