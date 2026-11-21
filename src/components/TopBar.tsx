import { RotateCcw, Save, Play } from 'lucide-react';
import type { GameMode, PieceColor, RoomResult } from '../shared/types';

export type DockTab = 'play' | 'multiplayer' | 'analysis' | 'replay' | 'skins';

interface TopBarProps {
  activeTab: DockTab;
  onSelectTab: (tab: DockTab) => void;
  gameMode: GameMode;
  whiteName: string;
  blackName: string;
  whiteClockMs: number;
  blackClockMs: number;
  isTimed: boolean;
  turn: PieceColor;
  materialDiff: number; // positive = white ahead
  isCheck: boolean;
  gameResult: RoomResult | null;
  statusNote: string | null;
  isThinkingAi: boolean;
  isReplayMode: boolean;
  replayTitle?: string;
  onPrimaryAction: () => void;
  onSaveCurrentGame: () => void;
  onOpenReplayCurrent: () => void;
  canSaveCurrent: boolean;
  alreadySaved: boolean;
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

const NAV_TABS: { id: DockTab; label: string }[] = [
  { id: 'play', label: 'Play' },
  { id: 'multiplayer', label: 'Multiplayer' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'replay', label: 'Replay' },
  { id: 'skins', label: 'Skins' },
];

export function TopBar({
  activeTab,
  onSelectTab,
  gameMode,
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
  isThinkingAi,
  isReplayMode,
  replayTitle,
  onPrimaryAction,
  onSaveCurrentGame,
  onOpenReplayCurrent,
  canSaveCurrent,
  alreadySaved,
}: TopBarProps) {
  return (
    <div className="fixed top-0 left-0 right-0 z-30 pointer-events-none">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="pointer-events-auto flex items-center justify-between gap-8 px-6 h-14 bg-[#0f1319]/92 border-b border-white/10">
        {/* Zone 1: Single text element wordmark */}
        <span className="font-display text-lg font-medium tracking-tight text-[#f5f0e6] whitespace-nowrap shrink-0">
          Chess3D
        </span>

        {/* Zone 2: 5 concise single-line text nav links */}
        <nav className="hidden md:flex items-center gap-7 text-[13px] font-medium">
          {NAV_TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className={`relative py-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:text-[#e8c37c] ${
                  active ? 'text-[#f6efe2]' : 'text-[#9aa3b2] hover:text-[#e5e0d5]'
                }`}
              >
                {tab.label}
                {active && (
                  <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-[#c89d54]" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onPrimaryAction}
            className="px-4 py-1.5 text-xs font-semibold text-[#111419] bg-[#d6ae63] hover:bg-[#e3be78] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e3be78]"
          >
            {isReplayMode ? 'Exit Replay' : gameMode === 'multiplayer' ? 'Leave Room' : 'New Match'}
          </button>
        </div>
      </header>

      {/* Discreet Unboxed Match Clock & Turn Strip */}
      <div className="flex flex-col items-center mt-2.5 px-4 gap-2">
        <div className="pointer-events-auto inline-flex items-center gap-3 px-4 py-1.5 rounded-md bg-[#11151d]/90 border border-white/10 text-xs text-[#d7dce5] shadow-md max-w-[94vw] overflow-x-auto">
          {/* White */}
          <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
            <span
              className={`w-2.5 h-2.5 rounded-[2px] border border-white/30 bg-[#f2ead9] ${
                turn === 'w' && !gameResult ? 'ring-1 ring-[#d6ae63]' : 'opacity-65'
              }`}
              aria-hidden="true"
            />
            <span className={turn === 'w' && !gameResult ? 'font-semibold text-[#f8f5ef]' : 'text-[#9aa3b2]'}>
              {whiteName}
            </span>
            {materialDiff > 0 && (
              <span className="font-mono-tabular text-[11px] text-[#c89d54]">+{materialDiff}</span>
            )}
            {isTimed && (
              <span
                className={`font-mono-tabular font-semibold ${
                  whiteClockMs < 30000 && turn === 'w' ? 'text-[#f87171]' : 'text-[#f3f1ec]'
                }`}
              >
                {formatClock(whiteClockMs)}
              </span>
            )}
          </div>

          <span className="text-white/25" aria-hidden="true">·</span>

          {/* Center Status */}
          <div className="whitespace-nowrap shrink-0 text-[12px] font-medium">
            {isReplayMode ? (
              <span className="text-[#d6ae63]">{replayTitle || 'Game Replay'}</span>
            ) : gameResult ? (
              <span className="text-[#e3be78]">{formatResultBanner(gameResult)}</span>
            ) : isThinkingAi ? (
              <span className="text-[#c89d54]">Engine calculating...</span>
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
          </div>

          <span className="text-white/25" aria-hidden="true">·</span>

          {/* Black */}
          <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
            {isTimed && (
              <span
                className={`font-mono-tabular font-semibold ${
                  blackClockMs < 30000 && turn === 'b' ? 'text-[#f87171]' : 'text-[#f3f1ec]'
                }`}
              >
                {formatClock(blackClockMs)}
              </span>
            )}
            {materialDiff < 0 && (
              <span className="font-mono-tabular text-[11px] text-[#c89d54]">+{Math.abs(materialDiff)}</span>
            )}
            <span className={turn === 'b' && !gameResult ? 'font-semibold text-[#f8f5ef]' : 'text-[#9aa3b2]'}>
              {blackName}
            </span>
            <span
              className={`w-2.5 h-2.5 rounded-[2px] border border-white/30 bg-[#1c2028] ${
                turn === 'b' && !gameResult ? 'ring-1 ring-[#d6ae63]' : 'opacity-65'
              }`}
              aria-hidden="true"
            />
          </div>
        </div>

        {/* Compact Game Over Action Strip (keeps center 3D board completely unobstructed) */}
        {gameResult && !isReplayMode && (
          <div className="pointer-events-auto inline-flex items-center gap-3 px-4 py-2 rounded-md bg-[#141922]/95 border border-[#c89d54]/40 text-xs shadow-lg">
            <span className="font-medium text-[#f5efe2] whitespace-nowrap">
              {formatResultBanner(gameResult)}
            </span>
            <span className="text-white/20" aria-hidden="true">|</span>
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
    </div>
  );
}
