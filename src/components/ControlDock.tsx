import { useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Rewind,
  FastForward,
  Volume2,
  VolumeX,
  RotateCcw,
  Check,
  Save,
  FolderOpen,
  Upload,
  ArrowLeft,
  Trash2,
  Flag,
  Eye,
  Download,
  GitBranch,
  Sun,
  Sparkles,
  ThumbsUp,
  HelpCircle,
  AlertTriangle,
  AlertCircle,
} from 'lucide-react';
import {
  ENGINE_LEVELS,
  type AnalysisSnapshot,
  type AnalyzedMoveMeta,
  type CameraPreset,
  type EngineLevel,
  type GameMode,
  type MoveQuality,
  type MoveRecord,
  type PieceColor,
  type SavedGame,
  type TimeControlId,
} from '../shared/types';
import { formatEvalLabel } from '../chess/engine';
import type { AngelVoiceMode } from '../chess/opponentVoice';
import type { DockTab } from './TopBar';

interface ControlDockProps {
  activeTab: DockTab;
  onSelectTab: (tab: DockTab) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onPrimaryAction: () => void;

  // Play & Chess Angel
  gameMode: GameMode;
  onStartLocalGame: (tc: TimeControlId) => void;
  onStartEngineGame: (
    level: EngineLevel,
    playerColor: PieceColor | 'random',
    tc: TimeControlId,
  ) => void;
  engineLevel: EngineLevel;
  onChangeEngineLevel: (level: EngineLevel) => void;
  humanColorVsAi: PieceColor | 'random';
  onChangeHumanColorVsAi: (c: PieceColor | 'random') => void;
  timeControl: TimeControlId;
  onChangeTimeControl: (tc: TimeControlId) => void;
  cameraPreset: CameraPreset;
  onSelectCameraPreset: (preset: CameraPreset) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  angelVoice: AngelVoiceMode;
  onChangeAngelVoice: (mode: AngelVoiceMode) => void;
  angelVisible: boolean;
  onChangeAngelVisible: (visible: boolean) => void;
  shadowsEnabled: boolean;
  onToggleShadows: () => void;
  showCoordinates: boolean;
  onToggleCoordinates: () => void;
  showSearchTree: boolean;
  onToggleSearchTree: () => void;
  onReplaySearchTree: () => void;
  onExportTreeJpg: () => void;
  canUndo: boolean;
  onUndo: () => void;
  onResignLocal: () => void;
  isGameActive: boolean;

  // Analysis
  analysisEnabled: boolean;
  onToggleAnalysis: () => void;
  showBestMoveArrow: boolean;
  onToggleBestMoveArrow: () => void;
  analysis: AnalysisSnapshot | null;
  moveHistory: MoveRecord[];
  viewPly: number;
  onJumpToPly: (ply: number) => void;
  moveEvalMeta: Record<number, AnalyzedMoveMeta>;
  currentFen: string;
  currentPgn: string;
  onPlayEngineMove: (uci: string) => void;

  // Replay
  isReplayMode: boolean;
  activeReplayGame: SavedGame | null;
  replayPlaying: boolean;
  replaySpeed: number;
  onToggleReplayPlay: () => void;
  onChangeReplaySpeed: (speed: number) => void;
  onRewindStep: () => void;
  onFastForwardStep: () => void;
  savedGames: SavedGame[];
  classicReplays: SavedGame[];
  onLoadSavedGame: (game: SavedGame) => void;
  onLoadReplay: (game: SavedGame) => void;
  onExitReplay: () => void;
  onSaveCurrentGame: () => void;
  onExportCurrentGame: () => void;
  onExportSavedGame: (game: SavedGame) => void;
  onImportSaveFile: (file: File) => Promise<boolean>;
  onDeleteSavedGame: (id: string) => void;
  canSaveCurrent: boolean;
  justSaved: boolean;
  onOpenLoadDrawer?: () => void;
  onSecretStudioTrigger?: () => void;
}

const QUALITY_COLORS: Record<MoveQuality, string> = {
  best: 'text-[#6ee7b7]',
  excellent: 'text-[#93c5fd]',
  good: 'text-[#cbd5e1]',
  inaccuracy: 'text-[#fbbf24]',
  mistake: 'text-[#fb923c]',
  blunder: 'text-[#f87171]',
};

const QUALITY_LABELS: Record<MoveQuality, string> = {
  best: 'Best move',
  excellent: 'Excellent move',
  good: 'Good move',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
};

function MoveQualityIcon({
  quality,
  active = false,
}: {
  quality?: MoveQuality;
  active?: boolean;
}) {
  if (!quality) return null;

  switch (quality) {
    case 'best':
      return (
        <Check
          aria-label="Best move"
          strokeWidth={2.8}
          className={`w-3 h-3 shrink-0 ${active ? 'text-[#064e3b]' : 'text-[#34d399]'}`}
        />
      );
    case 'excellent':
      return (
        <Sparkles
          aria-label="Excellent move"
          strokeWidth={2.4}
          className={`w-3 h-3 shrink-0 ${active ? 'text-[#1e3a8a]' : 'text-[#93c5fd]'}`}
        />
      );
    case 'good':
      return (
        <ThumbsUp
          aria-label="Good move"
          strokeWidth={2.3}
          className={`w-2.5 h-2.5 shrink-0 ${active ? 'text-[#1e293b]' : 'text-[#94a3b8]'}`}
        />
      );
    case 'inaccuracy':
      return (
        <HelpCircle
          aria-label="Inaccuracy"
          strokeWidth={2.4}
          className={`w-3 h-3 shrink-0 ${active ? 'text-[#78350f]' : 'text-[#fbbf24]'}`}
        />
      );
    case 'mistake':
      return (
        <AlertTriangle
          aria-label="Mistake"
          strokeWidth={2.4}
          className={`w-3 h-3 shrink-0 ${active ? 'text-[#7c2d12]' : 'text-[#fb923c]'}`}
        />
      );
    case 'blunder':
      return (
        <AlertCircle
          aria-label="Blunder"
          strokeWidth={2.6}
          className={`w-3 h-3 shrink-0 ${active ? 'text-[#991b1b]' : 'text-[#f87171]'}`}
        />
      );
  }
}

