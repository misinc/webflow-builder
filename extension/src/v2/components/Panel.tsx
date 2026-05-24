import type { ReactNode } from 'react';

export interface PanelProps {
  children: ReactNode;
  footer?: ReactNode;
  /** Legacy prop kept for compatibility while the V2 shell renders inside Webflow chrome. */
  hideTitlebarActions?: boolean;
  onClose?: () => void;
}

/**
 * Outer extension panel content area.
 * Webflow already provides the extension window chrome and sizing, so the
 * iframe should fill the available space instead of rendering its own modal shell.
 */
export function Panel({ children, footer }: PanelProps) {
  return (
    <div
      className="w-full h-full bg-wb-panel overflow-hidden flex flex-col text-[13px] text-wb-text-primary leading-snug"
    >
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">{children}</div>
      {footer && (
        <div className="border-t border-white/[0.09] px-5 py-3 bg-black/20 flex gap-2 items-center flex-shrink-0">
          {footer}
        </div>
      )}
    </div>
  );
}

/** A scrollable body region that fills the panel between header and footer. */
export function PanelContent({ children }: { children: ReactNode }) {
  return <div className="flex-1 overflow-y-auto min-h-0">{children}</div>;
}
