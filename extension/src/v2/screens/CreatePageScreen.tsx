import { useMemo, useState } from "react";
import { Panel, PanelContent } from "../components/Panel";
import { Button } from "../components/Button";
import { SectionDetailHeader } from "../components/Headers";
import { useNavigation } from "../context/NavigationContext";
import { useAppState } from "../context/AppStateContext";

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `/${slug}` : "/";
}

export function CreatePageScreen() {
  const { navigate } = useNavigation();
  const { createPage, isMutating, loadingLabel, repoTree } = useAppState();
  const [pageName, setPageName] = useState("Roadmap");
  const [slug, setSlug] = useState("/roadmap");
  const [repoPageId, setRepoPageId] = useState<string>("");
  const [switchToNewPage, setSwitchToNewPage] = useState(true);

  const repoPageOptions = useMemo(
    () =>
      (repoTree?.pages ?? []).map((entry) => ({
        id: entry.page.id,
        label: entry.page.sourceFile
      })),
    [repoTree?.pages]
  );

  return (
    <Panel
      onClose={() => navigate("map-pages")}
      footer={
        <>
          <Button variant="ghost" onClick={() => navigate("map-pages")}>
            Cancel
          </Button>
          <div className="flex-1" />
          <span className="text-[11px] text-wb-text-tertiary mr-2">{loadingLabel}</span>
          <Button
            variant="primary"
            disabled={isMutating || pageName.trim().length === 0}
            onClick={() => {
              void createPage({
                name: pageName.trim(),
                slug,
                switchToNewPage,
                repoPageId: repoPageId || null
              }).then((created) => {
                if (created) {
                  navigate("map-pages");
                }
              });
            }}
          >
            Create page
          </Button>
        </>
      }
    >
      <SectionDetailHeader
        eyebrow="Page mapping"
        title="Create a new Webflow page"
        onBack={() => navigate("map-pages")}
      />

      <PanelContent>
        <div className="px-8 pt-7 pb-4 max-w-[560px] mx-auto">
          <Field label="Page name" help="Shows in the Webflow Designer page list.">
            <input
              type="text"
              value={pageName}
              placeholder="e.g. Changelog"
              onChange={(event) => {
                const nextName = event.target.value;
                setPageName(nextName);
                setSlug(slugify(nextName));
              }}
              className="w-full h-9 bg-wb-input border border-white/[0.09] rounded-md px-2.5 text-wb-text-primary text-[13px] outline-none focus:border-wb-accent"
            />
          </Field>

          <Field label="URL slug" help="Auto-generated from page name. You can change it before creating.">
            <div className="flex items-stretch bg-wb-input border border-white/[0.09] rounded-md h-9 overflow-hidden">
              <span className="font-mono text-[12px] text-wb-text-tertiary px-3 bg-white/[0.02] inline-flex items-center border-r border-white/[0.09]">
                acme-studio.webflow.io
              </span>
              <input
                type="text"
                value={slug}
                placeholder="/roadmap"
                onChange={(event) => setSlug(event.target.value.startsWith("/") ? event.target.value : `/${event.target.value}`)}
                className="flex-1 bg-transparent text-wb-text-primary font-mono text-[12.5px] px-2.5 outline-none"
              />
            </div>
          </Field>

          <Field
            label={
              <>
                Map to repo file <span className="text-wb-text-tertiary font-normal">- optional</span>
              </>
            }
            help="Map now to start building sections on this page right away."
          >
            <select
              value={repoPageId}
              onChange={(event) => setRepoPageId(event.target.value)}
              className="w-full h-9 px-2.5 pr-7 rounded-md text-[13px] bg-wb-input border border-white/[0.09] text-wb-text-primary appearance-none"
              style={{
                backgroundImage:
                  "linear-gradient(45deg, transparent 50%, #6e6e6e 50%), linear-gradient(135deg, #6e6e6e 50%, transparent 50%)",
                backgroundPosition: "right 12px center, right 8px center",
                backgroundSize: "4px 4px",
                backgroundRepeat: "no-repeat"
              }}
            >
              <option value="">- Map later from Settings -</option>
              {repoPageOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex items-center gap-3.5 pt-3.5 pb-1 border-t border-white/[0.06]">
            <div className="flex-1">
              <div className="text-[12.5px] text-wb-text-primary font-medium mb-0.5">
                Switch to the new page after creating
              </div>
              <div className="text-[11px] text-wb-text-tertiary leading-relaxed">
                Keeps the extension focused on the page you just created.
              </div>
            </div>
            <Toggle on={switchToNewPage} onToggle={() => setSwitchToNewPage((current) => !current)} />
          </div>
        </div>
      </PanelContent>
    </Panel>
  );
}

function Field({
  label,
  help,
  children
}: {
  label: React.ReactNode;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5.5">
      <label className="text-[12px] font-semibold text-wb-text-primary block mb-1.5">{label}</label>
      {children}
      {help && <div className="text-[11px] text-wb-text-tertiary mt-1.5">{help}</div>}
    </div>
  );
}

function Toggle({
  on,
  onToggle
}: {
  on?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-8 h-[18px] rounded-full p-0.5 cursor-pointer flex flex-shrink-0 ${
        on ? "bg-wb-accent justify-end" : "bg-wb-surface-3 justify-start"
      }`}
    >
      <div
        className="w-3.5 h-3.5 bg-white rounded-full"
        style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.3)" }}
      />
    </button>
  );
}
