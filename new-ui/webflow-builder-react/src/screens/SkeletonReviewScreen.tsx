import type { ReactNode } from 'react';
import { ChevronDown, Plus, Pencil, ExternalLink, RefreshCw } from 'lucide-react';
import { Panel } from '../components/Panel';
import { Button, IconButton } from '../components/Button';
import { Stepper, buildStepper } from '../components/Stepper';
import { SectionDetailHeader } from '../components/Headers';
import { useNavigation } from '../context/NavigationContext';

export function SkeletonReviewScreen() {
  const { navigate } = useNavigation();

  return (
    <Panel
      onClose={() => navigate('section-list')}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => navigate('section-list')}>
            Skip this section
          </Button>
          <div className="flex-1" />
          <span className="text-[11px] text-wb-text-tertiary mr-2">18 elements · 9 classes</span>
          <Button variant="primary" onClick={() => navigate('applying-styles')}>
            Insert into Webflow
          </Button>
        </>
      }
    >
      <SectionDetailHeader
        eyebrow="Home · Section 4 of 8"
        title="Features grid"
        onBack={() => navigate('section-list')}
        trailing={
          <Button variant="ghost" size="sm">
            <RefreshCw size={12} />
            Regenerate
          </Button>
        }
      />

      <Stepper steps={buildStepper('skeleton')} />

      <div className="flex flex-1 min-h-0">
        {/* Tree */}
        <div className="w-1/2 border-r border-white/[0.09] flex flex-col min-w-0">
          <SplitHeader
            title="Skeleton tree"
            actions={
              <>
                <IconButton onClick={() => navigate('skeleton-edit')} aria-label="Add element">
                  <Plus size={13} />
                </IconButton>
                <IconButton onClick={() => navigate('skeleton-edit')} aria-label="Edit tree">
                  <Pencil size={13} />
                </IconButton>
              </>
            }
          />
          <div className="px-4 py-3 overflow-auto flex-1">
            <Tree />
          </div>
        </div>

        {/* Source code */}
        <div className="w-1/2 flex flex-col min-w-0">
          <SplitHeader
            title="Source · FeaturesGrid.tsx"
            actions={
              <IconButton aria-label="Open in GitHub">
                <ExternalLink size={13} />
              </IconButton>
            }
          />
          <div className="flex-1 overflow-auto p-4 font-mono text-[11.5px] text-wb-text-secondary bg-black/[0.18] leading-relaxed">
            <CodePreview />
          </div>
        </div>
      </div>
    </Panel>
  );
}

function SplitHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="px-4 py-2.5 border-b border-white/[0.09] text-[11px] font-semibold text-wb-text-tertiary uppercase tracking-wider flex items-center justify-between flex-shrink-0 bg-black/[0.12]">
      <span>{title}</span>
      {actions && <div className="flex gap-1">{actions}</div>}
    </div>
  );
}

function Tree() {
  return (
    <div className="font-mono text-[12px] text-wb-text-secondary leading-relaxed">
      <TreeNode tag="<section>" className=".features-grid" hasChildren defaultOpen />
      <Children>
        <TreeNode tag="<div>" className=".container" hasChildren defaultOpen />
        <Children>
          <TreeNode tag="<div>" className=".section-header" hasChildren defaultOpen />
          <Children>
            <TreeNode tag="<span>" className=".eyebrow" text='"Features"' />
            <TreeNode tag="<h2>" className=".heading-xl" />
            <TreeNode tag="<p>" className=".subhead" />
          </Children>
          <TreeNode tag="<div>" className=".grid-3-col" hasChildren defaultOpen selected />
          <Children>
            <TreeNode tag="<article>" className=".feature-card" text="× 6" hasChildren defaultOpen />
            <Children>
              <TreeNode tag="<div>" className=".feature-icon" />
              <TreeNode tag="<h3>" className=".feature-title" />
              <TreeNode tag="<p>" className=".feature-desc" />
            </Children>
          </Children>
        </Children>
      </Children>
    </div>
  );
}

