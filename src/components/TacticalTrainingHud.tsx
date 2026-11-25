import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Lightbulb,
  ListChecks,
  RotateCcw,
  Swords,
  XCircle,
} from 'lucide-react';
import {
  TACTICAL_DIFFICULTY_LABELS,
  TACTICAL_PUZZLES,
  TACTICAL_THEME_LABELS,
  computeTacticalSpeedMultiplier,
  formatSolveDuration,
  formatTacticalCountdown,
  type TacticalPuzzle,
  type TacticalSolveAward,
  type TacticalTrainingStats,
} from '../chess/tacticalPuzzles';

export type TacticalRunStatus =
  | 'solving'
  | 'opponent-replying'
  | 'wrong'
  | 'solved'
  | 'solution-shown';

interface TacticalTrainingHudProps {
  puzzle: TacticalPuzzle;
  status: TacticalRunStatus;
  solverStepNumber: number;
  totalSolverSteps: number;
  feedbackText: string | null;
  lastRatingDelta: number | null;
  lastSolveAward: TacticalSolveAward | null;
  timeLimitMs: number;
  remainingMs: number;
  hintStage: 0 | 1 | 2;
  stats: TacticalTrainingStats;
  angelVisible: boolean;
  onPrevPuzzle: () => void;
  onNextPuzzle: () => void;
  onRetryPuzzle: () => void;
  onRequestHint: () => void;
  onShowSolution: () => void;
  onOpenTrainingDeck: () => void;
  onSwitchToCasualPlay: () => void;
}

