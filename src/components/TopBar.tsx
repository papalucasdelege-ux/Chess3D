import { RotateCcw, Save, Play, FastForward } from 'lucide-react';
import type { PieceColor, RoomResult } from '../shared/types';

export type DockTab = 'play' | 'training' | 'analysis' | 'replay';

interface TopBarProps {
  whiteName: string;
  blackName: string;
  whiteClockMs: number;
  blackClockMs: number;
  isTimed: boolean;
  turn: PieceColor;
  materialDiff: number;
  isCheck: boolean;
  gameResult: RoomResult | null;
  statusNote: string | null;
  angelCandidate: string | null;
  isThinkingAi: boolean;
  treeHoldLabel?: string | null;
  onSkipTreeHold?: () => void;
  isReplayMode: boolean;
  replayTitle?: string;
  onPrimaryAction: () => void;
  onSaveCurrentGame: () => void;
  onOpenReplayCurrent: () => void;
  canSaveCurrent: boolean;
  alreadySaved: boolean;
  onEnterTacticalTraining?: () => void;
}

export function formatClock(ms: number): string {
  const clamped = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatResultBanner(result: RoomResult): string {
  const reasonMap: Record<RoomResult['reason'], string> = {
    checkmate: 'Checkmate',
    stalemate: 'Stalemate',
    insufficient: 'Insufficient Material',
    threefold: 'Threefold Repetition',
    'fifty-move': '50-Move Rule',
    resignation: 'Resignation',
    timeout: 'Time Expired',
    agreement: 'Mutual Agreement',
  };
  const reasonText = reasonMap[result.reason] || result.reason;
  if (result.winner === 'draw') return `Draw · ${reasonText}`;
  return `${result.winner === 'w' ? 'White' : 'Black'} Wins · ${reasonText}`;
}

export function TopBar({
  whiteName,
  blackName,
  whiteClockMs,
  blackClockMs,
  isTimed,
  turn,
  materialDiff,
  isCheck,
  gameResult,
  statusNote,
  angelCandidate,
  isThinkingAi,
  treeHoldLabel,
  onSkipTreeHold,
  isReplayMode,
  replayTitle,
  onPrimaryAction,
  onSaveCurrentGame,
  onOpenReplayCurrent,
  canSaveCurrent,
  alreadySaved,
  onEnterTacticalTraining,
}: TopBarProps) {
  return (
    <div className="fixed top-1 sm:top-2.5 left-0 right-0 z-30 pointer-events-none flex flex-col items-center px-1.5 sm:px-3">
      {/* Unboxed Transparent Chess Clock, Player Names & Chess Angel Candidate Readout */}
      <div className="pointer-events-none flex flex-wrap items-center justify-center gap-x-2 sm:gap-x-3.5 gap-y-0.5 sm:gap-y-1 px-2 sm:px-3 py-0.5 sm:py-1 bg-transparent text-[10.5px] sm:text-xs text-[#d7dce5] [text-shadow:0_1px_5px_rgba(0,0,0,0.98)] max-w-[98vw] sm:max-w-[96vw]">
        {/* White Player & Clock */}
        <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
          <span
            className={`w-2.5 h-2.5 rounded-[2px] border border-white/35 bg-[#9d7340] ${
              turn === 'w' && !gameResult ? 'ring-1 ring-[#d6ae63]' : 'opacity-65'
            }`}
            aria-hidden="true"
          />
          <span
            className={
              turn === 'w' && !gameResult ? 'font-semibold text-[#f8f5ef]' : 'text-[#9aa3b2]'
            }
          >
            {whiteName}
          </span>
          {materialDiff > 0 && (
            <span className="font-mono-tabular text-[11px] text-[#c89d54]">
              +{materialDiff}
            </span>
          )}
          {isTimed && (
            <span
              className={`font-mono-tabular text-sm font-semibold tracking-tight ${
                whiteClockMs < 30000 && turn === 'w'
                  ? 'text-[#f87171]'
                  : turn === 'w' && !gameResult
                    ? 'text-[#ffffff]'
                    : 'text-[#b9c1cf]'
              }`}
            >
              {formatClock(whiteClockMs)}
            </span>
          )}
        </div>

        <span className="text-white/30" aria-hidden="true">
          ·
        </span>

        {/* Center Status & Chess Angel Candidate */}
        <div className="flex items-center gap-2 whitespace-nowrap shrink-0 text-[12px] font-medium">
          {isReplayMode ? (
            <span className="text-[#d6ae63]">{replayTitle || 'Game Replay'}</span>
          ) : gameResult ? (
            <span className="text-[#e3be78]">{formatResultBanner(gameResult)}</span>
          ) : treeHoldLabel ? (
            <span className="inline-flex items-center gap-2 text-[#7dd3fc]">
              <span>{treeHoldLabel}</span>
              {onSkipTreeHold && (
                <button
                  type="button"
                  onClick={onSkipTreeHold}
                  className="pointer-events-auto inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#141c28]/92 hover:bg-[#1e293b] border border-[#38bdf8]/45 text-[11px] font-medium text-[#e0f2fe] cursor-pointer"
                >
                  <FastForward className="w-3 h-3 text-[#38bdf8]" />
                  {isThinkingAi ? 'Play Move' : 'Clear'}
                </button>
              )}
            </span>
          ) : isThinkingAi ? (
            <span className="text-[#d6ae63]">Chess Angel calculating...</span>
          ) : isCheck ? (
            <span className="text-[#f87171]">
              {turn === 'w' ? 'White' : 'Black'} in Check
            </span>
          ) : statusNote ? (
            <span className="text-[#cbd2df]">{statusNote}</span>
          ) : (
            <span className="text-[#cbd2df]">
              {turn === 'w' ? 'White to Move' : 'Black to Move'}
            </span>
          )}

          {angelCandidate && !gameResult && !isThinkingAi && !treeHoldLabel && (
            <>
              <span className="text-white/30" aria-hidden="true">
                ·
              </span>
              <span className="font-mono-tabular text-[11px] text-[#e8c784]">
                {angelCandidate}
              </span>
            </>
          )}
        </div>

        <span className="text-white/30" aria-hidden="true">
          ·
        </span>

        {/* Black Clock & Player */}
        <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
          {isTimed && (
            <span
              className={`font-mono-tabular text-sm font-semibold tracking-tight ${
                blackClockMs < 30000 && turn === 'b'
                  ? 'text-[#f87171]'
                  : turn === 'b' && !gameResult
                    ? 'text-[#ffffff]'
                    : 'text-[#b9c1cf]'
              }`}
            >
              {formatClock(blackClockMs)}
            </span>
          )}
          {materialDiff < 0 && (
            <span className="font-mono-tabular text-[11px] text-[#c89d54]">
              +{Math.abs(materialDiff)}
            </span>
          )}
          <span
            className={
              turn === 'b' && !gameResult ? 'font-semibold text-[#f8f5ef]' : 'text-[#9aa3b2]'
            }
          >
            {blackName}
          </span>
          <span
            className={`w-2.5 h-2.5 rounded-[2px] border border-white/35 bg-[#150d08] ${
              turn === 'b' && !gameResult ? 'ring-1 ring-[#d6ae63]' : 'opacity-65'
            }`}
            aria-hidden="true"
          />
        </div>

        {onEnterTacticalTraining && !isReplayMode && (
          <>
            <span className="text-white/30" aria-hidden="true">
              ·
            </span>
            <button
              type="button"
              onClick={onEnterTacticalTraining}
              title="Switch from Casual Play to Tactical Training puzzles"
              className="pointer-events-auto px-2 py-0.5 rounded bg-[#141923]/90 hover:bg-[#1e2636] border border-[#d6ae63]/40 text-[11px] font-medium text-[#ebd096] hover:text-[#fff3d6] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#e3be78]"
            >
              Tactical Training
            </button>
          </>
        )}
      </div>

      {/* Compact Game Over Action Strip */}
      {gameResult && !isReplayMode && (
        <div className="pointer-events-auto mt-2 inline-flex items-center gap-3 px-4 py-2 rounded-md bg-[#141922]/95 border border-[#c89d54]/40 text-xs shadow-lg">
          <span className="font-medium text-[#f5efe2] whitespace-nowrap">
            {formatResultBanner(gameResult)}
          </span>
          <span className="text-white/20" aria-hidden="true">
            |
          </span>
          {canSaveCurrent && (
            <button
              type="button"
              onClick={onSaveCurrentGame}
              disabled={alreadySaved}
              className="inline-flex items-center gap-1.5 text-[#d6ae63] hover:text-[#ebd096] disabled:text-[#7f8a9c] font-medium transition-colors whitespace-nowrap cursor-pointer disabled:cursor-default"
            >
              <Save className="w-3.5 h-3.5" />
              {alreadySaved ? 'Saved to Archive' : 'Save Game'}
            </button>
          )}
          <button
            type="button"
            onClick={onOpenReplayCurrent}
            className="inline-flex items-center gap-1.5 text-[#e2e7f0] hover:text-white font-medium transition-colors whitespace-nowrap cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            Review Replay
          </button>
          <button
            type="button"
            onClick={onPrimaryAction}
            className="inline-flex items-center gap-1.5 text-[#e2e7f0] hover:text-white font-medium transition-colors whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Play Again
          </button>
        </div>
      )}
    </div>
  );
}
