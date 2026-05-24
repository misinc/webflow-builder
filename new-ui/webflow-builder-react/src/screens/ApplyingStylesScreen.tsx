import { useEffect } from 'react';
import { X } from 'lucide-react';
import { Panel } from '../components/Panel';
import { Button } from '../components/Button';
import { Stepper, buildStepper } from '../components/Stepper';
import { SectionDetailHeader, ListHeader } from '../components/Headers';
import { AiBadge } from '../components/Badge';
import { Spinner } from '../components/Spinner';
import { useNavigation } from '../context/NavigationContext';

const AUTO_ADVANCE_MS = 3500;

interface StyleLine {
  selector: string;
  prop?: string;
  value?: string;
  pending?: boolean;
}

const APPLIED: StyleLine[] = [
  { selector: '.features-grid', prop: 'padding', value: '96px 0' },
  { selector: '.features-grid', prop: 'background', value: '#fafafa' },
  { selector: '.container', prop: 'max-width', value: '1200px' },
  { selector: '.container', prop: 'margin', value: '0 auto' },
  { selector: '.section-header', prop: 'text-align', value: 'center' },
  { selector: '.section-header', prop: 'margin-bottom', value: '64px' },
  { selector: '.eyebrow', prop: 'color', value: '#146ef5' },
  { selector: '.eyebrow', prop: 'font-size', value: '13px' },
  { selector: '.eyebrow', prop: 'font-weight', value: '600' },
  { selector: '.heading-xl', prop: 'font-size', value: '48px' },
  { selector: '.heading-xl', prop: 'font-weight', value: '700' },
  { selector: '.heading-xl', prop: 'letter-spacing', value: '-0.02em' },
  { selector: '.grid-3-col', prop: 'display', value: 'grid' },
  { selector: '.grid-3-col', prop: 'grid-template-columns', value: 'repeat(3, 1fr)' },
  { selector: '.grid-3-col', prop: 'gap', value: '32px' },
  { selector: '.feature-card', prop: 'applying styles', pending: true },
];

export function ApplyingStylesScreen() {
  const { navigate, setFeaturesGridState } = useNavigation();

  // Auto-advance to section complete. Mark features grid as built.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setFeaturesGridState('complete');
      navigate('section-complete');
    }, AUTO_ADVANCE_MS);
    return () => window.clearTimeout(t);
  }, [navigate, setFeaturesGridState]);

  return (
    <Panel
      onClose={() => navigate('section-list')}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => navigate('skeleton-review')}>
            <X size={12} />
            Reject &amp; redo
          </Button>
          <div className="flex-1" />
          <span className="text-[11px] text-wb-text-tertiary mr-2">Applying styles…</span>
          <Button variant="primary" disabled>
            Approve section
          </Button>
        </>
      }
    >
      <SectionDetailHeader
        eyebrow="Home · Section 4 of 8"
        title="Features grid"
        onBack={() => navigate('section-list')}
        badge={<AiBadge>Styling</AiBadge>}
      />

      <Stepper steps={buildStepper('style')} />

      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Loading top */}
        <div className="px-6 pt-7 pb-5 text-center border-b border-white/[0.06]">
          <div className="flex justify-center mb-3.5">
            <Spinner size={28} thickness={2.5} />
          </div>
          <div className="text-[15px] font-medium text-wb-text-primary mb-1.5">
            Applying styles to Features grid
          </div>
          <div className="text-[12.5px] text-wb-text-secondary leading-relaxed max-w-[480px] mx-auto">
            Watch the section take shape on the canvas behind you. Usually takes 6–10 seconds.
          </div>
        </div>

        {/* List header + applied styles */}
        <ListHeader title="Styles applied" count="22 of 34" />

        <div className="px-4 py-2 font-mono text-[11px] leading-loose">
          {APPLIED.map((line, i) => (
            <StyleLineRow key={i} line={line} />
          ))}
        </div>
      </div>
    </Panel>
  );
}

function StyleLineRow({ line }: { line: StyleLine }) {
  if (line.pending) {
    return (
      <div className="flex gap-2 px-2 py-0.5 rounded text-wb-text-secondary opacity-70">
        <span className="text-wb-accent w-3 text-center">…</span>
        <span className="text-[#8ad7ff]">{line.selector}</span>
        <span className="text-[#ffd479]">{line.prop}</span>
      </div>
    );
  }
  return (
    <div className="flex gap-2 px-2 py-0.5 rounded bg-wb-success/[0.06] text-[#cdf3e5]">
      <span className="text-wb-success w-3 text-center">+</span>
      <span className="text-[#8ad7ff]">{line.selector}</span>
      <span className="text-[#ffd479]">{line.prop}</span>
      <span className="text-wb-text-primary">: {line.value}</span>
    </div>
  );
}
