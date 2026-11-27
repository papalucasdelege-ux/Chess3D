import { useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Eraser,
  Hand,
  Play,
  RotateCcw,
  Swords,
  Trash2,
  X,
} from 'lucide-react';
import {
  COMPOSER_PRESETS,
  getLegalEnPassantSquares,
  type CastlingFlags,
  type ComposerState,
  type ComposerTool,
  type ComposerValidation,
} from '../chess/boardComposer';
import {
  ENGINE_LEVELS,
  type CameraPreset,
  type EngineLevel,
  type PieceColor,
  type PieceType,
} from '../shared/types';

interface BoardComposerHudProps {
  state: ComposerState;
  validation: ComposerValidation;
  activeTool: ComposerTool;
  selectedSquare: string | null;
  cameraPreset: CameraPreset;
  engineLevel: EngineLevel;
  whiteAngelLevel: EngineLevel;
  blackAngelLevel: EngineLevel;
  onSelectTool: (tool: ComposerTool) => void;
  onSquareInteract: (square: string) => void;
  onChangeTurn: (turn: PieceColor) => void;
  onToggleCastling: (flag: keyof CastlingFlags) => void;
  onChangeEnPassant: (sq: string) => void;
  onLoadPresetFen: (fen: string) => void;
  onLoadCurrentMatchFen: () => void;
  onClearBoard: () => void;
  onInvertColors: () => void;
  onApplyRawFen: (rawFen: string) => boolean;
  onSelectCameraPreset: (preset: CameraPreset) => void;
  onChangeEngineLevel: (level: EngineLevel) => void;
  onChangeWhiteAngelLevel: (level: EngineLevel) => void;
  onChangeBlackAngelLevel: (level: EngineLevel) => void;
  onRunVsAngel: (playerColor: PieceColor) => void;
  onRunAngelVsAngel: () => void;
  onRunPassAndPlay: () => void;
  onCloseComposer: () => void;
}

const PIECE_ORDER: readonly PieceType[] = ['k', 'q', 'r', 'b', 'n', 'p'];

const PIECE_GLYPHS: Record<PieceColor, Record<PieceType, string>> = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};

const PIECE_NAMES: Record<PieceType, string> = {
  k: 'King',
  q: 'Queen',
  r: 'Rook',
  b: 'Bishop',
  n: 'Knight',
  p: 'Pawn',
};

const LEVEL_ORDER: readonly EngineLevel[] = [
  'beginner',
  'intermediate',
  'advanced',
  'master',
  'grandmaster',
];

const FILES_W = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const FILES_B = ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'] as const;
const RANKS_W = [8, 7, 6, 5, 4, 3, 2, 1] as const;
const RANKS_B = [1, 2, 3, 4, 5, 6, 7, 8] as const;

function isSameTool(a: ComposerTool, b: ComposerTool): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'piece' && b.kind === 'piece') {
    return a.color === b.color && a.type === b.type;
  }
  return true;
}

