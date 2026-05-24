import type { ReactNode } from 'react';
import {
  Heading1,
  LayoutPanelTop,
  MoveRight,
  CreditCard,
  RefreshCw,
  Check,
  Code as CodeIcon,
} from 'lucide-react';
import { Panel } from '../components/Panel';
import { Button, IconButton } from '../components/Button';
import { SectionDetailHeader } from '../components/Headers';
import { AiBadge, Badge } from '../components/Badge';
import { useNavigation } from '../context/NavigationContext';

interface Opportunity {
  id: string;
  name: string;
  icon: ReactNode;
  confidence: 'high' | 'medium';
  instances: number;
  files: number;
  selected: boolean;
  active?: boolean; // shown in the detail pane
}

const OPPORTUNITIES: Opportunity[] = [
  {
    id: 'eyebrow',
    name: 'Eyebrow label',
    icon: <Heading1 size={14} />,
    confidence: 'high',
    instances: 12,
    files: 6,
    selected: true,
  },
  {
    id: 'feature-card',
    name: 'Feature card',
    icon: <LayoutPanelTop size={14} />,
    confidence: 'high',
    instances: 14,
    files: 4,
    selected: true,
    active: true,
  },
  {
    id: 'cta-button',
    name: 'CTA button with arrow',
    icon: <MoveRight size={14} />,
    confidence: 'high',
    instances: 8,
    files: 5,
    selected: true,
  },
  {
    id: 'pricing-tier',
    name: 'Pricing tier card',
    icon: <CreditCard size={14} />,
    confidence: 'medium',
    instances: 3,
    files: 1,
    selected: false,
  },
];

interface Prop {
  name: string;
  type: 'image' | 'text' | 'link';
  samples: string;
  optional?: boolean;
}

const FEATURE_CARD_PROPS: Prop[] = [
  { name: 'icon', type: 'image', samples: 'rocket.svg · lightning.svg · shield.svg' },
  { name: 'title', type: 'text', samples: '"Built for scale" · "Lightning fast" · "Enterprise security"' },
  { name: 'description', type: 'text', samples: '"Spin up clusters in seconds." · "Sub-100ms queries…"' },
  { name: 'href', type: 'link', samples: 'Optional · used in 4 of 14 instances', optional: true },
];

const FEATURE_CARD_OCCURRENCES = [
  { path: 'app/page.tsx', detail: '6 in FeaturesGrid' },
  { path: 'app/pricing/page.tsx', detail: '4 in TierComparison' },
  { path: 'app/about/page.tsx', detail: '2 in Values' },
  { path: 'app/blog/page.tsx', detail: '2 in CategoryGrid' },
];

