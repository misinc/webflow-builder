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
import { VisualQaClient } from "../../api/client.js";
import { getWebflowBridge } from "../../webflow/bridge.js";
import { copyWebflowPayloadToClipboard } from "../../webflow/clipboard.js";
import { styleGuideSpecSchema } from "@wfb/shared/style-guide.js";
import type { CaptureCandidate } from "@wfb/shared/contracts.js";

const capture = new VisualQaClient();
const bridge = getWebflowBridge();

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
  candidates: CaptureCandidate[];
  scanning: boolean;
  scan: () => Promise<void>;

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
  // The Style Guide flag and the source URL persist per Webflow site (keyed by
  // siteId) across restarts. Falls back to a global key when no site id is known.
  const [styleGuideComplete, setStyleGuideCompleteState] = useState(false);
  const siteSuffixRef = useRef<string>("");
  const keyFor = (name: string) => `wfb:${name}${siteSuffixRef.current}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let suffix = "";
      try {
        const wf = (window as unknown as {
          webflow?: { getSiteInfo?: () => Promise<{ siteId?: string }> };
        }).webflow;
        const info = await wf?.getSiteInfo?.();
        if (info?.siteId) suffix = `:${info.siteId}`;
      } catch {
        /* no site context — use global keys */
      }
      siteSuffixRef.current = suffix;
      try {
        if (cancelled) return;
        setStyleGuideCompleteState(localStorage.getItem(`wfb:styleGuideComplete${suffix}`) === "1");
        const savedUrl = localStorage.getItem(`wfb:sourceUrl${suffix}`);
        if (savedUrl) setSourceUrlState(savedUrl);
      } catch {
        /* localStorage unavailable */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSourceUrl = useCallback((url: string) => {
    setSourceUrlState(url);
    try {
      localStorage.setItem(keyFor("sourceUrl"), url);
    } catch {
      /* localStorage unavailable — session-only */
    }
  }, []);

  const setStyleGuideComplete = useCallback((done: boolean) => {
    setStyleGuideCompleteState(done);
    try {
      if (done) {
        localStorage.setItem(keyFor("styleGuideComplete"), "1");
      } else {
        localStorage.removeItem(keyFor("styleGuideComplete"));
      }
    } catch {
      /* localStorage unavailable — session-only */
    }
  }, []);

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
  }, [sourceUrl, notify]);

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
      const result = await capture.extractSections({
        url: sourceUrl.trim(),
        sections: chosen.map((c) => ({ selector: c.selector, label: c.label, kind: c.kind })),
        styleGuideMode: true
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
      return next;
    });
    setSelected(new Set());
    setPreparedPayload(null);
  }, [selected]);

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
      candidates,
      scanning,
      scan,
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
      candidates,
      scanning,
      scan,
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
