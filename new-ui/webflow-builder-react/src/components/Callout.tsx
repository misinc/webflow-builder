import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle } from 'lucide-react';

type Tone = 'warning' | 'error' | 'ai';

const tones: Record<Tone, { container: string; icon: string }> = {
  warning: {
    container: 'bg-wb-warning/10 border-wb-warning/30 text-[#d4b163]',
    icon: 'text-[#ffd24d]',
  },
  error: {
    container: 'bg-wb-danger/10 border-wb-danger/30 text-[#c97c7c]',
    icon: 'text-[#ff8888]',
  },
  ai: {
    container: 'bg-wb-ai/10 border-wb-ai/30 text-[#a386c2]',
    icon: 'text-[#cf9bff]',
  },
};

export function Callout({
  tone,
  title,
  children,
  className = '',
  icon,
}: {
  tone: Tone;
  title: string;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  const styles = tones[tone];
  const defaultIcon =
    tone === 'warning' ? <AlertCircle size={16} /> : <AlertTriangle size={16} />;

  return (
    <div className={`flex gap-2.5 px-3.5 py-3 rounded-md border items-start ${styles.container} ${className}`}>
      <div className={`w-4.5 h-4.5 flex-shrink-0 inline-flex items-center justify-center mt-px ${styles.icon}`}>
        {icon ?? defaultIcon}
      </div>
      <div className="flex-1">
        <div className={`text-[12.5px] font-semibold mb-0.5 ${styles.icon}`}>{title}</div>
        <div className="text-[11.5px] leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
