import type { ReactNode } from "react";
import { Github, GitBranch, Pencil } from "lucide-react";
import { Panel, PanelContent } from "../components/Panel";
import { Button } from "../components/Button";
import { Tabs } from "./SiteProgressScreen";
import { useNavigation } from "../context/NavigationContext";
import { useAppState } from "../context/AppStateContext";

function formatConnectedSince() {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date());
}

export function SettingsScreen() {
  const { navigate } = useNavigation();
  const { mappingRows, repos, selectedRepo, session } = useAppState();
  const mappedCount = mappingRows.filter((row) => row.mappingStatus === "mapped").length;

  return (
    <Panel onClose={() => navigate("section-list")}>
      <Tabs active="settings" />

      <PanelContent>
        <Section heading="GitHub connection">
          <Row
            icon={
              <div className="w-8 h-8 rounded-full bg-wb-surface-2 flex items-center justify-center">
                <Github size={18} fill="currentColor" strokeWidth={0} className="text-wb-text-primary" />
              </div>
            }
            label={`@${session?.login ?? "unknown"}`}
            sub={`Session source: ${session?.source ?? "unknown"} · active since ${formatConnectedSince()}`}
            trailing={
              <Button variant="ghost" size="sm" onClick={() => navigate("welcome")}>
                Switch account
              </Button>
            }
          />
        </Section>

        <Section heading="Repository">
          <Row
            icon={
              <div className="w-8 h-8 rounded-md bg-wb-surface-2 flex items-center justify-center text-wb-text-secondary">
                <GitBranch size={16} />
              </div>
            }
            label={selectedRepo?.fullName ?? "No repo selected"}
            sub={
              selectedRepo
                ? `Branch ${selectedRepo.defaultBranch} · ${selectedRepo.pageCount} indexed pages · ${selectedRepo.sectionCount} sections`
                : "Choose a repo to continue"
            }
            trailing={
              <Button variant="ghost" size="sm" onClick={() => navigate("choose-repo")}>
                Change repo
              </Button>
            }
          />
        </Section>

        <Section heading={`Page mapping · ${mappedCount} of ${mappingRows.length} mapped`}>
          <div className="text-[11.5px] text-wb-text-secondary mb-3">
            Each Webflow page is mapped to a file in your repo. Phase 2 loads the saved mapping
            state from the backend and the current Designer site.
          </div>
          <Button variant="ghost" block onClick={() => navigate("map-pages")}>
            <Pencil size={14} />
            View page mapping
          </Button>
        </Section>

        <Section heading="Workspace status">
          <div className="text-[12.5px] text-wb-text-primary">
            {repos.length} repos available in this session
          </div>
          <div className="text-[11.5px] text-wb-text-tertiary mt-0.5">
            This screen is now driven by the real bootstrap session and connected repo inventory.
          </div>
        </Section>

        <Section heading="Danger zone">
          <div className="flex items-center gap-3 py-2.5">
            <div className="flex-1">
              <div className="text-[12.5px] text-wb-text-primary">Disconnect GitHub</div>
              <div className="text-[11.5px] text-wb-text-tertiary mt-0.5">
                This action stays disabled until the V2 mutating settings flow is implemented.
              </div>
            </div>
            <Button variant="danger-ghost" size="sm" disabled>
              Disconnect
            </Button>
          </div>
        </Section>
      </PanelContent>
    </Panel>
  );
}

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="px-5 py-4 border-b border-white/[0.06] last:border-b-0">
      <div className="text-[11px] font-semibold text-wb-text-tertiary uppercase tracking-wider mb-3">
        {heading}
      </div>
      {children}
    </div>
  );
}

function Row({
  icon,
  label,
  sub,
  trailing
}: {
  icon: ReactNode;
  label: ReactNode;
  sub: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      {icon}
      <div className="flex-1">
        <div className="text-[12.5px] text-wb-text-primary">{label}</div>
        <div className="text-[11.5px] text-wb-text-tertiary mt-0.5">{sub}</div>
      </div>
      {trailing}
    </div>
  );
}
