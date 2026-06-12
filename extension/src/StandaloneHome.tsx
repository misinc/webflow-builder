const extensionPreviewUrl = `${window.location.pathname}?extension=1`;

export default function StandaloneHome() {
  return (
    <main className="min-h-full bg-[radial-gradient(circle_at_top_left,_rgba(255,214,102,0.24),_transparent_28%),linear-gradient(180deg,_#0c1117_0%,_#050608_100%)] text-zinc-100">
      <div className="mx-auto flex min-h-full max-w-5xl flex-col px-6 py-10 sm:px-10 lg:px-12">
        <div className="mb-10 flex items-center justify-between border-b border-white/10 pb-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.32em] text-amber-200/70">
              MIS Inc.
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Repo Section Builder
            </h1>
          </div>
          <a
            href={extensionPreviewUrl}
            className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/10"
          >
            Open extension preview
          </a>
        </div>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.9fr)]">
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-8 shadow-[0_32px_80px_rgba(0,0,0,0.32)] backdrop-blur">
            <p className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-emerald-200">
              Public entry page
            </p>
            <h2 className="mt-5 max-w-2xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Build Webflow sections from a GitHub repo, one page at a time.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg">
              This deployment hosts the Repo Section Builder extension. The full workflow runs
              inside Webflow Designer, where the extension can inspect the current site, map repo
              pages, generate skeletons, and apply styles.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <FeatureStat label="Input" value="GitHub pages + sections" />
              <FeatureStat label="Output" value="Webflow structure + styles" />
              <FeatureStat label="Surface" value="Designer extension" />
            </div>
          </div>

          <aside className="rounded-[28px] border border-white/10 bg-black/25 p-7 shadow-[0_24px_64px_rgba(0,0,0,0.25)]">
            <p className="text-sm font-medium uppercase tracking-[0.28em] text-zinc-400">
              How to use it
            </p>
            <ol className="mt-5 space-y-4 text-sm leading-6 text-zinc-300">
              <li>
                Open the extension from Webflow Designer.
              </li>
              <li>
                Connect the target repository and map repo pages to Webflow pages.
              </li>
              <li>
                Generate a section skeleton, review it, then apply styles and approve.
              </li>
            </ol>
            <div className="mt-8 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
              If you are checking this URL in a regular browser, this page is the expected public
              landing surface. The extension UI itself is available via the preview link above or
              inside Designer.
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function FeatureStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">{label}</p>
      <p className="mt-3 text-sm font-medium leading-6 text-zinc-100">{value}</p>
    </div>
  );
}
