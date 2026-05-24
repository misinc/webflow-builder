import { XCircle, RefreshCw, Check } from 'lucide-react';
import { Panel } from '../components/Panel';
import { Button } from '../components/Button';
import { Stepper, buildStepper } from '../components/Stepper';
import { SectionDetailHeader } from '../components/Headers';
import { ErrorBadge } from '../components/Badge';
import { useNavigation } from '../context/NavigationContext';

export function ErrorScreen() {
  const { navigate } = useNavigation();

  return (
    <Panel onClose={() => navigate('section-list')}>
      <SectionDetailHeader
        eyebrow="Home · Section 4 of 8"
        title="Features grid"
        onBack={() => navigate('section-list')}
        badge={<ErrorBadge />}
      />

      <Stepper steps={buildStepper('skeleton', 'skeleton')} />

      <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-3.5">
        <div
          className="w-14 h-14 rounded-2xl inline-flex items-center justify-center text-wb-danger"
          style={{ background: 'rgba(255,93,93,0.12)', border: '1px solid rgba(255,93,93,0.32)' }}
        >
          <XCircle size={28} />
        </div>

        <div>
          <div className="text-[16px] font-semibold text-wb-text-primary mb-1.5">
            Couldn't generate skeleton
          </div>
          <div className="text-[12.5px] text-wb-text-secondary leading-relaxed max-w-[480px] mx-auto">
            The AI returned an incomplete response after 12 seconds. This usually clears up on
            retry, but the section file may also be unusually large or malformed.
          </div>
        </div>

        <div
          className="rounded-md px-3.5 py-3 max-w-[480px] text-left font-mono text-[11px] text-wb-text-secondary leading-relaxed bg-wb-surface-1 border border-white/[0.09]"
        >
          <div className="text-wb-text-tertiary mb-1">{`// What we tried`}</div>
          <div>
            <Check size={11} strokeWidth={3} className="inline text-wb-success mr-1.5 -mt-px" />
            Read FeaturesGrid.tsx (4.2 KB)
          </div>
          <div>
            <Check size={11} strokeWidth={3} className="inline text-wb-success mr-1.5 -mt-px" />
            Mapped 18 elements
          </div>
          <div className="text-wb-danger">✕ AI response truncated · timeout 12s</div>
        </div>

        <div className="flex gap-2 mt-2">
          <Button variant="ghost" onClick={() => navigate('section-list')}>
            Skip this section
          </Button>
          <Button variant="primary" onClick={() => navigate('generating-skeleton')}>
            <RefreshCw size={14} />
            Try again
          </Button>
        </div>
      </div>
    </Panel>
  );
}
