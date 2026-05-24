import { Home, FileText, AlertTriangle, Check, ChevronRight } from "lucide-react";
import { Panel, PanelContent } from "../components/Panel";
import { Button, IconButton } from "../components/Button";
import { Badge } from "../components/Badge";
import { useNavigation } from "../context/NavigationContext";
import { useAppState } from "../context/AppStateContext";

export function SiteProgressScreen() {
  const { navigate } = useNavigation();
  const { pageProgressRows } = useAppState();
  const totalBuilt = pageProgressRows.reduce((sum, page) => sum + page.doneCount, 0);
  const totalSections = pageProgressRows.reduce((sum, page) => sum + page.totalCount, 0);
  const overallPercent =
    totalSections > 0 ? Math.round((totalBuilt / totalSections) * 100) : 0;

  return (
    <Panel onClose={() => navigate("section-list")}>
      <Tabs active="progress" />

      <PanelContent>
        <div className="px-5 py-4">
          <div className="flex items-center gap-4 mb-5 p-4 bg-wb-surface-1 border border-white/[0.09] rounded-lg">
            <div className="flex-1">
              <div className="text-[11px] text-wb-text-tertiary uppercase tracking-wider font-semibold mb-1.5">
                Overall
              </div>
              <div className="flex items-baseline gap-2.5">
                <span className="text-[26px] font-semibold text-wb-text-primary tracking-tight">
                  {totalBuilt}
                </span>
                <span className="text-[13px] text-wb-text-secondary">
                  of {totalSections} sections built
                </span>
              </div>
            </div>
            <div className="w-[160px]">
              <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className="h-full bg-wb-success rounded-full"
                  style={{ width: `${overallPercent}%` }}
                />
              </div>
              <div className="text-[11px] text-wb-text-tertiary mt-1.5 text-right">
                {overallPercent}% complete
              </div>
            </div>
          </div>

          {pageProgressRows.map((page) => (
            <PageRowItem key={page.webflowPageId} page={page} />
          ))}
        </div>
      </PanelContent>
    </Panel>
  );
}

function PageRowItem({
  page
}: {
  page: {
    webflowPageId: string;
    webflowPageName: string;
    mapped: boolean;
    active: boolean;
    doneCount: number;
    skippedCount: number;
    remainingCount: number;
    totalCount: number;
    percent: number;
  };
}) {
  const { navigate } = useNavigation();
  const { switchToPage } = useAppState();

  if (!page.mapped) {
    return (
      <div
        className="flex items-center gap-3.5 p-3.5 px-4 border rounded-md mb-2"
        style={{ background: "rgba(245,184,0,0.1)", borderColor: "rgba(245,184,0,0.24)" }}
      >
        <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 bg-wb-warning/10 text-wb-warning">
          <AlertTriangle size={14} />
        </div>
        <div className="flex-1">
          <div className="text-[13px] font-medium text-wb-text-primary flex items-center gap-2">
            {page.webflowPageName}
            <Badge tone="pending" className="bg-wb-warning/10 text-[#ffd24d] border-wb-warning/30">
              Not mapped
            </Badge>
          </div>
          <div className="text-[11px] text-wb-text-tertiary font-mono mt-0.5">
            Map this page to a repo file before building it.
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void switchToPage(page.webflowPageId).then(() => navigate("not-mapped"));
          }}
        >
          Map now
        </Button>
      </div>
    );
  }

  const complete = page.totalCount > 0 && page.remainingCount === 0;

  return (
    <button
      type="button"
      onClick={() => {
        void switchToPage(page.webflowPageId);
        navigate("section-list");
      }}
      className={`w-full flex items-center gap-3.5 p-3.5 px-4 border rounded-md mb-2 cursor-pointer text-left ${
        complete
          ? "bg-wb-success/[0.04] border-wb-success/20"
          : "bg-wb-surface-1 border-white/[0.09] hover:border-white/[0.16]"
      }`}
    >
      <div
        className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
          complete ? "bg-wb-success/10 text-wb-success" : "bg-wb-surface-2 text-wb-text-secondary"
        }`}
      >
        {complete ? (
          <Check size={14} strokeWidth={2.5} />
        ) : page.webflowPageName === "Home" ? (
          <Home size={14} />
        ) : (
          <FileText size={14} />
        )}
      </div>
      <div className="flex-1">
        <div className="text-[13px] font-medium text-wb-text-primary flex items-center gap-2">
          {page.webflowPageName}
          {page.active ? (
            <Badge tone="in-progress" className="ml-1">
              Active
            </Badge>
          ) : null}
        </div>
        <div className="text-[11px] text-wb-text-tertiary font-mono mt-0.5">
          {page.doneCount} done · {page.skippedCount} skipped · {page.remainingCount} remaining
        </div>
      </div>
      <div className="w-[120px] h-1 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${page.percent}%`,
            background: page.active
              ? "linear-gradient(90deg, #00d09c, #146ef5)"
              : "#00d09c"
          }}
        />
      </div>
      <span className="text-[11.5px] text-wb-text-secondary w-9 text-right tabular-nums">
        {page.percent}%
      </span>
      <IconButton aria-label="Open page">
        <ChevronRight size={14} />
      </IconButton>
    </button>
  );
}

export function Tabs({ active }: { active: "progress" | "settings" }) {
  const { navigate } = useNavigation();
  return (
    <div className="flex border-b border-white/[0.09] px-4 bg-wb-surface-1 gap-4 flex-shrink-0">
      <Tab
        name="Site progress"
        isActive={active === "progress"}
        onClick={() => navigate("site-progress")}
      />
      <Tab
        name="Settings"
        isActive={active === "settings"}
        onClick={() => navigate("settings")}
      />
    </div>
  );
}

function Tab({
  name,
  isActive,
  onClick
}: {
  name: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`py-3 text-[12.5px] font-medium border-b-2 -mb-px ${
        isActive
          ? "text-wb-text-primary border-wb-accent"
          : "text-wb-text-tertiary border-transparent hover:text-wb-text-secondary"
      }`}
    >
      {name}
    </button>
  );
}
