import { evalToWhiteWinPercent, formatEvalLabel } from '../chess/engine';
import type { AnalysisSnapshot } from '../shared/types';

interface EvalBarProps {
  visible: boolean;
  analysis: AnalysisSnapshot | null;
  flipped: boolean;
}

export function EvalBar({ visible, analysis, flipped }: EvalBarProps) {
  if (!visible) return null;

  const topLine = analysis?.lines[0];
  const scoreCp = topLine?.scoreCp ?? 0;
  const mateIn = topLine?.mateIn ?? null;
  const whitePct = evalToWhiteWinPercent(scoreCp, mateIn);
  const label = formatEvalLabel(scoreCp, mateIn);

  // When flipped (Black at bottom), White bar fills from top; otherwise White fills from bottom
  const whiteHeight = `${whitePct.toFixed(1)}%`;

  return (
    <aside
      aria-label="Position evaluation"
      className="fixed left-4 top-1/2 -translate-y-1/2 z-20 hidden sm:flex flex-col items-center gap-2 pointer-events-none select-none"
    >
      <div className="w-3.5 h-[min(460px,54vh)] rounded-sm overflow-hidden border border-white/15 bg-[#1b1f27] relative shadow-lg">
        <div
          className="absolute left-0 right-0 bg-[#ebe6dc] transition-transform duration-300 ease-out"
          style={{
            height: '100%',
            top: flipped ? 0 : undefined,
            bottom: flipped ? undefined : 0,
            transformOrigin: flipped ? 'top center' : 'bottom center',
            transform: `scaleY(${whitePct / 100})`,
          }}
        />
        {/* Midpoint 0.0 equilibrium tick */}
        <div className="absolute left-0 right-0 top-1/2 h-px bg-[#c89d54]/70" />
      </div>
      <span
        className="font-mono-tabular text-[11px] font-medium text-[#e6e1d7] tracking-tight"
        title={`White advantage: ${whiteHeight}`}
      >
        {label}
      </span>
    </aside>
  );
}
