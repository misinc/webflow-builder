import { Search, Check, GitBranch, ExternalLink, ArrowRight } from 'lucide-react';
import { Panel } from '../components/Panel';
import { Button } from '../components/Button';
import { Stepper, type Step } from '../components/Stepper';
import { ListHeader } from '../components/Headers';
import { useNavigation } from '../context/NavigationContext';

interface Repo {
  name: string;
  language: string;
  langColor: string;
  meta: string;
  selected?: boolean;
}

const REPOS: Repo[] = [
  {
    name: 'acme-studio / next-marketing-site',
    language: 'TypeScript',
    langColor: '#16a34a',
    meta: 'Updated 2 hours ago · main · 47 commits',
    selected: true,
  },
  {
    name: 'acme-studio / landing-pages-v3',
    language: 'JavaScript',
    langColor: '#eab308',
    meta: 'Updated yesterday',
  },
  {
    name: 'acme-studio / blog-template',
    language: 'TypeScript',
    langColor: '#16a34a',
    meta: 'Updated 3 days ago',
  },
  {
    name: 'acme-studio / portfolio-2025',
    language: 'TypeScript',
    langColor: '#16a34a',
    meta: 'Updated last week',
  },
  {
    name: 'acme-studio / docs-site',
    language: 'TypeScript',
    langColor: '#16a34a',
    meta: 'Updated 2 weeks ago',
  },
];

const STEPS: Step[] = [
  { label: 'Connect', state: 'done' },
  { label: 'Choose repo', state: 'active' },
  { label: 'Map pages', state: 'pending' },
];

export function ChooseRepoScreen() {
  const { navigate } = useNavigation();

  return (
    <Panel
      onClose={() => navigate('welcome')}
      footer={
        <>
          <Button variant="ghost" onClick={() => navigate('welcome')}>
            Cancel
          </Button>
          <div className="flex-1" />
          <Button variant="primary" onClick={() => navigate('map-pages')}>
            Continue
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
          className="w-[180px] h-6.5 px-2.5 pr-7 rounded text-[11.5px] bg-wb-input border border-white/[0.09] text-wb-text-primary appearance-none"
          style={{
            backgroundImage:
              'linear-gradient(45deg, transparent 50%, #6e6e6e 50%), linear-gradient(135deg, #6e6e6e 50%, transparent 50%)',
            backgroundPosition: 'right 12px center, right 8px center',
            backgroundSize: '4px 4px',
            backgroundRepeat: 'no-repeat',
          }}
        >
          <option>acme-studio (Personal)</option>
          <option>acme-team</option>
        </select>
      </div>

      <div className="px-4 pt-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-wb-text-tertiary" />
          <input
            type="text"
            placeholder="Search repositories"
            className="w-full h-8 bg-wb-input border border-white/[0.09] rounded-md pl-8 pr-2.5 text-wb-text-primary text-[12.5px] outline-none focus:border-wb-accent"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {REPOS.map((repo) => (
          <RepoRow key={repo.name} repo={repo} />
        ))}

        {/* Install on more repos affordance */}
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className="mt-3 flex items-center gap-2.5 px-3 py-2.5 rounded-md border border-dashed cursor-pointer"
          style={{
            background: 'rgba(20,110,245,0.04)',
            borderColor: 'rgba(20,110,245,0.32)',
            textDecoration: 'none',
          }}
        >
          <div className="w-6.5 h-6.5 rounded-md bg-wb-surface-2 inline-flex items-center justify-center text-wb-accent flex-shrink-0">
            <ExternalLink size={13} />
          </div>
          <div className="flex-1">
            <div className="text-[12.5px] text-wb-accent font-medium">
              Don't see your repo? Install on more
            </div>
            <div className="text-[11px] text-wb-text-tertiary mt-px">
              Opens GitHub so you can grant Webflow Builder access to additional repositories.
            </div>
          </div>
          <ArrowRight size={14} className="text-wb-accent flex-shrink-0" />
        </a>
      </div>
    </Panel>
  );
}

function RepoRow({ repo }: { repo: Repo }) {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer border ${
        repo.selected
          ? 'bg-wb-accent/10 border-wb-accent/30'
          : 'border-transparent hover:bg-wb-surface-1 hover:border-white/[0.09]'
      }`}
    >
      <div className="w-7 h-7 bg-wb-surface-2 rounded-md inline-flex items-center justify-center text-wb-text-secondary flex-shrink-0">
        <GitBranch size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-wb-text-primary">{repo.name}</div>
        <div className="text-[11px] text-wb-text-tertiary flex items-center gap-2.5 mt-0.5">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: repo.langColor }} />
            {repo.language}
          </span>
          <span>{repo.meta}</span>
        </div>
      </div>
      {repo.selected && <Check size={16} className="text-wb-accent" />}
    </div>
  );
}