const LEVEL_ORDER: EngineLevel[] = [
  'beginner',
  'intermediate',
  'advanced',
  'master',
  'grandmaster',
];
const TC_ORDER: TimeControlId[] = ['3+0', '5+3', '10+0', 'unlimited'];

export function ControlDock(props: ControlDockProps) {
  const [emblemBroken, setEmblemBroken] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [replayListTab, setReplayListTab] = useState<'saved' | 'classics'>('saved');
  const [loadDrawerOpen, setLoadDrawerOpen] = useState(false);
  const [importNotice, setImportNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const secretTapTimesRef = useRef<number[]>([]);

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const ok = await props.onImportSaveFile(file);
    if (ok) {
      setImportNotice({ ok: true, text: `Loaded "${file.name}"` });
      setLoadDrawerOpen(false);
    } else {
      setImportNotice({ ok: false, text: 'Could not parse file (.json or .pgn expected)' });
    }
    window.setTimeout(() => setImportNotice(null), 3200);
  };

  const handleBrandSecretTap = () => {
    if (!props.onSecretStudioTrigger) return;
    const now = performance.now();
    const recent = secretTapTimesRef.current.filter((t) => now - t <= 2800);
    recent.push(now);
    if (recent.length >= 5) {
      secretTapTimesRef.current = [];
      props.onSecretStudioTrigger();
    } else {
      secretTapTimesRef.current = recent;
    }
  };

  const copyText = (key: string, value: string) => {
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1800);
  };

  const totalPlies = props.moveHistory.length;
  const currentMoveRec = props.viewPly > 0 ? props.moveHistory[props.viewPly - 1] : null;

  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 z-30 w-[min(960px,95vw)] pointer-events-none flex flex-col items-center">
      {/* Bottom Rollout Arrow Tab (only opens/retracts menu when touched) */}
      <button
        type="button"
        onClick={props.onToggleCollapse}
        aria-expanded={!props.collapsed}
        aria-label={props.collapsed ? 'Roll out game menu' : 'Retract game menu'}
        title={props.collapsed ? 'Open menu (H)' : 'Retract menu (H)'}
        className={`pointer-events-auto inline-flex items-center justify-center min-w-[48px] min-h-[28px] px-3.5 py-1 bg-[#11151d]/92 hover:bg-[#1a202c] border-x border-t border-white/14 text-[#d6ae63] transition-colors cursor-pointer shadow-md focus-visible:outline-2 focus-visible:outline-[#e3be78] ${
          props.collapsed ? 'rounded-t-md' : 'rounded-md border-b mb-1.5'
        }`}
      >
        {props.collapsed ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.pgn,application/json,text/plain"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Unified Horizontal Bottom Control Dock (solid/rgba surface — zero backdrop-filter over WebGL) */}
      <div
        className={`pointer-events-auto w-full rounded-t-xl mb-0 sm:rounded-xl sm:mb-3 bg-[#11151d]/95 border border-white/12 shadow-2xl transition-all duration-200 ease-out overflow-hidden ${
          props.collapsed
            ? 'max-h-0 opacity-0 translate-y-4 pointer-events-none border-transparent sm:mb-0'
            : 'max-h-[440px] opacity-100 translate-y-0'
        }`}
      >
        {/* Unified Menu Header Bar: Logo + ChessAngel 3D + Version + Copyright on Left | Controls + Play/Analysis/Replay on Far Right */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-white/10 bg-[#0d1017]/95">
          <div
            onClick={handleBrandSecretTap}
            className="flex flex-wrap items-center gap-2 select-none cursor-default"
          >
            {/* ChessAngel 3D Logo Emblem on the Very Left Before Game Title */}
            <div className="inline-flex items-center gap-2 whitespace-nowrap shrink-0">
              {!emblemBroken ? (
                <img
                  src="/assets/aistudio/chess3D-angel_414f5812.png"
                  alt="ChessAngel 3D logo"
                  draggable={false}
                  onContextMenu={(e) => e.preventDefault()}
                  referrerPolicy="no-referrer"
                  onError={() => setEmblemBroken(true)}
                  className="w-7 h-7 rounded-md object-cover border border-white/15 shadow-sm shrink-0"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="w-7 h-7 rounded-md bg-[#261d12] border border-[#d6ae63]/40 inline-flex items-center justify-center text-xs text-[#e6c47f] font-display shrink-0"
                >
                  ♞
                </span>
              )}
              <span className="font-display text-base sm:text-lg font-semibold tracking-tight text-[#f5f0e6] whitespace-nowrap">
                ChessAngel 3D
              </span>
              <span className="font-mono-tabular text-sm sm:text-base font-bold tracking-tight px-2 py-0.5 rounded-md bg-[#261d0e] border border-[#d6ae63]/70 text-[#fde68a] shadow-sm whitespace-nowrap">
                v3.0
              </span>
            </div>

            <span className="text-[11px] text-[#9aa3b2] whitespace-nowrap">
              © Jan Rom 2026
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={props.onToggleSearchTree}
              aria-pressed={props.showSearchTree}
              title="Activate or deactivate rapid thin-line visualization of the entire explored search tree"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded border transition-colors whitespace-nowrap cursor-pointer ${
                props.showSearchTree
                  ? 'bg-[#1f2838] border-[#38bdf8]/60 text-[#bae6fd]'
                  : 'bg-[#171c26] border-white/10 text-[#8d96a6] hover:text-white'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5 text-[#38bdf8]" />
              Search Tree: {props.showSearchTree ? 'On' : 'Off'}
            </button>

            {props.showSearchTree && (
              <button
                type="button"
                onClick={props.onReplaySearchTree}
                title="Quickly flash the entire search tree on the board with thin lines"
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded bg-[#172838] hover:bg-[#1e3448] border border-[#38bdf8]/45 text-[#7dd3fc] transition-colors whitespace-nowrap cursor-pointer"
              >
                Show Now
              </button>
            )}

            <button
              type="button"
              onClick={props.onToggleShadows}
              aria-pressed={props.shadowsEnabled}
              title="Switch dynamic 3D board & piece shadows on or off"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded border transition-colors whitespace-nowrap cursor-pointer ${
                props.shadowsEnabled
                  ? 'bg-[#1f2634] border-[#c89d54]/50 text-[#f3efe4]'
                  : 'bg-[#171c26] border-white/10 text-[#8d96a6] hover:text-white'
              }`}
            >
              <Sun className="w-3.5 h-3.5 text-[#c89d54]" />
              Shadows: {props.shadowsEnabled ? 'On' : 'Off'}
            </button>

            <button
              type="button"
              onClick={props.onToggleCoordinates}
              className={`px-2.5 py-1 text-[11px] font-medium rounded border transition-colors whitespace-nowrap cursor-pointer ${
                props.showCoordinates
                  ? 'bg-[#1f2634] border-[#c89d54]/50 text-[#f3efe4]'
                  : 'bg-[#171c26] border-white/10 text-[#8d96a6] hover:text-white'
              }`}
            >
              Coords: {props.showCoordinates ? 'On' : 'Off'}
            </button>

            <button
              type="button"
              onClick={props.onToggleSound}
              aria-pressed={!props.soundEnabled}
              title={props.soundEnabled ? 'Mute sound (M)' : 'Unmute sound (M)'}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                props.soundEnabled
                  ? 'bg-[#171c26] hover:bg-[#1f2634] border-white/10 text-[#cfd5e0]'
                  : 'bg-[#2a191c] hover:bg-[#3a2024] border-[#f87171]/40 text-[#fca5a5]'
              }`}
            >
              {props.soundEnabled ? (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-[#c89d54]" />
                  Sound On
                </>
              ) : (
                <>
                  <VolumeX className="w-3.5 h-3.5 text-[#f87171]" />
                  Muted
                </>
              )}
            </button>

            <button
              type="button"
              onClick={props.onPrimaryAction}
              className="px-3.5 py-1 text-xs font-semibold text-[#111419] bg-[#d6ae63] hover:bg-[#e3be78] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e3be78]"
            >
              {props.isReplayMode ? 'Exit Replay' : 'New Match'}
            </button>

            {/* Tab Switcher at the Far Right End of the Rollout Header */}
            <div className="flex items-center gap-1 bg-[#171c26] border border-white/8 rounded-md p-0.5 text-xs">
              {(['play', 'analysis', 'replay'] as DockTab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setLoadDrawerOpen(false);
                    props.onSelectTab(t);
                  }}
                  className={`px-3 py-1 rounded capitalize transition-colors whitespace-nowrap cursor-pointer ${
                    props.activeTab === t && !(t === 'play' && loadDrawerOpen)
                      ? 'bg-[#d6ae63] text-[#111419] font-semibold'
                      : 'text-[#9aa3b2] hover:text-white'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4">
          {/* ==================== PLAY TAB (OR INLINE LOAD DRAWER) ==================== */}
          {props.activeTab === 'play' && loadDrawerOpen && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-white/8">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setLoadDrawerOpen(false)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded bg-[#181d27] hover:bg-[#222937] border border-white/12 text-[#e5e9f0] cursor-pointer whitespace-nowrap"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 text-[#d6ae63]" />
                    Back
                  </button>
                  <span className="text-xs font-semibold text-[#f3efe4] whitespace-nowrap">
                    Load &amp; Save Games
                  </span>
                  <span className="text-[11px] text-[#8d96a6] whitespace-nowrap font-mono-tabular">
                    · {props.savedGames.length} saved
                  </span>
                  {importNotice && (
                    <span
                      className={`text-[11px] whitespace-nowrap ${
                        importNotice.ok ? 'text-[#6ee7b7]' : 'text-[#fca5a5]'
                      }`}
                    >
                      · {importNotice.text}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={props.onSaveCurrentGame}
                    disabled={!props.canSaveCurrent}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap ${
                      props.justSaved
                        ? 'bg-[#192b24] border-[#6ee7b7]/55 text-[#6ee7b7]'
                        : 'bg-[#181d27] hover:bg-[#222937] border-white/12 text-[#e5e9f0]'
                    }`}
                  >
                    {props.justSaved ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Saved!
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5 text-[#d6ae63]" />
                        Save Current
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={props.onExportCurrentGame}
                    disabled={!props.canSaveCurrent}
                    title="Save current match as a .json file on your device"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded bg-[#181d27] hover:bg-[#222937] border border-white/12 text-[#cfd5e0] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5 text-[#d6ae63]" />
                    Save to File
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Load a saved .json or .pgn chess file from your device"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded bg-[#d6ae63] hover:bg-[#e3be78] text-[#111419] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Load File
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[164px] overflow-y-auto thin-scroll pr-0.5">
                {props.savedGames.length === 0 ? (
                  <p className="text-xs text-[#8d96a6] col-span-full py-3">
                    No saved games yet. Click <span className="text-[#f3efe4]">Save Current</span>{' '}
                    during any match to store your position and clock here, or use{' '}
                    <span className="text-[#f3efe4]">Load File</span> to open a .json or .pgn file.
                  </p>
                ) : (
                  props.savedGames.map((g) => {
                    const isInProgress = g.reason === 'in-progress' && !g.result;
                    const statusText = isInProgress ? 'In progress' : g.resultLabel;
                    const levelLabel = g.engineLevel ? ENGINE_LEVELS[g.engineLevel]?.label : null;
                    const dateShort = g.dateIso.slice(0, 16).replace('T', ' ');
                    return (
                      <div
                        key={g.id}
                        className="flex items-center justify-between gap-2.5 px-3 py-2 rounded border bg-[#171c25] border-white/10 hover:border-[#d6ae63]/45 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-[#f3f1ec] truncate">
                            {g.title}
                          </div>
                          <div className="text-[11px] text-[#8d96a6] truncate font-mono-tabular">
                            {statusText} · {g.moves.length} plies
                            {levelLabel ? ` · ${levelLabel}` : ''} · {dateShort}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setLoadDrawerOpen(false);
                              props.onLoadSavedGame(g);
                            }}
                            title="Load game onto the 3D board and continue playing"
                            className="px-2.5 py-1 text-[11px] font-semibold rounded bg-[#d6ae63] hover:bg-[#e3be78] text-[#111419] transition-colors cursor-pointer whitespace-nowrap"
                          >
                            Load
                          </button>
                          {g.moves.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setLoadDrawerOpen(false);
                                props.onLoadReplay(g);
                              }}
                              title="Step through moves from the start in Replay Theatre"
                              className="px-2 py-1 text-[11px] font-medium rounded bg-[#1e2636] hover:bg-[#283247] border border-white/10 text-[#cbd5e1] transition-colors cursor-pointer whitespace-nowrap"
                            >
                              Replay
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => props.onExportSavedGame(g)}
                            aria-label={`Export ${g.title}`}
                            title="Download save file (.json)"
                            className="p-1.5 text-[#8d96a6] hover:text-[#f3efe4] cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => props.onDeleteSavedGame(g.id)}
                            aria-label={`Delete ${g.title}`}
                            title="Delete saved game"
                            className="p-1.5 text-[#7f8999] hover:text-[#f87171] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {props.activeTab === 'play' && !loadDrawerOpen && (
            <div className="flex flex-col gap-3.5">
              {/* Row 1: Mode + Time Control + Camera Presets */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1 p-1 bg-[#191f2a] rounded-md border border-white/8">
                  <button
                    type="button"
                    onClick={() =>
                      props.onStartEngineGame(
                        props.engineLevel,
                        props.humanColorVsAi,
                        props.timeControl,
                      )
                    }
                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                      props.gameMode === 'engine'
                        ? 'bg-[#d6ae63] text-[#111419] font-semibold'
                        : 'text-[#aeb7c6] hover:text-white'
                    }`}
                  >
                    vs Chess Angel
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onStartLocalGame(props.timeControl)}
                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                      props.gameMode === 'local'
                        ? 'bg-[#d6ae63] text-[#111419] font-semibold'
                        : 'text-[#aeb7c6] hover:text-white'
                    }`}
                  >
                    Pass &amp; Play
                  </button>
                </div>

                {/* Time control selector */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-[#8d96a6] mr-1 whitespace-nowrap">Clock</span>
                  <div className="flex items-center gap-1 p-1 bg-[#191f2a] rounded-md border border-white/8">
                    {TC_ORDER.map((tc) => (
                      <button
                        key={tc}
                        type="button"
                        onClick={() => props.onChangeTimeControl(tc)}
                        className={`px-2.5 py-1 text-[11px] font-mono-tabular rounded transition-colors whitespace-nowrap cursor-pointer ${
                          props.timeControl === tc
                            ? 'bg-white/14 text-white font-medium'
                            : 'text-[#8e98a8] hover:text-white'
                        }`}
                      >
                        {tc === 'unlimited' ? '∞' : tc}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Camera Presets */}
                <div className="flex items-center gap-1.5">
                  {(['white', 'black', 'top', 'cinematic'] as CameraPreset[]).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => props.onSelectCameraPreset(preset)}
                      className={`px-2.5 py-1.5 text-[11px] font-medium rounded border transition-colors capitalize whitespace-nowrap cursor-pointer ${
                        props.cameraPreset === preset
                          ? 'bg-white/12 border-[#c89d54]/60 text-[#f5efe2]'
                          : 'bg-[#181d27] border-white/8 text-[#9aa3b2] hover:text-white'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 2: Search Depth Strength + Side + Angel Female Voice (On/Off) + Match Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-white/8">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-[#8d96a6] whitespace-nowrap">Level</span>
                  <div className="flex items-center gap-1 p-1 bg-[#191f2a] rounded-md border border-white/8 overflow-x-auto">
                    {LEVEL_ORDER.map((lvl) => {
                      const spec = ENGINE_LEVELS[lvl];
                      const active = props.engineLevel === lvl;
                      return (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => props.onChangeEngineLevel(lvl)}
                          title={`${spec.label} (${spec.elo} Elo) — ${spec.description}`}
                          className={`px-2.5 py-1 text-[11px] rounded transition-colors whitespace-nowrap cursor-pointer ${
                            active
                              ? 'bg-[#d6ae63]/20 text-[#f0d192] font-semibold border border-[#d6ae63]/50'
                              : 'text-[#9aa3b2] hover:text-white border border-transparent'
                          }`}
                        >
                          {spec.label}{' '}
                          <span className="font-mono-tabular opacity-75">{spec.elo}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Side selector */}
                  <div className="flex items-center gap-1 p-1 bg-[#191f2a] rounded-md border border-white/8">
                    {(['w', 'b', 'random'] as const).map((side) => (
                      <button
                        key={side}
                        type="button"
                        onClick={() => props.onChangeHumanColorVsAi(side)}
                        className={`px-2 py-1 text-[11px] rounded transition-colors whitespace-nowrap cursor-pointer ${
                          props.humanColorVsAi === side
                            ? 'bg-white/14 text-white font-medium'
                            : 'text-[#8e98a8] hover:text-white'
                        }`}
                      >
                        {side === 'w' ? 'White' : side === 'b' ? 'Black' : 'Random'}
                      </button>
                    ))}
                  </div>

                  {/* Warm Female Chess Angel Voice (On / Off) + Angel & Modal Visibility Switch + Auto Tree */}
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-[#8d96a6] whitespace-nowrap">
                        Angel Voice
                      </span>
                      <div className="flex items-center gap-1 p-1 bg-[#191f2a] rounded-md border border-white/8">
                        {(['on', 'off'] as AngelVoiceMode[]).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => props.onChangeAngelVoice(mode)}
                            className={`px-2.5 py-1 text-[11px] rounded transition-colors capitalize whitespace-nowrap cursor-pointer ${
                              props.angelVoice === mode
                                ? 'bg-[#d6ae63]/20 text-[#f0d192] font-semibold border border-[#d6ae63]/50'
                                : 'text-[#8e98a8] hover:text-white border border-transparent'
                            }`}
                          >
                            {mode === 'on' ? 'On' : 'Off'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-[#8d96a6] whitespace-nowrap">
                        Angel &amp; Modal
                      </span>
                      <div className="flex items-center gap-1 p-1 bg-[#191f2a] rounded-md border border-white/8">
                        {([true, false] as const).map((vis) => (
                          <button
                            key={vis ? 'on' : 'off'}
                            type="button"
                            onClick={() => props.onChangeAngelVisible(vis)}
                            aria-pressed={props.angelVisible === vis}
                            className={`px-2.5 py-1 text-[11px] rounded transition-colors whitespace-nowrap cursor-pointer ${
                              props.angelVisible === vis
                                ? 'bg-[#d6ae63]/20 text-[#f0d192] font-semibold border border-[#d6ae63]/50'
                                : 'text-[#8e98a8] hover:text-white border border-transparent'
                            }`}
                          >
                            {vis ? 'On' : 'Off'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={props.onToggleSearchTree}
                      aria-pressed={props.showSearchTree}
                      title="Automatically develop the full search tree on the board and keep it visible until you click"
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                        props.showSearchTree
                          ? 'bg-[#172838] text-[#bae6fd] font-semibold border-[#38bdf8]/55'
                          : 'bg-[#191f2a] text-[#8e98a8] hover:text-white border-white/8'
                      }`}
                    >
                      <GitBranch className="w-3.5 h-3.5 text-[#38bdf8]" />
                      Auto Tree: {props.showSearchTree ? 'On' : 'Off'}
                    </button>
                  </div>
                </div>

                {/* Match actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={props.onUndo}
                    disabled={!props.canUndo}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-[#181d27] hover:bg-[#222937] border border-white/10 text-[#d7dce5] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Undo
                  </button>
                  <button
                    type="button"
                    onClick={props.onSaveCurrentGame}
                    disabled={!props.canSaveCurrent}
                    title="Save current match progress, clock, and board state"
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap ${
                      props.justSaved
                        ? 'bg-[#192b24] border-[#6ee7b7]/55 text-[#6ee7b7]'
                        : 'bg-[#181d27] hover:bg-[#222937] border-white/10 text-[#d7dce5]'
                    }`}
                  >
                    {props.justSaved ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Saved!
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5 text-[#d6ae63]" />
                        Save
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLoadDrawerOpen(true);
                      props.onOpenLoadDrawer?.();
                    }}
                    title="Open saved games or load a .json / .pgn save file"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-[#181d27] hover:bg-[#222937] border border-white/10 text-[#d7dce5] cursor-pointer whitespace-nowrap"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-[#d6ae63]" />
                    Load{props.savedGames.length > 0 ? ` (${props.savedGames.length})` : ''}
                  </button>
                  {props.gameMode !== 'multiplayer' && props.isGameActive && (
                    <button
                      type="button"
                      onClick={props.onResignLocal}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-[#2a191c] hover:bg-[#3a2024] border border-[#f87171]/30 text-[#fca5a5] cursor-pointer whitespace-nowrap"
                    >
                      <Flag className="w-3.5 h-3.5" />
                      Resign
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==================== ANALYSIS TAB ==================== */}
          {props.activeTab === 'analysis' && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={props.onToggleAnalysis}
                    className={`px-3 py-1.5 text-xs font-semibold rounded border transition-colors cursor-pointer whitespace-nowrap ${
                      props.analysisEnabled
                        ? 'bg-[#d6ae63] border-[#d6ae63] text-[#111419]'
                        : 'bg-[#181d27] border-white/12 text-[#cbd2df]'
                    }`}
                  >
                    {props.analysisEnabled ? 'Engine Active' : 'Enable Engine'}
                  </button>
                  <button
                    type="button"
                    onClick={props.onToggleBestMoveArrow}
                    disabled={!props.analysisEnabled}
                    className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap ${
                      props.showBestMoveArrow && props.analysisEnabled
                        ? 'bg-[#172838] border-[#38bdf8]/60 text-[#7dd3fc]'
                        : 'bg-[#181d27] border-white/10 text-[#9aa3b2]'
                    }`}
                  >
                    Best-Move Arrow
                  </button>
                  <button
                    type="button"
                    onClick={props.onReplaySearchTree}
                    title="Display the entire explored search tree and browse simulations calmly"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border bg-[#181d27] hover:bg-[#212938] border-[#38bdf8]/40 text-[#bae6fd] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <GitBranch className="w-3.5 h-3.5 text-[#38bdf8]" />
                    Browse Search Tree
                  </button>
                  <button
                    type="button"
                    onClick={props.onExportTreeJpg}
                    title="Extract frontal top-view thinking tree lines on pure #000000 black"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded border bg-[#181d27] hover:bg-[#212938] border-white/14 text-[#e2e8f0] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#d6ae63]" />
                    Frontal Tree
                  </button>

                  {props.analysisEnabled && props.analysis && (
                    <div className="hidden sm:flex items-center gap-2 text-xs text-[#9aa3b2] ml-2 font-mono-tabular">
                      <span className="text-[#f3f1ec] font-semibold">
                        {props.analysis.lines[0]
                          ? formatEvalLabel(
                              props.analysis.lines[0].scoreCp,
                              props.analysis.lines[0].mateIn,
                            )
                          : '0.0'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>Depth {props.analysis.depth}</span>
                      <span aria-hidden="true">·</span>
                      <span>{(props.analysis.nps / 1000).toFixed(1)}k n/s</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => props.onJumpToPly(0)}
                    disabled={props.viewPly === 0}
                    aria-label="First move"
                    className="p-1.5 rounded bg-[#181d27] hover:bg-[#232b3a] border border-white/10 text-[#cbd2df] disabled:opacity-35 cursor-pointer"
                  >
                    <SkipBack className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onJumpToPly(Math.max(0, props.viewPly - 1))}
                    disabled={props.viewPly === 0}
                    aria-label="Previous move"
                    className="p-1.5 rounded bg-[#181d27] hover:bg-[#232b3a] border border-white/10 text-[#cbd2df] disabled:opacity-35 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onJumpToPly(Math.min(totalPlies, props.viewPly + 1))}
                    disabled={props.viewPly >= totalPlies}
                    aria-label="Next move"
                    className="p-1.5 rounded bg-[#181d27] hover:bg-[#232b3a] border border-white/10 text-[#cbd2df] disabled:opacity-35 cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onJumpToPly(totalPlies)}
                    disabled={props.viewPly >= totalPlies}
                    aria-label="Latest move"
                    className="p-1.5 rounded bg-[#181d27] hover:bg-[#232b3a] border border-white/10 text-[#cbd2df] disabled:opacity-35 cursor-pointer"
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                  </button>

                  <span className="text-white/15 mx-1" aria-hidden="true">
                    |
                  </span>

                  <button
                    type="button"
                    onClick={() => copyText('fen', props.currentFen)}
                    className="px-2.5 py-1.5 text-[11px] font-medium rounded bg-[#181d27] hover:bg-[#232b3a] border border-white/10 text-[#cbd2df] cursor-pointer whitespace-nowrap"
                  >
                    {copiedKey === 'fen' ? 'FEN Copied' : 'Copy FEN'}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyText('pgn', props.currentPgn)}
                    className="px-2.5 py-1.5 text-[11px] font-medium rounded bg-[#181d27] hover:bg-[#232b3a] border border-white/10 text-[#cbd2df] cursor-pointer whitespace-nowrap"
                  >
                    {copiedKey === 'pgn' ? 'PGN Copied' : 'Copy PGN'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-white/8">
                <div className="md:col-span-6 flex flex-col gap-1">
                  {!props.analysisEnabled ? (
                    <p className="text-xs text-[#7f8999] py-2">
                      Enable the mathematical engine to inspect multi-PV candidate lines and 3D
                      arrows.
                    </p>
                  ) : !props.analysis || props.analysis.lines.length === 0 ? (
                    <p className="text-xs text-[#7f8999] py-2">Evaluating position...</p>
                  ) : (
                    props.analysis.lines.slice(0, 3).map((line) => (
                      <div
                        key={line.multipv}
                        className="flex items-center gap-2.5 text-xs py-1 px-2 rounded bg-[#171c25] border border-white/6"
                      >
                        <span className="font-mono-tabular font-semibold text-[#e6c47f] w-11 shrink-0">
                          {formatEvalLabel(line.scoreCp, line.mateIn)}
                        </span>
                        <span className="font-mono-tabular text-[#d7dce5] truncate flex-1">
                          {line.pvSan.join(' ')}
                        </span>
                        {!props.isReplayMode &&
                          props.gameMode !== 'multiplayer' &&
                          props.viewPly === totalPlies && (
                            <button
                              type="button"
                              onClick={() => props.onPlayEngineMove(line.bestMoveUci)}
                              className="text-[11px] text-[#7dd3fc] hover:text-white cursor-pointer whitespace-nowrap shrink-0"
                            >
                              Play
                            </button>
                          )}
                      </div>
                    ))
                  )}
                </div>

                <div className="md:col-span-6 flex flex-wrap items-start content-start gap-x-2 gap-y-1 max-h-[86px] overflow-y-auto thin-scroll border-l border-white/8 pl-3 text-xs font-mono-tabular">
                  {props.moveHistory.length === 0 ? (
                    <span className="text-[#6f7888] font-sans">
                      Moves played in this game will appear here.
                    </span>
                  ) : (
                    props.moveHistory.map((m) => {
                      const active = props.viewPly === m.ply;
                      const meta = props.moveEvalMeta[m.ply];
                      const quality = meta?.quality;
                      const qualityClass = quality ? QUALITY_COLORS[quality] : 'text-[#d7dce5]';
                      const tooltip = quality
                        ? `${m.san} · ${QUALITY_LABELS[quality]}${
                            typeof meta?.cpLoss === 'number' && meta.cpLoss > 0
                              ? ` (−${Math.round(meta.cpLoss)} cp)`
                              : ''
                          }`
                        : m.san;
                      return (
                        <button
                          key={m.ply}
                          type="button"
                          onClick={() => props.onJumpToPly(m.ply)}
                          title={tooltip}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#d6ae63] text-[#111419] font-semibold'
                              : `hover:bg-white/10 ${qualityClass}`
                          }`}
                        >
                          <span>
                            {m.ply % 2 === 1 ? `${Math.ceil(m.ply / 2)}. ` : ''}
                            {m.san}
                          </span>
                          <MoveQualityIcon quality={quality} active={active} />
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==================== REPLAY TAB ==================== */}
          {props.activeTab === 'replay' && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => props.onJumpToPly(0)}
                    disabled={props.viewPly === 0}
                    title="Jump to start"
                    className="p-1.5 rounded bg-[#181d27] hover:bg-[#232b3a] border border-white/10 text-[#cbd2df] disabled:opacity-35 cursor-pointer"
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={props.onRewindStep}
                    disabled={props.viewPly === 0}
                    title="Rewind 2 plies"
                    className="p-1.5 rounded bg-[#181d27] hover:bg-[#232b3a] border border-white/10 text-[#cbd2df] disabled:opacity-35 cursor-pointer"
                  >
                    <Rewind className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onJumpToPly(Math.max(0, props.viewPly - 1))}
                    disabled={props.viewPly === 0}
                    title="Step back 1 move"
                    className="p-1.5 rounded bg-[#181d27] hover:bg-[#232b3a] border border-white/10 text-[#cbd2df] disabled:opacity-35 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={props.onToggleReplayPlay}
                    disabled={totalPlies === 0}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-[#d6ae63] hover:bg-[#e3be78] text-[#111419] text-xs font-semibold disabled:opacity-40 cursor-pointer whitespace-nowrap"
                  >
                    {props.replayPlaying ? (
                      <>
                        <Pause className="w-3.5 h-3.5" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        {props.viewPly >= totalPlies && totalPlies > 0 ? 'Replay' : 'Play'}
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => props.onJumpToPly(Math.min(totalPlies, props.viewPly + 1))}
                    disabled={props.viewPly >= totalPlies}
                    title="Step forward 1 move"
                    className="p-1.5 rounded bg-[#181d27] hover:bg-[#232b3a] border border-white/10 text-[#cbd2df] disabled:opacity-35 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={props.onFastForwardStep}
                    disabled={props.viewPly >= totalPlies}
                    title="Fast-forward 2 plies"
                    className="p-1.5 rounded bg-[#181d27] hover:bg-[#232b3a] border border-white/10 text-[#cbd2df] disabled:opacity-35 cursor-pointer"
                  >
                    <FastForward className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onJumpToPly(totalPlies)}
                    disabled={props.viewPly >= totalPlies}
                    title="Jump to end"
                    className="p-1.5 rounded bg-[#181d27] hover:bg-[#232b3a] border border-white/10 text-[#cbd2df] disabled:opacity-35 cursor-pointer"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2.5 flex-1 min-w-[180px] max-w-sm">
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, totalPlies)}
                    value={props.viewPly}
                    onChange={(e) => props.onJumpToPly(Number(e.target.value))}
                    disabled={totalPlies === 0}
                    aria-label="Scrub move timeline"
                    className="flex-1 accent-[#d6ae63] cursor-pointer"
                  />
                  <span className="inline-flex items-center justify-end gap-1 font-mono-tabular text-[11px] text-[#cfd5e0] whitespace-nowrap min-w-[6.5rem] text-right">
                    <span>
                      {props.viewPly}/{totalPlies}
                      {currentMoveRec ? ` · ${currentMoveRec.san}` : ''}
                    </span>
                    {currentMoveRec && (
                      <MoveQualityIcon quality={props.moveEvalMeta[currentMoveRec.ply]?.quality} />
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {[0.5, 1, 2, 3].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => props.onChangeReplaySpeed(spd)}
                      className={`px-2 py-1 text-[11px] font-mono-tabular rounded border cursor-pointer ${
                        props.replaySpeed === spd
                          ? 'bg-white/14 border-[#c89d54]/60 text-white'
                          : 'bg-[#181d27] border-white/8 text-[#8d96a6] hover:text-white'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}

                  {!props.isReplayMode && (
                    <button
                      type="button"
                      onClick={props.onSaveCurrentGame}
                      disabled={!props.canSaveCurrent}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded border transition-colors disabled:opacity-40 cursor-pointer whitespace-nowrap ml-1 ${
                        props.justSaved
                          ? 'bg-[#192b24] border-[#6ee7b7]/55 text-[#6ee7b7]'
                          : 'bg-[#1d2533] hover:bg-[#273144] border-white/12 text-[#f3f1ec]'
                      }`}
                    >
                      {props.justSaved ? (
                        <>
                          <Check className="w-3 h-3" />
                          Saved!
                        </>
                      ) : (
                        <>
                          <Save className="w-3 h-3" />
                          Save Current
                        </>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Import a .json or .pgn save file"
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded bg-[#1d2533] hover:bg-[#273144] border border-white/12 text-[#f3f1ec] cursor-pointer whitespace-nowrap"
                  >
                    <Upload className="w-3 h-3 text-[#d6ae63]" />
                    Load File
                  </button>
                  {props.isReplayMode && (
                    <button
                      type="button"
                      onClick={props.onExitReplay}
                      className="px-2.5 py-1 text-[11px] font-medium rounded bg-[#1d2533] hover:bg-[#273144] border border-white/12 text-[#f3f1ec] cursor-pointer whitespace-nowrap ml-1"
                    >
                      Return to Live
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2 border-t border-white/8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 p-0.5 bg-[#191f2a] rounded border border-white/8">
                    <button
                      type="button"
                      onClick={() => setReplayListTab('saved')}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded cursor-pointer ${
                        replayListTab === 'saved' ? 'bg-white/14 text-white' : 'text-[#8d96a6]'
                      }`}
                    >
                      Saved Games ({props.savedGames.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setReplayListTab('classics')}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded cursor-pointer ${
                        replayListTab === 'classics' ? 'bg-white/14 text-white' : 'text-[#8d96a6]'
                      }`}
                    >
                      Master Classics ({props.classicReplays.length})
                    </button>
                  </div>
                  <span className="text-[11px] text-[#8d96a6] hidden sm:inline">
                    Click a title to review in Replay · click Load to resume playing
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-[88px] overflow-y-auto thin-scroll">
                  {(replayListTab === 'saved' ? props.savedGames : props.classicReplays).length ===
                  0 ? (
                    <p className="text-xs text-[#6f7888] col-span-full py-2">
                      No saved games yet. Finish a match or click &ldquo;Save Current&rdquo; to
                      archive it for replay or resume.
                    </p>
                  ) : (
                    (replayListTab === 'saved' ? props.savedGames : props.classicReplays).map(
                      (g) => {
                        const isLoaded =
                          props.activeReplayGame?.id === g.id && props.isReplayMode;
                        return (
                          <div
                            key={g.id}
                            className={`flex items-center justify-between gap-2 px-3 py-2 rounded border transition-colors ${
                              isLoaded
                                ? 'bg-[#222938] border-[#c89d54]/70'
                                : 'bg-[#171c25] border-white/8 hover:border-white/20'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => props.onLoadReplay(g)}
                              className="text-left min-w-0 flex-1 cursor-pointer"
                            >
                              <div className="text-xs font-medium text-[#f3f1ec] truncate">
                                {g.title}
                              </div>
                              <div className="text-[11px] text-[#8d96a6] truncate font-mono-tabular">
                                {g.reason === 'in-progress' && !g.result ? 'In progress' : g.resultLabel}{' '}
                                · {g.moves.length} plies · {g.dateIso.slice(0, 10)}
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => props.onLoadSavedGame(g)}
                              title="Load onto the 3D board and resume playing"
                              className="px-2 py-0.5 text-[11px] font-semibold rounded bg-[#d6ae63]/90 hover:bg-[#e3be78] text-[#111419] cursor-pointer shrink-0"
                            >
                              Load
                            </button>
                            {replayListTab === 'saved' && (
                              <button
                                type="button"
                                onClick={() => props.onDeleteSavedGame(g.id)}
                                aria-label={`Delete ${g.title}`}
                                className="p-1 text-[#7f8999] hover:text-[#f87171] cursor-pointer shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      },
                    )
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
