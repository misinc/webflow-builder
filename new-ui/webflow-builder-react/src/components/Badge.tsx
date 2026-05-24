import type { ReactNode } from 'react';
import { Check, Sparkles, X } from 'lucide-react';
import { Spinner } from './Spinner';
import type { SectionStatus } from '../types';

export type BadgeTone = SectionStatus | 'ai';

export function Badge({
  tone,
  children,
  className = '',
}: {
  tone: BadgeTone;
  children?: ReactNode;
  className?: string;
}) {
  const tones: Record<BadgeTone, string> = {
    pending: 'bg-white/[0.04] text-wb-text-secondary border-white/[0.09]',
    'in-progress': 'bg-wb-accent/10 text-[#74a8ff] border-wb-accent/30',
    complete: 'bg-wb-success/10 text-[#43e2b8] border-wb-success/30',
    skipped: 'bg-wb-skipped/10 text-[#b0b0b0] border-wb-skipped/30',
    error: 'bg-wb-danger/10 text-[#ff8888] border-wb-danger/30',
    ai: 'bg-wb-ai/10 text-[#cf9bff] border-wb-ai/30',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10.5px] font-medium px-2 py-1 rounded border leading-none ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/* ===== Pre-built convenience badges ===== */

export function CompleteBadge() {
  return (
    <Badge tone="complete">
      <Check size={10} strokeWidth={3} />
      Complete
    </Badge>
  );
}

export function PendingBadge() {
  return <Badge tone="pending">Pending</Badge>;
}

export function SkippedBadge() {
  return <Badge tone="skipped">Skipped</Badge>;
}

export function InProgressBadge() {
  return (
    <Badge tone="in-progress">
      <Spinner size={8} thickness={1.5} />
      In progress
    </Badge>
  );
}

export function ErrorBadge() {
  return (
    <Badge tone="error">
      <X size={10} strokeWidth={2.5} />
      Failed
    </Badge>
  );
}

export function AiBadge({ children = 'AI working' }: { children?: ReactNode }) {
  return (
    <Badge tone="ai">
      <Sparkles size={10} fill="currentColor" strokeWidth={0} />
      {children}
    </Badge>
  );
}

/* ===== StatusDot ===== */

export function StatusDot({ status }: { status: SectionStatus | 'in-progress' }) {
  const tone: Record<SectionStatus | 'in-progress', string> = {
    pending: 'bg-wb-text-tertiary',
    'in-progress': 'bg-wb-accent ring-2 ring-wb-accent/30',
    complete: 'bg-wb-success',
    skipped: 'bg-wb-skipped',
    error: 'bg-wb-danger',
  };
  return <span className={`w-2 h-2 rounded-full inline-block flex-shrink-0 ${tone[status]}`} />;
}