function TreeNode({
  tag,
  className,
  text,
  hasChildren,
  defaultOpen,
  selected,
}: {
  tag: string;
  className?: string;
  text?: string;
  hasChildren?: boolean;
  defaultOpen?: boolean;
  selected?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer ${
        selected ? 'bg-wb-accent/10 text-wb-text-primary' : 'hover:bg-white/[0.03]'
      }`}
    >
      <span className="w-3.5 text-wb-text-tertiary inline-flex flex-shrink-0">
        {hasChildren && defaultOpen && <ChevronDown size={10} />}
      </span>
      <span className="text-[#ff80b5]">{tag}</span>
      {className && <span className="text-[#8ad7ff]">{className}</span>}
      {text && <span className="text-wb-text-tertiary italic">{text}</span>}
    </div>
  );
}

function Children({ children }: { children: ReactNode }) {
  return (
    <div className="pl-4 ml-1.5 border-l border-dashed border-white/[0.08]">{children}</div>
  );
}

function CodePreview() {
  const lines = [
    { n: 1, content: <Code><Tag>&lt;section</Tag> <Attr>className</Attr>=<Str>"features-grid"</Str><Tag>&gt;</Tag></Code> },
    { n: 2, content: <Code>&nbsp;&nbsp;<Tag>&lt;div</Tag> <Attr>className</Attr>=<Str>"container"</Str><Tag>&gt;</Tag></Code> },
    { n: 3, content: <Code>&nbsp;&nbsp;&nbsp;&nbsp;<Tag>&lt;header</Tag> <Attr>className</Attr>=<Str>"section-header"</Str><Tag>&gt;</Tag></Code> },
    { n: 4, content: <Code>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<Tag>&lt;span</Tag> <Attr>className</Attr>=<Str>"eyebrow"</Str><Tag>&gt;</Tag>Features<Tag>&lt;/span&gt;</Tag></Code> },
    { n: 5, content: <Code>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<Tag>&lt;h2</Tag> <Attr>className</Attr>=<Str>"heading-xl"</Str><Tag>&gt;</Tag></Code> },
    { n: 6, content: <Code>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Built for the way you work</Code> },
    { n: 7, content: <Code>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<Tag>&lt;/h2&gt;</Tag></Code> },
    { n: 8, content: <Code>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<Tag>&lt;p</Tag> <Attr>className</Attr>=<Str>"subhead"</Str><Tag>&gt;</Tag>...<Tag>&lt;/p&gt;</Tag></Code> },
    { n: 9, content: <Code>&nbsp;&nbsp;&nbsp;&nbsp;<Tag>&lt;/header&gt;</Tag></Code> },
    { n: 10, content: <Code>&nbsp;&nbsp;&nbsp;&nbsp;<Tag>&lt;div</Tag> <Attr>className</Attr>=<Str>"grid-3-col"</Str><Tag>&gt;</Tag></Code>, highlight: true },
    { n: 11, content: <Code>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{'{'}features.<Attr>map</Attr>((<Num>f</Num>) =&gt; (</Code> },
    { n: 12, content: <Code>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<Tag>&lt;article</Tag> <Attr>className</Attr>=<Str>"feature-card"</Str><Tag>&gt;</Tag></Code> },
    { n: 13, content: <Code>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<Tag>&lt;div</Tag> <Attr>className</Attr>=<Str>"feature-icon"</Str><Tag>&gt;</Tag>...<Tag>&lt;/div&gt;</Tag></Code> },
    { n: 14, content: <Code>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<Tag>&lt;h3</Tag> <Attr>className</Attr>=<Str>"feature-title"</Str><Tag>&gt;</Tag>...<Tag>&lt;/h3&gt;</Tag></Code> },
    { n: 15, content: <Code>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<Tag>&lt;p</Tag> <Attr>className</Attr>=<Str>"feature-desc"</Str><Tag>&gt;</Tag>...<Tag>&lt;/p&gt;</Tag></Code> },
    { n: 16, content: <Code>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<Tag>&lt;/article&gt;</Tag></Code> },
    { n: 17, content: <Code>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;))&#125;</Code> },
    { n: 18, content: <Code>&nbsp;&nbsp;&nbsp;&nbsp;<Tag>&lt;/div&gt;</Tag></Code> },
  ];

  return (
    <>
      {lines.map((l) => (
        <div
          key={l.n}
          className="flex gap-3.5"
          style={
            l.highlight
              ? {
                  background: 'rgba(20,110,245,0.1)',
                  borderLeft: '2px solid #146ef5',
                  paddingLeft: 6,
                  marginLeft: -8,
                }
              : undefined
          }
        >
          <span className="text-wb-text-disabled w-5 text-right select-none flex-shrink-0">{l.n}</span>
          <span>{l.content}</span>
        </div>
      ))}
    </>
  );
}

const Code = ({ children }: { children: ReactNode }) => <>{children}</>;
const Tag = ({ children }: { children: ReactNode }) => <span className="text-[#ff80b5]">{children}</span>;
const Attr = ({ children }: { children: ReactNode }) => <span className="text-[#ffd479]">{children}</span>;
const Str = ({ children }: { children: ReactNode }) => <span className="text-[#8ad7ff]">{children}</span>;
const Num = ({ children }: { children: ReactNode }) => <span className="text-[#b3e88c]">{children}</span>;
