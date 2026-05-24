import { FileText, Code as CodeIcon } from 'lucide-react';
import { Panel } from '../components/Panel';
import { Button } from '../components/Button';
import { PageHeader } from '../components/Headers';
import { Callout } from '../components/Callout';
import { Badge } from '../components/Badge';
import { useNavigation } from '../context/NavigationContext';

export function NotMappedScreen() {
  const { navigate } = useNavigation();

  return (
    <Panel
      onClose={() => navigate('section-list')}
      footer={
        <>
          <div className="flex-1" />
          <Button variant="ghost">Browse repo files</Button>
          <Button variant="ghost" onClick={() => navigate('site-progress')}>
            Skip this page
          </Button>
        </>
      }
    >
      <PageHeader
        icon={<FileText size={16} className="text-wb-warning" />}
        label="Currently editing"
        name={
          <>
            Changelog
            <span className="text-[11px] text-wb-text-tertiary font-normal font-mono">·  /changelog</span>
          </>
        }
        trailing={
          <Badge tone="pending" className="bg-wb-warning/10 text-[#ffd24d] border-wb-warning/30">
            Not mapped
          </Badge>
        }
      />

      <Callout
        tone="warning"
        title="No repo file is mapped to this page"
        className="mx-5 my-4"
      >
        Pick a file from your repo to use as the source of sections for the Changelog page.
      </Callout>

      <div className="px-5 pb-5">
        <div className="text-[11px] font-semibold text-wb-text-tertiary uppercase tracking-wider mb-2">
          Suggested matches
        </div>

        <SuggestedFile
          path="app/changelog/page.tsx"
          matchBadge={<Badge tone="ai">94% match</Badge>}
          meta="3 sections detected"
          primary
        />
        <SuggestedFile
          path="app/updates/page.tsx"
          matchBadge={<Badge tone="pending">61% match</Badge>}
          meta="4 sections detected"
        />
      </div>
    </Panel>
  );
}

function SuggestedFile({
  path,
  matchBadge,
  meta,
  primary,
}: {
  path: string;
  matchBadge: React.ReactNode;
  meta: string;
  primary?: boolean;
}) {
  const { navigate } = useNavigation();
  return (
    <div className="bg-wb-surface-1 border border-white/[0.09] rounded-md p-2.5 px-3 flex items-center gap-3 mb-1.5">
      <div className="w-7 h-7 rounded-md bg-wb-surface-2 flex items-center justify-center text-wb-text-secondary flex-shrink-0">
        <CodeIcon size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-wb-text-primary">{path}</div>
        <div className="flex items-center gap-2.5 mt-0.5 text-[11px] text-wb-text-tertiary">
          {matchBadge}
          <span>{meta}</span>
        </div>
      </div>
      <Button
        variant={primary ? 'primary' : 'ghost'}
        size="sm"
        onClick={() => navigate('section-list')}
      >
        Use this
      </Button>
    </div>
  );
}
