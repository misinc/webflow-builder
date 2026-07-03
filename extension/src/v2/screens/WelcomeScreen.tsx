import { type ReactNode, useMemo, useState } from 'react';
import { Github, GitBranch, ListOrdered, Check } from 'lucide-react';
import { Panel } from '../components/Panel';
import { Button } from '../components/Button';
import { useNavigation } from '../context/NavigationContext';
import { useAppState } from '../context/AppStateContext';

export function WelcomeScreen() {
  const { navigate } = useNavigation();
  const {
    bootstrapDiagnostics,
    connectAndSyncRepo,
    error,
    isBootstrapping,
    isMutating,
    loadingLabel,
    refreshBootstrap,
    repos,
    session,
  } = useAppState();
  const [owner, setOwner] = useState('misinc');
  const [name, setName] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const hasRepoChoices = repos.length > 0;
  const canAdvance = hasRepoChoices;
  const normalizedRepoUrl = useMemo(() => {
    const trimmed = repoUrl.trim();
    if (trimmed) {
      return trimmed;
    }
    if (!owner.trim() || !name.trim()) {
      return '';
    }
    return `https://github.com/${owner.trim()}/${name.trim()}`;
  }, [name, owner, repoUrl]);

  const primaryLabel = isBootstrapping
    ? 'Loading session…'
    : hasRepoChoices
      ? 'Continue to repositories'
      : session?.source === 'github-app'
        ? 'GitHub App repositories unavailable'
        : 'GitHub sign-in unavailable';

  const helperText = isBootstrapping
    ? 'Checking the current repository session.'
    : hasRepoChoices
      ? 'Repository access is available for this session.'
      : session?.source === 'github-app'
        ? bootstrapDiagnostics?.repoListingError ??
          'The GitHub App is configured, but the backend could not load installation repositories.'
        : session?.source === 'anonymous'
        ? 'This build does not have a GitHub session configured yet, so repository selection cannot start from this screen.'
        : 'No repositories are available for the current session yet.';

  return (
    <Panel>
      <div className="flex-1 flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="text-center px-12 pt-11 pb-7">
          <div
            className="w-[52px] h-[52px] rounded-xl bg-gradient-to-br from-[#00ce86] to-[#00a872] inline-flex items-center justify-center text-[#0a3a26] font-extrabold text-[18px] mb-4.5"
            style={{ boxShadow: '0 6px 20px -8px rgba(0,206,134,0.5)' }}
          >
            WB
          </div>
          <h2 className="text-[22px] font-bold text-wb-text-primary tracking-tight mt-0 mb-2">
            Welcome to Webflow Builder
          </h2>
          <p className="text-[13.5px] text-wb-text-secondary leading-relaxed mx-auto max-w-[520px]">
            Migrate sites into Webflow using a GitHub codebase as the source of truth. Each
            section is rebuilt clean and client-first — structure, styles, and icons — and lands
            on your canvas with a single paste.
          </p>
        </div>

        {/* How it works */}
        <div className="px-8">
          <div className="text-[10.5px] font-semibold text-wb-text-tertiary uppercase tracking-widest text-center mb-3.5">
            How it works
          </div>
          <div className="grid grid-cols-3 gap-3">
            <StepCard
              num="STEP 01"
              title="Connect a repo"
              body="Link a GitHub repo with pre-rendered HTML pages (a static export or compiled site) and map each Webflow page to its file."
              icon={<GitBranch size={16} />}
              iconStyle="default"
            />
            <StepCard
              num="STEP 02"
              title="Pick a page or section"
              body="Copy a whole page at once, or open a section to review its client-first skeleton first. Skip anything for later."
              icon={<ListOrdered size={16} />}
              iconStyle="default"
            />
            <StepCard
              num="STEP 03"
              title="Paste into Webflow"
              body="Cmd+V on the canvas, click Clean up paste to reuse your classes and variables, and mark it built."
              icon={<Check size={16} strokeWidth={2.5} />}
              iconStyle="success"
            />
          </div>
        </div>

        {/* CTA */}
        <div className="mt-auto px-8 pt-8 pb-9 flex flex-col items-center gap-3">
          <Button
            variant="primary"
            size="lg"
            disabled={!canAdvance || isBootstrapping}
            onClick={() => {
              if (canAdvance) {
                navigate('choose-repo');
              }
            }}
            className="min-w-[220px]"
          >
            <Github size={16} fill="currentColor" strokeWidth={0} />
            {primaryLabel}
          </Button>
          <p className="text-[11.5px] text-wb-text-tertiary m-0 text-center max-w-[520px]">
            {helperText}
          </p>
          <button
            type="button"
            onClick={() => navigate('debug-skeleton')}
            className="text-[11.5px] text-wb-accent hover:text-[#5da8ff] transition-colors"
          >
            Open debug skeleton playground
          </button>
          {!hasRepoChoices && !isBootstrapping ? (
            <div className="w-full max-w-[520px] mt-2 rounded-lg border border-white/[0.09] bg-wb-surface-1 p-4 text-left">
              <div className="text-[12.5px] font-semibold text-wb-text-primary mb-1.5">
                {session?.source === 'github-app'
                  ? 'GitHub App repository access'
                  : 'Connect a repository manually'}
              </div>
              <div className="text-[11.5px] text-wb-text-secondary leading-relaxed mb-3">
                {session?.source === 'github-app'
                  ? 'This deployment is configured to use your installed GitHub App. Retry the installation repo lookup first; use manual connect only as a fallback.'
                  : 'This deployment can still continue by connecting and syncing a GitHub repository directly through the Webflow Cloud backend.'}
              </div>
              {session?.source === 'github-app' ? (
                <div className="mb-4 rounded-md border border-white/[0.09] bg-black/[0.16] px-3 py-3">
                  <div className="text-[11px] font-semibold text-wb-text-tertiary uppercase tracking-wider mb-1.5">
                    GitHub App status
                  </div>
                  <div className="text-[12px] text-wb-text-secondary leading-relaxed">
                    {bootstrapDiagnostics?.repoListingError ??
                      'No installation repositories were returned for the current GitHub App session.'}
                  </div>
                  <div className="mt-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isMutating}
                      onClick={() => {
                        void refreshBootstrap();
                      }}
                    >
                      <Github size={14} fill="currentColor" strokeWidth={0} />
                      {isMutating ? loadingLabel ?? 'Retrying…' : 'Retry GitHub App lookup'}
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Field label="Owner">
                  <input
                    type="text"
                    value={owner}
                    onChange={(event) => setOwner(event.target.value)}
                    className="w-full h-9 bg-wb-input border border-white/[0.09] rounded-md px-2.5 text-wb-text-primary text-[12.5px] outline-none"
                  />
                </Field>
                <Field label="Repository">
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="w-full h-9 bg-wb-input border border-white/[0.09] rounded-md px-2.5 text-wb-text-primary text-[12.5px] outline-none"
                  />
                </Field>
              </div>
              <Field label="GitHub URL">
                <input
                  type="text"
                  value={repoUrl}
                  placeholder={normalizedRepoUrl || 'https://github.com/owner/repo'}
                  onChange={(event) => setRepoUrl(event.target.value)}
                  className="w-full h-9 bg-wb-input border border-white/[0.09] rounded-md px-2.5 text-wb-text-primary text-[12.5px] outline-none"
                />
              </Field>
              {error ? (
                <div className="text-[11.5px] text-wb-danger mt-3">{error}</div>
              ) : null}
              <div className="flex items-center gap-3 mt-4">
                <Button
                  variant="primary"
                  disabled={isMutating || !owner.trim() || !name.trim()}
                  onClick={() => {
                    void connectAndSyncRepo({
                      owner,
                      name,
                      repoUrl: normalizedRepoUrl
                    }).then((connected) => {
                      if (connected) {
                        navigate('choose-repo');
                      }
                    });
                  }}
                >
                  <Github size={16} fill="currentColor" strokeWidth={0} />
                  {loadingLabel ?? 'Connect repository'}
                </Button>
                <div className="text-[11px] text-wb-text-tertiary">
                  The repo will be connected, indexed, and added to this V2 session.
                </div>
              </div>
            </div>
          ) : null}
          <p className="text-[11.5px] text-wb-text-tertiary m-0 text-center">
            We only read repository contents. Nothing is pushed back to your repo.
          </p>
        </div>
      </div>
    </Panel>
  );
}

function Field({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="block">
      <div className="text-[10.5px] font-semibold text-wb-text-tertiary uppercase tracking-wider mb-1.5">
        {label}
      </div>
      {children}
    </label>
  );
}

function StepCard({
  num,
  title,
  body,
  icon,
  iconStyle,
}: {
  num: string;
  title: string;
  body: string;
  icon: React.ReactNode;
  iconStyle: 'default' | 'success';
}) {
  const iconClass =
    iconStyle === 'success'
      ? 'bg-wb-success/10 border border-wb-success/30 text-wb-success'
      : 'bg-wb-surface-2 text-wb-text-primary';

  return (
    <div className="bg-wb-surface-1 border border-white/[0.09] rounded-lg p-4.5 px-4">
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-8 h-8 rounded-md inline-flex items-center justify-center ${iconClass}`}>
          {icon}
        </div>
        <div className="text-[10px] font-semibold text-wb-text-tertiary tracking-widest">{num}</div>
      </div>
      <div className="text-[13.5px] font-semibold text-wb-text-primary mb-1.5">{title}</div>
      <div className="text-[11.5px] text-wb-text-secondary leading-relaxed">{body}</div>
    </div>
  );
}
