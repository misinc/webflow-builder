import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { BackendClient, VisualQaClient } from "../../api/client.js";
import { getWebflowBridge } from "../../webflow/bridge.js";
import { copyWebflowPayloadToClipboard } from "../../webflow/clipboard.js";
import { styleGuideSpecSchema } from "@wfb/shared/style-guide.js";
import type { CaptureCandidate, MigrationState } from "@wfb/shared/contracts.js";

const capture = new VisualQaClient();
const backend = new BackendClient();
const bridge = getWebflowBridge();

// Shared client-first classes the project owns — bind these to their real style
// ids on paste so Webflow reuses them instead of forking to "name 2". Section-
// scoped classes (e.g. hero_group) are intentionally excluded: they should paste
// fresh (and re-paste to update) rather than adopt a stale project version.
const SHARED_CLIENT_FIRST_CLASS =
  /^(heading-style-|text-size-|text-weight-|text-style-|text-color-|container|padding-global$|padding-section-|page-wrapper$|main-wrapper$|page-padding$|spacer-|margin-|max-width-|background-color-|button$|button-)/;

export type NotificationTone = "info" | "success" | "error";

export interface Notification {
  message: string;
  tone: NotificationTone;
  dismissed: boolean;
}

interface MigrationContextValue {
  captureConfigured: boolean;
  sourceUrl: string;
  setSourceUrl: (url: string) => void;

  // Scan
  hydrated: boolean;
  candidates: CaptureCandidate[];
  scanning: boolean;
  scan: () => Promise<void>;
  /** Rename a section — becomes its section_{key} class and Navigator name. */
  renameCandidate: (selector: string, label: string) => void;

  // Selection
  selected: Set<string>;
  toggleSelected: (selector: string) => void;
  setAllSelected: (on: boolean) => void;
  built: Set<string>;

  // Prepare (batch extract) → clipboard
  preparing: boolean;
  preparedPayload: string | null;
  preparedCount: number;
  prepareSelected: () => Promise<boolean>;
  copyPrepared: () => void;

  // Post-paste
  cleanupPaste: () => Promise<void>;
  markBuilt: () => void;

  // Style Guide
  applyStyleGuide: (json: string) => Promise<void>;
  styleGuideComplete: boolean;
  setStyleGuideComplete: (done: boolean) => void;

  // Top notification bar
  notification: Notification | null;
  notify: (message: string, tone?: NotificationTone) => void;
  dismissNotification: () => void;

  resetForNewPage: () => void;
}

const MigrationContext = createContext<MigrationContextValue | null>(null);