export function ComponentOpportunitiesScreen() {
  const { navigate } = useNavigation();
  const selectedCount = OPPORTUNITIES.filter((o) => o.selected).length;

  return (
    <Panel
      onClose={() => navigate('section-list')}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => navigate('section-list')}>
            Skip for now
          </Button>
          <div className="flex-1" />
          <span className="text-[11px] text-wb-text-tertiary mr-2">{selectedCount} components selected</span>
          <Button variant="primary" onClick={() => navigate('section-list')}>
            Create {selectedCount} components
          </Button>
        </>
      }
    >
      <SectionDetailHeader
        eyebrow="Setup · across all pages"
        title="Component opportunities"
        onBack={() => navigate('section-list')}
        badge={<AiBadge>AI scanned</AiBadge>}
      />

      {/* Intro strip */}
      <div className="px-5 py-3 bg-wb-surface-1 border-b border-white/[0.06] flex items-center gap-3 flex-shrink-0">
        <div className="flex-1">
          <div className="text-[12.5px] text-wb-text-primary font-medium">
            4 reusable patterns detected across 6 files
          </div>
          <div className="text-[11.5px] text-wb-text-tertiary mt-0.5">
            Promote any of these to a Webflow Component now, and we'll use it as we build the sections.
          </div>
        </div>
        <Button variant="ghost" size="sm">
          <RefreshCw size={12} />
          Rescan
        </Button>
      </div>

      {/* Split body */}
      <div className="flex flex-1 min-h-0">
        {/* Left: opportunity list */}
        <div className="w-[42%] border-r border-white/[0.09] flex flex-col min-w-0">
          <div className="px-4 py-2.5 border-b border-white/[0.09] text-[11px] font-semibold text-wb-text-tertiary uppercase tracking-wider flex items-center justify-between flex-shrink-0 bg-black/[0.12]">
            <span>Detected patterns</span>
            <span className="text-[10.5px] text-wb-text-tertiary font-medium normal-case tracking-normal">
              {selectedCount} of {OPPORTUNITIES.length} selected
            </span>
          </div>
          <div className="overflow-auto flex-1 px-2 py-1.5">
            {OPPORTUNITIES.map((opp) => (
              <OpportunityRow key={opp.id} opportunity={opp} />
            ))}
            <div className="px-3 pt-3 mt-1.5 border-t border-white/[0.06] text-[11.5px] text-wb-text-tertiary leading-relaxed">
              Patterns with fewer than 3 occurrences are hidden by default.{' '}
              <a href="#" className="text-wb-accent no-underline">Lower the threshold →</a>
            </div>
          </div>
        </div>

        {/* Right: detail of selected opportunity */}
        <div className="w-[58%] flex flex-col min-w-0">
          <div className="px-4 py-2.5 border-b border-white/[0.09] text-[11px] font-semibold text-wb-text-tertiary uppercase tracking-wider bg-black/[0.12] flex-shrink-0">
            Component details
          </div>
          <div className="overflow-y-auto flex-1 px-5 py-4.5">
            {/* Component name */}
            <Field label="Component name">
              <input
                type="text"
                defaultValue="Feature card"
                className="w-full h-9 bg-wb-input border border-white/[0.09] rounded-md px-2.5 text-wb-text-primary text-[14px] font-medium outline-none focus:border-wb-accent"
              />
            </Field>

            {/* Preview */}
            <Field label="Preview">
              <div className="bg-black/[0.25] border border-white/[0.09] rounded-lg px-4 py-3.5 flex flex-col gap-2">
                <div className="w-7 h-7 rounded-md bg-wb-accent/10 border border-wb-accent/30 inline-flex items-center justify-center text-wb-accent">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </div>
                <div className="h-[9px] bg-white/[0.12] rounded-sm w-[65%]" />
                <div className="flex flex-col gap-1">
                  <div className="h-1.5 bg-white/[0.06] rounded-sm" />
                  <div className="h-1.5 bg-white/[0.06] rounded-sm w-[88%]" />
                  <div className="h-1.5 bg-white/[0.06] rounded-sm w-[70%]" />
                </div>
                <div className="font-mono text-[10.5px] text-wb-text-tertiary mt-1 pt-2 border-t border-dashed border-white/[0.06]">
                  <span className="text-[#ff80b5]">&lt;article&gt;</span> &gt;{' '}
                  <span className="text-[#ff80b5]">&lt;div&gt;</span>
                  <span className="text-[#8ad7ff]">.feature-icon</span> +{' '}
                  <span className="text-[#ff80b5]">&lt;h3&gt;</span> +{' '}
                  <span className="text-[#ff80b5]">&lt;p&gt;</span>
                </div>
              </div>
            </Field>

            {/* Props */}
            <Field label="Inferred props · 4 detected">
              <div className="bg-wb-surface-1 border border-white/[0.09] rounded-md overflow-hidden">
                {/* header row */}
                <div className="grid grid-cols-[110px_80px_1fr] gap-2.5 px-3 py-2 bg-black/[0.12] border-b border-white/[0.06] text-[10px] font-semibold text-wb-text-tertiary uppercase tracking-wider">
                  <div>Name</div>
                  <div>Type</div>
                  <div>Samples</div>
                </div>
                {FEATURE_CARD_PROPS.map((p, i) => (
                  <PropRow key={p.name} prop={p} last={i === FEATURE_CARD_PROPS.length - 1} />
                ))}
              </div>
              <div className="text-[10.5px] text-wb-text-tertiary mt-1.5">
                The <code className="font-mono text-wb-text-secondary">?</code> marker means the prop is optional. Rename a prop by editing the table.
              </div>
            </Field>

            {/* Occurrences */}
            <div>
              <div className="text-[10.5px] font-semibold text-wb-text-tertiary uppercase tracking-wider mb-2">
                Occurrences · 14 across 4 files
              </div>
              <div className="flex flex-col gap-1 font-mono text-[11.5px] text-wb-text-secondary">
                {FEATURE_CARD_OCCURRENCES.map((occ) => (
                  <div
                    key={occ.path}
                    className="flex items-center gap-2 px-2.5 py-1.5 bg-white/[0.02] rounded"
                  >
                    <CodeIcon size={12} className="text-wb-text-tertiary flex-shrink-0" />
                    <span className="flex-1">{occ.path}</span>
                    <span className="text-wb-text-tertiary">{occ.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function OpportunityRow({ opportunity }: { opportunity: Opportunity }) {
  const confidenceBadge =
    opportunity.confidence === 'high' ? (
      <Badge tone="complete" className="px-1.5 py-0.5 text-[10px]">
        High confidence
      </Badge>
    ) : (
      <Badge
        tone="pending"
        className="px-1.5 py-0.5 text-[10px] bg-wb-warning/10 text-[#ffd24d] border-wb-warning/30"
      >
        Medium
      </Badge>
    );

  return (
    <div
      className={`flex items-start gap-2.5 px-3 py-2.5 rounded-md cursor-pointer border mb-1 ${
        opportunity.active
          ? 'bg-wb-accent/10 border-wb-accent/30'
          : 'border-transparent hover:bg-white/[0.03]'
      }`}
    >
      <Checkbox checked={opportunity.selected} />
      <div className="w-7 h-7 rounded-md bg-wb-surface-2 inline-flex items-center justify-center text-wb-text-secondary flex-shrink-0">
        {opportunity.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={`text-[12.5px] text-wb-text-primary ${
            opportunity.active ? 'font-semibold' : 'font-medium'
          }`}
        >
          {opportunity.name}
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          {confidenceBadge}
          <span className="text-[11px] text-wb-text-tertiary font-mono">
            {opportunity.instances} instances · {opportunity.files} files
          </span>
        </div>
      </div>
    </div>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <div
      className={`w-4 h-4 rounded inline-flex items-center justify-center flex-shrink-0 mt-0.5 border ${
        checked ? 'bg-wb-accent border-wb-accent' : 'bg-transparent border-white/[0.16]'
      }`}
    >
      {checked && <Check size={10} strokeWidth={3} className="text-white" />}
    </div>
  );
}

function PropRow({ prop, last }: { prop: Prop; last: boolean }) {
  const typeBadgeTone =
    prop.type === 'image' ? 'ai' : prop.type === 'text' ? 'complete' : 'in-progress';

  return (
    <div
      className={`grid grid-cols-[110px_80px_1fr] gap-2.5 px-3 py-2.5 items-center ${
        !last ? 'border-b border-white/[0.06]' : ''
      }`}
    >
      <div className="font-mono text-[11.5px] text-[#ffd479]">
        {prop.name}
        {prop.optional && <span className="text-wb-text-tertiary italic ml-1">?</span>}
      </div>
      <div>
        <Badge tone={typeBadgeTone} className="px-1.5 py-0.5 text-[10px]">
          {prop.type}
        </Badge>
      </div>
      <div className="font-mono text-[11px] text-wb-text-secondary overflow-hidden text-ellipsis whitespace-nowrap">
        {prop.samples}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mb-4.5">
      <label className="text-[10.5px] font-semibold text-wb-text-tertiary uppercase tracking-wider block mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
