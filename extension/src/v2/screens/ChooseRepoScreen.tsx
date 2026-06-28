import { useEffect, useState } from "react";
import { Search, Check, GitBranch } from "lucide-react";
import { Panel } from "../components/Panel";
import { Button } from "../components/Button";
import { Stepper, type Step } from "../components/Stepper";
import { useNavigation } from "../context/NavigationContext";
import { useAppState } from "../context/AppStateContext";

const STEPS: Step[] = [
  { label: "Connect", state: "done" },
  { label: "Choose repo", state: "active" },
  { label: "Map pages", state: "pending" }
];

function formatRepoMeta(updatedAt: string | null, branch: string, pageCount: number, needsResync: boolean) {
  const timeLabel = updatedAt
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      }).format(new Date(updatedAt))
    : "Not synced yet";
  const syncLabel = needsResync ? "re-scan required" : `${pageCount} indexed pages`;
  return `${timeLabel} · ${branch} · ${syncLabel}`;
}

export function ChooseRepoScreen() {
  const { navigate } = useNavigation();
  const {
    error,
    ensureSelectedRepoReady,
    isBootstrapping,
    isMutating,
    loadingLabel,
    repos,
    selectedRepoId,
    selectRepo,
    session
  } = useAppState();
  const [query, setQuery] = useState("");
  const [accountId, setAccountId] = useState<string | null>(session?.selectedAccountId ?? null);

  useEffect(() => {
    setAccountId(session?.selectedAccountId ?? session?.accounts[0]?.id ?? null);
  }, [session?.accounts, session?.selectedAccountId]);

  const activeAccount =
    session?.accounts.find((account) => account.id === accountId) ?? session?.accounts[0] ?? null;
  const filteredRepos = repos.filter((repo) => {
    const matchesAccount = activeAccount ? repo.owner === activeAccount.login : true;
    const haystack = `${repo.fullName} ${repo.defaultBranch}`.toLowerCase();
    return matchesAccount && haystack.includes(query.trim().toLowerCase());
  });

  return (
    <Panel
      onClose={() => navigate("welcome")}
      footer={
        <>
          <Button variant="ghost" onClick={() => navigate("welcome")}>
            Cancel
          </Button>
          <div className="flex-1" />
          <Button
            variant="primary"
            onClick={() => {
              void ensureSelectedRepoReady().then((ready) => {
                if (ready) {
                  navigate("map-pages");
                }
              });
            }}
            disabled={!selectedRepoId || isMutating}
          >
            {loadingLabel ?? "Continue"}
          </Button>
        </>
      }
    >
      <Stepper steps={STEPS} />

      <div className="px-5 py-3 flex items-center gap-2 bg-black/[0.12] border-b border-white/[0.06]">
        <div className="text-[11px] font-semibold text-wb-text-tertiary uppercase tracking-wider flex-1">
          Select a repository
        </div>
        <select
          value={accountId ?? ""}
          onChange={(event) => setAccountId(event.target.value || null)}
          className="w-[180px] h-6.5 px-2.5 pr-7 rounded text-[11.5px] bg-wb-input border border-white/[0.09] text-wb-text-primary appearance-none"
          style={{
            backgroundImage:
              "linear-gradient(45deg, transparent 50%, #6e6e6e 50%), linear-gradient(135deg, #6e6e6e 50%, transparent 50%)",
            backgroundPosition: "right 12px center, right 8px center",
            backgroundSize: "4px 4px",
            backgroundRepeat: "no-repeat"
          }}
        >
          {(session?.accounts ?? []).map((account) => (
            <option key={account.id} value={account.id}>
              {account.displayName}
            </option>
          ))}
        </select>
      </div>

      <div className="px-4 pt-3">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-wb-text-tertiary"
          />
          <input
            type="text"
            placeholder="Search repositories"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full h-8 bg-wb-input border border-white/[0.09] rounded-md pl-8 pr-2.5 text-wb-text-primary text-[12.5px] outline-none focus:border-wb-accent"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {isBootstrapping ? (
          <div className="px-3 py-8 text-[12.5px] text-wb-text-tertiary">Loading repositories…</div>
        ) : filteredRepos.length === 0 ? (
          <div className="px-3 py-8 text-[12.5px] text-wb-text-tertiary">
            No repositories matched this account and search.
          </div>
        ) : (
          filteredRepos.map((repo) => (
            <RepoRow
              key={repo.id}
              name={repo.fullName}
              meta={formatRepoMeta(
                repo.lastSyncedAt ?? repo.updatedAt,
                repo.defaultBranch,
                repo.pageCount,
                repo.needsResync
              )}
              selected={repo.id === selectedRepoId}
              onClick={() => selectRepo(repo.id)}
            />
          ))
        )}
        {error ? (
          <div className="px-3 pt-3 text-[11.5px] text-wb-danger">
            {error}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function RepoRow({
  name,
  meta,
  onClick,
  selected
}: {
  name: string;
  meta: string;
  onClick: () => void;
  selected: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer border text-left ${
        selected
          ? "bg-wb-accent/10 border-wb-accent/30"
          : "border-transparent hover:bg-wb-surface-1 hover:border-white/[0.09]"
      }`}
    >
      <div className="w-7 h-7 bg-wb-surface-2 rounded-md inline-flex items-center justify-center text-wb-text-secondary flex-shrink-0">
        <GitBranch size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-wb-text-primary">{name}</div>
        <div className="text-[11px] text-wb-text-tertiary flex items-center gap-2.5 mt-0.5">
          <span>{meta}</span>
        </div>
      </div>
      {selected && <Check size={16} className="text-wb-accent" />}
    </button>
  );
}
