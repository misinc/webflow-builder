import type { ReactNode } from 'react';
import { Github, GitBranch, Pencil, ExternalLink } from 'lucide-react';
import { Panel, PanelContent } from '../components/Panel';
import { Button } from '../components/Button';
import { Tabs } from './SiteProgressScreen';
import { useNavigation } from '../context/NavigationContext';

export function SettingsScreen() {
  const { navigate } = useNavigation();

  return (
    <Panel onClose={() => navigate('section-list')}>
      <Tabs active="settings" />

      <PanelContent>
        <Section heading="GitHub connection">
          <Row
            icon={
              <div className="w-8 h-8 rounded-full bg-wb-surface-2 flex items-center justify-center">
                <Github size={18} fill="currentColor" strokeWidth={0} className="text-wb-text-primary" />
              </div>
            }
            label="@maya-chen"
            sub="Connected since May 18, 2026"
            trailing={
              <Button variant="ghost" size="sm" onClick={() => navigate('welcome')}>
                Switch account
              </Button>
            }
          />
        </Section>

        <Section heading="Repository">
          <Row
            icon={
              <div className="w-8 h-8 rounded-md bg-wb-surface-2 flex items-center justify-center text-wb-text-secondary">
                <GitBranch size={16} />
              </div>
            }
            label="acme-studio / next-marketing-site"
            sub={
              <>
                Branch <span className="font-mono text-wb-text-secondary">main</span> · last synced
                4 minutes ago
              </>
            }
            trailing={
              <Button variant="ghost" size="sm" onClick={() => navigate('choose-repo')}>
                Change repo
              </Button>
            }
          />
          <Row
            icon={<div className="w-8 h-8 flex-shrink-0" />}
            label="Repository access"
            sub={
              <>
                Webflow Builder can read{' '}
                <strong className="text-wb-text-primary font-medium">1 repository</strong> via your GitHub App installation.
              </>
            }
            trailing={
              <Button variant="ghost" size="sm">
                <ExternalLink size={14} />
                Manage on GitHub
              </Button>
            }
          />
        </Section>

        <Section heading="Page mapping · 4 of 5 mapped">
          <div className="text-[11.5px] text-wb-text-secondary mb-3">
            Each Webflow page is mapped to a file in your repo. Webflow Builder uses this to know
            which sections to suggest.
          </div>
          <Button variant="ghost" block onClick={() => navigate('map-pages')}>
            <Pencil size={14} />
            Edit page mapping
          </Button>
        </Section>

        <Section heading="Danger zone">
          <div className="flex items-center gap-3 py-2.5">
            <div className="flex-1">
              <div className="text-[12.5px] text-wb-text-primary">Uninstall GitHub app</div>
              <div className="text-[11.5px] text-wb-text-tertiary mt-0.5">
                Revokes Webflow Builder's access to your repositories. Existing Webflow work isn't
                affected.
              </div>
            </div>
            <Button variant="danger-ghost" size="sm" onClick={() => navigate('welcome')}>
              Uninstall
            </Button>
          </div>
        </Section>
      </PanelContent>
    </Panel>
  );
}

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="px-5 py-4 border-b border-white/[0.06] last:border-b-0">
      <div className="text-[11px] font-semibold text-wb-text-tertiary uppercase tracking-wider mb-3">
        {heading}
      </div>
      {children}
    </div>
  );
}

function Row({
  icon,
  label,
  sub,
  trailing,
}: {
  icon: ReactNode;
  label: ReactNode;
  sub: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      {icon}
      <div className="flex-1">
        <div className="text-[12.5px] text-wb-text-primary">{label}</div>
        <div className="text-[11.5px] text-wb-text-tertiary mt-0.5">{sub}</div>
      </div>
      {trailing}
    </div>
  );
}
