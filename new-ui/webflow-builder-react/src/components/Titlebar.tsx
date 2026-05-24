import { Maximize2, X } from 'lucide-react';

export function Titlebar({
  hideActions,
  onClose,
}: {
  hideActions?: boolean;
  onClose?: () => void;
}) {
  return (
    <div className="h-9 bg-wb-titlebar flex items-center px-3 gap-2.5 border-b border-white/[0.04] flex-shrink-0">
      <div className="w-[18px] h-[18px] rounded bg-gradient-to-br from-[#00ce86] to-[#00a872] flex items-center justify-center text-[#0a3a26] font-extrabold text-[10px]">
        WB
      </div>
      <div className="text-[12px] font-semibold text-wb-text-primary flex-1">Webflow Builder</div>
      {!hideActions && (
        <div className="flex gap-1">
          <button
            type="button"
            className="w-[22px] h-[22px] rounded flex items-center justify-center text-wb-text-tertiary hover:bg-white/[0.06] hover:text-wb-text-primary transition-colors"
            aria-label="Maximize"
          >
            <Maximize2 size={11} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-[22px] h-[22px] rounded flex items-center justify-center text-wb-text-tertiary hover:bg-white/[0.06] hover:text-wb-text-primary transition-colors"
            aria-label="Close"
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
