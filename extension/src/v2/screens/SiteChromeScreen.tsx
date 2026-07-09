import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Clipboard, ChevronRight, Layout, PanelBottom, RefreshCw } from "lucide-react";
import type { ImportVariablesResult, RepoToken, SharedVariable } from "@wfb/shared/contracts.js";
import { Panel, PanelContent } from "../components/Panel";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { ListHeader, PageHeader } from "../components/Headers";
import { useNavigation } from "../context/NavigationContext";
import { useAppState } from "../context/AppStateContext";
import { copyWebflowPayloadToClipboard } from "../../webflow/clipboard.js";

/**
 * Sitewide elements — the chrome that lives on EVERY page (announcement bar +
 * navbar, footer). Built once via paste, componentized, then reused as
 * instances on each page shell. Sits between page mapping and per-page work.
 *
 * Two paths, same as pages: click a row to review its skeleton and copy it
 * alone, or Copy sitewide elements to paste navbar + footer in one gesture.
 */
export function SiteChromeScreen() {
  const { navigate } = useNavigation();
  const {
    activeMapping,
    buildClipboardPayload,
    designerContext,
    importRepoTokens,
    isMutating,
    isLoadingRepoTokens,
    loadingLabel,
    loadRepoTokens,
    repoTokens,
    selectedRepoId,
    setPasteScope,
    sharedStyleContext,
    setUiHint,
    startChromeBuild
  } = useAppState();
  const [copyAllLabel, setCopyAllLabel] = useState("Copy sitewide elements");
  const [pendingAll, setPendingAll] = useState<string | null>(null);

  // Building the combined payload takes seconds — longer than the browser's
  // clipboard user-activation window after a click. Prefetch it in the
  // background so the click copies prepared data synchronously.
  const [preparedAll, setPreparedAll] = useState<string | null>(null);
  const mappedPageId = activeMapping?.webflowPageId ?? null;

  const tokenHistoryKey =
    selectedRepoId && designerContext?.siteId
      ? `wb-v2-imported-token-keys:${selectedRepoId}:${designerContext.siteId}`
      : null;
  const [importedHistory, setImportedHistory] = useState<Set<string>>(() => new Set());
  const [selectedTokenKeys, setSelectedTokenKeys] = useState<Set<string>>(() => new Set());
  const [lastTokenImport, setLastTokenImport] = useState<ImportVariablesResult | null>(null);

  useEffect(() => {
    void loadRepoTokens();
  }, [loadRepoTokens]);

  useEffect(() => {
    if (!tokenHistoryKey) {
      setImportedHistory(new Set());
      return;
    }
    try {
      const raw = localStorage.getItem(tokenHistoryKey);
      setImportedHistory(new Set(raw ? (JSON.parse(raw) as string[]) : []));
    } catch {
      setImportedHistory(new Set());
    }
  }, [tokenHistoryKey]);
  useEffect(() => {
    if (!mappedPageId) {
      setPreparedAll(null);
      return;
    }
    let cancelled = false;
    setPreparedAll(null);
    void buildClipboardPayload(undefined, undefined, { chrome: "all", silent: true }).then(
      (result) => {
        if (!cancelled && result) {
          setPreparedAll(result.payload);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [mappedPageId, buildClipboardPayload]);

  const importedTokenKeys = useMemo(
    () => new Set(
      (repoTokens?.tokens ?? [])
        .filter((token) => tokenExistsInWebflow(token, sharedStyleContext?.variables ?? []))
        .map(tokenKey)
    ),
    [repoTokens?.tokens, sharedStyleContext?.variables]
  );

  useEffect(() => {
    if (!repoTokens) {
      setSelectedTokenKeys(new Set());
      return;
    }
    setSelectedTokenKeys(
      new Set(
        repoTokens.tokens
          .filter((token) => !importedTokenKeys.has(tokenKey(token)))
          .map(tokenKey)
      )
    );
  }, [importedTokenKeys, repoTokens]);

  const rememberImportedTokens = (tokens: RepoToken[]) => {
    if (!tokenHistoryKey) {
      return;
    }
    setImportedHistory((current) => {
      const next = new Set(current);
      tokens.forEach((token) => next.add(tokenKey(token)));
      localStorage.setItem(tokenHistoryKey, JSON.stringify([...next].sort()));
      return next;
    });
  };

  const importTokens = async (tokens: RepoToken[]) => {
    const result = await importRepoTokens(tokens);
    if (!result) {
      return;
    }
    setLastTokenImport(result);
    rememberImportedTokens([...result.created, ...result.reused]);
    setSelectedTokenKeys(new Set());
  };

  const copyAllForWebflow = async () => {
    let payload = preparedAll ?? pendingAll;
    if (!payload) {
      const result = await buildClipboardPayload(undefined, undefined, { chrome: "all" });
      if (!result) {
        return;
      }
      payload = result.payload;
    }
    try {
      copyWebflowPayloadToClipboard(payload);
      setPendingAll(null);
      setCopyAllLabel("Copied");
      setPasteScope("chrome");
      setUiHint(
        "Paste inside your page-wrapper, then unwrap: navbar stays above, footer below — main-wrapper pastes between them later."
      );
      navigate("paste-section");
      window.setTimeout(() => setCopyAllLabel("Copy sitewide elements"), 2600);
    } catch {
      setPendingAll(payload);
      setCopyAllLabel("Click again to copy");
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
          <Button variant="ghost" size="sm" onClick={() => navigate("section-list")}>
            Continue to pages
            <ChevronRight size={13} />
          </Button>
          <div className="flex-1" />
          <Button
            variant="primary"
            disabled={isMutating}
            onClick={() => {
              void copyAllForWebflow();
            }}
            title="Copies navbar + footer as ONE Webflow paste payload, then walks you through the paste."
          >
            <Clipboard size={12} />
            {isMutating && loadingLabel === "Preparing page copy"
              ? "Preparing…"
              : !preparedAll && copyAllLabel === "Copy sitewide elements"
              ? "Preparing copy…"
              : copyAllLabel}
          </Button>
        </>
      }
    >
      <PageHeader
        icon={<Layout size={16} />}
        label="Site setup"
        name="Sitewide elements"
        progressDoneText="Built once, then added to every page as Components."
        progressRemainingText="Review each element → Copy → paste inside page-wrapper → Clean up paste → Create Component."
      />

      <PanelContent>
        <DesignTokensPanel
          importedHistory={importedHistory}
          importedTokenKeys={importedTokenKeys}
          isLoading={isLoadingRepoTokens}
          isMutating={isMutating}
          lastImport={lastTokenImport}
          onImport={importTokens}
          onRescan={loadRepoTokens}
          repoTokens={repoTokens}
          selectedTokenKeys={selectedTokenKeys}
          setSelectedTokenKeys={setSelectedTokenKeys}
        />

        <ListHeader title="Chrome detected around <main>" count="2 elements" />
        <div className="px-3 py-2">
          {rows.map((row) => (
            <button
              key={row.kind}
              type="button"
              disabled={isMutating}
              onClick={() => {
                void startChromeBuild(row.kind);
                navigate("chrome-detail");
              }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-md border text-left cursor-pointer border-transparent hover:bg-wb-surface-1 hover:border-white/[0.09]"
            >
              <div className="w-7 h-7 rounded-md inline-flex items-center justify-center flex-shrink-0 bg-wb-surface-2 text-wb-text-tertiary">
                {row.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-wb-text-primary mb-0.5">{row.title}</div>
                <div className="text-[11.5px] text-wb-text-tertiary font-mono">{row.detail}</div>
              </div>
              <div className="flex-shrink-0 text-wb-text-tertiary">
                <ChevronRight size={16} />
              </div>
            </button>
          ))}
        </div>
        <div className="px-6 py-3 text-[11.5px] text-wb-text-tertiary">
          Click an element to review its skeleton and copy it alone, or copy both at once below —
          they paste inside page-wrapper (navbar above main-wrapper, footer below). Once each is a
          Component, pages only need instances.
        </div>
      </PanelContent>
    </Panel>
  );
}

function tokenKey(token: RepoToken): string {
  return `${token.group}/${token.name}`;
}

function tokenExistsInWebflow(token: RepoToken, variables: SharedVariable[]): boolean {
  const fullName = tokenKey(token);
  const lowerFullName = fullName.toLowerCase();
  const lowerName = token.name.toLowerCase();
  const lowerGroup = token.group.toLowerCase();
  return variables.some((variable) => {
    const variableName = variable.name.toLowerCase();
    const variableGroup = variable.group?.toLowerCase();
    return (
      variableName === lowerFullName ||
      variableName === lowerName ||
      (variableGroup === lowerGroup && variableName === lowerName)
    );
  });
}

function tokenTypeLabel(type: RepoToken["type"]) {
  if (type === "fontFamily") return "font";
  return type;
}

function DesignTokensPanel({
  importedHistory,
  importedTokenKeys,
  isLoading,
  isMutating,
  lastImport,
  onImport,
  onRescan,
  repoTokens,
  selectedTokenKeys,
  setSelectedTokenKeys
}: {
  importedHistory: Set<string>;
  importedTokenKeys: Set<string>;
  isLoading: boolean;
  isMutating: boolean;
  lastImport: ImportVariablesResult | null;
  onImport: (tokens: RepoToken[]) => Promise<void>;
  onRescan: () => Promise<unknown>;
  repoTokens: { tokens: RepoToken[]; warnings: string[] } | null;
  selectedTokenKeys: Set<string>;
  setSelectedTokenKeys: (keys: Set<string>) => void;
}) {
  const tokens = repoTokens?.tokens ?? [];
  const selectedTokens = tokens.filter((token) => selectedTokenKeys.has(tokenKey(token)));
  const missingTokens = tokens.filter((token) => {
    const key = tokenKey(token);
    return importedHistory.has(key) && !importedTokenKeys.has(key);
  });
  const groupedTokens = useMemo(() => {
    const groups = new Map<string, RepoToken[]>();
    tokens.forEach((token) => {
      groups.set(token.group, [...(groups.get(token.group) ?? []), token]);
    });
    return [...groups.entries()].sort((left, right) => left[0].localeCompare(right[0]));
  }, [tokens]);
  const counts = tokens.reduce(
    (acc, token) => {
      acc[token.type] = (acc[token.type] ?? 0) + 1;
      return acc;
    },
    {} as Record<RepoToken["type"], number>
  );

  const toggleToken = (token: RepoToken) => {
    const key = tokenKey(token);
    const next = new Set(selectedTokenKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setSelectedTokenKeys(next);
  };

  const selectTokens = (nextTokens: RepoToken[]) => {
    setSelectedTokenKeys(new Set(nextTokens.map(tokenKey)));
  };

  return (
    <div className="border-b border-white/[0.06]">
      <div className="px-5 py-3 flex items-center gap-3 bg-black/[0.12] border-b border-white/[0.06]">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold text-wb-text-tertiary uppercase tracking-wider">
            Design tokens
          </div>
          <div className="text-[11.5px] text-wb-text-tertiary mt-1">
            Reads direct <span className="font-mono">*.tokens.json</span> files inside repo folders named <span className="font-mono">tokens</span> or <span className="font-mono">variables</span>.
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={isMutating || isLoading}
          onClick={() => {
            void onRescan();
          }}
        >
          <RefreshCw size={12} />
          {isLoading ? "Scanning…" : "Rescan"}
        </Button>
      </div>

      <div className="px-5 py-3">
        {isLoading ? (
          <div className="text-[12px] text-wb-text-tertiary">Scanning repo token files…</div>
        ) : tokens.length === 0 ? (
          <div className="text-[12px] text-wb-text-tertiary">
            No token files found yet. Add files like <span className="font-mono">tokens/colors.tokens.json</span> or <span className="font-mono">variables/typography.tokens.json</span>.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <Badge tone="pending">{tokens.length} discovered</Badge>
              {Object.entries(counts).map(([type, count]) => (
                <Badge key={type} tone="pending">
                  {count} {tokenTypeLabel(type as RepoToken["type"])}
                </Badge>
              ))}
              <Badge tone="complete">{importedTokenKeys.size} imported</Badge>
              {missingTokens.length > 0 ? (
                <Badge tone="error">{missingTokens.length} missing in Webflow</Badge>
              ) : null}
            </div>

            <div className="max-h-[260px] overflow-auto rounded-md border border-white/[0.06] bg-wb-surface-1">
              {groupedTokens.map(([group, groupTokens]) => (
                <div key={group} className="border-b border-white/[0.06] last:border-b-0">
                  <div className="px-3 py-2 flex items-center gap-2 bg-black/[0.12]">
                    <div className="text-[11.5px] font-semibold text-wb-text-secondary flex-1">
                      {group}
                    </div>
                    <div className="text-[10.5px] text-wb-text-tertiary">
                      {groupTokens.length} tokens
                    </div>
                  </div>
                  {groupTokens.map((token) => {
                    const key = tokenKey(token);
                    const imported = importedTokenKeys.has(key);
                    const missing = importedHistory.has(key) && !imported;
                    return (
                      <label
                        key={key}
                        className="flex items-center gap-2.5 px-3 py-2 border-t border-white/[0.04] cursor-pointer hover:bg-white/[0.03]"
                      >
                        <input
                          type="checkbox"
                          checked={selectedTokenKeys.has(key)}
                          disabled={isMutating}
                          onChange={() => toggleToken(token)}
                          className="accent-wb-accent"
                        />
                        <div
                          className="w-4 h-4 rounded border border-white/[0.16] flex-shrink-0"
                          style={token.type === "color" ? { background: token.value } : undefined}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] text-wb-text-primary truncate font-mono">
                            {token.name}
                          </div>
                          <div className="text-[10.5px] text-wb-text-tertiary truncate">
                            {token.type} · {token.value}
                          </div>
                        </div>
                        {imported ? (
                          <Badge tone="complete">
                            <Check size={10} />
                            Imported
                          </Badge>
                        ) : missing ? (
                          <Badge tone="error">
                            <AlertTriangle size={10} />
                            Missing in Webflow
                          </Badge>
                        ) : (
                          <Badge tone="pending">Not imported</Badge>
                        )}
                        {imported ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isMutating}
                            onClick={(event) => {
                              event.preventDefault();
                              void onImport([token]);
                            }}
                          >
                            Re-import
                          </Button>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>

            {repoTokens?.warnings.length ? (
              <div className="mt-3 text-[11px] text-[#ffd24d]">
                {repoTokens.warnings.slice(0, 3).map((warning) => (
                  <div key={warning}>Warning: {warning}</div>
                ))}
              </div>
            ) : null}

            {lastImport ? (
              <div className="mt-3 text-[11.5px] text-wb-text-tertiary">
                Last import: {lastImport.created.length} created · {lastImport.reused.length} reused · {lastImport.skipped.length} skipped · {lastImport.failed.length} failed
              </div>
            ) : null}

            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                disabled={isMutating || selectedTokens.length === 0}
                onClick={() => {
                  void onImport(selectedTokens);
                }}
              >
                Import selected
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={isMutating || missingTokens.length === 0}
                onClick={() => {
                  void onImport(missingTokens);
                }}
              >
                Re-import missing
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={isMutating}
                onClick={() => selectTokens(tokens.filter((token) => !importedTokenKeys.has(tokenKey(token))))}
              >
                Select not imported
              </Button>
              <div className="flex-1" />
              <span className="text-[11px] text-wb-text-tertiary">
                {selectedTokens.length} selected
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