export function TacticalTrainingHud({
  puzzle,
  status,
  solverStepNumber,
  totalSolverSteps,
  feedbackText,
  lastRatingDelta,
  lastSolveAward,
  timeLimitMs,
  remainingMs,
  hintStage,
  stats,
  angelVisible,
  onPrevPuzzle,
  onNextPuzzle,
  onRetryPuzzle,
  onRequestHint,
  onShowSolution,
  onOpenTrainingDeck,
  onSwitchToCasualPlay,
}: TacticalTrainingHudProps) {
  const uniqueSolvedCount = Object.values(stats.puzzleRecords).filter((r) => r.solved).length;
  const isFinished = status === 'solved' || status === 'solution-shown';
  const isInteractive = status === 'solving' || status === 'wrong';

  const speedTier = computeTacticalSpeedMultiplier(remainingMs, timeLimitMs);
  const ratio = timeLimitMs > 0 ? Math.min(1, Math.max(0, remainingMs / timeLimitMs)) : 0;
  const isLowTime = !isFinished && remainingMs > 0 && remainingMs < 10_000;
  const isTimedOut = !isFinished && remainingMs <= 0;

  const timerTextColor = isFinished
    ? 'text-[#aeb7c6]'
    : isTimedOut || isLowTime
      ? 'text-[#fca5a5]'
      : speedTier.tier === 'lightning'
        ? 'text-[#6ee7b7]'
        : speedTier.tier === 'swift'
          ? 'text-[#f0d192]'
          : 'text-[#f3efe4]';

  const multiplierTextColor = isFinished
    ? 'text-[#9aa3b2]'
    : speedTier.tier === 'lightning'
      ? 'text-[#34d399]'
      : speedTier.tier === 'swift'
        ? 'text-[#e3be78]'
        : speedTier.tier === 'sharp'
          ? 'text-[#7dd3fc]'
          : speedTier.tier === 'overtime'
            ? 'text-[#f87171]'
            : 'text-[#cbd2df]';

  const barFillClass = isTimedOut || isLowTime
    ? 'bg-[#ef4444]'
    : speedTier.tier === 'lightning'
      ? 'bg-[#34d399]'
      : speedTier.tier === 'swift'
        ? 'bg-[#d6ae63]'
        : speedTier.tier === 'sharp'
          ? 'bg-[#38bdf8]'
          : 'bg-[#9aa3b2]';

  return (
    <div
      className={`fixed top-1.5 sm:top-2.5 left-0 right-0 z-30 pointer-events-none flex flex-col items-center px-2 sm:px-4 ${
        angelVisible ? 'lg:pr-[340px]' : ''
      }`}
    >
      <div className="pointer-events-auto w-full max-w-[820px] rounded-lg bg-[#11151d]/95 border border-white/12 shadow-xl px-3 py-2 sm:px-4 sm:py-2.5 flex flex-col gap-1.5">
        {/* Row 1: Unboxed Puzzle Metadata + Countdown & Speed Multiplier + Mode Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs min-w-0">
            <span className="font-mono-tabular text-[#d6ae63] font-semibold whitespace-nowrap shrink-0">
              {String(puzzle.index).padStart(2, '0')}.
            </span>
            <span className="font-semibold text-[#f5f0e6] truncate max-w-[170px] sm:max-w-[230px]">
              {puzzle.title}
            </span>
            <span className="text-white/25" aria-hidden="true">
              ·
            </span>
            <span className="text-[#aeb7c6] whitespace-nowrap shrink-0">
              {TACTICAL_THEME_LABELS[puzzle.theme]}
            </span>
            <span className="text-white/25 hidden sm:inline" aria-hidden="true">
              ·
            </span>
            <span className="text-[#9aa3b2] hidden sm:inline whitespace-nowrap shrink-0">
              {TACTICAL_DIFFICULTY_LABELS[puzzle.difficulty]}{' '}
              <span className="font-mono-tabular">({puzzle.rating})</span>
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Live Countdown Clock + Speed Multiplier */}
            <div
              className="flex items-center gap-1.5 text-xs font-mono-tabular whitespace-nowrap"
              aria-label={`Puzzle countdown ${formatTacticalCountdown(remainingMs)}, speed multiplier ${speedTier.multiplier.toFixed(1)}x ${speedTier.label}`}
            >
              <span
                className={`inline-flex items-center gap-1.5 origin-center ${
                  isLowTime ? 'tactical-timer-urgent' : ''
                }`}
              >
                <Clock className={`w-3.5 h-3.5 shrink-0 ${timerTextColor}`} />
                <span className={`font-semibold ${timerTextColor}`}>
                  {formatTacticalCountdown(remainingMs)}
                </span>
              </span>
              <span className="text-white/25" aria-hidden="true">
                ·
              </span>
              <span className={`text-[11px] font-semibold ${multiplierTextColor}`}>
                {speedTier.multiplier.toFixed(1)}x {speedTier.label}
              </span>
            </div>

            <div className="hidden md:flex items-center gap-2 text-[11px] text-[#9aa3b2] font-mono-tabular whitespace-nowrap border-l border-white/10 pl-2.5">
              <span>
                Score{' '}
                <strong className="text-[#e3be78] font-semibold">
                  {stats.totalScore.toLocaleString()}
                </strong>
              </span>
              <span className="text-white/25" aria-hidden="true">
                ·
              </span>
              <span>
                Rating <strong className="text-[#f3efe4] font-semibold">{stats.rating}</strong>
              </span>
              <span className="text-white/25" aria-hidden="true">
                ·
              </span>
              <span>
                {uniqueSolvedCount}/{TACTICAL_PUZZLES.length}
              </span>
            </div>

            <button
              type="button"
              onClick={onOpenTrainingDeck}
              title="Browse puzzles, themes, and full performance statistics"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded bg-[#181d27] hover:bg-[#222937] border border-white/12 text-[#d7dce5] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#e3be78]"
            >
              <ListChecks className="w-3.5 h-3.5 text-[#d6ae63]" />
              <span>Stats &amp; List</span>
            </button>

            <button
              type="button"
              onClick={onSwitchToCasualPlay}
              title="Switch from Tactical Training back to Casual Play"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded bg-[#1c2331] hover:bg-[#263044] border border-[#d6ae63]/45 text-[#f3d38b] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#e3be78]"
            >
              <Swords className="w-3.5 h-3.5 text-[#d6ae63]" />
              <span>Casual Play</span>
            </button>
          </div>
        </div>

        {/* Hairline Countdown Speed Bar (compositor-only scaleX, zero layout thrash) */}
        <div
          className="w-full h-[2px] bg-white/10 overflow-hidden rounded-full"
          aria-hidden="true"
        >
          <div
            className={`h-full w-full origin-left transition-transform duration-100 ease-linear ${barFillClass} ${
              isLowTime ? 'tactical-bar-urgent' : ''
            }`}
            style={{ transform: `scaleX(${ratio})` }}
          />
        </div>

        {/* Row 2: Live Tactical Prompt / Score Award / Explanation + Interactive Actions */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 pt-0.5">
          <div className="flex items-center gap-2 min-w-0 flex-1 text-xs">
            {status === 'solved' ? (
              <>
                <Check className="w-4 h-4 text-[#34d399] shrink-0" strokeWidth={2.6} />
                <span className="text-[#d1fae5] truncate" title={puzzle.explanation}>
                  <strong className="font-semibold text-[#6ee7b7] font-mono-tabular">
                    Solved
                    {lastSolveAward
                      ? ` · +${lastSolveAward.pointsAwarded} pts (${lastSolveAward.multiplier.toFixed(1)}x · ${formatSolveDuration(lastSolveAward.solveMs)})`
                      : ''}
                    {lastRatingDelta !== null
                      ? ` · ${lastRatingDelta >= 0 ? `+${lastRatingDelta}` : lastRatingDelta} Elo`
                      : ''}
                  </strong>
                  {' · '}
                  {puzzle.explanation}
                </span>
              </>
            ) : status === 'solution-shown' ? (
              <>
                <Eye className="w-4 h-4 text-[#7dd3fc] shrink-0" />
                <span className="text-[#e0f2fe] truncate" title={puzzle.explanation}>
                  <strong className="font-semibold text-[#7dd3fc]">Solution</strong>
                  {' · '}
                  {puzzle.explanation}
                </span>
              </>
            ) : status === 'wrong' ? (
              <>
                <XCircle className="w-4 h-4 text-[#f87171] shrink-0" />
                <span className="text-[#fecaca] truncate">
                  <strong className="font-semibold text-[#fca5a5]">Not quite</strong>
                  {' · '}
                  {feedbackText || 'Look for a stronger forcing check, capture, or threat.'}
                </span>
              </>
            ) : status === 'opponent-replying' ? (
              <span className="text-[#e3be78] font-medium truncate">
                Correct move — opponent responding...
              </span>
            ) : (
              <>
                <span
                  className={`w-2.5 h-2.5 rounded-[2px] border border-white/35 shrink-0 ${
                    puzzle.solverColor === 'w' ? 'bg-[#9d7340]' : 'bg-[#150d08]'
                  }`}
                  aria-hidden="true"
                />
                <span className="text-[#e5e9f0] truncate">
                  {isTimedOut
                    ? 'Time up (0.5x Overtime) · Finish solving or view Solution'
                    : feedbackText || puzzle.objective}
                  {totalSolverSteps > 1 && (
                    <span className="text-[#9aa3b2] font-mono-tabular">
                      {' '}
                      · Step {solverStepNumber}/{totalSolverSteps}
                    </span>
                  )}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onPrevPuzzle}
              aria-label="Previous puzzle"
              title="Previous puzzle"
              className="p-1.5 rounded bg-[#181d27] hover:bg-[#232b3a] border border-white/10 text-[#cbd2df] transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            {!isFinished && (
              <>
                <button
                  type="button"
                  onClick={onRequestHint}
                  disabled={!isInteractive}
                  title={
                    hintStage === 0
                      ? 'Highlight the piece to move'
                      : 'Show the target square arrow on the 3D board'
                  }
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 ${
                    hintStage > 0
                      ? 'bg-[#261f12] border-[#d6ae63]/55 text-[#f0d192]'
                      : 'bg-[#181d27] hover:bg-[#232b3a] border-white/10 text-[#d7dce5]'
                  }`}
                >
                  <Lightbulb className="w-3.5 h-3.5 text-[#d6ae63]" />
                  <span>{hintStage === 0 ? 'Hint' : hintStage === 1 ? 'Show Arrow' : 'Hint On'}</span>
                </button>

                <button
                  type="button"
                  onClick={onShowSolution}
                  disabled={!isInteractive}
                  title="Play out the winning tactical solution on the 3D board"
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded bg-[#181d27] hover:bg-[#232b3a] border border-white/10 text-[#cbd2df] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
                >
                  <Eye className="w-3.5 h-3.5 text-[#7dd3fc]" />
                  <span>Solution</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={onRetryPuzzle}
              title="Reset and retry this puzzle from the beginning"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded bg-[#181d27] hover:bg-[#232b3a] border border-white/10 text-[#cbd2df] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>

            <button
              type="button"
              onClick={onNextPuzzle}
              className={`inline-flex items-center gap-1 px-3 py-1 text-[11px] font-semibold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isFinished
                  ? 'bg-[#d6ae63] hover:bg-[#e3be78] text-[#111419]'
                  : 'bg-[#1d2432] hover:bg-[#273144] border border-white/12 text-[#f3efe4]'
              }`}
            >
              <span>Next Puzzle</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
