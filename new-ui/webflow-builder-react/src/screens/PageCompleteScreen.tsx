import { Check, Sparkles, Home, FileText } from 'lucide-react';
import { Panel } from '../components/Panel';
import { Button } from '../components/Button';
import { CompleteBadge } from '../components/Badge';
import { useNavigation } from '../context/NavigationContext';

export function PageCompleteScreen() {
  const { navigate } = useNavigation();

  return (
    <Panel onClose={() => navigate('section-list')}>
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-[520px] text-center">
          {/* Celebration mark with sparkles */}
          <div className="relative inline-block mb-5">
            <div
              className="w-20 h-20 rounded-[20px] inline-flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(0,208,156,0.12), rgba(0,208,156,0.04))',
                border: '1px solid rgba(0,208,156,0.32)',
                color: '#00d09c',
              }}
            >
              <Check size={40} strokeWidth={2.5} />
            </div>
            <div className="absolute -top-1 -right-2 text-wb-success opacity-60">
              <Sparkles size={14} fill="currentColor" strokeWidth={0} />
            </div>
            <div className="absolute bottom-1 -left-2.5 text-wb-success opacity-40">
              <Sparkles size={10} fill="currentColor" strokeWidth={0} />
            </div>
          </div>

          <h2 className="text-[24px] font-bold text-wb-text-primary tracking-tight mb-2.5">
            Home page is complete
          </h2>
          <p className="text-[13.5px] text-wb-text-secondary leading-relaxed mb-6">
            Every section has been addressed. The page is ready to review in Webflow.
          </p>

          {/* Summary card */}
          <div className="bg-wb-surface-1 border border-white/[0.09] rounded-[10px] mb-5.5 text-left overflow-hidden">
            <div className="flex items-center gap-3 px-4.5 py-4 border-b border-white/[0.06]">
              <div className="w-8 h-8 rounded-md bg-wb-success/10 text-wb-success flex items-center justify-center flex-shrink-0">
                <Home size={16} />
              </div>
              <div className="flex-1">
                <div className="text-[13.5px] font-semibold text-wb-text-primary">Home</div>
                <div className="text-[11px] text-wb-text-tertiary font-mono mt-0.5">app/page.tsx</div>
              </div>
              <CompleteBadge />
            </div>
            <div className="grid grid-cols-3 py-4">
              <Stat value="7" label="Built" color="text-wb-success" border />
              <Stat value="1" label="Skipped" color="text-wb-skipped" border />
              <Stat value="142" label="Styles" color="text-wb-text-primary" />
            </div>
          </div>

          {/* Next page suggestion */}
          <div
            className="rounded-lg px-4 py-3 mb-5.5 text-left flex items-center gap-3"
            style={{ background: 'rgba(20,110,245,0.04)', border: '1px solid rgba(20,110,245,0.32)' }}
          >
            <div className="w-7 h-7 rounded-md bg-wb-surface-2 inline-flex items-center justify-center text-wb-text-secondary flex-shrink-0">
              <FileText size={14} />
            </div>
            <div className="flex-1">
              <div className="text-[10.5px] text-wb-text-tertiary uppercase tracking-wider font-semibold mb-0.5">
                Next up
              </div>
              <div className="text-[12.5px] text-wb-text-primary font-medium">
                Pricing — 9 sections, 67% done
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-center">
            <Button variant="ghost" onClick={() => navigate('section-list')}>
              Back to sections
            </Button>
            <Button variant="primary" onClick={() => navigate('site-progress')}>
              View site progress
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function Stat({
  value,
  label,
  color,
  border,
}: {
  value: string;
  label: string;
  color: string;
  border?: boolean;
}) {
  return (
    <div className={`text-center ${border ? 'border-r border-white/[0.06]' : ''}`}>
      <div className={`text-[22px] font-bold tracking-tight ${color}`}>{value}</div>
      <div className="text-[10.5px] text-wb-text-tertiary uppercase tracking-wider font-semibold mt-0.5">
        {label}
      </div>
    </div>
  );
}
