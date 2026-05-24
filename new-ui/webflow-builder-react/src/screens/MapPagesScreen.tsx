import { Home, FileText, ArrowRight, Plus } from 'lucide-react';
import { Panel, PanelContent } from '../components/Panel';
import { Button } from '../components/Button';
import { Stepper, type Step } from '../components/Stepper';
import { useNavigation } from '../context/NavigationContext';

interface PageMapping {
  name: string;
  slug: string;
  icon: 'home' | 'page';
  options: string[];
  unmapped?: boolean;
}

const MAPPINGS: PageMapping[] = [
  { name: 'Home', slug: '/', icon: 'home', options: ['app/page.tsx', 'app/(marketing)/page.tsx'] },
  { name: 'About', slug: '/about', icon: 'page', options: ['app/about/page.tsx'] },
  { name: 'Pricing', slug: '/pricing', icon: 'page', options: ['app/pricing/page.tsx'] },
  { name: 'Blog', slug: '/blog', icon: 'page', options: ['app/blog/page.tsx'] },
  {
    name: 'Changelog',
    slug: '/changelog',
    icon: 'page',
    options: ['— Not mapped —', 'app/blog/page.tsx', 'app/pricing/page.tsx'],
    unmapped: true,
  },
];

const STEPS: Step[] = [
  { label: 'Connect', state: 'done' },
  { label: 'Choose repo', state: 'done' },
  { label: 'Map pages', state: 'active' },
];

export function MapPagesScreen() {
  const { navigate } = useNavigation();

  return (
    <Panel
      onClose={() => navigate('welcome')}
      footer={
        <>
          <span className="text-[11.5px] text-wb-text-tertiary">
            Unmapped pages can be mapped later from Settings.
          </span>
          <div className="flex-1" />
          <Button variant="ghost" onClick={() => navigate('choose-repo')}>
            Back
          </Button>
          <Button variant="primary" onClick={() => navigate('section-list')}>
            Start building
          </Button>
        </>
      }
    >
      <Stepper steps={STEPS} />

      <div className="px-5 py-3 flex items-center gap-2 bg-black/[0.12] border-b border-white/[0.06]">
        <div className="text-[11px] font-semibold text-wb-text-tertiary uppercase tracking-wider flex-1">
          Page mapping
        </div>
        <span className="text-[11px] text-wb-text-tertiary tabular-nums">4 of 5 mapped</span>
      </div>

      <PanelContent>
        <div className="px-5 py-3">
          <div className="grid grid-cols-[1fr_24px_1fr] gap-3 pb-2 text-[10.5px] font-semibold text-wb-text-tertiary uppercase tracking-wider">
            <div>Webflow page</div>
            <div />
            <div>Repo page</div>
          </div>
          {MAPPINGS.map((m, i) => (
            <div
              key={m.name}
              className={`grid grid-cols-[1fr_24px_1fr] gap-3 items-center py-2.5 ${
                i < MAPPINGS.length - 1 ? 'border-b border-white/[0.06]' : ''
              }`}
            >
              <div className="flex items-center gap-2.5 text-[12.5px] text-wb-text-primary min-w-0">
                <div
                  className={`w-5.5 h-5.5 rounded inline-flex items-center justify-center flex-shrink-0 bg-wb-surface-2 ${
                    m.unmapped ? 'text-wb-warning' : 'text-wb-text-tertiary'
                  }`}
                >
                  {m.icon === 'home' ? <Home size={12} /> : <FileText size={12} />}
                </div>
                <div>
                  <div>{m.name}</div>
                  <div className="text-[11px] text-wb-text-tertiary font-mono">{m.slug}</div>
                </div>
              </div>
              <div className="text-wb-text-disabled text-center">
                <ArrowRight size={14} className="inline-block" />
              </div>
              <select
                className={`w-full h-8 px-2.5 pr-7 rounded text-[12.5px] bg-wb-input border text-wb-text-primary appearance-none ${
                  m.unmapped ? 'border-wb-warning/30' : 'border-white/[0.09]'
                }`}
                style={{
                  backgroundImage:
                    'linear-gradient(45deg, transparent 50%, #6e6e6e 50%), linear-gradient(135deg, #6e6e6e 50%, transparent 50%)',
                  backgroundPosition: 'right 12px center, right 8px center',
                  backgroundSize: '4px 4px',
                  backgroundRepeat: 'no-repeat',
                }}
              >
                {m.options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="px-5 pb-4">
          <Button block dashed onClick={() => navigate('create-page')}>
            <Plus size={14} />
            Create a new Webflow page
          </Button>
        </div>
      </PanelContent>
    </Panel>
  );
}