export function MigrationProvider({ children }: { children: ReactNode }) {
  const [sourceUrl, setSourceUrlState] = useState("");
  const [candidates, setCandidates] = useState<CaptureCandidate[]>([]);
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [built, setBuilt] = useState<Set<string>>(new Set());
  const [preparing, setPreparing] = useState(false);
  const [preparedPayload, setPreparedPayload] = useState<string | null>(null);
  const [preparedCount, setPreparedCount] = useState(0);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [styleGuideComplete, setStyleGuideCompleteState] = useState(false);
  // Becomes true once persisted state has loaded — the Sections screen waits for
  // this before deciding whether to auto-scan (so it won't scan over saved parts).
  const [hydrated, setHydrated] = useState(false);

  // Migration progress persists per Webflow site in D1 (source of truth), with a
  // localStorage cache as an offline/dev fallback. `stateRef` mirrors the
  // persistable fields so any mutation can save the whole record.
  const siteIdRef = useRef<string | null>(null);
  const stateRef = useRef<MigrationState>({
    styleGuideComplete: false,
    sourceUrl: "",
    scannedCandidates: [],
    builtSelectors: []
  });
  const cacheKey = () => `wfb:migrationState${siteIdRef.current ? `:${siteIdRef.current}` : ""}`;

  const persist = useCallback((next: Partial<MigrationState>) => {
    const merged = { ...stateRef.current, ...next };
    stateRef.current = merged;
    try {
      localStorage.setItem(cacheKey(), JSON.stringify(merged));
    } catch {
      /* localStorage unavailable */
    }
    const siteId = siteIdRef.current;
    if (siteId) {
      void backend.saveMigrationState(siteId, merged).catch(() => {
        /* backend unreachable — the cache still holds it */
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let siteId: string | null = null;
      try {
        const wf = (window as unknown as {
          webflow?: { getSiteInfo?: () => Promise<{ siteId?: string }> };
        }).webflow;
        siteId = (await wf?.getSiteInfo?.())?.siteId ?? null;
      } catch {
        /* no site context */
      }
      siteIdRef.current = siteId;

      let state: MigrationState | null = null;
      if (siteId) {
        try {
          state = await backend.getMigrationState(siteId);
        } catch {
          /* backend unreachable — fall back to the local cache */
        }
      }
      if (!state) {
        try {
          const cached = localStorage.getItem(cacheKey());
          if (cached) state = JSON.parse(cached) as MigrationState;
        } catch {
          /* ignore */
        }
      }
      if (cancelled) return;
      if (state) {
        stateRef.current = state;
        setStyleGuideCompleteState(Boolean(state.styleGuideComplete));
        if (state.sourceUrl) setSourceUrlState(state.sourceUrl);
        if (state.scannedCandidates?.length) setCandidates(state.scannedCandidates);
        if (state.builtSelectors?.length) setBuilt(new Set(state.builtSelectors));
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSourceUrl = useCallback(
    (url: string) => {
      setSourceUrlState(url);
      persist({ sourceUrl: url });
    },
    [persist]
  );

  const setStyleGuideComplete = useCallback(
    (done: boolean) => {
      setStyleGuideCompleteState(done);
      persist({ styleGuideComplete: done });
    },
    [persist]
  );

  const notify = useCallback((message: string, tone: NotificationTone = "info") => {
    setNotification({ message, tone, dismissed: false });
  }, []);
  const dismissNotification = useCallback(() => {
    setNotification((n) => (n ? { ...n, dismissed: true } : n));
  }, []);

  const scan = useCallback(async () => {
    const url = sourceUrl.trim();
    if (!url) {
      notify("Enter the source site URL first.", "error");
      return;
    }
    setScanning(true);
    setCandidates([]);
    setSelected(new Set());
    notify("Rendering the page and detecting its parts…");
    try {
      const result = await capture.scanSections(url);
      setCandidates(result.candidates);
      // Remember the scan (and the URL) so re-opening the extension doesn't
      // re-scan — only the Rescan button does.
      persist({ scannedCandidates: result.candidates, sourceUrl: url });
      notify(
        result.candidates.length
          ? `Found ${result.candidates.length} parts — select what to build.`
          : "No structural parts detected. Check the URL.",
        result.candidates.length ? "success" : "error"
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "Scan failed.", "error");
    } finally {
      setScanning(false);
    }
  }, [sourceUrl, notify, persist]);

  const renameCandidate = useCallback(
    (selector: string, label: string) => {
      const trimmed = label.slice(0, 120);
      setCandidates((prev) => {
        const next = prev.map((c) => (c.selector === selector ? { ...c, label: trimmed } : c));
        persist({ scannedCandidates: next });
        return next;
      });
    },
    [persist]
  );

  const toggleSelected = useCallback((selector: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(selector) ? next.delete(selector) : next.add(selector);
      return next;
    });
  }, []);

  const setAllSelected = useCallback(
    (on: boolean) => {
      setSelected(on ? new Set(candidates.map((c) => c.selector)) : new Set());
    },
    [candidates]
  );

  const prepareSelected = useCallback(async (): Promise<boolean> => {
    const chosen = candidates.filter((c) => selected.has(c.selector));
    if (chosen.length === 0) {
      notify("Select at least one part to build.", "error");
      return false;
    }
    setPreparing(true);
    setPreparedPayload(null);
    notify(`Capturing ${chosen.length} part${chosen.length === 1 ? "" : "s"}…`);
    try {
      // Bind the project's shared client-first classes to their real style ids so
      // the paste reuses them (no "text-size-medium 2" forks to clean up after).
      let existingStyles: Array<{ className: string; styleId: string }> = [];
      try {
        const styles = await bridge.listStyleIds();
        existingStyles = styles
          .filter((s) => SHARED_CLIENT_FIRST_CLASS.test(s.name))
          .map((s) => ({ className: s.name, styleId: s.id }));
      } catch {
        /* no Designer context / styles — paste falls back to name-only reuse */
      }
      const result = await capture.extractSections({
        url: sourceUrl.trim(),
        sections: chosen.map((c) => ({ selector: c.selector, label: c.label, kind: c.kind })),
        styleGuideMode: true,
        existingStyles
      });
      setPreparedPayload(result.payloadJson);
      setPreparedCount(chosen.length);
      const warn = result.warnings.length ? ` · ${result.warnings.length} note(s)` : "";
      notify(`Ready to paste — ${result.stats.nodeCount} elements${warn}.`, "success");
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Capture failed.", "error");
      return false;
    } finally {
      setPreparing(false);
    }
  }, [candidates, selected, sourceUrl, notify]);

  const copyPrepared = useCallback(() => {
    if (!preparedPayload) {
      return;
    }
    try {
      copyWebflowPayloadToClipboard(preparedPayload);
      notify("Copied. Paste on the canvas with Cmd/Ctrl+V, then Clean up paste.", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Clipboard write blocked — click again.", "error");
    }
  }, [preparedPayload, notify]);

  const cleanupPaste = useCallback(async () => {
    notify("Cleaning up the pasted selection…");
    try {
      const deduped = await bridge.dedupeSelectionStyles();
      const bound = await bridge.bindTokensInSelection();
      notify(
        `Cleaned up — ${deduped.swappedClasses.length} class${deduped.swappedClasses.length === 1 ? "" : "es"} reused · ${bound.boundProperties} token${bound.boundProperties === 1 ? "" : "s"} bound.`,
        "success"
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "Clean up failed.", "error");
    }
  }, [notify]);

  const markBuilt = useCallback(() => {
    setBuilt((prev) => {
      const next = new Set(prev);
      for (const selector of selected) {
        next.add(selector);
      }
      persist({ builtSelectors: [...next] });
      return next;
    });
    setSelected(new Set());
    setPreparedPayload(null);
  }, [selected, persist]);

  const applyStyleGuide = useCallback(
    async (json: string) => {
      if (!bridge.applyStyleGuide) {
        notify("This project can't apply a Style Guide from here.", "error");
        return;
      }
      let spec;
      try {
        spec = styleGuideSpecSchema.parse(JSON.parse(json));
      } catch (error) {
        notify(
          `Invalid Style Guide JSON: ${error instanceof Error ? error.message.split("\n")[0] : "could not parse"}`,
          "error"
        );
        return;
      }
      notify("Applying the Style Guide…");
      try {
        const r = await bridge.applyStyleGuide(spec);
        const warn = r.warnings.length ? ` · ${r.warnings.length} note(s)` : "";
        notify(
          `Style Guide applied — ${r.variablesCreated + r.variablesUpdated} variables · ${r.classesUpdated} classes${warn}.`,
          "success"
        );
        setStyleGuideComplete(true);
      } catch (error) {
        notify(error instanceof Error ? error.message : "Apply failed.", "error");
      }
    },
    [notify, setStyleGuideComplete]
  );

  const resetForNewPage = useCallback(() => {
    setCandidates([]);
    setSelected(new Set());
    setBuilt(new Set());
    setPreparedPayload(null);
    setPreparedCount(0);
  }, []);

  const value = useMemo<MigrationContextValue>(
    () => ({
      captureConfigured: capture.isConfigured(),
      sourceUrl,
      setSourceUrl,
      hydrated,
      candidates,
      scanning,
      scan,
      renameCandidate,
      selected,
      toggleSelected,
      setAllSelected,
      built,
      preparing,
      preparedPayload,
      preparedCount,
      prepareSelected,
      copyPrepared,
      cleanupPaste,
      markBuilt,
      applyStyleGuide,
      styleGuideComplete,
      setStyleGuideComplete,
      notification,
      notify,
      dismissNotification,
      resetForNewPage
    }),
    [
      sourceUrl,
      hydrated,
      candidates,
      scanning,
      scan,
      renameCandidate,
      selected,
      toggleSelected,
      setAllSelected,
      built,
      preparing,
      preparedPayload,
      preparedCount,
      prepareSelected,
      copyPrepared,
      cleanupPaste,
      markBuilt,
      applyStyleGuide,
      styleGuideComplete,
      setStyleGuideComplete,
      notification,
      notify,
      dismissNotification,
      resetForNewPage
    ]
  );

  return <MigrationContext.Provider value={value}>{children}</MigrationContext.Provider>;
}

export function useMigration() {
  const ctx = useContext(MigrationContext);
  if (!ctx) {
    throw new Error("useMigration must be used within MigrationProvider");
  }
  return ctx;
}
