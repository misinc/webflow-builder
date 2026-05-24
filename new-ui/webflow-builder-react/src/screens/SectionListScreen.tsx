import { useState } from 'react';
import { Home, RefreshCw, GripVertical, MoreVertical, ChevronRight, Clock, Sparkles, X } from 'lucide-react';
import { Panel, PanelContent } from '../components/Panel';
import { Button } from '../components/Button';
import { ListHeader, PageHeader } from '../components/Headers';
import { Badge, CompleteBadge, InProgressBadge, SkippedBadge, StatusDot } from '../components/Badge';
import { useNavigation } from '../context/NavigationContext';
import type { SectionStatus } from '../types';

interface Section {
  id: string;
  title: string;
  file: string;
  elements: number;
  status: SectionStatus | 'in-progress';
}

export function SectionListScreen() {
  const { navigate, featuresGridState } = useNavigation();
  const isPageComplete = featuresGridState === 'complete';
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Section list: 6 already complete + 1 skipped + Features grid (only remaining)
  // When Features grid completes, it flips to "complete" → page is done.
  const sections: Section[] = [
    { id: 'navigation', title: 'Navigation', file: 'components/Navigation.tsx', elements: 6, status: 'complete' },
    { id: 'hero', title: 'Hero section', file: 'components/Hero.tsx', elements: 12, status: 'complete' },
    { id: 'announcement', title: 'Announcement banner', file: 'components/AnnouncementBanner.tsx', elements: 3, status: 'skipped' },
    {
      id: 'features-grid',
      title: 'Features grid',
      file: 'components/FeaturesGrid.tsx',
      elements: 18,
      status: isPageComplete ? 'complete' : 'in-progress',
    },
    { id: 'testimonials', title: 'Testimonials carousel', file: 'components/Testimonials.tsx', elements: 14, status: 'complete' },
    { id: 'pricing', title: 'Pricing table', file: 'components/PricingTable.tsx', elements: 22, status: 'complete' },
    { id: 'cta', title: 'CTA section', file: 'components/CTA.tsx', elements: 7, status: 'complete' },
    { id: 'footer', title: 'Footer', file: 'components/Footer.tsx', elements: 11, status: 'complete' },
  ];

  return (
    <Panel>
      <PageHeader
        icon={<Home size={16} />}
        label="Currently editing"
        name={
          <>
            Home
            <span className="text-[11px] text-wb-text-tertiary font-normal font-mono">·  app/page.tsx</span>
          </>
        }
        progressPercent={isPageComplete ? 100 : 75}
        progressFromTo={isPageComplete ? undefined : { from: '#00d09c', to: '#146ef5' }}
        progressDoneText={isPageComplete ? '7 of 8 sections built' : '6 of 8 sections done'}
        progressRemainingText={isPageComplete ? '1 skipped · page complete' : '1 skipped · 1 remaining'}
        trailing={
          <Button variant="ghost" size="sm">
            <RefreshCw size={12} />
            Re-scan
          </Button>
        }
      />

      {/* Component opportunities suggestion banner */}
      {!bannerDismissed && !isPageComplete && (
        <div
          className="px-5 py-2.5 flex items-center gap-3 flex-shrink-0 border-b"
          style={{
            background: 'rgba(180,108,255,0.06)',
            borderColor: 'rgba(180,108,255,0.18)',
          }}
        >
          <div
            className="w-6.5 h-6.5 rounded-md inline-flex items-center justify-center flex-shrink-0"
            style={{
              background: 'rgba(180,108,255,0.14)',
              border: '1px solid rgba(180,108,255,0.32)',
              color: '#cf9bff',
            }}
          >
            <Sparkles size={13} fill="currentColor" strokeWidth={0} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] text-wb-text-primary font-medium">
              4 component opportunities detected
            </div>
            <div className="text-[11px] text-wb-text-tertiary mt-px">
              Reusable patterns worth considering as Webflow Components for easier site maintenance.
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('component-opportunities')}
            className="h-6.5 px-2.5 text-[11.5px] font-medium rounded border inline-flex items-center justify-center transition-colors"
            style={{
              borderColor: 'rgba(180,108,255,0.32)',
              color: '#cf9bff',
              background: 'transparent',
            }}
          >
            Review
          </button>
          <button
            type="button"
            onClick={() => setBannerDismissed(true)}
            aria-label="Dismiss"
            className="w-6 h-6 rounded inline-flex items-center justify-center text-wb-text-tertiary hover:bg-white/[0.06] hover:text-wb-text-primary transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      )}

      <PanelContent>
        <ListHeader title="Sections in this page" count="8 detected" />

        <div className="px-3 py-2">
          {sections.map((s) => (
            <SectionRow key={s.id} section={s} />
          ))}
        </div>
      </PanelContent>

      {/* Footer */}
      <div className="border-t border-white/[0.09] px-5 py-3 bg-black/20 flex gap-2 items-center flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={() => navigate('site-progress')}>
          <Clock size={12} />
          Site progress
        </Button>
        <div className="flex-1" />
        <Button
          variant="primary"
          onClick={() => navigate(isPageComplete ? 'page-complete' : 'generating-skeleton')}
        >
          {isPageComplete ? 'See page summary' : 'Continue building Features grid'}
        </Button>
      </div>
    </Panel>
  );
}

function SectionRow({ section }: { section: Section }) {
  const { navigate, featuresGridState } = useNavigation();
  const isActive = section.status === 'in-progress';
  const clickable = isActive;

  function handleClick() {
    if (clickable) navigate('generating-skeleton');
  }

  return (
    <div
      onClick={handleClick}
      className={`flex items-center gap-3 px-3 py-3 rounded-md border ${
        isActive
          ? 'bg-wb-accent/10 border-wb-accent/30 cursor-pointer'
          : 'border-transparent hover:bg-wb-surface-1 hover:border-white/[0.09]'
      }`}
    >
      <div className="w-[18px] text-wb-text-disabled flex justify-center flex-shrink-0">
        <GripVertical size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[13px] font-medium text-wb-text-primary mb-0.5">
          <StatusDot status={section.status} />
          {section.title}
          {renderBadge(section.status)}
        </div>
        <div className="text-[11.5px] text-wb-text-tertiary font-mono">
          {section.file} · {section.elements} elements
        </div>
      </div>
      <div className={`flex-shrink-0 ${isActive ? 'text-wb-accent' : 'text-wb-text-tertiary'}`}>
        {section.status === 'complete' || section.status === 'skipped' ? (
          <MoreVertical size={16} />
        ) : (
          <ChevronRight size={16} />
        )}
      </div>
    </div>
  );
}

function renderBadge(status: SectionStatus | 'in-progress') {
  switch (status) {
    case 'complete':
      return <CompleteBadge />;
    case 'in-progress':
      return <InProgressBadge />;
    case 'skipped':
      return <SkippedBadge />;
    case 'pending':
      return <Badge tone="pending">Pending</Badge>;
    case 'error':
      return <Badge tone="error">Failed</Badge>;
    default:
      return null;
  }
}
