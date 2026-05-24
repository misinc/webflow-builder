import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'default' | 'danger-ghost';
type Size = 'default' | 'sm' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  dashed?: boolean;
  children: ReactNode;
}

const baseClasses =
  'inline-flex items-center justify-center gap-1.5 font-medium rounded-md border transition-colors whitespace-nowrap leading-none disabled:opacity-50 disabled:cursor-not-allowed';

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-wb-accent border-wb-accent text-white hover:enabled:bg-wb-accent-hover hover:enabled:border-wb-accent-hover',
  ghost:
    'bg-transparent border-white/[0.09] text-wb-text-secondary hover:enabled:bg-white/[0.04] hover:enabled:text-wb-text-primary hover:enabled:border-white/[0.16]',
  default:
    'bg-wb-surface-2 border-transparent text-wb-text-primary hover:enabled:bg-wb-surface-3',
  'danger-ghost':
    'bg-transparent border-wb-danger/30 text-[#ff8888] hover:enabled:bg-wb-danger/[0.06]',
};

const sizeClasses: Record<Size, string> = {
  default: 'h-8 px-3.5 text-[12.5px]',
  sm: 'h-6.5 px-2.5 text-[11.5px]',
  lg: 'h-10 px-6 text-[13px]',
};

export function Button({
  variant = 'default',
  size = 'default',
  block,
  dashed,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={[
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        block ? 'w-full' : '',
        dashed ? 'border-dashed border-white/[0.16] hover:enabled:border-white/[0.24]' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ===== IconButton ===== */

export function IconButton({
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`w-6 h-6 rounded inline-flex items-center justify-center text-wb-text-secondary hover:bg-white/[0.06] hover:text-wb-text-primary transition-colors ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
