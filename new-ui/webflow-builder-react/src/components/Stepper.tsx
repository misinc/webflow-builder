import { Check } from 'lucide-react';

export type StepState = 'pending' | 'active' | 'done' | 'error';

export interface Step {
  label: string;
  state: StepState;
}

/**
 * 3-step progress indicator: Skeleton → Style → Done.
 * Also used in onboarding with custom labels (Connect → Choose repo → Map pages).
 */
export function Stepper({ steps }: { steps: Step[] }) {
  return (
    <div className="flex items-center gap-1.5 px-5 py-3 border-b border-white/[0.09] bg-wb-surface-1 text-[11.5px] text-wb-text-tertiary flex-shrink-0">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center gap-1.5">
          <StepNode step={step} index={i + 1} />
          {i < steps.length - 1 && <div className="w-3.5 h-px bg-white/[0.09]" />}
        </div>
      ))}
    </div>
  );
}

function StepNode({ step, index }: { step: Step; index: number }) {
  const dotClasses =
    step.state === 'active'
      ? 'bg-wb-accent text-white'
      : step.state === 'done'
        ? 'bg-wb-success text-[#06281f]'
        : step.state === 'error'
          ? 'bg-wb-danger text-white'
          : 'bg-wb-surface-3 text-wb-text-tertiary';

  const labelClasses =
    step.state === 'active'
      ? 'text-wb-text-primary font-medium'
      : step.state === 'error'
        ? 'text-[#ff8888] font-medium'
        : '';

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`w-[18px] h-[18px] rounded-full inline-flex items-center justify-center text-[10px] font-semibold ${dotClasses}`}
      >
        {step.state === 'done' ? <Check size={10} strokeWidth={3} /> : step.state === 'error' ? '!' : index}
      </span>
      <span className={labelClasses}>{step.label}</span>
    </div>
  );
}

/** Convenience builder for the build-flow stepper. */
export function buildStepper(active: 'skeleton' | 'style' | 'done', erroredAt?: 'skeleton'): Step[] {
  const idx = active === 'skeleton' ? 0 : active === 'style' ? 1 : 2;
  return ['Skeleton', 'Style', 'Done'].map((label, i) => {
    if (erroredAt === 'skeleton' && i === 0) return { label, state: 'error' };
    if (i < idx) return { label, state: 'done' };
    if (i === idx) return { label, state: 'active' };
    return { label, state: 'pending' };
  });
}
