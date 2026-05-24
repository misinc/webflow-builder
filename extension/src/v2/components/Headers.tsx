import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';

/* ===== List header (small bar above lists) ===== */

export function ListHeader({ title, count }: { title: string; count?: ReactNode }) {
  return (
    <div className="px-5 py-3 flex items-center gap-2 bg-black/[0.12] border-b border-white/[0.06] flex-shrink-0">
      <div className="text-[11px] font-semibold text-wb-text-tertiary uppercase tracking-wider flex-1">
        {title}
      </div>
      {count && <span className="text-[11px] text-wb-text-tertiary tabular-nums">{count}</span>}
    </div>
  );
}

/* ===== Section detail header (used during build flow) ===== */

export function SectionDetailHeader({
  eyebrow,
  title,
  badge,
  onBack,
  trailing,
}: {
  eyebrow?: string;
  title: ReactNode;
  badge?: ReactNode;
  onBack?: () => void;
  trailing?: ReactNode;
}) {
  return (
    <div className="px-5 py-3.5 border-b border-white/[0.09] bg-wb-surface-1 flex items-center gap-3 flex-shrink-0">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="w-7 h-7 rounded-md bg-wb-surface-2 text-wb-text-secondary inline-flex items-center justify-center border border-white/[0.09] hover:bg-wb-surface-3 hover:text-wb-text-primary transition-colors flex-shrink-0"
          aria-label="Back"
        >
          <ChevronLeft size={14} />
        </button>
      )}
      <div className="flex-1 min-w-0">
        {eyebrow && (
          <div className="text-[10.5px] text-wb-text-tertiary uppercase tracking-wider font-semibold mb-0.5">
            {eyebrow}
          </div>
        )}
        <div className="text-[15px] font-semibold text-wb-text-primary flex items-center gap-2">
          {title}
        </div>
      </div>
      {badge && <div className="flex-shrink-0">{badge}</div>}
      {trailing}
    </div>
  );
}

/* ===== Page header (section list "currently editing" bar) ===== */

export function PageHeader({
  icon,
  label,
  name,
  meta,
  progressPercent,
  progressFromTo,
  progressDoneText,
  progressRemainingText,
  trailing,
}: {
  icon: ReactNode;
  label: string;
  name: ReactNode;
  meta?: ReactNode;
  progressPercent?: number;
  progressFromTo?: { from: string; to: string }; // gradient fill
  progressDoneText?: string;
  progressRemainingText?: string;
  trailing?: ReactNode;
}) {
  const fillStyle: React.CSSProperties = progressFromTo
    ? {
        width: `${progressPercent}%`,
        background: `linear-gradient(90deg, ${progressFromTo.from}, ${progressFromTo.to})`,
      }
    : { width: `${progressPercent}%` };

  return (
    <div className="px-5 py-3.5 bg-wb-surface-1 border-b border-white/[0.09] flex items-center gap-3">
      <div className="w-8 h-8 bg-wb-surface-2 rounded-md flex items-center justify-center text-wb-text-secondary flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10.5px] text-wb-text-tertiary uppercase tracking-wider font-semibold mb-1">
          {label}
        </div>
        <div className="text-sm font-semibold text-wb-text-primary flex items-center gap-2">
          {name}
        </div>
        {progressPercent != null && (
          <>
            <div className="w-full h-1 bg-white/[0.06] rounded-full mt-2.5 overflow-hidden">
              <div className="h-full rounded-full bg-wb-success" style={fillStyle} />
            </div>
            <div className="flex justify-between mt-1.5 text-[11px] text-wb-text-tertiary">
              <span>{progressDoneText}</span>
              <span>{progressRemainingText}</span>
            </div>
          </>
        )}
        {meta && <div className="mt-1">{meta}</div>}
      </div>
      {trailing}
    </div>
  );
}
