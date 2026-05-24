import { useEffect } from 'react';
import { Check } from 'lucide-react';
import { Panel } from '../components/Panel';
import { Button } from '../components/Button';
import { Stepper, buildStepper } from '../components/Stepper';
import { SectionDetailHeader } from '../components/Headers';
import { AiBadge } from '../components/Badge';
import { Spinner } from '../components/Spinner';
import { useNavigation } from '../context/NavigationContext';

const AUTO_ADVANCE_MS = 3500;

export function GeneratingSkeletonScreen() {
  const { navigate } = useNavigation();

  // Auto-advance to skeleton-review after a beat.
  useEffect(() => {
    const t = window.setTimeout(() => navigate('skeleton-review'), AUTO_ADVANCE_MS);
    return () => window.clearTimeout(t);
  }, [navigate]);

  return (
    <Panel
      onClose={() => navigate('section-list')}
      footer={
        <Button variant="ghost" size="sm" onClick={() => navigate('section-list')}>
          Cancel
        </Button>
      }
    >
      <SectionDetailHeader
        eyebrow="Home · Section 4 of 8"
        title={
          <>
            Features grid
            <span className="text-[11px] font-normal text-wb-text-tertiary font-mono">
              components/FeaturesGrid.tsx
            </span>
          </>
        }
        badge={<AiBadge>AI working</AiBadge>}
        onBack={() => navigate('section-list')}
      />

      <Stepper steps={buildStepper('skeleton')} />

      <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-3.5">
        <Spinner size={28} thickness={2.5} />
        <div>
          <div className="text-[15px] font-medium text-wb-text-primary mb-1.5">Generating skeleton</div>
          <div className="text-[12.5px] text-wb-text-secondary leading-relaxed max-w-[460px] mx-auto">
            Reading FeaturesGrid.tsx and mapping its 18 elements into a Webflow-friendly tree with
            class names. Usually takes 4–8 seconds.
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-2 text-[11.5px] text-wb-text-tertiary font-mono">
          <div className="flex items-center gap-2">
            <Check size={12} strokeWidth={3} className="text-wb-success" />
            Read FeaturesGrid.tsx (4.2 KB)
          </div>
          <div className="flex items-center gap-2">
            <Check size={12} strokeWidth={3} className="text-wb-success" />
            Mapped nesting structure
          </div>
          <div className="flex items-center gap-2 text-wb-text-secondary">
            <Spinner size={10} thickness={1.5} />
            Generating class names…
          </div>
        </div>
      </div>
    </Panel>
  );
}
