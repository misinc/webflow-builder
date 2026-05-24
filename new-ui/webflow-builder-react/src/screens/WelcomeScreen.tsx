import { Github, GitBranch, ListOrdered, Check } from 'lucide-react';
import { Panel } from '../components/Panel';
import { Button } from '../components/Button';
import { useNavigation } from '../context/NavigationContext';

export function WelcomeScreen() {
  const { navigate } = useNavigation();

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
            Build sites in Webflow using a GitHub codebase as the source of truth. Connect once,
            then build sections one at a time with the AI handling structure and styling.
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
              title="Connect & map pages"
              body="Link a GitHub repo and map each Webflow page to the right file in your codebase."
              icon={<GitBranch size={16} />}
              iconStyle="default"
            />
            <StepCard
              num="STEP 02"
              title="Choose a section"
              body="Webflow Builder shows the sections in each page. Pick one to start, skip the rest for later."
              icon={<ListOrdered size={16} />}
              iconStyle="default"
            />
            <StepCard
              num="STEP 03"
              title="Build & style"
              body="The AI proposes a skeleton, inserts it, and applies styles from your codebase. Approve and move on."
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
            onClick={() => navigate('choose-repo')}
            className="min-w-[220px]"
          >
            <Github size={16} fill="currentColor" strokeWidth={0} />
            Connect GitHub
          </Button>
          <p className="text-[11.5px] text-wb-text-tertiary m-0 text-center">
            You choose which repos to share when you install. We only read — nothing is pushed back.
          </p>
        </div>
      </div>
    </Panel>
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
