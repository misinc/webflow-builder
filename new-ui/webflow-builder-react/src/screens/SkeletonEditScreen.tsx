import type { ReactNode } from 'react';
import { ChevronDown, Plus, Pencil, Trash2, ArrowUp, ArrowDown, Copy, X, Code as CodeIcon } from 'lucide-react';
import { Panel } from '../components/Panel';
import { Button, IconButton } from '../components/Button';
import { Stepper, buildStepper } from '../components/Stepper';
import { SectionDetailHeader } from '../components/Headers';
import { Badge } from '../components/Badge';
import { useNavigation } from '../context/NavigationContext';

export function SkeletonEditScreen() {
  const { navigate } = useNavigation();

  return (
    <Panel
      onClose={() => navigate('skeleton-review')}
      footer={
        <>
          <Button variant="ghost" onClick={() => navigate('skeleton-review')}>
            Discard changes
          </Button>
          <div className="flex-1" />
          <span className="text-[11px] text-wb-text-tertiary mr-2">1 element edited</span>
          <Button variant="primary" onClick={() => navigate('skeleton-review')}>
            Save changes
          </Button>
        </>
      }
    >
      <SectionDetailHeader
        eyebrow="Editing skeleton · Features grid"
        title="Edit skeleton tree"
        onBack={() => navigate('skeleton-review')}
        badge={
          <Badge tone="in-progress">
            <Pencil size={10} />
            Editing
          </Badge>
        }
      />

      <Stepper steps={buildStepper('skeleton')} />

      <div className="flex flex-1 min-h-0">
        {/* Tree */}
        <div className="w-1/2 border-r border-white/[0.09] flex flex-col min-w-0">
          <SplitHeader
            title="Skeleton tree"
            actions={
              <IconButton aria-label="Add element">
                <Plus size={13} />
              </IconButton>
            }
          />
          <div className="px-4 py-3 overflow-auto flex-1 font-mono text-[12px] text-wb-text-secondary leading-relaxed">
            <TreeNode tag="<section>" cls=".features-grid" hasChildren defaultOpen />
            <Children>
              <TreeNode tag="<div>" cls=".container" hasChildren defaultOpen />
              <Children>
                <TreeNode tag="<div>" cls=".section-header" hasChildren defaultOpen />
                <Children>
                  <TreeNode tag="<span>" cls=".eyebrow" text='"Features"' />
                  <TreeNode tag="<h2>" cls=".heading-xl" />
                  <TreeNode tag="<p>" cls=".subhead" />
                </Children>
                <TreeNode tag="<div>" cls=".grid-3-col" hasChildren defaultOpen />
                <Children>
                  <TreeNode tag="<article>" cls=".feature-card" text="× 6" hasChildren defaultOpen selected />
                  <Children>
                    <TreeNode tag="<div>" cls=".feature-icon" />
                    <TreeNode tag="<h3>" cls=".feature-title" />
                    <TreeNode tag="<p>" cls=".feature-desc" />
                  </Children>
                </Children>
              </Children>
            </Children>
          </div>
        </div>

        {/* Inspector */}
        <div className="w-1/2 flex flex-col min-w-0">
          <SplitHeader
            title="Element details"
            actions={
              <>
                <IconButton aria-label="Move up"><ArrowUp size={13} /></IconButton>
                <IconButton aria-label="Move down"><ArrowDown size={13} /></IconButton>
                <IconButton aria-label="Duplicate"><Copy size={13} /></IconButton>
                <IconButton aria-label="Delete" className="text-[#ff8888] hover:text-[#ff8888]">
                  <Trash2 size={13} />
                </IconButton>
              </>
            }
          />
          <div className="px-5 py-4.5 overflow-y-auto flex-1">
            <Inspector />
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

function TreeNode({
  tag,
  cls,
  text,
  hasChildren,
  defaultOpen,
  selected,
}: {
  tag: string;
  cls?: string;
  text?: string;
  hasChildren?: boolean;
  defaultOpen?: boolean;
  selected?: boolean;
}) {
  if (selected) {
    return (
      <div
        className="flex items-center gap-1.5 px-2 py-1 rounded text-wb-text-primary border border-wb-accent/30 bg-wb-accent/10 -mx-px -my-px"
      >
        <span className="w-3.5 text-wb-text-tertiary inline-flex flex-shrink-0">
          {hasChildren && defaultOpen && <ChevronDown size={10} />}
        </span>
        <span className="text-[#ff80b5]">{tag}</span>
        {cls && <span className="text-[#8ad7ff]">{cls}</span>}
        {text && <span className="text-wb-text-tertiary italic">{text}</span>}
        <span className="ml-auto flex gap-0.5">
          <button
            type="button"
            aria-label="Delete element"
            className="w-5 h-5 rounded inline-flex items-center justify-center text-wb-danger hover:bg-white/[0.06]"
          >
            <Trash2 size={11} />
          </button>
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer hover:bg-white/[0.03]">
      <span className="w-3.5 text-wb-text-tertiary inline-flex flex-shrink-0">
        {hasChildren && defaultOpen && <ChevronDown size={10} />}
      </span>
      <span className="text-[#ff80b5]">{tag}</span>
      {cls && <span className="text-[#8ad7ff]">{cls}</span>}
      {text && <span className="text-wb-text-tertiary italic">{text}</span>}
    </div>
  );
}

function Children({ children }: { children: ReactNode }) {
  return <div className="pl-4 ml-1.5 border-l border-dashed border-white/[0.08]">{children}</div>;
}

function Inspector() {
  return (
    <>
      {/* Breadcrumb */}
      <div className="font-mono text-[10.5px] text-wb-text-tertiary mb-5.5 leading-relaxed">
        <span className="text-[#ff80b5]">section</span><span className="text-[#8ad7ff]">.features-grid</span>
        <span className="text-wb-text-disabled mx-1">›</span>
        <span className="text-[#ff80b5]">div</span><span className="text-[#8ad7ff]">.container</span>
        <br />
        <span className="text-[#ff80b5]">div</span><span className="text-[#8ad7ff]">.grid-3-col</span>
        <span className="text-wb-text-disabled mx-1">›</span>
        <span className="text-wb-accent font-semibold">article.feature-card</span>
      </div>

      {/* Tag */}
      <Field label="Tag">
        <select
          className="w-full h-8 px-2.5 pr-7 rounded text-[12px] bg-wb-input border border-white/[0.09] text-wb-text-primary font-mono appearance-none"
          style={{
            backgroundImage:
              'linear-gradient(45deg, transparent 50%, #6e6e6e 50%), linear-gradient(135deg, #6e6e6e 50%, transparent 50%)',
            backgroundPosition: 'right 12px center, right 8px center',
            backgroundSize: '4px 4px',
            backgroundRepeat: 'no-repeat',
          }}
        >
          <option>&lt;article&gt;</option>
          <option>&lt;div&gt;</option>
          <option>&lt;section&gt;</option>
          <option>&lt;li&gt;</option>
          <option>&lt;a&gt;</option>
        </select>
      </Field>

      {/* Classes */}
      <Field label="Classes" help="Applied as a Webflow combo class. Press Enter to add.">
        <div className="flex flex-wrap gap-1 p-1.5 bg-wb-input border border-white/[0.09] rounded-md items-center min-h-[32px]">
          <Chip>feature-card</Chip>
          <input
            type="text"
            placeholder="Add class…"
            className="flex-1 bg-transparent border-none text-wb-text-primary font-mono text-[12px] min-w-[80px] px-1.5 py-1 outline-none"
          />
        </div>
      </Field>

      {/* Repeats toggle */}
      <div className="mb-4.5 p-3 px-3.5 bg-wb-surface-1 border border-white/[0.09] rounded-md">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <div className="text-[12.5px] text-wb-text-primary font-medium mb-0.5">Repeats from data</div>
            <div className="text-[11px] text-wb-text-tertiary leading-relaxed">
              Detected <span className="font-mono text-[#ffd479]">features.map()</span> in source. The skeleton renders 6 cards.
            </div>
          </div>
          <div className="w-8 h-[18px] bg-wb-accent rounded-full p-0.5 cursor-pointer flex justify-end flex-shrink-0 mt-0.5">
            <div className="w-3.5 h-3.5 bg-white rounded-full" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }} />
          </div>
        </div>
      </div>

      {/* Children */}
      <Field label="Children · 3 elements">
        <div className="flex flex-col gap-1 font-mono text-[11.5px] text-wb-text-secondary">
          <ChildItem tag="div" cls=".feature-icon" />
          <ChildItem tag="h3" cls=".feature-title" />
          <ChildItem tag="p" cls=".feature-desc" />
        </div>
        <Button variant="ghost" size="sm" block className="mt-2 justify-center">
          <Plus size={12} />
          Add child element
        </Button>
      </Field>

      {/* Source mapping */}
      <div className="mt-5.5 pt-3.5 border-t border-white/[0.06]">
        <div className="text-[10.5px] font-semibold text-wb-text-tertiary uppercase tracking-wider mb-2">
          Source mapping
        </div>
        <div className="flex items-center gap-2">
          <CodeIcon size={14} className="text-wb-text-tertiary flex-shrink-0" />
          <div className="font-mono text-[11.5px] text-wb-text-secondary">
            FeaturesGrid.tsx <span className="text-wb-text-tertiary">· line 12</span>
          </div>
        </div>
      </div>
    </>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: ReactNode;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-4.5">
      <label className="text-[10.5px] font-semibold text-wb-text-tertiary uppercase tracking-wider block mb-1.5">
        {label}
      </label>
      {children}
      {help && <div className="text-[10.5px] text-wb-text-tertiary mt-1.5">{help}</div>}
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 bg-[#8ad7ff]/10 border border-[#8ad7ff]/30 rounded px-2 py-1 text-[11.5px] font-mono text-[#8ad7ff]">
      {children}
      <button
        type="button"
        aria-label="Remove class"
        className="w-3.5 h-3.5 inline-flex items-center justify-center rounded text-wb-text-tertiary hover:bg-white/[0.1] hover:text-wb-text-primary"
      >
        <X size={10} strokeWidth={2.5} />
      </button>
    </span>
  );
}

function ChildItem({ tag, cls }: { tag: string; cls: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-white/[0.02]">
      <span className="text-wb-text-disabled">↳</span>
      <span className="text-[#ff80b5]">{tag}</span>
      <span className="text-[#8ad7ff]">{cls}</span>
    </div>
  );
}