export function BoardComposerHud({
  state,
  validation,
  activeTool,
  selectedSquare,
  cameraPreset,
  engineLevel,
  whiteAngelLevel,
  blackAngelLevel,
  onSelectTool,
  onSquareInteract,
  onChangeTurn,
  onToggleCastling,
  onChangeEnPassant,
  onLoadPresetFen,
  onLoadCurrentMatchFen,
  onClearBoard,
  onInvertColors,
  onApplyRawFen,
  onSelectCameraPreset,
  onChangeEngineLevel,
  onChangeWhiteAngelLevel,
  onChangeBlackAngelLevel,
  onRunVsAngel,
  onRunAngelVsAngel,
  onRunPassAndPlay,
  onCloseComposer,
}: BoardComposerHudProps) {
  const [minimized, setMinimized] = useState(false);
  const [showMiniGrid, setShowMiniGrid] = useState(true);
  const [fenDraft, setFenDraft] = useState(validation.fen);
  const [fenError, setFenError] = useState<string | null>(null);
  const [copiedFen, setCopiedFen] = useState(false);

  useEffect(() => {
    setFenDraft(validation.fen);
    setFenError(null);
  }, [validation.fen]);

  const legalEps = getLegalEnPassantSquares(state.pieces, state.turn);
  const wkOnE1 = state.pieces.e1?.color === 'w' && state.pieces.e1?.type === 'k';
  const bkOnE8 = state.pieces.e8?.color === 'b' && state.pieces.e8?.type === 'k';
  const canWK = wkOnE1 && state.pieces.h1?.color === 'w' && state.pieces.h1?.type === 'r';
  const canWQ = wkOnE1 && state.pieces.a1?.color === 'w' && state.pieces.a1?.type === 'r';
  const canBK = bkOnE8 && state.pieces.h8?.color === 'b' && state.pieces.h8?.type === 'r';
  const canBQ = bkOnE8 && state.pieces.a8?.color === 'b' && state.pieces.a8?.type === 'r';

  const flipped2D = cameraPreset === 'black';
  const files = flipped2D ? FILES_B : FILES_W;
  const ranks = flipped2D ? RANKS_B : RANKS_W;

  const canLaunch = validation.valid && validation.legalMoveCount > 0;

  const handleCopyFen = () => {
    navigator.clipboard?.writeText(validation.fen).catch(() => {});
    setCopiedFen(true);
    window.setTimeout(() => setCopiedFen(false), 1600);
  };

  const handleSubmitFen = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = onApplyRawFen(fenDraft);
    if (!ok) {
      setFenError('Could not parse FEN string.');
    } else {
      setFenError(null);
    }
  };

  return (
    <div className="fixed bottom-9 sm:bottom-10 left-1/2 -translate-x-1/2 z-[38] w-[min(980px,calc(100vw-12px))] pointer-events-none flex flex-col items-center">
      {/* Compact Header Strip (Always Accessible) */}
      <div className="pointer-events-auto w-full rounded-t-xl bg-[#0e121a]/96 border border-white/14 shadow-2xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-white/10 bg-[#0a0d14]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-display text-sm font-medium text-[#f5efe2] whitespace-nowrap">
              Composable Chessboard
            </span>
            <span className="text-white/25" aria-hidden="true">
              ·
            </span>
            <span className="text-[11px] text-[#9aa3b2] truncate">
              Click or drag 3D figures directly on the board to craft any Black or White situation
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowMiniGrid((v) => !v)}
              className={`hidden md:inline-flex items-center px-2 py-1 rounded border text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                showMiniGrid
                  ? 'bg-[#1a2232] border-[#d6ae63]/50 text-[#f3efe4]'
                  : 'bg-[#151a24] border-white/10 text-[#9aa3b2] hover:text-white'
              }`}
            >
              2D Grid: {showMiniGrid ? 'On' : 'Off'}
            </button>
            <button
              type="button"
              onClick={() => setMinimized((m) => !m)}
              title={minimized ? 'Expand composer tools' : 'Minimize composer panel to inspect 3D board'}
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#161b26] hover:bg-[#1f2636] border border-white/12 text-[11px] font-medium text-[#d7dce5] cursor-pointer whitespace-nowrap"
            >
              {minimized ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5 text-[#d6ae63]" />
                  Tools
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5 text-[#d6ae63]" />
                  Compact
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onCloseComposer}
              title="Exit composer and return to match"
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#1c161b] hover:bg-[#2b1d24] border border-white/12 text-[11px] font-medium text-[#e2e8f0] cursor-pointer whitespace-nowrap"
            >
              <X className="w-3.5 h-3.5 text-[#f87171]" />
              Exit
            </button>
          </div>
        </div>

        {/* Always-Visible Primary Launch Bar + Validation Readout */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-[#121722] border-b border-white/8">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={!canLaunch}
              onClick={() => onRunVsAngel('w')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#d6ae63] hover:bg-[#e3be78] disabled:opacity-40 text-[#111419] text-xs font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5" />
              Play as White vs Angel
            </button>

            <button
              type="button"
              disabled={!canLaunch}
              onClick={() => onRunVsAngel('b')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#232b3b] hover:bg-[#2d374b] border border-[#d6ae63]/55 disabled:opacity-40 text-[#f5efe2] text-xs font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5 text-[#d6ae63]" />
              Play as Black vs Angel
            </button>

            <button
              type="button"
              disabled={!canLaunch}
              onClick={onRunAngelVsAngel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#162938] hover:bg-[#1d364a] border border-[#38bdf8]/60 disabled:opacity-40 text-[#e0f2fe] text-xs font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
            >
              <Swords className="w-3.5 h-3.5 text-[#38bdf8]" />
              Run Angel vs Angel
            </button>

            <button
              type="button"
              disabled={!canLaunch}
              onClick={onRunPassAndPlay}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#181d27] hover:bg-[#222938] border border-white/12 disabled:opacity-40 text-[#cbd5e1] text-xs font-medium transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
            >
              Pass &amp; Play
            </button>
          </div>

          {/* Live Validation Status */}
          <div className="text-[11px] font-medium min-w-0">
            {!validation.valid ? (
              <span className="text-[#fca5a5]">{validation.errors[0]}</span>
            ) : validation.warnings.length > 0 ? (
              <span className="text-[#fcd34d]">{validation.warnings[0]}</span>
            ) : (
              <span className="text-[#6ee7b7] font-mono-tabular whitespace-nowrap">
                Ready · {state.turn === 'w' ? 'White' : 'Black'} to move ·{' '}
                {validation.legalMoveCount} legal moves
                {validation.inCheckColor
                  ? ` · ${validation.inCheckColor === 'w' ? 'White' : 'Black'} in Check`
                  : ''}
              </span>
            )}
          </div>
        </div>

        {/* Expandable Palette, Situation Controls & Optional 2D Grid */}
        {!minimized && (
          <div className="p-2.5 sm:p-3 max-h-[38dvh] sm:max-h-[340px] overflow-y-auto thin-scroll">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
              {/* Left / Center: Piece Palette + Match Situation Controls */}
              <div
                className={`${
                  showMiniGrid ? 'md:col-span-8' : 'md:col-span-12'
                } flex flex-col gap-2.5`}
              >
                {/* Row A: Tools + White & Black Piece Brushes */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onSelectTool({ kind: 'move' })}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      activeTool.kind === 'move'
                        ? 'bg-[#d6ae63] border-[#d6ae63] text-[#111419] font-semibold'
                        : 'bg-[#171c26] border-white/10 text-[#cbd2df] hover:text-white'
                    }`}
                  >
                    <Hand className="w-3.5 h-3.5" />
                    Move
                  </button>

                  <button
                    type="button"
                    onClick={() => onSelectTool({ kind: 'erase' })}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      activeTool.kind === 'erase'
                        ? 'bg-[#3a1d22] border-[#f87171]/70 text-[#fecaca] font-semibold'
                        : 'bg-[#171c26] border-white/10 text-[#cbd2df] hover:text-white'
                    }`}
                  >
                    <Eraser className="w-3.5 h-3.5 text-[#f87171]" />
                    Erase
                  </button>

                  <span className="text-white/15 mx-0.5" aria-hidden="true">
                    |
                  </span>

                  {/* White Pieces */}
                  <div className="inline-flex items-center gap-1 p-0.5 rounded-md bg-[#181e2a] border border-white/10">
                    {PIECE_ORDER.map((pt) => {
                      const tool: ComposerTool = { kind: 'piece', color: 'w', type: pt };
                      const active = isSameTool(activeTool, tool);
                      return (
                        <button
                          key={`w-${pt}`}
                          type="button"
                          onClick={() => onSelectTool(tool)}
                          title={`Place White ${PIECE_NAMES[pt]}`}
                          className={`w-8 h-8 rounded flex items-center justify-center text-lg leading-none transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#d6ae63] text-[#111419] font-bold shadow-sm'
                              : 'text-[#f8f5ef] hover:bg-white/10'
                          }`}
                        >
                          {PIECE_GLYPHS.w[pt]}
                        </button>
                      );
                    })}
                  </div>

                  {/* Black Pieces */}
                  <div className="inline-flex items-center gap-1 p-0.5 rounded-md bg-[#181e2a] border border-white/10">
                    {PIECE_ORDER.map((pt) => {
                      const tool: ComposerTool = { kind: 'piece', color: 'b', type: pt };
                      const active = isSameTool(activeTool, tool);
                      return (
                        <button
                          key={`b-${pt}`}
                          type="button"
                          onClick={() => onSelectTool(tool)}
                          title={`Place Black ${PIECE_NAMES[pt]}`}
                          className={`w-8 h-8 rounded flex items-center justify-center text-lg leading-none transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#38bdf8] text-[#0b121c] font-bold shadow-sm'
                              : 'text-[#93c5fd] hover:bg-white/10'
                          }`}
                        >
                          {PIECE_GLYPHS.b[pt]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Row B: Side to Move + Castling + En Passant + Camera View */}
                <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-white/8 text-xs">
                  <div className="inline-flex items-center gap-1 p-0.5 bg-[#171c26] rounded-md border border-white/10">
                    <button
                      type="button"
                      onClick={() => onChangeTurn('w')}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        state.turn === 'w'
                          ? 'bg-[#d6ae63] text-[#111419] font-semibold'
                          : 'text-[#9aa3b2] hover:text-white'
                      }`}
                    >
                      ♔ White to Move
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeTurn('b')}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        state.turn === 'b'
                          ? 'bg-[#38bdf8] text-[#0c131f] font-semibold'
                          : 'text-[#9aa3b2] hover:text-white'
                      }`}
                    >
                      ♚ Black to Move
                    </button>
                  </div>

                  {/* Castling toggles */}
                  <div className="inline-flex items-center gap-1 text-[11px]">
                    <span className="text-[#8d96a6] whitespace-nowrap mr-0.5">Castling:</span>
                    {(
                      [
                        { flag: 'K', label: 'W O-O', allowed: canWK },
                        { flag: 'Q', label: 'W O-O-O', allowed: canWQ },
                        { flag: 'k', label: 'B O-O', allowed: canBK },
                        { flag: 'q', label: 'B O-O-O', allowed: canBQ },
                      ] as const
                    ).map((item) => {
                      const checked = state.castling[item.flag] && item.allowed;
                      return (
                        <button
                          key={item.flag}
                          type="button"
                          disabled={!item.allowed}
                          onClick={() => onToggleCastling(item.flag)}
                          title={
                            item.allowed
                              ? `Toggle ${item.label}`
                              : `Requires King and Rook on home squares for ${item.label}`
                          }
                          className={`px-2 py-1 rounded border font-mono-tabular transition-colors whitespace-nowrap cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
                            checked
                              ? 'bg-[#1f2a3c] border-[#d6ae63]/60 text-[#f3efe4]'
                              : 'bg-[#161b24] border-white/10 text-[#8d96a6]'
                          }`}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* En Passant Square (if pawns allow) */}
                  {legalEps.length > 0 && (
                    <div className="inline-flex items-center gap-1 text-[11px]">
                      <span className="text-[#8d96a6] whitespace-nowrap">En Passant:</span>
                      <select
                        value={legalEps.includes(state.enPassant) ? state.enPassant : '-'}
                        onChange={(e) => onChangeEnPassant(e.target.value)}
                        className="px-2 py-1 rounded bg-[#161b24] border border-white/12 text-[#e2e8f0] font-mono-tabular text-[11px] cursor-pointer"
                      >
                        <option value="-">None (-)</option>
                        {legalEps.map((sq) => (
                          <option key={sq} value={sq}>
                            {sq}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Camera orientation */}
                  <div className="inline-flex items-center gap-1 ml-auto">
                    {(['white', 'black', 'top'] as CameraPreset[]).map((cam) => (
                      <button
                        key={cam}
                        type="button"
                        onClick={() => onSelectCameraPreset(cam)}
                        className={`px-2 py-1 rounded border text-[11px] capitalize transition-colors cursor-pointer whitespace-nowrap ${
                          cameraPreset === cam
                            ? 'bg-white/12 border-[#c89d54]/60 text-[#f5efe2]'
                            : 'bg-[#161b24] border-white/10 text-[#8d96a6] hover:text-white'
                        }`}
                      >
                        {cam} View
                      </button>
                    ))}
                  </div>
                </div>

                {/* Row C: Presets & Board Actions */}
                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-white/8">
                  <span className="text-[11px] text-[#8d96a6] whitespace-nowrap mr-0.5">
                    Presets:
                  </span>
                  {COMPOSER_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onLoadPresetFen(preset.fen)}
                      title={preset.subtitle}
                      className="px-2 py-1 rounded bg-[#171c26] hover:bg-[#222938] border border-white/10 text-[11px] text-[#d7dce5] transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {preset.label}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={onLoadCurrentMatchFen}
                    title="Load the current active match board into the composer"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#171c26] hover:bg-[#222938] border border-white/10 text-[11px] text-[#e6c47f] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Current Board
                  </button>

                  <button
                    type="button"
                    onClick={onInvertColors}
                    title="Mirror and swap White and Black pieces and side to move"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#171c26] hover:bg-[#222938] border border-white/10 text-[11px] text-[#cbd5e1] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <ArrowLeftRight className="w-3 h-3 text-[#38bdf8]" />
                    Swap Colors
                  </button>

                  <button
                    type="button"
                    onClick={onClearBoard}
                    title="Remove all pieces so you can build from an empty 8x8 board"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#26161a] hover:bg-[#361d23] border border-[#f87171]/35 text-[11px] text-[#fca5a5] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Trash2 className="w-3 h-3" />
                    Clear All
                  </button>
                </div>

                {/* Row D: Strength Selectors for Player vs Angel & Angel vs Angel + FEN Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/8 text-[11px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1 text-[#9aa3b2] whitespace-nowrap">
                      <span>vs Angel:</span>
                      <select
                        value={engineLevel}
                        onChange={(e) => onChangeEngineLevel(e.target.value as EngineLevel)}
                        className="px-2 py-1 rounded bg-[#161b24] border border-white/12 text-[#f3efe4] text-[11px] cursor-pointer"
                      >
                        {LEVEL_ORDER.map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {ENGINE_LEVELS[lvl].label} ({ENGINE_LEVELS[lvl].elo})
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="inline-flex items-center gap-1 text-[#9aa3b2] whitespace-nowrap">
                      <span>Angel White:</span>
                      <select
                        value={whiteAngelLevel}
                        onChange={(e) => onChangeWhiteAngelLevel(e.target.value as EngineLevel)}
                        className="px-2 py-1 rounded bg-[#161b24] border border-white/12 text-[#f3efe4] text-[11px] cursor-pointer"
                      >
                        {LEVEL_ORDER.map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {ENGINE_LEVELS[lvl].label} ({ENGINE_LEVELS[lvl].elo})
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="inline-flex items-center gap-1 text-[#9aa3b2] whitespace-nowrap">
                      <span>Angel Black:</span>
                      <select
                        value={blackAngelLevel}
                        onChange={(e) => onChangeBlackAngelLevel(e.target.value as EngineLevel)}
                        className="px-2 py-1 rounded bg-[#161b24] border border-white/12 text-[#f3efe4] text-[11px] cursor-pointer"
                      >
                        {LEVEL_ORDER.map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {ENGINE_LEVELS[lvl].label} ({ENGINE_LEVELS[lvl].elo})
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {/* FEN Input / Copy */}
                  <form
                    onSubmit={handleSubmitFen}
                    className="flex items-center gap-1.5 flex-1 min-w-[240px]"
                  >
                    <input
                      type="text"
                      value={fenDraft}
                      onChange={(e) => setFenDraft(e.target.value)}
                      placeholder="Paste or edit FEN..."
                      aria-label="FEN position string"
                      className="flex-1 min-w-0 px-2 py-1 rounded bg-[#0d1118] border border-white/12 text-[11px] font-mono-tabular text-[#e2e8f0] focus:outline-none focus:border-[#d6ae63]"
                    />
                    <button
                      type="submit"
                      className="px-2 py-1 rounded bg-[#1d2534] hover:bg-[#273246] border border-white/12 text-[#f3efe4] font-medium cursor-pointer whitespace-nowrap"
                    >
                      Apply FEN
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyFen}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#161b24] hover:bg-[#212836] border border-white/12 text-[#cbd5e1] cursor-pointer whitespace-nowrap"
                    >
                      {copiedFen ? (
                        <>
                          <Check className="w-3 h-3 text-[#6ee7b7]" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-[#d6ae63]" />
                          Copy
                        </>
                      )}
                    </button>
                  </form>
                </div>

                {fenError && <div className="text-[11px] text-[#fca5a5]">{fenError}</div>}
              </div>

              {/* Right: Synchronized 2D Rapid-Placement Chessboard Grid */}
              {showMiniGrid && (
                <div className="hidden md:flex md:col-span-4 flex-col items-center justify-center border-l border-white/8 pl-3">
                  <div className="grid grid-cols-8 border border-[#c89d54]/40 rounded overflow-hidden shadow-md select-none">
                    {ranks.map((r, rIdx) =>
                      files.map((f, fIdx) => {
                        const sq = `${f}${r}`;
                        const piece = state.pieces[sq];
                        const isLight = (FILES_W.indexOf(f) + r) % 2 === 1;
                        const isSelected = selectedSquare === sq;
                        return (
                          <button
                            key={sq}
                            type="button"
                            onClick={() => onSquareInteract(sq)}
                            title={`${sq}${
                              piece
                                ? ` · ${piece.color === 'w' ? 'White' : 'Black'} ${
                                    PIECE_NAMES[piece.type]
                                  }`
                                : ''
                            }`}
                            className={`relative w-6 h-6 lg:w-7 lg:h-7 flex items-center justify-center text-base lg:text-lg leading-none cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-[#d6ae63] ring-1 ring-inset ring-white'
                                : isLight
                                  ? 'bg-[#c9b089] hover:bg-[#d7c19e]'
                                  : 'bg-[#6e4c30] hover:bg-[#825b3b]'
                            }`}
                          >
                            {piece && (
                              <span
                                className={
                                  piece.color === 'w'
                                    ? 'text-[#ffffff] [text-shadow:0_1px_2px_rgba(0,0,0,0.95)]'
                                    : 'text-[#0b0e14] [text-shadow:0_0_2px_rgba(255,255,255,0.65)]'
                                }
                              >
                                {PIECE_GLYPHS[piece.color][piece.type]}
                              </span>
                            )}
                            {fIdx === 0 && (
                              <span className="absolute top-0 left-0.5 text-[7px] font-mono-tabular opacity-65 text-black pointer-events-none">
                                {r}
                              </span>
                            )}
                            {rIdx === 7 && (
                              <span className="absolute bottom-0 right-0.5 text-[7px] font-mono-tabular opacity-65 text-black pointer-events-none">
                                {f}
                              </span>
                            )}
                          </button>
                        );
                      }),
                    )}
                  </div>
                  <span className="mt-1 text-[10px] text-[#8d96a6] whitespace-nowrap">
                    Synced 2D &amp; 3D Board · Click any square
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
