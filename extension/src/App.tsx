import { useEffect, useState } from "react";
import {
  BuildResultRecord,
  PlacementMode
} from "../../src/shared/contracts.js";
import { BackendClient, RepoTreeResponse, summarizeSharedStyles } from "./api/client.js";
import { BuildSummary } from "./components/BuildSummary.js";
import { RepoTree } from "./components/RepoTree.js";
import { executeBuildPlan } from "./executor/buildExecutor.js";
import { DesignerContext, getWebflowBridge } from "./webflow/bridge.js";

const backend = new BackendClient();
const bridge = getWebflowBridge();

function usePersistentState(
  key: string,
  initialValue: string
): [string, (value: string) => void] {
  const [value, setValue] = useState(() => localStorage.getItem(key) ?? initialValue);
  useEffect(() => {
    localStorage.setItem(key, value);
  }, [key, value]);
  return [value, setValue];
}

export default function App() {
  const [userId, setUserId] = usePersistentState("builder-user-id", "karim");
  const [repoOwner, setRepoOwner] = usePersistentState("builder-repo-owner", "misinc");
  const [repoName, setRepoName] = usePersistentState("builder-repo-name", "atlas");
  const [repoUrl, setRepoUrl] = usePersistentState(
    "builder-repo-url",
    "https://github.com/misinc/atlas"
  );
  const [repoId, setRepoId] = useState<string | null>(null);
  const [tree, setTree] = useState<RepoTreeResponse | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [placementMode, setPlacementMode] = useState<PlacementMode>("append");
  const [designerContext, setDesignerContext] = useState<DesignerContext | null>(null);
  const [sharedStyleSummary, setSharedStyleSummary] = useState<string>("");
  const [lastResult, setLastResult] = useState<BuildResultRecord | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    bridge.getContext().then(setDesignerContext).catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to read Webflow context.");
    });
  }, []);

  async function connectAndSyncRepo() {
    setLoading("Connecting repo");
    setError(null);
    try {
      const repoResponse = await backend.connectRepo({
        owner: repoOwner,
        name: repoName,
        repoUrl,
        provider: "github",
        requestedBy: userId
      });
      setRepoId(repoResponse.repo.id);
      await backend.syncRepo(repoResponse.repo.id);
      const nextTree = await backend.getRepoTree(repoResponse.repo.id);
      setTree(nextTree);
      const firstPage = nextTree.pages[0];
      setSelectedPageId(firstPage?.page.id ?? null);
      setSelectedSectionId(firstPage?.sections[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect repo.");
    } finally {
      setLoading(null);
    }
  }

  async function bindCurrentSite() {
    if (!repoId || !designerContext?.siteId) {
      setError("Connect a repo and open a valid Webflow site first.");
      return;
    }
    setLoading("Binding site");
    setError(null);
    try {
      const sharedStyles = await bridge.inspectSharedStyles(designerContext.siteId);
      setSharedStyleSummary(summarizeSharedStyles(sharedStyles));
      await backend.bindSite({
        repoId,
        webflowSiteId: designerContext.siteId,
        requestedBy: userId,
        sharedStyleContext: sharedStyles
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to bind Webflow site.");
    } finally {
      setLoading(null);
    }
  }

  async function buildSelectedSection() {
    if (!repoId || !selectedPageId || !selectedSectionId || !designerContext?.siteId || !designerContext.pageId) {
      setError("Select a repo section and confirm active Webflow page context first.");
      return;
    }
    setLoading("Building section");
    setError(null);
    try {
      const refreshedContext = await bridge.getContext();
      if (
        refreshedContext.siteId !== designerContext.siteId ||
        refreshedContext.pageId !== designerContext.pageId
      ) {
        throw new Error("Webflow context changed before build execution.");
      }
      const sharedStyles = await bridge.inspectSharedStyles(refreshedContext.siteId);
      setSharedStyleSummary(summarizeSharedStyles(sharedStyles));

      const request = {
        repoId,
        pageId: selectedPageId,
        sectionId: selectedSectionId,
        webflowSiteId: refreshedContext.siteId,
        webflowPageId: refreshedContext.pageId,
        placementMode,
        placementTarget:
          placementMode === "afterSelected" ? refreshedContext.selectedElementId : null,
        sharedStyleContext: sharedStyles
      } as const;

      const [{ job }, plan] = await Promise.all([
        backend.createBuildJob(request, userId),
        backend.createPlan(request, userId)
      ]);
      const execution = await executeBuildPlan({
        bridge,
        context: refreshedContext,
        plan,
        placementMode,
        placementTarget: request.placementTarget
      });
      const { result } = await backend.completeBuildJob(job.id, {
        success: execution.success,
        insertedSectionName: plan.sectionMetadata.sectionName,
        webflowPageId: refreshedContext.pageId,
        reusedClasses: execution.reusedClasses,
        createdClasses: execution.createdClasses,
        createdNodeIds: execution.createdNodeIds,
        warnings: execution.warnings,
        missingAssets: execution.missingAssets,
        rollbackOutcome: execution.rollbackOutcome
      });
      setLastResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Build failed.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <main className="app-shell">
      <header className="hero-panel">
        <div>
          <p className="eyebrow">Repo-based Webflow section builder</p>
          <h1>Compile MIS sections straight into the active Designer page.</h1>
        </div>
        <div className="context-card">
          <div className={`status-pill ${designerContext?.mode === "designer" ? "is-success" : "is-error"}`}>
            {designerContext?.mode === "designer" ? "Editable Designer" : "Designer not ready"}
          </div>
          <p>Site: {designerContext?.siteId ?? "Unavailable"}</p>
          <p>Page: {designerContext?.pageId ?? "Unavailable"}</p>
          <p>Selection: {designerContext?.selectedElementId ?? "None"}</p>
          <p>Shared inventory: {sharedStyleSummary || "Not captured yet"}</p>
        </div>
      </header>

      <section className="grid">
        <article className="panel">
          <h2>Session + Repo</h2>
          <label>
            User ID
            <input value={userId} onChange={(event) => setUserId(event.target.value)} />
          </label>
          <label>
            Repo owner
            <input value={repoOwner} onChange={(event) => setRepoOwner(event.target.value)} />
          </label>
          <label>
            Repo name
            <input value={repoName} onChange={(event) => setRepoName(event.target.value)} />
          </label>
          <label>
            Repo URL
            <input value={repoUrl} onChange={(event) => setRepoUrl(event.target.value)} />
          </label>
          <div className="actions">
            <button type="button" onClick={connectAndSyncRepo} disabled={Boolean(loading)}>
              Connect + Sync
            </button>
            <button type="button" className="ghost" onClick={bindCurrentSite} disabled={!repoId || Boolean(loading)}>
              Bind Active Site
            </button>
          </div>
        </article>

        <article className="panel">
          <h2>Repo Tree</h2>
          <RepoTree
            tree={tree}
            selectedPageId={selectedPageId}
            selectedSectionId={selectedSectionId}
            onSelectPage={setSelectedPageId}
            onSelectSection={(pageId, sectionId) => {
              setSelectedPageId(pageId);
              setSelectedSectionId(sectionId);
            }}
          />
        </article>

        <article className="panel">
          <h2>Build Panel</h2>
          <label>
            Placement
            <select
              value={placementMode}
              onChange={(event) => setPlacementMode(event.target.value as PlacementMode)}
            >
              <option value="append">Append to end of page body</option>
              <option value="afterSelected">Insert after selected element</option>
            </select>
          </label>
          <p className="meta-line">Selected page: {selectedPageId ?? "None"}</p>
          <p className="meta-line">Selected section: {selectedSectionId ?? "None"}</p>
          <p className="meta-line">
            Placement target:{" "}
            {placementMode === "afterSelected"
              ? designerContext?.selectedElementId ?? "No element selected"
              : "Page body end"}
          </p>
          <button type="button" onClick={buildSelectedSection} disabled={Boolean(loading)}>
            Build Section
          </button>
          {loading ? <p className="info-banner">{loading}…</p> : null}
          {error ? <p className="error-banner">{error}</p> : null}
        </article>
      </section>

      <section className="panel">
        <h2>Result Summary</h2>
        <BuildSummary result={lastResult} />
      </section>
    </main>
  );
}
