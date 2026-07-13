import { Panel } from "../components/Panel";
import { Button } from "../components/Button";
import { useNavigation } from "../context/NavigationContext";
import { useMigration } from "../context/MigrationContext";

export function DoneScreen() {
  const { navigate } = useNavigation();
  const { built, resetForNewPage } = useMigration();

  const newPage = () => {
    resetForNewPage();
    navigate("welcome");
  };

  return (
    <Panel
      footer={
        <>
          <Button variant="ghost" onClick={() => navigate("sections")}>
            Back to sections
          </Button>
          <div className="flex-1" />
          <Button variant="primary" onClick={newPage}>
            Migrate another page
          </Button>
        </>
      }
    >
      <div className="px-6 py-10 flex flex-col items-center text-center gap-3">
        <h1 className="text-[18px] font-semibold text-wb-text-primary m-0">Page migrated</h1>
        <p className="text-[13px] text-wb-text-secondary max-w-[420px]">
          You built {built.size} part{built.size === 1 ? "" : "s"} into this page.
          Migrate another page, or head back to add more sections.
        </p>
      </div>
    </Panel>
  );
}
