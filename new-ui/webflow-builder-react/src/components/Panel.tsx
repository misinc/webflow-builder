import type { ReactNode } from 'react';
import { Titlebar } from './Titlebar';

export interface PanelProps {
  children: ReactNode;
  footer?: ReactNode;
  /** Hide window controls in the titlebar (e.g. on screens with no close action). */
  hideTitlebarActions?: boolean;
  onClose?: () => void;
}

/**
 * Outer extension panel chrome — 800×600 with the dark titlebar.
 * Matches Webflow's `webflow.setExtensionSize('large')` dimensions.
 */
export function Panel({ children, footer, hideTitlebarActions, onClose }: PanelProps) {
  return (
    <div
      className="w-[800px] h-[600px] bg-wb-panel rounded-lg overflow-hidden flex flex-col text-[13px] text-wb-text-primary leading-snug"
      style={{
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.04), 0 30px 60px -20px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.6)',
      }}
    >
      <Titlebar hideActions={hideTitlebarActions} onClose={onClose} />
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
