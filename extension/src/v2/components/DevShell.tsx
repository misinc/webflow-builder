import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useNavigation } from '../context/NavigationContext';
import { SCREENS, type ScreenName, type Phase } from '../types';

/**
 * Dev-only shell around the active screen — sidebar nav + topbar controls.
 *
 * For production (real Webflow extension), render the screen directly:
 *   <NavigationProvider><CurrentScreen /></NavigationProvider>
 * without wrapping it in <DevShell>.
 */
export function DevShell({ children }: { children: ReactNode }) {
  const { current, canGoBack, canGoForward, goBack, goForward, restart } = useNavigation();

  // Keyboard shortcuts: ← → for history, R to restart.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') goBack();
      else if (e.key === 'ArrowRight') goForward();
      else if (e.key === 'r' || e.key === 'R') restart();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goBack, goForward, restart]);

  const meta = SCREENS[current];

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0)',
        backgroundSize: '24px 24px',
      }}
    >
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <div
          className="h-14 border-b border-white/[0.05] flex items-center gap-2 px-6 flex-shrink-0"
          style={{ background: 'rgba(12,12,12,0.6)', backdropFilter: 'blur(8px)' }}
        >
          <TopbarButton onClick={goBack} disabled={!canGoBack} ariaLabel="Back">
            <ChevronLeft size={14} />
          </TopbarButton>
          <TopbarButton onClick={goForward} disabled={!canGoForward} ariaLabel="Forward">
            <ChevronRight size={14} />
          </TopbarButton>
          <div className="ml-2 flex flex-col gap-0.5">
            <div className="text-[10.5px] text-wb-text-tertiary uppercase tracking-wider font-medium">
              {meta.phase}
            </div>
            <div className="text-[13px] font-semibold text-wb-text-primary">{meta.title}</div>
          </div>
          <div className="flex-1" />
          <div className="font-mono text-[11.5px] text-wb-text-tertiary px-2.5 py-1.5 bg-white/[0.03] rounded">
            {meta.num} / 16
          </div>
          <TopbarButton onClick={restart} ariaLabel="Restart">
            <RefreshCw size={14} />
          </TopbarButton>
        </div>

        {/* Stage */}
        <div className="flex-1 flex items-center justify-center overflow-auto p-10 relative">
          {children}
        </div>
      </main>
    </div>
  );
}

function TopbarButton({
  children,
  onClick,
  disabled,
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="w-8 h-8 rounded-md bg-white/[0.04] border border-white/[0.08] text-wb-text-secondary inline-flex items-center justify-center hover:enabled:bg-white/[0.08] hover:enabled:text-wb-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}

function Sidebar() {
  const { current, navigate } = useNavigation();

  const groups: Record<Phase, ScreenName[]> = {
    Onboarding: ['welcome', 'choose-repo', 'map-pages', 'create-page'],
    Main: ['section-list'],
    'Build flow': [
      'generating-skeleton',
      'skeleton-review',
      'skeleton-edit',
      'applying-styles',
      'section-complete',
      'page-complete',
    ],
    Settings: ['site-progress', 'settings'],
    'Edge case': ['not-mapped', 'error'],
    Proposed: ['component-opportunities'],
  };

  return (
    <aside className="w-[280px] bg-[#0a0a0a] border-r border-white/[0.06] flex flex-col flex-shrink-0">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/[0.04]">
        <div
          className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00ce86] to-[#00a872] flex items-center justify-center text-[#0a3a26] font-extrabold text-[12px]"
          style={{ boxShadow: '0 4px 12px -4px rgba(0,206,134,0.4)' }}
        >
          WB
        </div>
        <div>
          <div className="text-[13px] font-semibold text-wb-text-primary">Webflow Builder</div>
          <div className="text-[10.5px] text-[#666] uppercase tracking-wider font-medium">
            Clickable prototype
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {(Object.entries(groups) as [Phase, ScreenName[]][]).map(([phase, names]) => (
          <div key={phase} className="mb-3.5">
            <div className="text-[10px] font-semibold text-[#555] uppercase tracking-widest px-2.5 py-1.5">
              {phase === 'Edge case' ? 'Edge cases' : phase}
            </div>
            {names.map((name) => {
              const isActive = current === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => navigate(name)}
                  className={`w-full text-left flex items-center gap-2.5 px-2.5 py-1.5 text-[12.5px] rounded border transition-colors ${
                    isActive
                      ? 'bg-wb-accent/10 text-wb-text-primary border-wb-accent/30'
                      : 'text-[#999] border-transparent hover:bg-white/[0.04] hover:text-[#ddd]'
                  }`}
                >
                  <span
                    className={`font-mono w-[18px] text-[10.5px] text-center ${
                      isActive ? 'text-wb-accent' : 'text-[#555]'
                    }`}
                  >
                    {SCREENS[name].num}
                  </span>
                  <span className="truncate">{SCREENS[name].title.split(' — ')[0]}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="px-5 py-3.5 border-t border-white/[0.04] text-[10.5px] text-[#555] leading-relaxed">
        <div>
          <kbd className="font-mono text-[10px] bg-white/[0.06] border border-white/[0.1] rounded px-1.5 py-0.5 text-[#aaa]">←</kbd>{' '}
          <kbd className="font-mono text-[10px] bg-white/[0.06] border border-white/[0.1] rounded px-1.5 py-0.5 text-[#aaa]">→</kbd>{' '}
          navigate history
        </div>
        <div className="mt-1">
          <kbd className="font-mono text-[10px] bg-white/[0.06] border border-white/[0.1] rounded px-1.5 py-0.5 text-[#aaa]">R</kbd>{' '}
          restart
        </div>
        <div className="mt-2">Click the panel's primary buttons to walk through the flow.</div>
      </div>
    </aside>
  );
}
