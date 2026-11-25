import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { APP_VERSION } from './chess/assetVersion';
import { Maximize2, Minimize2, X } from 'lucide-react';
import { Chess, type Move, type Square } from 'chess.js';
import { ChessScene3D, type SuggestionArrow } from './three/ChessScene3D';
import { soundEngine } from './three/sound';
import {
  buildQuickSearchTreeForPosition,
  classifyMoveQuality,
  formatEvalLabel,
  quickEvaluateHumanMove,
} from './chess/engine';
import type { EngineWorkerRequest, EngineWorkerResponse } from './chess/engineWorker';
import { MultiplayerClient, type ConnectionStatus } from './services/multiplayerClient';
import {
  CLASSIC_REPLAYS,
  buildPgnFromMoves,
  exportSavedGameJson,
  loadSavedGames,
  parseImportedSavedGame,
  persistSavedGames,
} from './services/gameArchive';
import { EvalBar } from './components/EvalBar';
import { TopBar, type DockTab } from './components/TopBar';
import { TacticalTrainingHud, type TacticalRunStatus } from './components/TacticalTrainingHud';
import { ControlDock } from './components/ControlDock';
import { PromotionModal } from './components/PromotionModal';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
const LazyAngelVideoStudioModal = import.meta.env.DEV
  ? lazy(() =>
      import('./components/AngelVideoStudioModal').then((m) => ({
        default: m.AngelVideoStudioModal,
      })),
    )
  : null;
import {
  OpponentSpeechBanner,
  type CalcPreviewProgress,
  type TreeBrowserState,
} from './components/OpponentSpeechBanner';
import {
  buildTopThreeEdges,
  drawSearchTreeTopViewOnCanvas,
} from './chess/treeJpgExporter';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import {
  computeFallbackUpperRightVoid,
  type UpperRightVoidSpec,
} from './utils/deviceLayout';
import {
  IS_VIDEO_STUDIO_DEV_ENV,
  VOICE_CLIP_DURATION_SEC,
  extractCaseIdFromClip,
  getAngelDanceStarsVideoUrl,
  getAngelDogRunJumpSec,
  getAngelDogRunVideoUrl,
  getAngelVideoOverridesSnapshot,
  getVideoFileDurationSec,
  isStudioDeveloperUnlocked,
  logoutStudioDeveloperSession,
  prepareHumanCommentaryPlayback,
  resetGameVideoPlayCounts,
  startAngelMediaBackgroundPrewarmer,
  subscribeStudioDeveloperAuth,
  unlockStudioDeveloperSession,
} from './chess/angelPortraitVideos';

const ALLOW_VIDEO_STUDIO = Boolean(import.meta.env.DEV) && IS_VIDEO_STUDIO_DEV_ENV;
import {
  composeBotMoveCommentary,
  composeHesitationCommentary,
  createAngelModalOffMessage,
  createAngelModalOnMessage,
  createCalcShowingMessage,
  createClockTimeoutMessage,
  createThankJanMessage,
  createEngineLevelMessage,
  createHintShownMessage,
  createIntroMessage,
  createLoadGameMessage,
  createNewMatchMessage,
  createResignMessage,
  createSaveGameMessage,
  createTreeBrowseMessage,
  createTrialConfirmMessage,
  createUndoConfirmedMessage,
  evaluateHumanMoveCommentary,
  getSpeakerName,
  inspectPostMoveForkState,
  DEFAULT_MUSIC_TRACKS,
  opponentSpeech,
  resetGameCommentaryCounts,
  resolvePreviewConcernedFigures,
  resolvePreviewForkArrows,
  type AngelVoiceMode,
  type MusicTrack,
  type OpponentMessage,
  type VoicePlaybackState,
} from './chess/opponentVoice';
import {
  ENGINE_LEVELS,
  TIME_CONTROLS,
  type AnalysisSnapshot,
  type AnalyzedMoveMeta,
  type BoardSkinId,
  type BotSearchReport,
  type CameraPreset,
  type EngineLevel,
  type EngineLine,
  type GameMode,
  type MoveRecord,
  type PieceColor,
  type PieceType,
  type PublicRoomSummary,
  type RoomResult,
  type RoomState,
  type SavedGame,
  type SearchTreeEdge,
  type TimeControlId,
} from './shared/types';
import {
  TACTICAL_PUZZLES,
  evaluateTacticalMoveAttempt,
  getPuzzleTimeLimitMs,
  loadTacticalStats,
  recordTacticalHintUsed,
  recordTacticalMistakeOrReveal,
  recordTacticalSolve,
  resetTacticalStats,
  uciToSanInPosition,
  type TacticalDifficulty,
  type TacticalPuzzle,
  type TacticalSolveAward,
  type TacticalTheme,
  type TacticalTrainingStats,
} from './chess/tacticalPuzzles';

const INITIAL_FEN = new Chess().fen();
const DEFAULT_SKIN: BoardSkinId = 'walnut-maple';
const PIECE_MATERIAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function computeMaterialDiff(fen: string): number {
  const chess = new Chess(fen);
  let diff = 0;
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell) continue;
      const val = PIECE_MATERIAL[cell.type] || 0;
      diff += cell.color === 'w' ? val : -val;
    }
  }
  return diff;
}

function findCheckedKingSquare(chess: Chess): string | null {
  if (!chess.inCheck()) return null;
  const turn = chess.turn();
  const board = chess.board();
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      if (cell && cell.type === 'k' && cell.color === turn) {
        return `${files[c]}${8 - r}`;
      }
    }
  }
  return null;
}

function evaluateLocalGameOver(chess: Chess): RoomResult | null {
  if (chess.isCheckmate()) {
    return { winner: chess.turn() === 'w' ? 'b' : 'w', reason: 'checkmate' };
  }
  if (chess.isStalemate()) return { winner: 'draw', reason: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { winner: 'draw', reason: 'insufficient' };
  if (chess.isThreefoldRepetition()) return { winner: 'draw', reason: 'threefold' };
  if (chess.isDraw()) return { winner: 'draw', reason: 'fifty-move' };
  return null;
}

function resultToScoreLabel(res: RoomResult | null): string {
  if (!res) return '*';
  if (res.winner === 'w') return '1-0';
  if (res.winner === 'b') return '0-1';
  return '1/2-1/2';
}

function resolveCandidateMovesForFen(
  fen: string,
  analysisSnap: AnalysisSnapshot | null,
  maxCount = 3,
): Array<{ uci: string; san: string }> {
  let rootChess: Chess;
  try {
    rootChess = new Chess(fen);
  } catch {
    return [];
  }
  const legalMoves = rootChess.moves({ verbose: true });
  if (legalMoves.length === 0) return [];

  const results: Array<{ uci: string; san: string }> = [];
  const seenUci = new Set<string>();

  const tryAddUci = (rawUci?: string) => {
    if (!rawUci || rawUci.length < 4 || results.length >= maxCount) return;
    const from = rawUci.slice(0, 2);
    const to = rawUci.slice(2, 4);
    const promotion = (rawUci.slice(4, 5) || undefined) as PieceType | undefined;
    try {
      const probe = new Chess(fen);
      const mv = probe.move({ from, to, promotion });
      if (!mv) return;
      const canonicalUci = `${mv.from}${mv.to}${mv.promotion || ''}`;
      if (seenUci.has(canonicalUci)) return;
      seenUci.add(canonicalUci);
      results.push({ uci: canonicalUci, san: mv.san });
    } catch {
      // Ignore invalid candidate UCI
    }
  };

  if (analysisSnap && analysisSnap.fen === fen) {
    for (const l of analysisSnap.lines) {
      tryAddUci(l.bestMoveUci || l.pvUci?.[0]);
    }
    if (results.length < maxCount && analysisSnap.allSimulations) {
      for (const l of analysisSnap.allSimulations) {
        tryAddUci(l.bestMoveUci || l.pvUci?.[0]);
      }
    }
  }

  if (results.length < maxCount) {
    try {
      const quick = buildQuickSearchTreeForPosition(fen);
      for (const l of quick.allSimulations) {
        tryAddUci(l.bestMoveUci || l.pvUci?.[0]);
      }
    } catch {
      // Ignore quick-tree error and fall back to legal moves
    }
  }

  if (results.length < maxCount) {
    const orderedLegal = [...legalMoves].sort(
      (a, b) => Number(Boolean(b.captured)) - Number(Boolean(a.captured)),
    );
    for (const mv of orderedLegal) {
      tryAddUci(`${mv.from}${mv.to}${mv.promotion || ''}`);
      if (results.length >= maxCount) break;
    }
  }

  return results;
}

function normalizeLegalEngineLinesForFen(
  rootFen: string,
  rawLines: EngineLine[] | undefined | null,
  maxLines = 3,
): EngineLine[] {
  if (!rawLines || rawLines.length === 0) return [];
  const validLines: EngineLine[] = [];
  const seenRootUci = new Set<string>();

  for (const line of rawLines) {
    if (validLines.length >= maxLines) break;
    const rawPv =
      line.pvUci && line.pvUci.length > 0
        ? line.pvUci
        : line.bestMoveUci && line.bestMoveUci.length >= 4
          ? [line.bestMoveUci]
          : [];
    if (rawPv.length === 0) continue;

    try {
      const sim = new Chess(rootFen);
      const checkedUci: string[] = [];
      const checkedSan: string[] = [];
      for (const u of rawPv.slice(0, 4)) {
        if (!u || u.length < 4) break;
        const mv = sim.move({
          from: u.slice(0, 2),
          to: u.slice(2, 4),
          promotion: (u.slice(4, 5) || undefined) as PieceType | undefined,
        });
        if (!mv) break;
        checkedUci.push(`${mv.from}${mv.to}${mv.promotion || ''}`);
        checkedSan.push(mv.san);
      }
      if (checkedUci.length === 0) continue;
      if (seenRootUci.has(checkedUci[0])) continue;
      seenRootUci.add(checkedUci[0]);

      // Extend 1-ply lines with a natural reply if legal moves exist so branch walkthrough feels rich
      if (checkedUci.length === 1) {
        const replies = sim.moves({ verbose: true });
        if (replies.length > 0) {
          const replyPick = replies.find((r) => r.captured) || replies[0];
          const replyMv = sim.move({
            from: replyPick.from,
            to: replyPick.to,
            promotion: replyPick.promotion,
          });
          if (replyMv) {
            checkedUci.push(`${replyMv.from}${replyMv.to}${replyMv.promotion || ''}`);
            checkedSan.push(replyMv.san);
          }
        }
      }

      validLines.push({
        ...line,
        multipv: validLines.length + 1,
        bestMoveUci: checkedUci[0],
        pvUci: checkedUci,
        pvSan: checkedSan,
      });
    } catch {
      // Ignore malformed line
    }
  }

  return validLines;
}

function ensureValidCalcReport(
  report: BotSearchReport | null | undefined,
  fallbackFen: string,
  analysisSnap: AnalysisSnapshot | null,
): BotSearchReport | null {
  if (report && report.rootFen) {
    const validFromReport = normalizeLegalEngineLinesForFen(
      report.rootFen,
      report.triedLines && report.triedLines.length > 0
        ? report.triedLines
        : report.allSimulations,
      3,
    );
    if (validFromReport.length > 0) {
      return {
        ...report,
        bestMoveUci:
          report.bestMoveUci && report.bestMoveUci.length >= 4
            ? report.bestMoveUci
            : validFromReport[0].bestMoveUci,
        triedLines: validFromReport,
      };
    }
  }

  let chess: Chess;
  try {
    chess = new Chess(fallbackFen);
  } catch {
    return null;
  }
  const legalMoves = chess.moves({ verbose: true });
  if (legalMoves.length === 0) return null;

  const fromAnalysis =
    analysisSnap?.fen === fallbackFen
      ? normalizeLegalEngineLinesForFen(
          fallbackFen,
          analysisSnap.allSimulations && analysisSnap.allSimulations.length > 0
            ? analysisSnap.allSimulations
            : analysisSnap.lines,
          3,
        )
      : [];

  const quickCache: { val: ReturnType<typeof buildQuickSearchTreeForPosition> | null } = {
    val: null,
  };
  const getQuick = () => {
    if (!quickCache.val) quickCache.val = buildQuickSearchTreeForPosition(fallbackFen);
    return quickCache.val;
  };

  let triedLines =
    fromAnalysis.length > 0
      ? fromAnalysis
      : normalizeLegalEngineLinesForFen(fallbackFen, getQuick().allSimulations, 3);

  if (triedLines.length === 0) {
    const ordered = [...legalMoves].sort(
      (a, b) => Number(Boolean(b.captured)) - Number(Boolean(a.captured)),
    );
    const rawFallback: EngineLine[] = ordered.slice(0, 3).map((mv, idx) => ({
      multipv: idx + 1,
      scoreCp: 0,
      mateIn: null,
      bestMoveUci: `${mv.from}${mv.to}${mv.promotion || ''}`,
      pvUci: [`${mv.from}${mv.to}${mv.promotion || ''}`],
      pvSan: [mv.san],
    }));
    triedLines = normalizeLegalEngineLinesForFen(fallbackFen, rawFallback, 3);
  }

  if (triedLines.length === 0) return null;

  const edges =
    (analysisSnap?.fen === fallbackFen &&
    analysisSnap.treeEdges &&
    analysisSnap.treeEdges.length > 0
      ? analysisSnap.treeEdges
      : null) || getQuick().edges;

  return {
    rootFen: fallbackFen,
    bestMoveUci: triedLines[0].bestMoveUci,
    depth: analysisSnap?.fen === fallbackFen ? analysisSnap.depth : 3,
    nodes:
      analysisSnap?.fen === fallbackFen
        ? Math.max(32, analysisSnap.nodes)
        : Math.max(64, triedLines.length * 48),
    timeMs: 220,
    triedLines,
    allSimulations:
      (analysisSnap?.fen === fallbackFen && analysisSnap.allSimulations) ||
      quickCache.val?.allSimulations ||
      triedLines,
    treeEdges: edges,
  };
}

function ensureTreeSimulations(
  rootFen: string,
  simulations: EngineLine[] | null | undefined,
  analysisSnap?: AnalysisSnapshot | null,
): EngineLine[] {
  if (simulations && simulations.length > 0) {
    return simulations;
  }

  if (analysisSnap?.fen === rootFen) {
    if (analysisSnap.allSimulations && analysisSnap.allSimulations.length > 0) {
      return analysisSnap.allSimulations;
    }
    if (analysisSnap.lines && analysisSnap.lines.length > 0) {
      return analysisSnap.lines;
    }
  }

  const quick = buildQuickSearchTreeForPosition(rootFen);
  if (quick.allSimulations.length > 0) {
    return quick.allSimulations;
  }

  try {
    const chess = new Chess(rootFen);
    const legalMoves = chess.moves({ verbose: true });
    if (legalMoves.length === 0) return [];
    const ordered = [...legalMoves].sort(
      (a, b) => Number(Boolean(b.captured)) - Number(Boolean(a.captured)),
    );
    return ordered.slice(0, 16).map((mv, idx) => ({
      multipv: idx + 1,
      scoreCp: 0,
      mateIn: null,
      bestMoveUci: `${mv.from}${mv.to}${mv.promotion || ''}`,
      pvUci: [`${mv.from}${mv.to}${mv.promotion || ''}`],
      pvSan: [mv.san],
    }));
  } catch {
    return [];
  }
}

function buildRootPreviewArrowsFromReport(report: BotSearchReport): SuggestionArrow[] {
  const trialKinds: Array<'trial-1' | 'trial-2' | 'trial-3'> = [
    'trial-1',
    'trial-2',
    'trial-3',
  ];
  return report.triedLines.slice(0, 3).flatMap((line, idx) => {
    const uci = line.pvUci?.[0] || line.bestMoveUci;
    if (!uci || uci.length < 4) return [];
    return [
      {
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        kind: trialKinds[idx] || 'trial-1',
        opacityScale: 0.92,
      },
    ];
  });
}

export default function App() {
  // === Retractable Bottom HUD Dock (closed during play, opened ONLY via rollout arrow) ===
  const [dockCollapsed, setDockCollapsed] = useState(true);
  const [activeTab, setActiveTab] = useState<DockTab>('play');

  // === Studio & Voice Preferences ===
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('white');
  const [showCoordinates, setShowCoordinates] = useState(true);
  const [showSearchTree, setShowSearchTree] = useState(true);
  const [suppressTreeAndThreeMoves, setSuppressTreeAndThreeMoves] = useState(false);
  const [treeStatusMode, setTreeStatusMode] = useState<'idle' | 'developing' | 'holding'>('idle');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem('chess_angel_music_enabled_v1') === '1';
    } catch {
      return false;
    }
  });
  const musicEnabledRef = useRef<boolean>(musicEnabled);
  musicEnabledRef.current = musicEnabled;
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([...DEFAULT_MUSIC_TRACKS]);
  const [activeMusicTrackIndex, setActiveMusicTrackIndex] = useState<number>(0);
  const [angelVoice, setAngelVoice] = useState<AngelVoiceMode>('on');
  const [angelModalEnabled, setAngelModalEnabled] = useState<boolean>(true);
  const [angelVisible, setAngelVisible] = useState<boolean>(true);
  const angelModalOffTimerRef = useRef<number | null>(null);
  const thankJanPlayingUntilRef = useRef<number>(0);
  const [powerSaveMode, setPowerSaveMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const saved = window.localStorage.getItem('chess_angel_power_save_v1');
      if (saved === '1') return true;
      if (saved === '0') return false;
    } catch {
      // ignore storage errors
    }
    return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  });
  const [shadowsEnabled, setShadowsEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        if (window.localStorage.getItem('chess_angel_power_save_v1') === '1') {
          return false;
        }
      } catch {
        // ignore
      }
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        return false;
      }
    }
    return typeof navigator === 'undefined' || !/Android|iPhone|iPad/i.test(navigator.userAgent);
  });
  const prePowerSaveShadowsRef = useRef<boolean | null>(null);
  const handleTogglePowerSaveMode = useCallback(() => {
    const next = !powerSaveMode;
    setPowerSaveMode(next);
    try {
      window.localStorage.setItem('chess_angel_power_save_v1', next ? '1' : '0');
    } catch {
      // ignore
    }
    if (next) {
      prePowerSaveShadowsRef.current = shadowsEnabled;
      if (shadowsEnabled) {
        setShadowsEnabled(false);
      }
    } else if (prePowerSaveShadowsRef.current !== null) {
      setShadowsEnabled(prePowerSaveShadowsRef.current);
      prePowerSaveShadowsRef.current = null;
    }
  }, [powerSaveMode, shadowsEnabled]);
  const [upperRightVoid, setUpperRightVoid] = useState<UpperRightVoidSpec>(() =>
    computeFallbackUpperRightVoid(
      typeof window !== 'undefined' ? window.innerWidth : 1280,
      typeof window !== 'undefined' ? window.innerHeight : 800,
    ),
  );
  const angelVisibleRef = useRef<boolean>(true);
  angelVisibleRef.current = angelModalEnabled;
  const [opponentMessage, setOpponentMessage] = useState<OpponentMessage | null>(() =>
    createIntroMessage(),
  );
  const [voiceState, setVoiceState] = useState<VoicePlaybackState>('idle');
  const [speechHighlightWindowOpen, setSpeechHighlightWindowOpen] = useState(false);
  const prevVoiceStateForHighlightRef = useRef<VoicePlaybackState>('idle');
  const [coachArrows, setCoachArrows] = useState<SuggestionArrow[]>([]);
  const forkArrowsTimerRef = useRef<number | null>(null);
  const clearForkArrowsTimer = useCallback(() => {
    if (forkArrowsTimerRef.current !== null) {
      window.clearTimeout(forkArrowsTimerRef.current);
      forkArrowsTimerRef.current = null;
    }
  }, []);
  const showTemporaryForkArrows = useCallback(
    (arrows: { from: string; to: string }[]) => {
      clearForkArrowsTimer();
      if (!arrows || arrows.length === 0) return;
      setCoachArrows(
        arrows.map((a) => ({
          from: a.from,
          to: a.to,
          kind: 'fork',
        })),
      );
      forkArrowsTimerRef.current = window.setTimeout(() => {
        forkArrowsTimerRef.current = null;
        setCoachArrows((prev) =>
          prev.some((arr) => arr.kind === 'fork')
            ? prev.filter((arr) => arr.kind !== 'fork')
            : prev,
        );
      }, 3000);
    },
    [clearForkArrowsTimer],
  );
  useEffect(() => {
    startAngelMediaBackgroundPrewarmer();
    return () => {
      if (forkArrowsTimerRef.current !== null) {
        window.clearTimeout(forkArrowsTimerRef.current);
        forkArrowsTimerRef.current = null;
      }
    };
  }, []);
  const [calcPreview, setCalcPreview] = useState<CalcPreviewProgress | null>(null);
  const [calcShowingPending, setCalcShowingPending] = useState(false);
  const calcShowingTimerRef = useRef<number | null>(null);
  const [treeBrowser, setTreeBrowser] = useState<TreeBrowserState | null>(null);
  const [botHoldEpoch, setBotHoldEpoch] = useState(0);
  const [studioUnlocked, setStudioUnlocked] = useState<boolean>(() =>
    isStudioDeveloperUnlocked(),
  );
  const [videoStudioOpen, setVideoStudioOpen] = useState(false);
  const [idlePreviewNonce, setIdlePreviewNonce] = useState(0);
  const [previewIdleUrl, setPreviewIdleUrl] = useState<string | null>(null);
  const [dogRunCueSec, setDogRunCueSec] = useState<number | null>(null);
  const [danceStarsActive, setDanceStarsActive] = useState(false);
  const dogJumpTimerRef = useRef<number | null>(null);
  const dogRunCueCallbackRef = useRef<(() => void) | null>(null);
  const dogVideoClearTimerRef = useRef<number | null>(null);
  const dogEventActiveRef = useRef<boolean>(false);
  const puppyIdleAccumMsRef = useRef<number>(0);
  const lastPuppyAutoAtRef = useRef<number>(0);
  const lastIdleCritterRef = useRef<'puppy' | 'hamsters' | 'dance_stars'>('hamsters');
  const lastSpeechEndedAtRef = useRef<number>(0);
  const prevPuppyActivitySigRef = useRef<string>('');
  const frontalTreeViewOpenRef = useRef<boolean>(false);
  const [webglLost, setWebglLost] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
    if (typeof document === 'undefined') return false;
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    return Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
  });
  const isOnline = useOnlineStatus();

  useEffect(() => {
    const syncFullscreen = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      setIsFullscreen(Boolean(doc.fullscreenElement || doc.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('webkitfullscreenchange', syncFullscreen);
      if (dogJumpTimerRef.current !== null) {
        window.clearTimeout(dogJumpTimerRef.current);
        dogJumpTimerRef.current = null;
      }
      if (dogVideoClearTimerRef.current !== null) {
        window.clearTimeout(dogVideoClearTimerRef.current);
        dogVideoClearTimerRef.current = null;
      }
    };
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    const rootEl = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };

    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      if (doc.exitFullscreen) {
        doc.exitFullscreen().catch(() => {});
      } else if (doc.webkitExitFullscreen) {
        try {
          doc.webkitExitFullscreen();
        } catch {
          // Ignore vendor exit error
        }
      }
    } else if (rootEl.requestFullscreen) {
      rootEl.requestFullscreen().catch(() => {});
    } else if (rootEl.webkitRequestFullscreen) {
      try {
        rootEl.webkitRequestFullscreen();
      } catch {
        // Ignore vendor request error
      }
    }
  }, []);

  // === Game Mode & Local/Engine State ===
  const [gameMode, setGameMode] = useState<GameMode>('engine');
  const [engineLevel, setEngineLevel] = useState<EngineLevel>('advanced');
  const [humanColorPref, setHumanColorPref] = useState<PieceColor | 'random'>('w');
  const [humanColorActual, setHumanColorActual] = useState<PieceColor>('w');
  const [timeControl, setTimeControl] = useState<TimeControlId>('10+0');

  const [localMoves, setLocalMoves] = useState<MoveRecord[]>([]);
  const [localFen, setLocalFen] = useState<string>(INITIAL_FEN);
  const [localResult, setLocalResult] = useState<RoomResult | null>(null);
  const [localClocks, setLocalClocks] = useState<{ w: number; b: number }>({
    w: TIME_CONTROLS['10+0'].initialMs,
    b: TIME_CONTROLS['10+0'].initialMs,
  });
  const [isThinkingAi, setIsThinkingAi] = useState(false);

  // === Tactical Training State & Casual Session Snapshot ===
  const [tacticalStats, setTacticalStats] = useState<TacticalTrainingStats>(() =>
    loadTacticalStats(),
  );
  const [activePuzzleId, setActivePuzzleId] = useState<string>(() => TACTICAL_PUZZLES[0].id);
  const [tacticalThemeFilter, setTacticalThemeFilter] = useState<TacticalTheme | 'all'>('all');
  const [tacticalDifficultyFilter, setTacticalDifficultyFilter] = useState<
    TacticalDifficulty | 'all'
  >('all');
  const [tacticalStepIdx, setTacticalStepIdx] = useState<number>(0);
  const [tacticalStatus, setTacticalStatus] = useState<TacticalRunStatus>('solving');
  const [tacticalFeedback, setTacticalFeedback] = useState<string | null>(null);
  const [tacticalHintStage, setTacticalHintStage] = useState<0 | 1 | 2>(0);
  const [tacticalLastDelta, setTacticalLastDelta] = useState<number | null>(null);
  const [tacticalLastSolveAward, setTacticalLastSolveAward] =
    useState<TacticalSolveAward | null>(null);
  const [tacticalRemainingMs, setTacticalRemainingMs] = useState<number>(() =>
    getPuzzleTimeLimitMs(TACTICAL_PUZZLES[0]),
  );
  const tacticalRemainingMsRef = useRef<number>(getPuzzleTimeLimitMs(TACTICAL_PUZZLES[0]));
  const tacticalElapsedMsRef = useRef<number>(0);
  const tacticalTimedOutChimedRef = useRef<boolean>(false);
  const tacticalHadMistakeRef = useRef<boolean>(false);
  const tacticalUsedHintRef = useRef<boolean>(false);
  const tacticalTimerIdsRef = useRef<number[]>([]);
  const casualSessionSnapshotRef = useRef<{
    mode: 'engine' | 'local';
    fen: string;
    moves: MoveRecord[];
    result: RoomResult | null;
    clocks: { w: number; b: number };
    moveEvalMeta: Record<number, AnalyzedMoveMeta>;
    engineLevel: EngineLevel;
    humanColorActual: PieceColor;
    humanColorPref: PieceColor | 'random';
    timeControl: TimeControlId;
  } | null>(null);

  const activePuzzle: TacticalPuzzle = useMemo(
    () => TACTICAL_PUZZLES.find((p) => p.id === activePuzzleId) || TACTICAL_PUZZLES[0],
    [activePuzzleId],
  );
  const activePuzzleTimeLimitMs = useMemo(
    () => getPuzzleTimeLimitMs(activePuzzle),
    [activePuzzle],
  );

  // Independent 100ms countdown ticker for Tactical Training (pauses during opponent auto-replies & non-tactical modes)
  useEffect(() => {
    if (gameMode !== 'tactical') return;
    if (tacticalStatus !== 'solving' && tacticalStatus !== 'wrong') return;

    let lastTickAt = performance.now();
    const intervalId = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(500, Math.max(0, now - lastTickAt));
      lastTickAt = now;

      tacticalElapsedMsRef.current += dt;
      const prevRem = tacticalRemainingMsRef.current;
      const nextRem = Math.max(0, prevRem - dt);
      tacticalRemainingMsRef.current = nextRem;

      if (prevRem > 0 && nextRem === 0 && !tacticalTimedOutChimedRef.current) {
        tacticalTimedOutChimedRef.current = true;
        if (soundEnabledRef.current) {
          soundEngine.playCheck();
        }
      }

      setTacticalRemainingMs(nextRem);
    }, 100);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [gameMode, tacticalStatus, activePuzzleId]);

  // === Board Selection & Promotion ===
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: string;
    to: string;
    color: PieceColor;
  } | null>(null);

  // === Timeline / View Ply & Replay Theatre ===
  const [viewPly, setViewPly] = useState<number>(0);
  const [savedGames, setSavedGames] = useState<SavedGame[]>(() => loadSavedGames());
  const [activeReplayGame, setActiveReplayGame] = useState<SavedGame | null>(null);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<number>(1);
  const [justSaved, setJustSaved] = useState(false);
  const saveFeedbackTimerRef = useRef<number | null>(null);
  const currentMatchIdRef = useRef<string>(
    `game_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  );
  const [savedGameFingerprints, setSavedGameFingerprints] = useState<Set<string>>(() => {
    const initial = loadSavedGames();
    return new Set(
      initial.map((g) => `${g.whiteName}|${g.blackName}|${g.moves.map((m) => m.uci).join(',')}`),
    );
  });

  // === Integrated Analysis Engine ===
  const [analysisEnabled, setAnalysisEnabled] = useState(true);
  const [showBestMoveArrow, setShowBestMoveArrow] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisSnapshot | null>(null);
  const [moveEvalMeta, setMoveEvalMeta] = useState<Record<number, AnalyzedMoveMeta>>({});

  // === Real-Time Multiplayer State ===
  const [playerName, setPlayerName] = useState<string>(() => {
    try {
      return localStorage.getItem('chessangel3d_player_name') || 'Grandmaster';
    } catch {
      return 'Grandmaster';
    }
  });
  const [wsStatus, setWsStatus] = useState<ConnectionStatus>('connecting');
  const [onlineCount, setOnlineCount] = useState(1);
  const [queueCount, setQueueCount] = useState(0);
  const [inQueue, setInQueue] = useState(false);
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [activeRoom, setActiveRoom] = useState<RoomState | null>(null);
  const [myRoomRole, setMyRoomRole] = useState<PieceColor | 'spectator' | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [displayRoomClocks, setDisplayRoomClocks] = useState<{ w: number; b: number }>({
    w: 0,
    b: 0,
  });

  // === Non-Reactive Imperative Core Refs (Strict Three.js + 100ms Simulation Decoupling) ===
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<ChessScene3D | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const analysisReqIdRef = useRef(0);
  const botReqIdRef = useRef(0);
  const mpClientRef = useRef<MultiplayerClient | null>(null);
  const lastMoveAnimHintRef = useRef<{ from: string; to: string } | null>(null);
  const prevEvalByFenRef = useRef<Map<string, number>>(new Map());
  const autoSavedSessionRef = useRef<string | null>(null);
  const hasPlayedWelcomeRef = useRef(false);

  // Authoritative simulation refs read/mutated inside the independent 100ms ticker
  const localClockMsRef = useRef<{ w: number; b: number }>({
    w: TIME_CONTROLS['10+0'].initialMs,
    b: TIME_CONTROLS['10+0'].initialMs,
  });
  const lastRenderedLocalSecRef = useRef<{ w: number; b: number }>({
    w: Math.ceil(TIME_CONTROLS['10+0'].initialMs / 1000),
    b: Math.ceil(TIME_CONTROLS['10+0'].initialMs / 1000),
  });
  const lastRenderedRoomSecRef = useRef<{ w: number; b: number }>({ w: 0, b: 0 });
  const turnStartedAtRef = useRef<number>(performance.now());
  const hesitationStageRef = useRef<number>(0);
  const prevHesitateSelectedSqRef = useRef<string | null>(null);
  const holdBotUntilRef = useRef<number>(0);
  const awaitingDistractionModalRef = useRef<boolean>(false);
  const goodMoveStreakRef = useRef<number>(0);
  const lastSeductionPlyRef = useRef<number>(-99);
  const calcPreviewActiveRef = useRef<boolean>(false);
  const showSearchTreeRef = useRef<boolean>(true);
  const suppressTreeAndThreeMovesRef = useRef<boolean>(false);
  const preserveMessageOnBotCommitRef = useRef<boolean>(false);
  const latestTreeEdgesRef = useRef<SearchTreeEdge[]>([]);
  const latestAllSimulationsRef = useRef<EngineLine[]>([]);
  const activeTreeFullEdgesRef = useRef<SearchTreeEdge[]>([]);
  const activeTreeRootFenRef = useRef<string>(INITIAL_FEN);
  const lastBotReportForFenRef = useRef<{ afterFen: string; report: BotSearchReport } | null>(null);
  const angelVoiceRef = useRef<AngelVoiceMode>('on');
  angelVoiceRef.current = angelVoice;
  const soundEnabledRef = useRef<boolean>(true);
  soundEnabledRef.current = soundEnabled;

  useEffect(() => {
    const unsub = opponentSpeech.subscribeMusicState((snap) => {
      setMusicTracks(snap.tracks);
      setActiveMusicTrackIndex(snap.trackIndex);
    });
    if (musicEnabledRef.current && soundEnabledRef.current) {
      opponentSpeech.setBackgroundMusicEnabled(true, true);
    }
    return unsub;
  }, []);

  const handleToggleMusic = useCallback(() => {
    const nextMusic = !musicEnabledRef.current;
    musicEnabledRef.current = nextMusic;
    setMusicEnabled(nextMusic);
    try {
      window.localStorage.setItem('chess_angel_music_enabled_v1', nextMusic ? '1' : '0');
    } catch {
      // ignore storage errors
    }
    if (nextMusic) {
      if (!soundEnabledRef.current) {
        soundEnabledRef.current = true;
        setSoundEnabled(true);
        soundEngine.enabled = true;
      }
      opponentSpeech.unlock();
      opponentSpeech.setBackgroundMusicEnabled(true, true);
    } else {
      opponentSpeech.setBackgroundMusicEnabled(false, soundEnabledRef.current);
    }
  }, []);

  const handleSelectMusicTrack = useCallback((index: number) => {
    if (!soundEnabledRef.current) {
      soundEnabledRef.current = true;
      setSoundEnabled(true);
      soundEngine.enabled = true;
    }
    if (!musicEnabledRef.current) {
      musicEnabledRef.current = true;
      setMusicEnabled(true);
      try {
        window.localStorage.setItem('chess_angel_music_enabled_v1', '1');
      } catch {
        // ignore storage errors
      }
    }
    opponentSpeech.unlock();
    opponentSpeech.selectBackgroundMusicTrack(index, true);
  }, []);
  const opponentMessageRef = useRef<OpponentMessage | null>(opponentMessage);
  opponentMessageRef.current = opponentMessage;
  const voiceStateRef = useRef<VoicePlaybackState>(voiceState);
  voiceStateRef.current = voiceState;
  const clockTimeoutAnnouncedForIdRef = useRef<string | null>(null);
  const announceControlEvent = useCallback((msg: OpponentMessage | null) => {
    if (!msg || angelVoiceRef.current !== 'on') return;
    setOpponentMessage(msg);
    opponentSpeech.unlock();
    opponentSpeech.playClip(msg.clipId, 'on', soundEnabledRef.current);
  }, []);
  const pendingBotMoveRef = useRef<{
    requestId: number;
    from: string;
    to: string;
    promo: PieceType;
    report: BotSearchReport | null;
  } | null>(null);
  const treeActiveOnScreenRef = useRef<boolean>(false);

  // === Derived Active Game View ===
  const isReplayMode = gameMode === 'replay' && activeReplayGame !== null;

  const activeMoves: MoveRecord[] = useMemo(() => {
    if (isReplayMode && activeReplayGame) return activeReplayGame.moves;
    if (gameMode === 'multiplayer' && activeRoom) return activeRoom.moves;
    return localMoves;
  }, [isReplayMode, activeReplayGame, gameMode, activeRoom, localMoves]);

  const activeResult: RoomResult | null = useMemo(() => {
    if (isReplayMode) return null;
    if (gameMode === 'multiplayer' && activeRoom) return activeRoom.result;
    return localResult;
  }, [isReplayMode, gameMode, activeRoom, localResult]);

  const clampedViewPly = Math.min(viewPly, activeMoves.length);
  const isViewingLatest = clampedViewPly === activeMoves.length;

  const displayedFen = useMemo(() => {
    if (clampedViewPly === 0) {
      return gameMode === 'tactical' ? activePuzzle.fen : INITIAL_FEN;
    }
    return activeMoves[clampedViewPly - 1]?.fen ?? localFen;
  }, [clampedViewPly, activeMoves, localFen, gameMode, activePuzzle.fen]);

  const displayedChess = useMemo(() => new Chess(displayedFen), [displayedFen]);
  const displayedTurn = displayedChess.turn() as PieceColor;
  const displayedIsCheck = displayedChess.inCheck();
  const checkedKingSquare = useMemo(() => findCheckedKingSquare(displayedChess), [displayedChess]);
  const materialDiff = useMemo(() => computeMaterialDiff(displayedFen), [displayedFen]);

  const lastDisplayedMove = useMemo(() => {
    if (clampedViewPly === 0) return null;
    const m = activeMoves[clampedViewPly - 1];
    return m ? { from: m.from, to: m.to } : null;
  }, [clampedViewPly, activeMoves]);

  // Keep simulation snapshot ref fresh without recreating the 100ms interval loop
  const simSnapshotRef = useRef({
    gameMode,
    isReplayMode,
    localResult,
    timeControl,
    localMovesLen: localMoves.length,
    localFen,
    isViewingLatest,
    isThinkingAi,
    humanColorActual,
    angelVoice,
    soundEnabled,
    analysis,
    activeRoom,
    dockCollapsed,
    videoStudioOpen,
    angelModalEnabled,
    angelVisible,
    selectedSquare,
    treeBrowserOpen: treeBrowser !== null,
  });
  simSnapshotRef.current = {
    gameMode,
    isReplayMode,
    localResult,
    timeControl,
    localMovesLen: localMoves.length,
    localFen,
    isViewingLatest,
    isThinkingAi,
    humanColorActual,
    angelVoice,
    soundEnabled,
    analysis,
    activeRoom,
    dockCollapsed,
    videoStudioOpen,
    angelModalEnabled,
    angelVisible,
    selectedSquare,
    treeBrowserOpen: treeBrowser !== null,
  };
  calcPreviewActiveRef.current = calcPreview !== null || calcShowingPending;
  showSearchTreeRef.current = showSearchTree;

  // Player display names
  const { whiteName, blackName } = useMemo(() => {
    if (isReplayMode && activeReplayGame) {
      return { whiteName: activeReplayGame.whiteName, blackName: activeReplayGame.blackName };
    }
    if (gameMode === 'multiplayer' && activeRoom) {
      return {
        whiteName: activeRoom.players.w?.name || 'Waiting for White...',
        blackName: activeRoom.players.b?.name || 'Waiting for Black...',
      };
    }
    if (gameMode === 'engine') {
      const speaker = getSpeakerName();
      const aiLabel = `${speaker} · ${ENGINE_LEVELS[engineLevel].label} (${ENGINE_LEVELS[engineLevel].elo})`;
      return humanColorActual === 'w'
        ? { whiteName: playerName || 'White', blackName: aiLabel }
        : { whiteName: aiLabel, blackName: playerName || 'Black' };
    }
    return { whiteName: 'White', blackName: 'Black' };
  }, [
    isReplayMode,
    activeReplayGame,
    gameMode,
    activeRoom,
    engineLevel,
    humanColorActual,
    playerName,
  ]);

  const activeTimeControl: TimeControlId =
    gameMode === 'multiplayer' && activeRoom ? activeRoom.timeControl : timeControl;
  const isTimed =
    !isReplayMode && gameMode !== 'tactical' && TIME_CONTROLS[activeTimeControl].initialMs > 0;
  const whiteClockMs =
    gameMode === 'multiplayer' && activeRoom ? displayRoomClocks.w : localClocks.w;
  const blackClockMs =
    gameMode === 'multiplayer' && activeRoom ? displayRoomClocks.b : localClocks.b;

  const canInteractWithBoard = useMemo(() => {
    if (isReplayMode || !isViewingLatest || activeResult || calcPreview !== null) return false;
    if (gameMode === 'tactical') {
      return (
        (tacticalStatus === 'solving' || tacticalStatus === 'wrong') &&
        displayedTurn === activePuzzle.solverColor
      );
    }
    if (gameMode === 'multiplayer') {
      if (!activeRoom || activeRoom.status !== 'active') return false;
      if (myRoomRole !== 'w' && myRoomRole !== 'b') return false;
      return activeRoom.turn === myRoomRole;
    }
    if (gameMode === 'engine') {
      return !isThinkingAi && displayedTurn === humanColorActual;
    }
    return true;
  }, [
    isReplayMode,
    isViewingLatest,
    activeResult,
    calcPreview,
    gameMode,
    tacticalStatus,
    activePuzzle.solverColor,
    activeRoom,
    myRoomRole,
    isThinkingAi,
    displayedTurn,
    humanColorActual,
  ]);

  const legalMovesForSelected: Move[] = useMemo(() => {
    if (!selectedSquare || !canInteractWithBoard) return [];
    try {
      return displayedChess.moves({ square: selectedSquare as Square, verbose: true });
    } catch {
      return [];
    }
  }, [selectedSquare, canInteractWithBoard, displayedChess]);

  const currentFingerprint = useMemo(() => {
    if (activeMoves.length === 0) return '';
    return `${whiteName}|${blackName}|${activeMoves.map((m) => m.uci).join(',')}`;
  }, [whiteName, blackName, activeMoves]);

  const currentPgn = useMemo(
    () =>
      buildPgnFromMoves(activeMoves, {
        whiteName,
        blackName,
        resultLabel:
          isReplayMode && activeReplayGame
            ? activeReplayGame.resultLabel
            : resultToScoreLabel(activeResult),
        dateIso: new Date().toISOString(),
      }),
    [activeMoves, whiteName, blackName, isReplayMode, activeReplayGame, activeResult],
  );

  // === Save & Load Game Helpers ===
  const buildCurrentSavedGameSnapshot = useCallback(
    (overrideResult?: RoomResult | null): SavedGame => {
      const res = overrideResult !== undefined ? overrideResult : activeResult;
      const dateIso = new Date().toISOString();
      const resultLabel = resultToScoreLabel(res);
      const movesToSave =
        !isViewingLatest && clampedViewPly < activeMoves.length
          ? activeMoves.slice(0, clampedViewPly)
          : [...activeMoves];
      const finalFen =
        movesToSave.length > 0
          ? movesToSave[movesToSave.length - 1].fen
          : displayedFen || INITIAL_FEN;
      const moveNum = Math.ceil(movesToSave.length / 2);
      const progressTag = res ? '' : movesToSave.length > 0 ? ` · Move ${moveNum}` : ' · Start';
      const title =
        gameMode === 'engine'
          ? `${whiteName} vs ${blackName}${progressTag}`
          : gameMode === 'multiplayer' && activeRoom
            ? `Online #${activeRoom.id} · ${whiteName} vs ${blackName}`
            : `Pass & Play · ${whiteName} vs ${blackName}${progressTag}`;

      const currentClocks =
        gameMode === 'multiplayer' && activeRoom
          ? { w: displayRoomClocks.w, b: displayRoomClocks.b }
          : { w: localClockMsRef.current.w, b: localClockMsRef.current.b };

      return {
        id: currentMatchIdRef.current,
        title,
        whiteName,
        blackName,
        resultLabel,
        reason: res?.reason || 'in-progress',
        mode: gameMode === 'replay' || gameMode === 'tactical' ? 'local' : gameMode,
        skinId: DEFAULT_SKIN,
        timeControl: activeTimeControl,
        dateIso,
        moves: movesToSave,
        finalFen,
        pgn: buildPgnFromMoves(movesToSave, { whiteName, blackName, resultLabel, dateIso }),
        engineLevel,
        humanColor: humanColorActual,
        humanColorPref,
        clocks: currentClocks,
        result: res ?? null,
        moveEvalMeta: { ...moveEvalMeta },
      };
    },
    [
      activeResult,
      isViewingLatest,
      clampedViewPly,
      activeMoves,
      displayedFen,
      gameMode,
      whiteName,
      blackName,
      activeRoom,
      displayRoomClocks.w,
      displayRoomClocks.b,
      activeTimeControl,
      engineLevel,
      humanColorActual,
      humanColorPref,
      moveEvalMeta,
    ],
  );

  const triggerJustSavedBadge = useCallback(() => {
    setJustSaved(true);
    if (saveFeedbackTimerRef.current !== null) {
      window.clearTimeout(saveFeedbackTimerRef.current);
    }
    saveFeedbackTimerRef.current = window.setTimeout(() => {
      setJustSaved(false);
      saveFeedbackTimerRef.current = null;
    }, 2400);
  }, []);

  const saveCurrentGameToArchive = useCallback(
    (overrideResult?: RoomResult | null, isAutoSave = false) => {
      if (isReplayMode || gameMode === 'tactical') return;
      if (isAutoSave && activeMoves.length === 0) return;

      const entry = buildCurrentSavedGameSnapshot(overrideResult);
      const fp = `${entry.whiteName}|${entry.blackName}|${entry.moves.map((m) => m.uci).join(',')}`;
      if (isAutoSave && savedGameFingerprints.has(fp)) return;

      setSavedGames((prev) => {
        const filtered = prev.filter((g) => g.id !== entry.id);
        const next = [entry, ...filtered];
        persistSavedGames(next);
        return next;
      });
      setSavedGameFingerprints((prev) => new Set(prev).add(fp));
      if (!isAutoSave) {
        triggerJustSavedBadge();
        announceControlEvent(createSaveGameMessage(entry.title));
      }
    },
    [
      isReplayMode,
      gameMode,
      activeMoves.length,
      buildCurrentSavedGameSnapshot,
      savedGameFingerprints,
      triggerJustSavedBadge,
      announceControlEvent,
    ],
  );

  const handleExportCurrentGame = useCallback(() => {
    if (isReplayMode || gameMode === 'tactical') return;
    const entry = buildCurrentSavedGameSnapshot();
    saveCurrentGameToArchive();
    exportSavedGameJson(entry);
  }, [isReplayMode, gameMode, buildCurrentSavedGameSnapshot, saveCurrentGameToArchive]);

  // Auto-save completed games to archive
  useEffect(() => {
    if (!activeResult || isReplayMode || gameMode === 'tactical' || activeMoves.length < 2) return;
    const key = `${currentFingerprint}|${activeResult.reason}`;
    if (autoSavedSessionRef.current === key) return;
    autoSavedSessionRef.current = key;
    saveCurrentGameToArchive(activeResult, true);
  }, [
    activeResult,
    isReplayMode,
    gameMode,
    activeMoves.length,
    currentFingerprint,
    saveCurrentGameToArchive,
  ]);

  // === Execute Local or Engine Move ===
  const commitLocalMove = useCallback(
    (
      from: string,
      to: string,
      promotion: PieceType = 'q',
      botReport: BotSearchReport | null = null,
    ): boolean => {
      const preFen = localFen;
      const chess = new Chess(preFen);
      const preEval = prevEvalByFenRef.current.get(preFen);

      try {
        const res = chess.move({ from, to, promotion });
        if (!res) return false;

        if (calcShowingTimerRef.current !== null) {
          window.clearTimeout(calcShowingTimerRef.current);
          calcShowingTimerRef.current = null;
        }
        setCalcShowingPending(false);
        sceneRef.current?.stopCalculationPreview(false);
        sceneRef.current?.stopSearchTreeThinLines();
        treeActiveOnScreenRef.current = false;
        setTreeStatusMode('idle');
        setCalcPreview(null);
        clearForkArrowsTimer();
        setCoachArrows([]);
        turnStartedAtRef.current = performance.now();
        hesitationStageRef.current = 0;

        const nextFen = chess.fen();
        const record: MoveRecord = {
          ply: localMoves.length + 1,
          san: res.san,
          uci: `${res.from}${res.to}${res.promotion || ''}`,
          from: res.from,
          to: res.to,
          color: res.color as PieceColor,
          piece: res.piece as PieceType,
          captured: res.captured as PieceType | undefined,
          promotion: res.promotion as PieceType | undefined,
          fen: nextFen,
          timestamp: Date.now(),
        };

        lastMoveAnimHintRef.current = { from: res.from, to: res.to };
        const nextMoves = [...localMoves, record];
        setLocalMoves(nextMoves);
        setLocalFen(nextFen);
        setViewPly(nextMoves.length);
        setSelectedSquare(null);

        // Apply clock increment in authoritative ref + state if timed
        const spec = TIME_CONTROLS[timeControl];
        if (spec.initialMs > 0 && spec.incrementMs > 0 && localMoves.length > 0) {
          const movedColor = res.color as PieceColor;
          const updatedMs = localClockMsRef.current[movedColor] + spec.incrementMs;
          localClockMsRef.current[movedColor] = updatedMs;
          lastRenderedLocalSecRef.current[movedColor] = Math.ceil(updatedMs / 1000);
          setLocalClocks({ ...localClockMsRef.current });
        }

        const over = evaluateLocalGameOver(chess);
        const sharedAudit = !botReport && !over ? quickEvaluateHumanMove(preFen, record.uci, nextFen) : null;

        if (over?.reason === 'checkmate') {
          const mateCp = record.color === 'w' ? 9900 : -9900;
          setMoveEvalMeta((prev) => ({
            ...prev,
            [record.ply]: { ply: record.ply, evalCp: mateCp, quality: 'best', cpLoss: 0 },
          }));
        } else if (sharedAudit) {
          setMoveEvalMeta((prev) => ({
            ...prev,
            [record.ply]: {
              ply: record.ply,
              evalCp: sharedAudit.afterPlayedCp,
              quality: classifyMoveQuality(sharedAudit.cpLoss),
              cpLoss: sharedAudit.cpLoss,
            },
          }));
        } else if (botReport?.triedLines && botReport.triedLines.length > 0) {
          const moverSign = record.color === 'w' ? 1 : -1;
          const bestForMover = Math.max(
            ...botReport.triedLines.map((l) => l.scoreCp * moverSign),
          );
          const chosenLine =
            botReport.triedLines.find((l) => l.bestMoveUci === record.uci) ||
            botReport.triedLines[0];
          const botCpLoss = Math.max(0, Math.round(bestForMover - chosenLine.scoreCp * moverSign));
          setMoveEvalMeta((prev) => ({
            ...prev,
            [record.ply]: {
              ply: record.ply,
              evalCp: chosenLine.scoreCp,
              quality: classifyMoveQuality(botCpLoss),
              cpLoss: botCpLoss,
            },
          }));
        } else if (preEval !== undefined) {
          setMoveEvalMeta((prev) => ({
            ...prev,
            [record.ply]: { ply: record.ply, evalCp: preEval },
          }));
        }

        if (over) {
          setLocalResult(over);
          soundEngine.playGameOver();
        } else if (chess.inCheck()) {
          soundEngine.playCheck();
        } else if (res.captured) {
          soundEngine.playCapture();
        } else {
          soundEngine.playMove();
        }

        // Cache explored search tree edges (automatic visual development + 5s hold occurs before the real move)
        if (botReport?.treeEdges && botReport.treeEdges.length > 0) {
          latestTreeEdgesRef.current = botReport.treeEdges;
        }
        if (botReport?.triedLines && botReport.triedLines.length > 0) {
          lastBotReportForFenRef.current = { afterFen: nextFen, report: botReport };
        }

        // Chess Angel mathematical commentary & interactive voice guidance
        if (gameMode === 'engine' && angelVoice === 'on') {
          const aiColor: PieceColor = humanColorActual === 'w' ? 'b' : 'w';
          if (record.color === humanColorActual) {
            const audit = sharedAudit;
            const humanSign = humanColorActual === 'w' ? 1 : -1;
            const humanEvalAdvantageCp = audit ? Math.round(audit.afterPlayedCp * humanSign) : 0;

            if (!over && record.ply >= 3 && (audit === null || audit.cpLoss <= 28)) {
              goodMoveStreakRef.current += 1;
            } else if (audit && audit.cpLoss > 45) {
              goodMoveStreakRef.current = 0;
            }

            const ov = getAngelVideoOverridesSnapshot();
            const msg = evaluateHumanMoveCommentary({
              preFen,
              postFen: nextFen,
              lastMove: record,
              aiColor,
              humanColor: humanColorActual,
              audit,
              plyCount: nextMoves.length,
              humanGoodStreak: goodMoveStreakRef.current,
              humanEvalAdvantageCp,
              canTriggerSeductionNow: nextMoves.length - lastSeductionPlyRef.current >= 8,
              seductionTriggerMode: ov.seductionTriggerMode,
            });
            if (msg) {
              const prep = prepareHumanCommentaryPlayback(msg.clipId, `msg:${msg.id}`);
              setOpponentMessage(msg);
              opponentSpeech.playClip(msg.clipId, angelVoice, soundEnabled);
              if (msg.clipId.startsWith('seduction_') && !over && angelVisibleRef.current) {
                lastSeductionPlyRef.current = nextMoves.length;
                goodMoveStreakRef.current = 0;
                awaitingDistractionModalRef.current = false;
                const seductionVideoHold = prep.playToEnd ? prep.videoSec : 0;
                const seductionAudioFallback =
                  seductionVideoHold > 0 ? 0 : Math.min(prep.audioSec, 12);
                const seductionHoldMs =
                  Math.round(Math.max(seductionVideoHold, seductionAudioFallback, 4.5) * 1000) +
                  450;
                holdBotUntilRef.current = performance.now() + seductionHoldMs;
              } else if (msg.action?.kind === 'undo-offer' && !over && angelVisibleRef.current) {
                awaitingDistractionModalRef.current = false;
                const undoMediaSec = Math.max(
                  prep.audioSec || 6.2,
                  prep.playToEnd ? prep.videoSec : 0,
                );
                holdBotUntilRef.current =
                  performance.now() + Math.round(undoMediaSec * 1000) + 4200;
              } else if (!over && angelVisibleRef.current) {
                awaitingDistractionModalRef.current = false;
                const reactionHoldSec = Math.max(
                  soundEnabled ? prep.audioSec : 0,
                  prep.playToEnd ? prep.videoSec : 0,
                );
                holdBotUntilRef.current =
                  reactionHoldSec > 0
                    ? performance.now() + Math.round(reactionHoldSec * 1000) + 350
                    : 0;
              } else {
                awaitingDistractionModalRef.current = false;
                holdBotUntilRef.current = 0;
              }
            } else {
              awaitingDistractionModalRef.current = false;
              holdBotUntilRef.current = 0;
              // Clear stale non-action prompts when player makes a clean move
              setOpponentMessage((prev) => (prev?.action ? null : prev));
            }
          } else {
            awaitingDistractionModalRef.current = false;
            holdBotUntilRef.current = 0;
            const forkState = inspectPostMoveForkState(
              preFen,
              from,
              to,
              promotion,
              aiColor,
              humanColorActual,
            );
            if (
              preserveMessageOnBotCommitRef.current &&
              !over &&
              !chess.inCheck() &&
              !forkState.isFork
            ) {
              preserveMessageOnBotCommitRef.current = false;
              setOpponentMessage((prev) =>
                prev && prev.action?.kind === 'calc-preview'
                  ? { ...prev, action: undefined }
                  : prev,
              );
            } else {
              preserveMessageOnBotCommitRef.current = false;
              const msg = composeBotMoveCommentary({
                fen: nextFen,
                lastMove: record,
                aiColor,
                humanColor: humanColorActual,
                plyCount: nextMoves.length,
                analysis,
                report: botReport,
                allowCalcProposal:
                  showSearchTreeRef.current && !suppressTreeAndThreeMovesRef.current,
              });
              if (msg) {
                setOpponentMessage(msg);
                if (msg.forkArrows && msg.forkArrows.length > 0) {
                  showTemporaryForkArrows(msg.forkArrows);
                }
                opponentSpeech.playClip(msg.clipId, angelVoice, soundEnabled);
              } else if (forkState.isFork) {
                // 3rd+ fork in the game: say nothing about forks and clear any stale banner so player plays freely
                setOpponentMessage(null);
              } else {
                setOpponentMessage((prev) => (prev?.action ? prev : null));
              }
            }
          }
        } else {
          awaitingDistractionModalRef.current = false;
          holdBotUntilRef.current = 0;
        }

        return true;
      } catch {
        return false;
      }
    },
    [
      localFen,
      localMoves,
      timeControl,
      gameMode,
      angelVoice,
      humanColorActual,
      analysis,
      soundEnabled,
      clearForkArrowsTimer,
      showTemporaryForkArrows,
    ],
  );

  const clearTacticalTimers = useCallback(() => {
    tacticalTimerIdsRef.current.forEach((id) => window.clearTimeout(id));
    tacticalTimerIdsRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      tacticalTimerIdsRef.current.forEach((id) => window.clearTimeout(id));
      tacticalTimerIdsRef.current = [];
    };
  }, []);

  const showPuzzleMotifArrows = useCallback((puzzle: TacticalPuzzle) => {
    if (!puzzle.motifArrows || puzzle.motifArrows.length === 0) {
      setCoachArrows([]);
      return;
    }
    setCoachArrows(
      puzzle.motifArrows.map((a) => ({
        from: a.from,
        to: a.to,
        kind: a.kind,
      })),
    );
  }, []);

  const submitTacticalMove = useCallback(
    (from: string, to: string, promotion?: PieceType) => {
      if (tacticalStatus !== 'solving' && tacticalStatus !== 'wrong') return;
      clearTacticalTimers();
      clearForkArrowsTimer();
      setCoachArrows([]);
      setSelectedSquare(null);
      setTacticalHintStage(0);

      const preFen = localFen;
      const preMoves = localMoves;
      const evalRes = evaluateTacticalMoveAttempt(
        preFen,
        from,
        to,
        promotion,
        activePuzzle,
        tacticalStepIdx,
      );
      if (!evalRes.legal) return;

      const parsedPiece = new Chess(preFen).get(from as Square);
      const moverRecord: MoveRecord = {
        ply: preMoves.length + 1,
        san: evalRes.san,
        uci: evalRes.uci,
        from,
        to,
        color: activePuzzle.solverColor,
        piece: (parsedPiece?.type || 'p') as PieceType,
        captured: evalRes.captured,
        promotion,
        fen: evalRes.nextFen,
        timestamp: Date.now(),
      };

      lastMoveAnimHintRef.current = { from, to };
      const afterSolverMoves = [...preMoves, moverRecord];
      setLocalMoves(afterSolverMoves);
      setLocalFen(evalRes.nextFen);
      setViewPly(afterSolverMoves.length);

      if (!evalRes.correct) {
        soundEngine.playMove();
        setTacticalStatus('wrong');
        setTacticalFeedback(`${evalRes.san} lets the opponent defend — try a stronger forcing move.`);

        if (!tacticalHadMistakeRef.current) {
          tacticalHadMistakeRef.current = true;
          const { next, ratingDelta } = recordTacticalMistakeOrReveal(tacticalStats, activePuzzle);
          setTacticalStats(next);
          setTacticalLastDelta(ratingDelta);
        }

        const snapbackTimer = window.setTimeout(() => {
          setLocalMoves(preMoves);
          setLocalFen(preFen);
          setViewPly(preMoves.length);
          setSelectedSquare(null);
        }, 680);
        tacticalTimerIdsRef.current.push(snapbackTimer);
        return;
      }

      // Correct solver move!
      if (evalRes.completedPuzzle) {
        if (evalRes.isCheckmate) {
          soundEngine.playGameOver();
        } else if (evalRes.inCheck) {
          soundEngine.playCheck();
        } else if (evalRes.captured) {
          soundEngine.playCapture();
        } else {
          soundEngine.playMove();
        }

        const { next, ratingDelta, award } = recordTacticalSolve(tacticalStats, activePuzzle, {
          hadMistake: tacticalHadMistakeRef.current,
          usedHint: tacticalUsedHintRef.current,
          solveMs: tacticalElapsedMsRef.current,
          remainingMs: tacticalRemainingMsRef.current,
          timeLimitMs: activePuzzleTimeLimitMs,
        });
        setTacticalStats(next);
        setTacticalLastDelta(ratingDelta);
        setTacticalLastSolveAward(award);
        setTacticalStatus('solved');
        setTacticalFeedback(null);
        showPuzzleMotifArrows(activePuzzle);
        return;
      }

      // Correct intermediate move — play sound and schedule opponent's forced reply
      if (evalRes.inCheck) {
        soundEngine.playCheck();
      } else if (evalRes.captured) {
        soundEngine.playCapture();
      } else {
        soundEngine.playMove();
      }

      const opponentReplyUci = activePuzzle.solutionUci[tacticalStepIdx + 1];
      if (!opponentReplyUci || opponentReplyUci.length < 4) {
        setTacticalStatus('solved');
        return;
      }

      setTacticalStatus('opponent-replying');
      setTacticalFeedback(null);

      const replyTimer = window.setTimeout(() => {
        try {
          const replyChess = new Chess(evalRes.nextFen);
          const repFrom = opponentReplyUci.slice(0, 2);
          const repTo = opponentReplyUci.slice(2, 4);
          const repPromo = (opponentReplyUci.slice(4, 5) || undefined) as PieceType | undefined;
          const repRes = replyChess.move({ from: repFrom, to: repTo, promotion: repPromo });
          if (!repRes) {
            setTacticalStatus('solving');
            return;
          }

          const nextFenAfterReply = replyChess.fen();
          const replyRecord: MoveRecord = {
            ply: afterSolverMoves.length + 1,
            san: repRes.san,
            uci: `${repRes.from}${repRes.to}${repRes.promotion || ''}`,
            from: repRes.from,
            to: repRes.to,
            color: repRes.color as PieceColor,
            piece: repRes.piece as PieceType,
            captured: repRes.captured as PieceType | undefined,
            promotion: repRes.promotion as PieceType | undefined,
            fen: nextFenAfterReply,
            timestamp: Date.now(),
          };

          lastMoveAnimHintRef.current = { from: repRes.from, to: repRes.to };
          const combinedMoves = [...afterSolverMoves, replyRecord];
          setLocalMoves(combinedMoves);
          setLocalFen(nextFenAfterReply);
          setViewPly(combinedMoves.length);
          setTacticalStepIdx(tacticalStepIdx + 2);
          setTacticalStatus('solving');
          setTacticalFeedback('Sharp move — now finish the combination!');

          if (replyChess.inCheck()) soundEngine.playCheck();
          else if (repRes.captured) soundEngine.playCapture();
          else soundEngine.playMove();
        } catch {
          setTacticalStatus('solving');
        }
      }, 460);
      tacticalTimerIdsRef.current.push(replyTimer);
    },
    [
      tacticalStatus,
      clearTacticalTimers,
      clearForkArrowsTimer,
      localFen,
      localMoves,
      activePuzzle,
      activePuzzleTimeLimitMs,
      tacticalStepIdx,
      tacticalStats,
      showPuzzleMotifArrows,
    ],
  );

  // === Submit Move (routes to Multiplayer Server, Tactical Trainer, or Local/Engine) ===
  const submitMove = useCallback(
    (from: string, to: string, promotion?: PieceType) => {
      if (gameMode === 'tactical') {
        submitTacticalMove(from, to, promotion);
        return;
      }
      if (gameMode === 'multiplayer' && activeRoom) {
        lastMoveAnimHintRef.current = { from, to };
        setSelectedSquare(null);
        mpClientRef.current?.sendMove(activeRoom.id, from, to, promotion);
        return;
      }
      commitLocalMove(from, to, promotion || 'q', null);
    },
    [gameMode, activeRoom, submitTacticalMove, commitLocalMove],
  );

  // === Click Handler from 3D Raycaster ===
  const handleSquareClick = useCallback(
    (square: string) => {
      if (!canInteractWithBoard) return;

      if (selectedSquare) {
        if (selectedSquare === square) {
          setSelectedSquare(null);
          return;
        }
        const matchingMoves = legalMovesForSelected.filter((m) => m.to === square);
        if (matchingMoves.length > 0) {
          const isPromo = matchingMoves.some((m) => Boolean(m.promotion));
          if (isPromo) {
            setPendingPromotion({ from: selectedSquare, to: square, color: displayedTurn });
            return;
          }
          submitMove(selectedSquare, square);
          return;
        }
      }

      const piece = displayedChess.get(square as Square);
      if (piece && piece.color === displayedTurn) {
        setSelectedSquare(square);
      } else {
        setSelectedSquare(null);
      }
    },
    [
      canInteractWithBoard,
      selectedSquare,
      legalMovesForSelected,
      displayedTurn,
      displayedChess,
      submitMove,
    ],
  );

  const squareClickRef = useRef(handleSquareClick);
  squareClickRef.current = handleSquareClick;

  // Subscribe to Chess Angel voice state and trigger warm startup greeting
  useEffect(() => {
    const unsubState = opponentSpeech.subscribe(setVoiceState);
    if (!hasPlayedWelcomeRef.current) {
      hasPlayedWelcomeRef.current = true;
      if (opponentMessage) {
        opponentSpeech.playClip(opponentMessage.clipId, 'on', true);
      } else {
        const intro = createIntroMessage();
        if (intro) {
          setOpponentMessage(intro);
          opponentSpeech.playClip(intro.clipId, 'on', true);
        }
      }
    }
    return () => {
      unsubState();
    };
  }, []);

  // Track speech-duration highlight window for concerned 3D chess figures on warnings, hints & Studio previews
  useEffect(() => {
    const figures = opponentMessage?.concernedFigures;
    if (
      !opponentMessage ||
      !figures ||
      figures.length === 0 ||
      (angelVoice === 'off' && !opponentMessage.isStudioPreview)
    ) {
      setSpeechHighlightWindowOpen(false);
      return;
    }
    setSpeechHighlightWindowOpen(true);
    const fallbackSec = VOICE_CLIP_DURATION_SEC[opponentMessage.clipId] ?? 4.8;
    const windowMs = soundEnabled ? 1400 : Math.round(fallbackSec * 1000);
    const timerId = window.setTimeout(() => {
      setSpeechHighlightWindowOpen(false);
    }, windowMs);
    return () => window.clearTimeout(timerId);
  }, [opponentMessage, angelVoice, soundEnabled]);

  useEffect(() => {
    const prev = prevVoiceStateForHighlightRef.current;
    prevVoiceStateForHighlightRef.current = voiceState;
    if (voiceState === 'speaking') {
      if (dogJumpTimerRef.current !== null) {
        window.clearTimeout(dogJumpTimerRef.current);
        dogJumpTimerRef.current = null;
      }
      dogRunCueCallbackRef.current = null;
      setDogRunCueSec(null);
      if (dogVideoClearTimerRef.current !== null) {
        window.clearTimeout(dogVideoClearTimerRef.current);
        dogVideoClearTimerRef.current = null;
      }
      dogEventActiveRef.current = false;
      setDanceStarsActive(false);
    }
    if (prev === 'speaking' && voiceState !== 'speaking') {
      lastSpeechEndedAtRef.current = performance.now();
      setSpeechHighlightWindowOpen(false);
    }
  }, [voiceState]);

  const activeSpeechHighlights = useMemo(() => {
    const isPreview = Boolean(opponentMessage?.isStudioPreview);
    if (
      (angelVoice === 'off' && !isPreview) ||
      ((!isViewingLatest || isReplayMode) && !isPreview) ||
      !opponentMessage?.concernedFigures ||
      opponentMessage.concernedFigures.length === 0
    ) {
      return [];
    }
    if (voiceState === 'speaking' || speechHighlightWindowOpen) {
      return opponentMessage.concernedFigures;
    }
    return [];
  }, [
    angelVoice,
    isViewingLatest,
    isReplayMode,
    opponentMessage,
    voiceState,
    speechHighlightWindowOpen,
  ]);

  const treeSquareClickRef = useRef<(sq: string) => void>(() => {});

  // === Mount Three.js 3D Scene ONCE (Strict Non-Reactive Ref Architecture) ===
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const scene = new ChessScene3D(container, 'walnut-maple', 'warm-studio', {
      onSquareClick: (sq) => squareClickRef.current(sq),
      onTreeSquareClick: (sq) => treeSquareClickRef.current(sq),
      onUpperRightVoidChange: (spec) => setUpperRightVoid(spec),
      onContextLost: () => setWebglLost(true),
      onContextRestored: () => setWebglLost(false),
    });
    sceneRef.current = scene;

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setShadowsEnabled(shadowsEnabled);
  }, [shadowsEnabled]);

  useEffect(() => {
    sceneRef.current?.setPowerSaveMode(powerSaveMode);
  }, [powerSaveMode]);

  useEffect(() => {
    sceneRef.current?.setAngelOverlayVisible(angelVisible);
  }, [angelVisible]);

  useEffect(() => {
    return () => {
      if (angelModalOffTimerRef.current !== null) {
        window.clearTimeout(angelModalOffTimerRef.current);
        angelModalOffTimerRef.current = null;
      }
      if (calcShowingTimerRef.current !== null) {
        window.clearTimeout(calcShowingTimerRef.current);
        calcShowingTimerRef.current = null;
      }
    };
  }, []);

  // Sync declarative visual board state into imperative Three.js scene
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const bestUci =
      analysisEnabled && showBestMoveArrow && analysis?.fen === displayedFen
        ? analysis.lines[0]?.bestMoveUci
        : undefined;
    const bestMoveArrow =
      bestUci && bestUci.length >= 4
        ? { from: bestUci.slice(0, 2), to: bestUci.slice(2, 4) }
        : null;

    const legalTargets = legalMovesForSelected.map((m) => ({
      square: m.to,
      isCapture: Boolean(m.captured),
    }));

    const hint = lastMoveAnimHintRef.current;
    lastMoveAnimHintRef.current = null;

    scene.syncState(
      {
        fen: displayedFen,
        selectedSquare,
        legalTargets,
        lastMove: lastDisplayedMove,
        checkSquare: checkedKingSquare,
        bestMoveArrow,
        suggestionArrows: coachArrows,
        speechHighlights: activeSpeechHighlights,
        showCoordinates,
      },
      hint,
    );
  }, [
    displayedFen,
    selectedSquare,
    legalMovesForSelected,
    lastDisplayedMove,
    checkedKingSquare,
    analysisEnabled,
    showBestMoveArrow,
    analysis,
    coachArrows,
    activeSpeechHighlights,
    showCoordinates,
  ]);

  const handleForcedIdleCueReached = useCallback(() => {
    const cb = dogRunCueCallbackRef.current;
    dogRunCueCallbackRef.current = null;
    setDogRunCueSec(null);
    cb?.();
  }, []);

  const triggerFluffyPuppyEvent = useCallback(
    ({ playVideo, fromStudio = false }: { playVideo: boolean; fromStudio?: boolean }) => {
      if (dogJumpTimerRef.current !== null) {
        window.clearTimeout(dogJumpTimerRef.current);
        dogJumpTimerRef.current = null;
      }
      dogRunCueCallbackRef.current = null;
      setDogRunCueSec(null);
      if (dogVideoClearTimerRef.current !== null) {
        window.clearTimeout(dogVideoClearTimerRef.current);
        dogVideoClearTimerRef.current = null;
      }

      if (fromStudio) {
        if (angelModalOffTimerRef.current !== null) {
          window.clearTimeout(angelModalOffTimerRef.current);
          angelModalOffTimerRef.current = null;
        }
        if (calcShowingTimerRef.current !== null) {
          window.clearTimeout(calcShowingTimerRef.current);
          calcShowingTimerRef.current = null;
        }
        setFrontalTreeViewOpen(false);
        setCalcShowingPending(false);
        sceneRef.current?.stopCalculationPreview(true);
        sceneRef.current?.stopSearchTreeThinLines();
        treeActiveOnScreenRef.current = false;
        setTreeStatusMode('idle');
        setTreeBrowser(null);
        setCalcPreview(null);
        setCoachArrows([]);
        setAngelModalEnabled(true);
        setAngelVisible(true);
        opponentSpeech.stop();
        soundEngine.unlock();
      }

      const snap = getAngelVideoOverridesSnapshot();
      const dogUrl = getAngelDogRunVideoUrl(snap);
      const jumpSec = getAngelDogRunJumpSec(snap);
      const shouldPlayVideo = Boolean(playVideo && dogUrl);

      dogEventActiveRef.current = true;
      setDanceStarsActive(false);
      puppyIdleAccumMsRef.current = 0;

      const launch3DPuppy = () => {
        const modalEl = document.querySelector('[data-angel-portrait-modal="true"]');
        const rect = modalEl ? modalEl.getBoundingClientRect() : null;
        sceneRef.current?.triggerWildDogRun(rect, soundEnabledRef.current);
      };

      if (shouldPlayVideo && dogUrl) {
        const clipSec = getVideoFileDurationSec(dogUrl, snap) ?? Math.max(6, jumpSec + 3.2);
        const remainingClipSec = Math.max(0.8, clipSec - jumpSec);
        let puppyLaunched = false;

        const firePuppyOnce = () => {
          if (puppyLaunched) return;
          puppyLaunched = true;
          if (dogJumpTimerRef.current !== null) {
            window.clearTimeout(dogJumpTimerRef.current);
            dogJumpTimerRef.current = null;
          }
          dogRunCueCallbackRef.current = null;
          setDogRunCueSec(null);
          launch3DPuppy();
          if (dogVideoClearTimerRef.current !== null) {
            window.clearTimeout(dogVideoClearTimerRef.current);
          }
          const postLaunchClearMs = Math.max(4600, Math.round((remainingClipSec + 0.8) * 1000));
          dogVideoClearTimerRef.current = window.setTimeout(() => {
            dogVideoClearTimerRef.current = null;
            dogEventActiveRef.current = false;
            setPreviewIdleUrl(null);
          }, postLaunchClearMs);
        };

        // Fire the 3D puppy frame-synced when the <video>'s live currentTime reaches jumpSec (e.g. 4.2s)
        dogRunCueCallbackRef.current = firePuppyOnce;
        setDogRunCueSec(jumpSec);
        setPreviewIdleUrl(dogUrl);
        setOpponentMessage(null);
        setIdlePreviewNonce((n) => n + 1);

        // Guaranteed fallback launch if mobile/PWA video buffering delays the live frame cue
        const fallbackLaunchMs = Math.max(1200, Math.round((jumpSec + 1.4) * 1000));
        dogJumpTimerRef.current = window.setTimeout(() => {
          dogJumpTimerRef.current = null;
          firePuppyOnce();
        }, fallbackLaunchMs);

        // Safety watchdog to guarantee cleanup even if everything stalls
        const safetyMs = Math.max(12000, Math.round((clipSec + 8.0) * 1000));
        dogVideoClearTimerRef.current = window.setTimeout(() => {
          dogVideoClearTimerRef.current = null;
          dogRunCueCallbackRef.current = null;
          setDogRunCueSec(null);
          dogEventActiveRef.current = false;
          setPreviewIdleUrl(null);
        }, safetyMs);
      } else {
        // Allow one brief frame if Angel modal just mounted so its DOMRect is measured accurately
        dogJumpTimerRef.current = window.setTimeout(() => {
          dogJumpTimerRef.current = null;
          launch3DPuppy();
        }, 100);
        dogVideoClearTimerRef.current = window.setTimeout(() => {
          dogVideoClearTimerRef.current = null;
          dogEventActiveRef.current = false;
        }, 5600);
      }
    },
    [],
  );
  const triggerFluffyPuppyEventRef = useRef(triggerFluffyPuppyEvent);
  triggerFluffyPuppyEventRef.current = triggerFluffyPuppyEvent;

  const triggerHamsterChaseEvent = useCallback(({ fromStudio = false }: { fromStudio?: boolean } = {}) => {
    if (dogJumpTimerRef.current !== null) {
      window.clearTimeout(dogJumpTimerRef.current);
      dogJumpTimerRef.current = null;
    }
    dogRunCueCallbackRef.current = null;
    setDogRunCueSec(null);
    if (dogVideoClearTimerRef.current !== null) {
      window.clearTimeout(dogVideoClearTimerRef.current);
      dogVideoClearTimerRef.current = null;
    }
    if (fromStudio) {
      setFrontalTreeViewOpen(false);
      setCalcShowingPending(false);
      sceneRef.current?.stopCalculationPreview(true);
      sceneRef.current?.stopSearchTreeThinLines();
      treeActiveOnScreenRef.current = false;
      setTreeStatusMode('idle');
      setTreeBrowser(null);
      setCalcPreview(null);
      setCoachArrows([]);
      soundEngine.unlock();
    }
    puppyIdleAccumMsRef.current = 0;
    dogEventActiveRef.current = true;
    setDanceStarsActive(false);
    const startChase = () => {
      sceneRef.current?.triggerHamsterChase(soundEnabledRef.current);
    };
    if (fromStudio) {
      dogJumpTimerRef.current = window.setTimeout(() => {
        dogJumpTimerRef.current = null;
        startChase();
      }, 80);
    } else {
      startChase();
    }
    dogVideoClearTimerRef.current = window.setTimeout(() => {
      dogVideoClearTimerRef.current = null;
      dogEventActiveRef.current = false;
    }, 7600);
  }, []);
  const triggerHamsterChaseEventRef = useRef(triggerHamsterChaseEvent);
  triggerHamsterChaseEventRef.current = triggerHamsterChaseEvent;

  const triggerDanceWithStarsEvent = useCallback(({ fromStudio = false }: { fromStudio?: boolean } = {}) => {
    if (dogJumpTimerRef.current !== null) {
      window.clearTimeout(dogJumpTimerRef.current);
      dogJumpTimerRef.current = null;
    }
    dogRunCueCallbackRef.current = null;
    setDogRunCueSec(null);
    if (dogVideoClearTimerRef.current !== null) {
      window.clearTimeout(dogVideoClearTimerRef.current);
      dogVideoClearTimerRef.current = null;
    }

    if (fromStudio) {
      if (angelModalOffTimerRef.current !== null) {
        window.clearTimeout(angelModalOffTimerRef.current);
        angelModalOffTimerRef.current = null;
      }
      if (calcShowingTimerRef.current !== null) {
        window.clearTimeout(calcShowingTimerRef.current);
        calcShowingTimerRef.current = null;
      }
      setFrontalTreeViewOpen(false);
      setCalcShowingPending(false);
      sceneRef.current?.stopCalculationPreview(true);
      sceneRef.current?.stopSearchTreeThinLines();
      treeActiveOnScreenRef.current = false;
      setTreeStatusMode('idle');
      setTreeBrowser(null);
      setCalcPreview(null);
      setCoachArrows([]);
      setAngelModalEnabled(true);
      setAngelVisible(true);
      opponentSpeech.stop();
    }

    const snap = getAngelVideoOverridesSnapshot();
    const danceUrl =
      getAngelDanceStarsVideoUrl(snap) ||
      snap.cases?.seduction_6 ||
      snap.cases?.seduction ||
      null;

    dogEventActiveRef.current = true;
    puppyIdleAccumMsRef.current = 0;
    setDanceStarsActive(true);

    if (danceUrl) {
      setPreviewIdleUrl(danceUrl);
      setOpponentMessage(null);
      setIdlePreviewNonce((n) => n + 1);
    }

    const clipSec = getVideoFileDurationSec(danceUrl || undefined, snap) ?? 10.0;
    const clearMs = Math.max(5500, Math.round((clipSec + 0.4) * 1000));
    dogVideoClearTimerRef.current = window.setTimeout(() => {
      dogVideoClearTimerRef.current = null;
      dogEventActiveRef.current = false;
      setDanceStarsActive(false);
      setPreviewIdleUrl(null);
    }, clearMs);
  }, []);
  const triggerDanceWithStarsEventRef = useRef(triggerDanceWithStarsEvent);
  triggerDanceWithStarsEventRef.current = triggerDanceWithStarsEvent;

  // === Independent 100ms Simulation Loop (Decoupled from requestAnimationFrame & React Render Tree) ===
  useEffect(() => {
    let prevTick = performance.now();

    const tickerId = window.setInterval(() => {
      const now = performance.now();
      const dtMs = Math.min(500, Math.max(0, now - prevTick));
      prevTick = now;

      const snap = simSnapshotRef.current;

      // 1. Release mistake-undo hold window once expired so Chess Angel can reply
      if (holdBotUntilRef.current > 0 && now >= holdBotUntilRef.current) {
        holdBotUntilRef.current = 0;
        setBotHoldEpoch((n) => n + 1);
      }

      const isPausedForShowcaseOrModal =
        calcPreviewActiveRef.current ||
        awaitingDistractionModalRef.current ||
        treeActiveOnScreenRef.current ||
        holdBotUntilRef.current > now;

      // 2. Local / Engine Chess Clock Simulation (only triggers React state on whole-second changes)
      if (
        snap.gameMode !== 'multiplayer' &&
        snap.gameMode !== 'tactical' &&
        !snap.isReplayMode &&
        !snap.localResult &&
        snap.localMovesLen > 0 &&
        TIME_CONTROLS[snap.timeControl].initialMs > 0 &&
        !isPausedForShowcaseOrModal
      ) {
        const activeTurn = new Chess(snap.localFen).turn() as PieceColor;
        const nextMs = Math.max(0, localClockMsRef.current[activeTurn] - dtMs);
        localClockMsRef.current[activeTurn] = nextMs;

        const nextSec = Math.ceil(nextMs / 1000);
        if (nextSec !== lastRenderedLocalSecRef.current[activeTurn] || nextMs <= 0) {
          lastRenderedLocalSecRef.current[activeTurn] = nextSec;
          setLocalClocks({
            w: localClockMsRef.current.w,
            b: localClockMsRef.current.b,
          });
          if (nextMs <= 0) {
            const winner: PieceColor = activeTurn === 'w' ? 'b' : 'w';
            setLocalResult({
              winner,
              reason: 'timeout',
            });
            soundEngine.playGameOver();
            if (clockTimeoutAnnouncedForIdRef.current !== currentMatchIdRef.current) {
              clockTimeoutAnnouncedForIdRef.current = currentMatchIdRef.current;
              if (snap.angelVoice === 'on') {
                const timeoutMsg = createClockTimeoutMessage(
                  winner,
                  snap.humanColorActual,
                  snap.gameMode,
                );
                if (timeoutMsg) {
                  setOpponentMessage(timeoutMsg);
                  opponentSpeech.playClip(timeoutMsg.clipId, 'on', snap.soundEnabled);
                }
              }
            }
          }
        }
      }

      // 3. Authoritative Online Room Clock Interpolation (only triggers React state on whole-second changes)
      if (snap.gameMode === 'multiplayer' && snap.activeRoom) {
        const room = snap.activeRoom;
        const spec = TIME_CONTROLS[room.timeControl];
        if (
          spec.initialMs > 0 &&
          room.status === 'active' &&
          room.moves.length > 0 &&
          room.lastClockUpdateAt
        ) {
          const elapsed = Math.max(0, Date.now() - room.lastClockUpdateAt);
          const wMs = room.turn === 'w' ? Math.max(0, room.clocks.w - elapsed) : room.clocks.w;
          const bMs = room.turn === 'b' ? Math.max(0, room.clocks.b - elapsed) : room.clocks.b;
          const wSec = Math.ceil(wMs / 1000);
          const bSec = Math.ceil(bMs / 1000);
          if (
            wSec !== lastRenderedRoomSecRef.current.w ||
            bSec !== lastRenderedRoomSecRef.current.b
          ) {
            lastRenderedRoomSecRef.current = { w: wSec, b: bSec };
            setDisplayRoomClocks({ w: wMs, b: bMs });
          }
        }
      }

      // 4. Player Hesitation Detection -> Chess Angel Sequential Shorter Hints (stops after stage 6)
      if (
        snap.gameMode === 'engine' &&
        !snap.localResult &&
        snap.isViewingLatest &&
        !snap.isThinkingAi &&
        !isPausedForShowcaseOrModal &&
        snap.angelVoice === 'on' &&
        snap.angelModalEnabled &&
        snap.dockCollapsed &&
        !snap.videoStudioOpen &&
        !snap.treeBrowserOpen
      ) {
        // Do not count Chess Angel's own speaking duration as player hesitation
        if (voiceStateRef.current === 'speaking') {
          turnStartedAtRef.current = now;
        } else {
          const turn = new Chess(snap.localFen).turn() as PieceColor;
          if (turn !== snap.humanColorActual) {
            turnStartedAtRef.current = now;
          } else {
            // Give a gentle grace cushion when the player actively selects a piece before stage 0
            if (snap.selectedSquare !== prevHesitateSelectedSqRef.current) {
              prevHesitateSelectedSqRef.current = snap.selectedSquare;
              if (snap.selectedSquare && hesitationStageRef.current === 0) {
                turnStartedAtRef.current = Math.max(turnStartedAtRef.current, now - 10_000);
              }
            }

            const idleMs = now - turnStartedAtRef.current;
            const stageThresholdsMs =
              snap.localMovesLen === 0
                ? [65_000, 115_000]
                : snap.localMovesLen < 6
                  ? [40_000, 78_000, 118_000]
                  : [28_000, 62_000, 98_000, 138_000];
            const nextThresholdMs = stageThresholdsMs[hesitationStageRef.current];

            if (nextThresholdMs !== undefined && idleMs >= nextThresholdMs) {
              hesitationStageRef.current += 1;
              const hintMsg = composeHesitationCommentary(snap.localFen, snap.analysis);
              if (hintMsg) {
                setOpponentMessage(hintMsg);
                opponentSpeech.playClip(hintMsg.clipId, 'on', snap.soundEnabled);
              }
            }
          }
        }
      } else {
        turnStartedAtRef.current = now;
      }

      // 5. Playful Special Events (Dance with Stars, Fluffy White Puppy, 3D Mini Hamsters Chase)
      //    Triggers naturally when waiting for a match (~18s) or thinking quietly during a match (~38s).
      const activitySig = `${snap.gameMode}|${snap.localFen}|${snap.activeRoom?.id || ''}|${snap.activeRoom?.status || ''}|${snap.activeRoom?.moves.length ?? 0}|${snap.localResult?.reason || ''}`;
      if (activitySig !== prevPuppyActivitySigRef.current) {
        prevPuppyActivitySigRef.current = activitySig;
        puppyIdleAccumMsRef.current = 0;
        // If an actual move or match change happened before the puppy jumped out, cancel the pending jump cleanly
        if ((dogJumpTimerRef.current !== null || dogRunCueCallbackRef.current !== null) && !snap.videoStudioOpen) {
          if (dogJumpTimerRef.current !== null) {
            window.clearTimeout(dogJumpTimerRef.current);
            dogJumpTimerRef.current = null;
          }
          dogRunCueCallbackRef.current = null;
          setDogRunCueSec(null);
          if (dogVideoClearTimerRef.current !== null) {
            window.clearTimeout(dogVideoClearTimerRef.current);
            dogVideoClearTimerRef.current = null;
          }
          dogEventActiveRef.current = false;
          setPreviewIdleUrl(null);
        }
      }

      const isTabHidden = typeof document !== 'undefined' && document.hidden;
      const canRunAutoPuppy =
        !isTabHidden &&
        !snap.videoStudioOpen &&
        !frontalTreeViewOpenRef.current &&
        !snap.treeBrowserOpen &&
        !snap.isReplayMode &&
        snap.gameMode !== 'tactical' &&
        !snap.isThinkingAi &&
        !isPausedForShowcaseOrModal &&
        !dogEventActiveRef.current;

      if (canRunAutoPuppy) {
        const isWaitingForMatch =
          (snap.gameMode === 'multiplayer' &&
            (!snap.activeRoom ||
              snap.activeRoom.status === 'waiting' ||
              snap.activeRoom.status === 'finished')) ||
          ((snap.gameMode === 'engine' || snap.gameMode === 'local') &&
            (snap.localMovesLen === 0 || snap.localResult !== null));

        const isWaitingLongInMatch =
          !isWaitingForMatch &&
          snap.isViewingLatest &&
          ((snap.gameMode === 'multiplayer' && snap.activeRoom?.status === 'active') ||
            ((snap.gameMode === 'engine' || snap.gameMode === 'local') &&
              snap.localMovesLen > 0 &&
              !snap.localResult));

        if (isWaitingForMatch || isWaitingLongInMatch) {
          // Pause (don't reset) while Chess Angel briefly speaks; only count quiet time
          if (voiceStateRef.current !== 'speaking') {
            puppyIdleAccumMsRef.current += dtMs;
            const thresholdMs = isWaitingForMatch ? 18_000 : 38_000;
            const cooldownOk =
              lastPuppyAutoAtRef.current === 0 || now - lastPuppyAutoAtRef.current >= 55_000;
            const quietSinceSpeechOk = now - lastSpeechEndedAtRef.current >= 3_500;
            const canPlayPuppy =
              snap.angelModalEnabled &&
              snap.angelVisible &&
              Boolean(getAngelDogRunVideoUrl());
            const canPlayDanceStars =
              snap.angelModalEnabled &&
              snap.angelVisible &&
              Boolean(getAngelDanceStarsVideoUrl());

            if (cooldownOk && quietSinceSpeechOk && puppyIdleAccumMsRef.current >= thresholdMs) {
              lastPuppyAutoAtRef.current = now;
              puppyIdleAccumMsRef.current = 0;
              // Rotate playfully through Fluffy White Puppy, 3D Mini Hamsters Chase, and Dance with Stars
              if (canPlayDanceStars && lastIdleCritterRef.current === 'hamsters') {
                lastIdleCritterRef.current = 'dance_stars';
                triggerDanceWithStarsEventRef.current({ fromStudio: false });
              } else if (canPlayPuppy && lastIdleCritterRef.current !== 'puppy') {
                lastIdleCritterRef.current = 'puppy';
                triggerFluffyPuppyEventRef.current({ playVideo: true, fromStudio: false });
              } else {
                lastIdleCritterRef.current = 'hamsters';
                triggerHamsterChaseEventRef.current({ fromStudio: false });
              }
            }
          }
        } else {
          puppyIdleAccumMsRef.current = 0;
        }
      } else if (snap.videoStudioOpen || snap.isReplayMode || snap.gameMode === 'tactical') {
        puppyIdleAccumMsRef.current = 0;
      }
    }, 100);

    return () => {
      window.clearInterval(tickerId);
    };
  }, []);

  // === Initialize Web Worker for Analysis & Chess Angel Routine ===
  const commitLocalMoveRef = useRef(commitLocalMove);
  commitLocalMoveRef.current = commitLocalMove;

  const openTreeBrowserSession = useCallback(
    (
      rootFen: string,
      edges: SearchTreeEdge[],
      simulations: EngineLine[],
      hasPendingBotMove: boolean,
      depth?: number,
      nodes?: number,
    ) => {
      activeTreeRootFenRef.current = rootFen;
      activeTreeFullEdgesRef.current = edges;
      const resolvedSims = ensureTreeSimulations(rootFen, simulations);
      let moverColor: PieceColor = 'b';
      try {
        moverColor = new Chess(rootFen).turn() as PieceColor;
      } catch {
        // default 'b'
      }
      suppressTreeAndThreeMovesRef.current = false;
      setSuppressTreeAndThreeMoves(false);
      setCalcPreview(null);
      setTreeBrowser({
        simulations: resolvedSims,
        moverColor,
        selectedIndex: null,
        onlyTopThree: false,
        hasPendingBotMove,
        nodes,
        depth,
      });

      const browseMsg = createTreeBrowseMessage(
        resolvedSims.length > 0 ? resolvedSims.length : edges.length,
        depth,
        nodes,
      );
      if (browseMsg) {
        setOpponentMessage(browseMsg);
        if (angelVoiceRef.current === 'on') {
          opponentSpeech.unlock();
          opponentSpeech.playClip(browseMsg.clipId, angelVoiceRef.current, soundEnabledRef.current);
        }
      } else {
        opponentSpeech.stop();
        setOpponentMessage(null);
      }
    },
    [],
  );

  const openTreeBrowserSessionRef = useRef(openTreeBrowserSession);
  openTreeBrowserSessionRef.current = openTreeBrowserSession;

  const flushPendingBotMove = useCallback((executeMove: boolean) => {
    sceneRef.current?.stopSearchTreeThinLines();
    treeActiveOnScreenRef.current = false;
    setTreeStatusMode('idle');
    setTreeBrowser(null);

    const pending = pendingBotMoveRef.current;
    pendingBotMoveRef.current = null;
    setIsThinkingAi(false);

    if (executeMove && pending) {
      commitLocalMoveRef.current(pending.from, pending.to, pending.promo, pending.report);
    }
  }, []);

  const flushPendingBotMoveRef = useRef(flushPendingBotMove);
  flushPendingBotMoveRef.current = flushPendingBotMove;

  useEffect(() => {
    const worker = new Worker(new URL('./chess/engineWorker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<EngineWorkerResponse>) => {
      const msg = e.data;
      if (!msg) return;

      if (msg.type === 'progress' || msg.type === 'done') {
        if (msg.requestId !== analysisReqIdRef.current) return;
        const nps = Math.round((msg.nodes / Math.max(1, msg.timeMs)) * 1000);
        const topScore = msg.lines[0]?.scoreCp;
        if (topScore !== undefined) {
          prevEvalByFenRef.current.set(msg.fen, topScore);
        }
        if (msg.type === 'done' && msg.treeEdges.length > 0) {
          latestTreeEdgesRef.current = msg.treeEdges;
        }
        if (msg.type === 'done' && msg.allSimulations.length > 0) {
          latestAllSimulationsRef.current = msg.allSimulations;
        }
        setAnalysis((prev) => ({
          fen: msg.fen,
          depth: msg.depth,
          nodes: msg.nodes,
          nps,
          timeMs: msg.timeMs,
          lines: msg.lines,
          allSimulations:
            msg.type === 'done'
              ? msg.allSimulations
              : prev?.fen === msg.fen
                ? prev.allSimulations
                : undefined,
          treeEdges:
            msg.type === 'done'
              ? msg.treeEdges
              : prev?.fen === msg.fen
                ? prev.treeEdges
                : undefined,
          isSearching: msg.type === 'progress',
        }));
      } else if (msg.type === 'bot-tree-progress') {
        if (msg.requestId !== botReqIdRef.current) return;
        if (msg.treeEdges.length > 0) {
          latestTreeEdgesRef.current = msg.treeEdges;
          if (showSearchTreeRef.current) {
            treeActiveOnScreenRef.current = true;
            setTreeStatusMode('developing');
            sceneRef.current?.updateDevelopingSearchTree(msg.treeEdges);
          }
        }
      } else if (msg.type === 'bot-move') {
        if (msg.requestId !== botReqIdRef.current) return;
        if (msg.bestMoveUci && msg.bestMoveUci.length >= 4) {
          const from = msg.bestMoveUci.slice(0, 2);
          const to = msg.bestMoveUci.slice(2, 4);
          const promo = (msg.bestMoveUci.slice(4, 5) || 'q') as PieceType;

          if (msg.report?.treeEdges && msg.report.treeEdges.length > 0) {
            latestTreeEdgesRef.current = msg.report.treeEdges;
          }
          if (msg.report?.allSimulations && msg.report.allSimulations.length > 0) {
            latestAllSimulationsRef.current = msg.report.allSimulations;
          }

          const snap = simSnapshotRef.current;
          const aiColorForMove: PieceColor = snap.humanColorActual === 'w' ? 'b' : 'w';
          const forkPreview =
            snap.gameMode === 'engine'
              ? inspectPostMoveForkState(
                  snap.localFen,
                  from,
                  to,
                  promo,
                  aiColorForMove,
                  snap.humanColorActual,
                )
              : { isFork: false, shouldWarn: false };

          if (
            !forkPreview.isFork &&
            showSearchTreeRef.current &&
            msg.report?.treeEdges &&
            msg.report.treeEdges.length > 0 &&
            sceneRef.current
          ) {
            const reqIdSnapshot = msg.requestId;
            const reportSnapshot = msg.report;
            const edgesSnapshot = msg.report.treeEdges;
            const simsSnapshot =
              msg.report.allSimulations && msg.report.allSimulations.length > 0
                ? msg.report.allSimulations
                : msg.report.triedLines;

            pendingBotMoveRef.current = {
              requestId: reqIdSnapshot,
              from,
              to,
              promo,
              report: reportSnapshot,
            };
            treeActiveOnScreenRef.current = true;
            setTreeStatusMode('developing');

            sceneRef.current.presentDevelopedSearchTree(edgesSnapshot, {
              minDevelopSec: 1.35,
              holdSec: 0,
              fadeSec: 0.3,
              onDeveloped: () => {
                if (pendingBotMoveRef.current?.requestId !== reqIdSnapshot) return;
                setTreeStatusMode('holding');
                openTreeBrowserSessionRef.current(
                  reportSnapshot.rootFen,
                  edgesSnapshot,
                  simsSnapshot,
                  true,
                  reportSnapshot.depth,
                  reportSnapshot.nodes,
                );
              },
              onComplete: () => {
                if (pendingBotMoveRef.current?.requestId === reqIdSnapshot) {
                  flushPendingBotMoveRef.current(true);
                }
              },
            });
          } else {
            treeActiveOnScreenRef.current = false;
            setIsThinkingAi(false);
            setTreeStatusMode('idle');
            commitLocalMoveRef.current(from, to, promo, msg.report);
          }
        } else {
          treeActiveOnScreenRef.current = false;
          setIsThinkingAi(false);
          setTreeStatusMode('idle');
        }
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // Update move quality badge when post-move analysis settles
  useEffect(() => {
    if (!analysis || analysis.isSearching || analysis.lines.length === 0) return;
    const ply = clampedViewPly;
    if (ply <= 0) return;
    const moveRec = activeMoves[ply - 1];
    if (!moveRec || moveRec.fen !== analysis.fen) return;

    const prevFen =
      ply === 1
        ? gameMode === 'tactical'
          ? activePuzzle.fen
          : INITIAL_FEN
        : activeMoves[ply - 2]?.fen;
    const prevScore = prevFen ? prevEvalByFenRef.current.get(prevFen) : undefined;
    const postScore = analysis.lines[0].scoreCp;

    if (prevScore !== undefined) {
      const cpLoss =
        moveRec.color === 'w'
          ? Math.max(0, prevScore - postScore)
          : Math.max(0, postScore - prevScore);
      const quality = classifyMoveQuality(cpLoss);
      setMoveEvalMeta((prev) => ({
        ...prev,
        [ply]: { ply, evalCp: postScore, quality, cpLoss },
      }));
    }
  }, [analysis, clampedViewPly, activeMoves]);

  // Trigger continuous position analysis when enabled (and not during active AI search)
  useEffect(() => {
    const worker = workerRef.current;
    if (!worker || !analysisEnabled || isThinkingAi) return;

    const reqId = ++analysisReqIdRef.current;
    const req: EngineWorkerRequest = {
      type: 'analyze',
      requestId: reqId,
      fen: displayedFen,
      maxDepth: 5,
      timeBudgetMs: 950,
      multiPv: 3,
    };
    worker.postMessage(req);
  }, [analysisEnabled, displayedFen, isThinkingAi]);

  // Trigger Chess Angel's mathematical routine move when it's her turn (respecting undo-offer window)
  useEffect(() => {
    if (gameMode !== 'engine' || localResult || !isViewingLatest || calcPreview !== null) return;
    const chess = new Chess(localFen);
    const turn = chess.turn() as PieceColor;
    const aiColor: PieceColor = humanColorActual === 'w' ? 'b' : 'w';
    if (turn !== aiColor) return;

    if (
      pendingBotMoveRef.current ||
      awaitingDistractionModalRef.current ||
      holdBotUntilRef.current > performance.now()
    ) {
      return;
    }

    const worker = workerRef.current;
    if (!worker) return;

    setIsThinkingAi(true);
    if (showSearchTreeRef.current) {
      setTreeStatusMode('developing');
    }
    const reqId = ++botReqIdRef.current;
    const delay = window.setTimeout(() => {
      const req: EngineWorkerRequest = {
        type: 'bot-move',
        requestId: reqId,
        fen: localFen,
        level: engineLevel,
      };
      worker.postMessage(req);
    }, 280);

    return () => {
      window.clearTimeout(delay);
    };
  }, [
    gameMode,
    localFen,
    localResult,
    humanColorActual,
    engineLevel,
    isViewingLatest,
    calcPreview,
    botHoldEpoch,
  ]);

  // === Real-Time WebSocket Multiplayer Connection ===
  const prevRoomMoveCountRef = useRef(0);

  useEffect(() => {
    const client = new MultiplayerClient(
      {
        onStatus: (s) => setWsStatus(s),
        onMessage: (msg) => {
          switch (msg.type) {
            case 'server:welcome':
              setOnlineCount(msg.onlineCount);
              break;
            case 'server:presence':
              setOnlineCount(msg.onlineCount);
              setQueueCount(msg.queueCount);
              break;
            case 'rooms:list':
              setPublicRooms(msg.rooms);
              break;
            case 'matchmaking:queued':
              setInQueue(true);
              setRoomError(null);
              break;
            case 'matchmaking:cancelled':
              setInQueue(false);
              break;
            case 'room:error':
              setRoomError(msg.message);
              break;
            case 'room:joined': {
              setInQueue(false);
              setRoomError(null);
              setActiveRoom(msg.room);
              setMyRoomRole(msg.role);
              setGameMode('multiplayer');
              setActiveReplayGame(null);
              setReplayPlaying(false);
              lastRenderedRoomSecRef.current = {
                w: Math.ceil(msg.room.clocks.w / 1000),
                b: Math.ceil(msg.room.clocks.b / 1000),
              };
              setDisplayRoomClocks(msg.room.clocks);
              prevRoomMoveCountRef.current = msg.room.moves.length;
              setViewPly(msg.room.moves.length);
              setSelectedSquare(null);
              setCoachArrows([]);
              const preset: CameraPreset = msg.role === 'b' ? 'black' : 'white';
              setCameraPreset(preset);
              sceneRef.current?.setCameraPreset(preset);

              const url = new URL(window.location.href);
              url.searchParams.set('room', msg.room.id);
              window.history.replaceState({}, '', url.toString());
              break;
            }
            case 'room:state': {
              const room = msg.room;
              setActiveRoom(room);
              lastRenderedRoomSecRef.current = {
                w: Math.ceil(room.clocks.w / 1000),
                b: Math.ceil(room.clocks.b / 1000),
              };
              setDisplayRoomClocks(room.clocks);

              if (room.moves.length > prevRoomMoveCountRef.current) {
                const newest = room.moves[room.moves.length - 1];
                lastMoveAnimHintRef.current = { from: newest.from, to: newest.to };
                setViewPly(room.moves.length);
                const c = new Chess(room.fen);
                if (room.result) soundEngine.playGameOver();
                else if (c.inCheck()) soundEngine.playCheck();
                else if (newest.captured) soundEngine.playCapture();
                else soundEngine.playMove();
              } else if (room.moves.length < prevRoomMoveCountRef.current) {
                setViewPly(room.moves.length);
              }
              if (
                room.result?.reason === 'timeout' &&
                clockTimeoutAnnouncedForIdRef.current !== room.id
              ) {
                clockTimeoutAnnouncedForIdRef.current = room.id;
                soundEngine.playGameOver();
                const roomWinner: PieceColor = room.result.winner === 'b' ? 'b' : 'w';
                if (angelVoiceRef.current === 'on') {
                  const timeoutMsg = createClockTimeoutMessage(roomWinner, undefined, 'multiplayer');
                  if (timeoutMsg) {
                    setOpponentMessage(timeoutMsg);
                    opponentSpeech.playClip(timeoutMsg.clipId, 'on', soundEnabledRef.current);
                  }
                }
              }
              prevRoomMoveCountRef.current = room.moves.length;
              break;
            }
            case 'game:move-rejected':
              setRoomError(msg.reason);
              window.setTimeout(() => setRoomError(null), 2600);
              break;
          }
        },
      },
      playerName,
    );

    mpClientRef.current = client;
    client.connect();

    return () => {
      client.disconnect();
      mpClientRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // === Replay Theatre Auto-Playback Timer ===
  const jumpToPly = useCallback(
    (targetPly: number) => {
      const clamped = Math.max(0, Math.min(activeMoves.length, targetPly));
      if (clamped === viewPly + 1 && activeMoves[clamped - 1]) {
        const m = activeMoves[clamped - 1];
        lastMoveAnimHintRef.current = { from: m.from, to: m.to };
        if (m.captured) soundEngine.playCapture();
        else soundEngine.playMove();
      }
      setViewPly(clamped);
      setSelectedSquare(null);
      if (clamped >= activeMoves.length) {
        setReplayPlaying(false);
      }
    },
    [activeMoves, viewPly],
  );

  useEffect(() => {
    if (!replayPlaying) return;
    if (clampedViewPly >= activeMoves.length) {
      setReplayPlaying(false);
      return;
    }

    const intervalMs = Math.round(1050 / replaySpeed);
    const id = window.setTimeout(() => {
      jumpToPly(clampedViewPly + 1);
    }, intervalMs);

    return () => window.clearTimeout(id);
  }, [replayPlaying, clampedViewPly, activeMoves.length, replaySpeed, jumpToPly]);

  const handleStepTreeSimulation = useCallback((delta: -1 | 1) => {
    setTreeBrowser((prev) => {
      if (!prev) return prev;
      const visibleCount = prev.onlyTopThree
        ? Math.min(3, prev.simulations.length)
        : prev.simulations.length;
      if (visibleCount === 0) return prev;

      if (prev.selectedIndex === null) {
        return {
          ...prev,
          selectedIndex: delta > 0 ? 0 : visibleCount - 1,
        };
      }
      const next = prev.selectedIndex + delta;
      if (next < 0 || next >= visibleCount) {
        return { ...prev, selectedIndex: null };
      }
      return { ...prev, selectedIndex: next };
    });
  }, []);

  const handleSelectTreeSimulation = useCallback((index: number | null) => {
    setTreeBrowser((prev) => (prev ? { ...prev, selectedIndex: index } : prev));
  }, []);

  const handleToggleTreeOnlyTopThree = useCallback(() => {
    setTreeBrowser((prev) => {
      if (!prev) return prev;
      const nextOnlyTop = !prev.onlyTopThree;
      const nextSelected =
        nextOnlyTop && prev.selectedIndex !== null && prev.selectedIndex >= 3
          ? 0
          : prev.selectedIndex;
      return {
        ...prev,
        onlyTopThree: nextOnlyTop,
        selectedIndex: nextSelected,
      };
    });
  }, []);

  const handleContinueFromTree = useCallback(() => {
    // Once the player pushes "Continue · Play Move", stop showing the tree on the board
    // and stop proposing the three best moves until the player opens the tree again,
    // while letting the active voice message continue playing and her modal keep its content.
    showSearchTreeRef.current = false;
    setShowSearchTree(false);
    suppressTreeAndThreeMovesRef.current = true;
    setSuppressTreeAndThreeMoves(true);
    setFrontalTreeViewOpen(false);

    if (pendingBotMoveRef.current) {
      preserveMessageOnBotCommitRef.current = true;
      flushPendingBotMove(true);
    } else {
      setTreeBrowser(null);
      sceneRef.current?.confirmSearchTreeContinue();
    }
  }, [flushPendingBotMove]);

  treeSquareClickRef.current = (sq: string) => {
    setTreeBrowser((prev) => {
      if (!prev) return prev;
      const visibleSims = prev.onlyTopThree
        ? prev.simulations.slice(0, 3)
        : prev.simulations;
      const matchingIndices: number[] = [];
      visibleSims.forEach((sim, idx) => {
        if (
          sim.bestMoveUci.slice(0, 2) === sq ||
          sim.bestMoveUci.slice(2, 4) === sq
        ) {
          matchingIndices.push(idx);
        }
      });
      if (matchingIndices.length === 0) return prev;
      const curPos =
        prev.selectedIndex !== null ? matchingIndices.indexOf(prev.selectedIndex) : -1;
      const nextIdx = matchingIndices[(curPos + 1) % matchingIndices.length];
      return { ...prev, selectedIndex: nextIdx };
    });
  };

  // Sync 3D search-tree lines & colored evaluation arrows whenever treeBrowser state changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!treeBrowser || !scene) return;

    const allSims = treeBrowser.simulations;
    const visibleSims = treeBrowser.onlyTopThree ? allSims.slice(0, 3) : allSims;
    const topEdges = treeBrowser.onlyTopThree ? buildTopThreeEdges(allSims) : [];
    const baseEdges =
      treeBrowser.onlyTopThree && topEdges.length > 0
        ? topEdges
        : activeTreeFullEdgesRef.current;

    if (
      treeBrowser.selectedIndex !== null &&
      visibleSims[treeBrowser.selectedIndex]
    ) {
      const selIdx = treeBrowser.selectedIndex;
      const sim = visibleSims[selIdx];
      const arrowKind: SuggestionArrow['kind'] =
        selIdx === 0 ? 'trial-1' : selIdx === 1 ? 'trial-2' : 'trial-3';
      const overlayArrows: SuggestionArrow[] = sim.pvUci
        .slice(0, 4)
        .filter((u) => u.length >= 4)
        .map((u, plyIdx) => ({
          from: u.slice(0, 2),
          to: u.slice(2, 4),
          kind: arrowKind,
          opacityScale: plyIdx === 0 ? 1 : Math.max(0.55, 0.88 - plyIdx * 0.12),
        }));

      scene.setSearchTreeBrowserDisplay({
        edges: baseEdges,
        treeOpacity: 0.22,
        overlayArrows,
      });
    } else if (treeBrowser.onlyTopThree) {
      const topThreeArrows: SuggestionArrow[] = visibleSims
        .filter((s) => s.bestMoveUci.length >= 4)
        .map((sim, idx) => ({
          from: sim.bestMoveUci.slice(0, 2),
          to: sim.bestMoveUci.slice(2, 4),
          kind: idx === 0 ? 'trial-1' : idx === 1 ? 'trial-2' : 'trial-3',
          opacityScale: 1,
        }));

      scene.setSearchTreeBrowserDisplay({
        edges: baseEdges,
        treeOpacity: 0.88,
        overlayArrows: topThreeArrows,
      });
    } else {
      scene.setSearchTreeBrowserDisplay({
        edges: baseEdges,
        treeOpacity: 0.88,
        overlayArrows: [],
      });
    }
  }, [treeBrowser]);

  // === Keyboard Shortcuts (M = mute, Left/Right = step simulations or moves, Space = replay) ===
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        handleToggleFullscreen();
      } else if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setSoundEnabled((prev) => {
          const next = !prev;
          soundEngine.enabled = next;
          if (!next) {
            opponentSpeech.stop();
            opponentSpeech.setBackgroundMusicEnabled(musicEnabledRef.current, false);
          } else if (musicEnabledRef.current) {
            opponentSpeech.setBackgroundMusicEnabled(true, true);
          }
          return next;
        });
      } else if (treeBrowser) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handleStepTreeSimulation(-1);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          handleStepTreeSimulation(1);
        } else if (e.key === 'Escape' || e.key === 'Enter') {
          e.preventDefault();
          handleContinueFromTree();
        }
      } else if (e.key === 'ArrowLeft') {
        setReplayPlaying(false);
        jumpToPly(clampedViewPly - 1);
      } else if (e.key === 'ArrowRight') {
        setReplayPlaying(false);
        jumpToPly(clampedViewPly + 1);
      } else if (e.key === ' ' && activeTab === 'replay' && activeMoves.length > 0) {
        e.preventDefault();
        if (!replayPlaying && clampedViewPly >= activeMoves.length) {
          setViewPly(0);
          setReplayPlaying(true);
        } else {
          setReplayPlaying((p) => !p);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    jumpToPly,
    clampedViewPly,
    activeTab,
    activeMoves.length,
    replayPlaying,
    handleToggleFullscreen,
    treeBrowser,
    handleStepTreeSimulation,
    handleContinueFromTree,
  ]);

  // === Game & Interactive Coach Handlers ===
  const resetLocalState = useCallback(
    (tc: TimeControlId) => {
      clearTacticalTimers();
      casualSessionSnapshotRef.current = null;
      botReqIdRef.current++;
      flushPendingBotMove(false);
      resetGameCommentaryCounts();
      resetGameVideoPlayCounts();
      awaitingDistractionModalRef.current = false;
      preserveMessageOnBotCommitRef.current = false;
      holdBotUntilRef.current = 0;
      goodMoveStreakRef.current = 0;
      lastSeductionPlyRef.current = -99;
      turnStartedAtRef.current = performance.now();
      hesitationStageRef.current = 0;
      if (calcShowingTimerRef.current !== null) {
        window.clearTimeout(calcShowingTimerRef.current);
        calcShowingTimerRef.current = null;
      }
      setCalcShowingPending(false);
      clearForkArrowsTimer();
      sceneRef.current?.stopCalculationPreview(false);
      setCalcPreview(null);
      setCoachArrows([]);
      setIsThinkingAi(false);
      setLocalMoves([]);
      setLocalFen(INITIAL_FEN);
      setLocalResult(null);
      setViewPly(0);
      setSelectedSquare(null);
      setPendingPromotion(null);
      setMoveEvalMeta({});
      setReplayPlaying(false);
      setActiveReplayGame(null);
      setOpponentMessage(null);
      opponentSpeech.stop();
      autoSavedSessionRef.current = null;
      clockTimeoutAnnouncedForIdRef.current = null;
      currentMatchIdRef.current = `game_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const ms = TIME_CONTROLS[tc].initialMs;
      localClockMsRef.current = { w: ms, b: ms };
      lastRenderedLocalSecRef.current = {
        w: Math.ceil(ms / 1000),
        b: Math.ceil(ms / 1000),
      };
      setLocalClocks({ w: ms, b: ms });
    },
    [clearTacticalTimers, clearForkArrowsTimer, flushPendingBotMove],
  );

  const handleStartEngineGame = useCallback(
    (
      level: EngineLevel,
      colorPref: PieceColor | 'random',
      tc: TimeControlId,
      announcement: 'intro' | 'new_match' | 'none' = 'intro',
    ) => {
      if (activeRoom) {
        mpClientRef.current?.leaveRoom();
        setActiveRoom(null);
        setMyRoomRole(null);
        const url = new URL(window.location.href);
        url.searchParams.delete('room');
        window.history.replaceState({}, '', url.toString());
      }
      setEngineLevel(level);
      setHumanColorPref(colorPref);
      setTimeControl(tc);
      const actual: PieceColor =
        colorPref === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : colorPref;
      setHumanColorActual(actual);
      setGameMode('engine');
      resetLocalState(tc);
      if (announcement !== 'none') {
        const startMsg =
          announcement === 'new_match' ? createNewMatchMessage() : createIntroMessage();
        setOpponentMessage(startMsg);
        if (startMsg && angelVoiceRef.current === 'on') {
          opponentSpeech.unlock();
          opponentSpeech.playClip(startMsg.clipId, 'on', soundEnabledRef.current);
        }
      }
      const cam: CameraPreset = actual === 'b' ? 'black' : 'white';
      setDockCollapsed(true);
      setCameraPreset(cam);
      sceneRef.current?.setCameraPreset(cam);
    },
    [activeRoom, resetLocalState],
  );

  const handleStartLocalGame = useCallback(
    (tc: TimeControlId, announcement: 'new_match' | 'none' = 'none') => {
      if (activeRoom) {
        mpClientRef.current?.leaveRoom();
        setActiveRoom(null);
        setMyRoomRole(null);
        const url = new URL(window.location.href);
        url.searchParams.delete('room');
        window.history.replaceState({}, '', url.toString());
      }
      setTimeControl(tc);
      setGameMode('local');
      resetLocalState(tc);
      if (announcement === 'new_match') {
        announceControlEvent(createNewMatchMessage());
      }
      setDockCollapsed(true);
      setCameraPreset('white');
      sceneRef.current?.setCameraPreset('white');
    },
    [activeRoom, resetLocalState, announceControlEvent],
  );

  const handleLeaveMultiplayer = useCallback(() => {
    mpClientRef.current?.leaveRoom();
    setActiveRoom(null);
    setMyRoomRole(null);
    setRoomError(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url.toString());
    setGameMode('engine');
    resetLocalState(timeControl);
  }, [resetLocalState, timeControl]);

  const handleUndoLocal = useCallback(() => {
    if (gameMode === 'multiplayer' || isReplayMode || localMoves.length === 0) {
      return;
    }
    botReqIdRef.current++;
    flushPendingBotMove(false);
    awaitingDistractionModalRef.current = false;
    holdBotUntilRef.current = 0;
    setIsThinkingAi(false);
    if (calcShowingTimerRef.current !== null) {
      window.clearTimeout(calcShowingTimerRef.current);
      calcShowingTimerRef.current = null;
    }
    setCalcShowingPending(false);
    sceneRef.current?.stopCalculationPreview(false);
    setCalcPreview(null);
    clearForkArrowsTimer();
    setCoachArrows([]);
    setOpponentMessage(null);
    opponentSpeech.stop();
    turnStartedAtRef.current = performance.now();
    hesitationStageRef.current = 0;

    const currentTurn = new Chess(localFen).turn() as PieceColor;
    const stepsBack =
      gameMode === 'engine' && localMoves.length >= 2 && currentTurn === humanColorActual ? 2 : 1;
    const nextMoves = localMoves.slice(0, Math.max(0, localMoves.length - stepsBack));
    const nextFen = nextMoves.length > 0 ? nextMoves[nextMoves.length - 1].fen : INITIAL_FEN;
    setLocalMoves(nextMoves);
    setLocalFen(nextFen);
    setLocalResult(null);
    setViewPly(nextMoves.length);
    setSelectedSquare(null);
  }, [gameMode, isReplayMode, localMoves, localFen, humanColorActual, flushPendingBotMove]);

  const startCalcPreviewOnScene = useCallback(
    (validReport: BotSearchReport, restoreFen: string) => {
      const scene = sceneRef.current;
      if (!scene) return;
      setCalcShowingPending(false);
      setCoachArrows([]);
      opponentSpeech.stop();
      setOpponentMessage(null);
      scene.playCalculationPreview(validReport, restoreFen, {
        onBranchChange: (branchIndex, totalBranches, pvSan, waitingForConfirm) => {
          if (!waitingForConfirm) {
            opponentSpeech.stop();
            setOpponentMessage(null);
          }
          setCalcPreview({ branchIndex, totalBranches, pvSan, waitingForConfirm });
        },
        onWaitForBranchConfirm: (completedBranchIndex, _totalBranches, pvSan) => {
          if (completedBranchIndex === 1 || completedBranchIndex === 2) {
            const confirmMsg = createTrialConfirmMessage(completedBranchIndex, pvSan);
            if (confirmMsg) {
              setOpponentMessage(confirmMsg);
              opponentSpeech.playClip(
                confirmMsg.clipId,
                angelVoiceRef.current,
                soundEnabledRef.current,
              );
            } else {
              setOpponentMessage(null);
            }
          }
        },
        onComplete: () => {
          setCalcPreview(null);
          setOpponentMessage(null);
          turnStartedAtRef.current = performance.now();
        },
      });
    },
    [],
  );

  // Interactive Chess Angel callbacks:
  // 1) Animate the search-tree branches Chess Angel calculated on the 3D board (slow + click-confirmed between branches)
  const handleWatchCalculatedLines = useCallback(
    (report: BotSearchReport, restoreFenOverride?: string) => {
      const scene = sceneRef.current;
      if (!scene) return;

      if (calcShowingTimerRef.current !== null) {
        window.clearTimeout(calcShowingTimerRef.current);
        calcShowingTimerRef.current = null;
      }
      scene.stopCalculationPreview(false);
      scene.stopSearchTreeThinLines();
      treeActiveOnScreenRef.current = false;
      setTreeStatusMode('idle');
      setTreeBrowser(null);
      setCalcPreview(null);
      setFrontalTreeViewOpen(false);

      const targetRestoreFen = restoreFenOverride || displayedFen;
      const validReport = ensureValidCalcReport(report, targetRestoreFen, analysis);
      if (!validReport) return;

      // Immediately illuminate the 3 colored root candidate arrows when rootFen matches current board
      if (validReport.rootFen === targetRestoreFen) {
        setCoachArrows(buildRootPreviewArrowsFromReport(validReport));
      } else {
        setCoachArrows([]);
      }

      opponentSpeech.unlock();
      const showingMsg = angelVoice !== 'off' ? createCalcShowingMessage(validReport) : null;
      if (showingMsg) {
        const prep = prepareHumanCommentaryPlayback(showingMsg.clipId, `msg:${showingMsg.id}`);
        setOpponentMessage(showingMsg);
        opponentSpeech.playClip(showingMsg.clipId, angelVoice, soundEnabled);

        const introSec = Math.max(
          soundEnabled ? prep.audioSec || 4.8 : angelVisibleRef.current ? 1.8 : 0,
          angelVisibleRef.current && prep.playToEnd ? prep.videoSec : 0,
        );
        const delayMs = introSec > 0.25 ? Math.round(introSec * 1000) + 160 : 0;

        if (delayMs > 0) {
          setCalcShowingPending(true);
          calcShowingTimerRef.current = window.setTimeout(() => {
            calcShowingTimerRef.current = null;
            startCalcPreviewOnScene(validReport, targetRestoreFen);
          }, delayMs);
          return;
        }
      } else {
        setOpponentMessage(null);
      }

      startCalcPreviewOnScene(validReport, targetRestoreFen);
    },
    [angelVoice, soundEnabled, displayedFen, analysis, startCalcPreviewOnScene],
  );

  const handleConfirmNextBranch = useCallback(() => {
    opponentSpeech.stop();
    setOpponentMessage(null);
    sceneRef.current?.confirmNextCalculationBranch();
  }, []);

  const handleStopCalculationPreview = useCallback(() => {
    if (calcShowingTimerRef.current !== null) {
      window.clearTimeout(calcShowingTimerRef.current);
      calcShowingTimerRef.current = null;
    }
    setCalcShowingPending(false);
    opponentSpeech.stop();
    setOpponentMessage(null);
    sceneRef.current?.stopCalculationPreview(true);
    if (!pendingBotMoveRef.current) {
      sceneRef.current?.stopSearchTreeThinLines();
      treeActiveOnScreenRef.current = false;
      setTreeStatusMode('idle');
    }
    setCalcPreview(null);
    setCoachArrows([]);
    turnStartedAtRef.current = performance.now();
  }, []);

  const [frontalTreeViewOpen, setFrontalTreeViewOpen] = useState(false);
  frontalTreeViewOpenRef.current = frontalTreeViewOpen;
  const frontalTreeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleToggleFrontalTreeView = useCallback(() => {
    setFrontalTreeViewOpen((prev) => {
      const next = !prev;
      if (next) {
        suppressTreeAndThreeMovesRef.current = false;
        setSuppressTreeAndThreeMoves(false);
      }
      return next;
    });
  }, []);

  const handleOpenFrontalTreeView = useCallback(() => {
    suppressTreeAndThreeMovesRef.current = false;
    setSuppressTreeAndThreeMoves(false);
    setFrontalTreeViewOpen(true);
  }, []);

  useEffect(() => {
    if (!frontalTreeViewOpen) return;
    const canvas = frontalTreeCanvasRef.current;
    if (!canvas) return;

    const reportFromMsg =
      !treeBrowser &&
      opponentMessage?.action?.kind === 'calc-preview' &&
      opponentMessage.action.report.treeEdges &&
      opponentMessage.action.report.treeEdges.length > 0
        ? opponentMessage.action.report
        : null;

    const schematicFen = treeBrowser
      ? activeTreeRootFenRef.current
      : reportFromMsg
        ? reportFromMsg.rootFen
        : displayedFen;

    let edgesToDraw =
      (treeBrowser && activeTreeFullEdgesRef.current.length > 0
        ? activeTreeFullEdgesRef.current
        : null) ||
      (reportFromMsg ? reportFromMsg.treeEdges : null) ||
      (analysis?.fen === schematicFen && analysis.treeEdges && analysis.treeEdges.length > 0
        ? analysis.treeEdges
        : null) ||
      buildQuickSearchTreeForPosition(schematicFen).edges;

    if (treeBrowser && treeBrowser.simulations.length > 0) {
      const visibleSims = treeBrowser.onlyTopThree
        ? treeBrowser.simulations.slice(0, 3)
        : treeBrowser.simulations;
      if (
        treeBrowser.selectedIndex !== null &&
        treeBrowser.selectedIndex >= 0 &&
        treeBrowser.selectedIndex < visibleSims.length
      ) {
        const singleEdges = buildTopThreeEdges([visibleSims[treeBrowser.selectedIndex]]);
        if (singleEdges.length > 0) {
          edgesToDraw = singleEdges;
        }
      } else if (treeBrowser.onlyTopThree) {
        const topEdges = buildTopThreeEdges(treeBrowser.simulations);
        if (topEdges.length > 0) {
          edgesToDraw = topEdges;
        }
      }
    }

    drawSearchTreeTopViewOnCanvas(canvas, edgesToDraw, schematicFen);
  }, [frontalTreeViewOpen, treeBrowser, opponentMessage, analysis, displayedFen]);

  useEffect(() => {
    return subscribeStudioDeveloperAuth(() => {
      const unlocked = isStudioDeveloperUnlocked();
      setStudioUnlocked(unlocked);
      if (!unlocked) {
        setVideoStudioOpen(false);
      }
    });
  }, []);

  const handleTriggerCreatorTribute = useCallback(() => {
    // Ignore duplicate / rapid clicks while Thank You, Jan is already playing so it only plays once
    if (
      angelVisibleRef.current &&
      performance.now() < thankJanPlayingUntilRef.current
    ) {
      return;
    }

    if (angelModalOffTimerRef.current !== null) {
      window.clearTimeout(angelModalOffTimerRef.current);
      angelModalOffTimerRef.current = null;
    }

    const msg = createThankJanMessage();
    setPreviewIdleUrl(null);
    setAngelVisible(true);
    const prep = prepareHumanCommentaryPlayback(msg.clipId, `msg:${msg.id}`);
    const playSec = Math.max(
      soundEnabledRef.current ? prep.audioSec : 0,
      prep.videoUrl ? prep.videoSec : 0,
      7.5,
    );
    thankJanPlayingUntilRef.current = performance.now() + Math.round(playSec * 1000) + 250;
    setOpponentMessage(msg);

    if (soundEnabledRef.current) {
      opponentSpeech.unlock();
      opponentSpeech.playClip(msg.clipId, 'on', true);
    }

    // If the player currently has Angel & Modal switched OFF, gently hide her again once the thank-you video finishes
    if (!angelModalEnabled) {
      angelModalOffTimerRef.current = window.setTimeout(() => {
        angelModalOffTimerRef.current = null;
        thankJanPlayingUntilRef.current = 0;
        opponentSpeech.stop();
        setOpponentMessage(null);
        setAngelVisible(false);
      }, Math.round(playSec * 1000) + 450);
    }
  }, [angelModalEnabled]);

  const handleSetAngelModalVisible = useCallback(
    (vis: boolean) => {
      if (vis) {
        if (angelModalOffTimerRef.current !== null) {
          window.clearTimeout(angelModalOffTimerRef.current);
          angelModalOffTimerRef.current = null;
        }
        setAngelModalEnabled(true);
        setAngelVisible(true);
        setPreviewIdleUrl(null);
        const onMsg = createAngelModalOnMessage();
        if (onMsg) {
          setOpponentMessage(onMsg);
          if (angelVoice === 'on') {
            opponentSpeech.unlock();
            opponentSpeech.playClip(onMsg.clipId, 'on', soundEnabled);
          }
        }
        return;
      }

      thankJanPlayingUntilRef.current = 0;
      setAngelModalEnabled(false);
      setCalcPreview(null);
      setTreeBrowser(null);
      if (awaitingDistractionModalRef.current || holdBotUntilRef.current > 0) {
        awaitingDistractionModalRef.current = false;
        holdBotUntilRef.current = 0;
        setBotHoldEpoch((n) => n + 1);
      }

      // If already hidden or farewell is already running and user clicks Off / Angel again, hide immediately
      if (!angelVisible || angelModalOffTimerRef.current !== null) {
        if (angelModalOffTimerRef.current !== null) {
          window.clearTimeout(angelModalOffTimerRef.current);
          angelModalOffTimerRef.current = null;
        }
        opponentSpeech.stop();
        setOpponentMessage(null);
        setAngelVisible(false);
        return;
      }

      const offMsg = createAngelModalOffMessage();
      if (!offMsg) {
        opponentSpeech.stop();
        setOpponentMessage(null);
        setAngelVisible(false);
        return;
      }

      setPreviewIdleUrl(null);
      const prep = prepareHumanCommentaryPlayback(offMsg.clipId, `msg:${offMsg.id}`);
      setOpponentMessage(offMsg);
      if (angelVoice === 'on') {
        opponentSpeech.unlock();
        opponentSpeech.playClip(offMsg.clipId, 'on', soundEnabled);
      }
      const farewellSec = Math.max(
        angelVoice === 'on' && soundEnabled ? prep.audioSec : 0,
        prep.videoUrl ? prep.videoSec : 0,
      );
      if (farewellSec > 0.25) {
        angelModalOffTimerRef.current = window.setTimeout(() => {
          angelModalOffTimerRef.current = null;
          opponentSpeech.stop();
          setOpponentMessage(null);
          setAngelVisible(false);
        }, Math.round(farewellSec * 1000) + 220);
      } else {
        setAngelVisible(false);
      }
    },
    [angelVisible, angelVoice, soundEnabled],
  );

  const handleSecretStudioTrigger = useCallback(() => {
    if (!ALLOW_VIDEO_STUDIO) return;
    unlockStudioDeveloperSession();
    setStudioUnlocked(true);
    setVideoStudioOpen(true);
  }, []);

  useEffect(() => {
    if (!ALLOW_VIDEO_STUDIO) return;
    const onSecretKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        handleSecretStudioTrigger();
      }
    };
    window.addEventListener('keydown', onSecretKeyDown);
    return () => window.removeEventListener('keydown', onSecretKeyDown);
  }, [handleSecretStudioTrigger]);

  useEffect(() => {
    if (!frontalTreeViewOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFrontalTreeViewOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [frontalTreeViewOpen]);

  const handleShowFullSearchTree = useCallback(
    (report?: BotSearchReport) => {
      const scene = sceneRef.current;
      if (!scene || pendingBotMoveRef.current) return;
      suppressTreeAndThreeMovesRef.current = false;
      setSuppressTreeAndThreeMoves(false);

      const rootFen = report?.rootFen || displayedFen;
      const fromReportEdges =
        report?.treeEdges && report.treeEdges.length > 0 ? report.treeEdges : null;
      const fromAnalysisEdges =
        analysis?.fen === rootFen && analysis.treeEdges && analysis.treeEdges.length > 0
          ? analysis.treeEdges
          : null;

      let quickBuilt: ReturnType<typeof buildQuickSearchTreeForPosition> | null = null;
      const ensureQuick = () => {
        if (!quickBuilt) quickBuilt = buildQuickSearchTreeForPosition(rootFen);
        return quickBuilt;
      };

      const edges =
        fromReportEdges ||
        fromAnalysisEdges ||
        ensureQuick().edges;

      const sims =
        (report?.allSimulations && report.allSimulations.length > 0
          ? report.allSimulations
          : report?.triedLines && report.triedLines.length > 0
            ? report.triedLines
            : null) ||
        (analysis?.fen === rootFen &&
        analysis.allSimulations &&
        analysis.allSimulations.length > 0
          ? analysis.allSimulations
          : analysis?.fen === rootFen && analysis.lines.length > 0
            ? analysis.lines
            : null) ||
        ensureQuick().allSimulations;

      if (edges.length > 0) {
        latestTreeEdgesRef.current = edges;
        if (sims.length > 0) latestAllSimulationsRef.current = sims;
        treeActiveOnScreenRef.current = true;
        setTreeStatusMode('developing');
        scene.playSearchTreeThinLines(
          edges,
          () => {
            treeActiveOnScreenRef.current = false;
            setTreeStatusMode('idle');
            setTreeBrowser(null);
          },
          () => {
            setTreeStatusMode('holding');
            openTreeBrowserSession(
              rootFen,
              edges,
              sims,
              false,
              report?.depth ?? analysis?.depth,
              report?.nodes ?? analysis?.nodes,
            );
          },
        );
      }
    },
    [analysis, displayedFen, openTreeBrowserSession],
  );

  const handleReopenTreeBrowser = useCallback(
    (onlyTopThree = false) => {
      suppressTreeAndThreeMovesRef.current = false;
      setSuppressTreeAndThreeMoves(false);
      setCalcPreview(null);

      const rootFen = displayedFen;
      const validReport = ensureValidCalcReport(
        lastBotReportForFenRef.current?.afterFen === rootFen
          ? lastBotReportForFenRef.current.report
          : null,
        rootFen,
        analysis,
      );
      const quick =
        validReport?.treeEdges && validReport.treeEdges.length > 0
          ? null
          : buildQuickSearchTreeForPosition(rootFen);
      const edges =
        (validReport?.treeEdges && validReport.treeEdges.length > 0
          ? validReport.treeEdges
          : null) ||
        quick?.edges ||
        [];
      const sims = ensureTreeSimulations(
        rootFen,
        validReport?.allSimulations && validReport.allSimulations.length > 0
          ? validReport.allSimulations
          : validReport?.triedLines,
        analysis,
      );

      activeTreeRootFenRef.current = rootFen;
      activeTreeFullEdgesRef.current = edges;
      if (edges.length > 0) latestTreeEdgesRef.current = edges;
      if (sims.length > 0) latestAllSimulationsRef.current = sims;

      let moverColor: PieceColor = 'b';
      try {
        moverColor = new Chess(rootFen).turn() as PieceColor;
      } catch {
        // default 'b'
      }

      if (edges.length > 0 && sceneRef.current) {
        treeActiveOnScreenRef.current = true;
        setTreeStatusMode('holding');
        sceneRef.current.playSearchTreeThinLines(
          edges,
          () => {
            treeActiveOnScreenRef.current = false;
            setTreeStatusMode('idle');
            setTreeBrowser(null);
          },
          () => {
            setTreeStatusMode('holding');
          },
        );
      }

      setTreeBrowser({
        simulations: sims,
        moverColor,
        selectedIndex: null,
        onlyTopThree,
        hasPendingBotMove: Boolean(pendingBotMoveRef.current),
        depth: validReport?.depth ?? analysis?.depth ?? 3,
        nodes: validReport?.nodes ?? analysis?.nodes ?? Math.max(64, sims.length * 32),
      });
    },
    [analysis, displayedFen],
  );

  const handleAnimateTopThreeFromTree = useCallback(() => {
    if (!treeBrowser || treeBrowser.simulations.length === 0) return;
    const pending = pendingBotMoveRef.current;
    const pendingReport = pending?.report;
    const synthReport: BotSearchReport = pendingReport || {
      rootFen: activeTreeRootFenRef.current,
      bestMoveUci: treeBrowser.simulations[0].bestMoveUci,
      depth: treeBrowser.depth ?? 3,
      nodes: treeBrowser.nodes ?? treeBrowser.simulations.length * 32,
      timeMs: 250,
      triedLines: treeBrowser.simulations.slice(0, 3),
      allSimulations: treeBrowser.simulations,
      treeEdges: activeTreeFullEdgesRef.current,
    };
    if (pending) {
      let postCommitFen = displayedFen;
      try {
        const probe = new Chess(localFen);
        const mv = probe.move({
          from: pending.from,
          to: pending.to,
          promotion: pending.promo,
        });
        if (mv) postCommitFen = probe.fen();
      } catch {
        // Ignore probe error
      }
      flushPendingBotMove(true);
      window.setTimeout(() => {
        handleWatchCalculatedLines(synthReport, postCommitFen);
      }, 120);
    } else {
      setTreeBrowser(null);
      sceneRef.current?.stopSearchTreeThinLines();
      treeActiveOnScreenRef.current = false;
      setTreeStatusMode('idle');
      handleWatchCalculatedLines(synthReport, displayedFen);
    }
  }, [treeBrowser, localFen, displayedFen, flushPendingBotMove, handleWatchCalculatedLines]);

  const handlePlayThreeMoves = useCallback(() => {
    setFrontalTreeViewOpen(false);

    if (calcPreview || calcShowingPending) {
      handleStopCalculationPreview();
      return;
    }

    if (treeBrowser && treeBrowser.simulations.length > 0) {
      handleAnimateTopThreeFromTree();
      return;
    }

    if (
      opponentMessage?.action?.kind === 'calc-preview' &&
      opponentMessage.action.report.triedLines.length > 0
    ) {
      handleWatchCalculatedLines(opponentMessage.action.report, displayedFen);
      return;
    }

    if (
      lastBotReportForFenRef.current &&
      lastBotReportForFenRef.current.afterFen === displayedFen &&
      lastBotReportForFenRef.current.report.triedLines.length > 0
    ) {
      handleWatchCalculatedLines(lastBotReportForFenRef.current.report, displayedFen);
      return;
    }

    const synthReport = ensureValidCalcReport(null, displayedFen, analysis);
    if (!synthReport) return;
    handleWatchCalculatedLines(synthReport, displayedFen);
  }, [
    calcPreview,
    calcShowingPending,
    treeBrowser,
    opponentMessage,
    displayedFen,
    analysis,
    handleStopCalculationPreview,
    handleAnimateTopThreeFromTree,
    handleWatchCalculatedLines,
  ]);

  const handleToggleSearchTree = useCallback(() => {
    const next = !showSearchTreeRef.current;
    showSearchTreeRef.current = next;
    setShowSearchTree(next);

    if (!next) {
      if (pendingBotMoveRef.current) {
        flushPendingBotMove(true);
      } else {
        sceneRef.current?.stopSearchTreeThinLines();
        treeActiveOnScreenRef.current = false;
        setTreeStatusMode('idle');
        setTreeBrowser(null);
      }
    } else {
      suppressTreeAndThreeMovesRef.current = false;
      setSuppressTreeAndThreeMoves(false);
      if (!pendingBotMoveRef.current) {
        handleShowFullSearchTree();
      }
    }
  }, [flushPendingBotMove, handleShowFullSearchTree]);

  const hasBestMoveArrowProjected = Boolean(
    analysisEnabled &&
      showBestMoveArrow &&
      analysis?.fen === displayedFen &&
      (analysis.lines[0]?.bestMoveUci?.length ?? 0) >= 4,
  );

  const thinkingLinesProjected =
    treeStatusMode !== 'idle' ||
    treeBrowser !== null ||
    calcPreview !== null ||
    calcShowingPending ||
    coachArrows.length > 0 ||
    hasBestMoveArrowProjected ||
    frontalTreeViewOpen;

  const handleSwitchOffThinkingLines = useCallback(() => {
    if (calcShowingTimerRef.current !== null) {
      window.clearTimeout(calcShowingTimerRef.current);
      calcShowingTimerRef.current = null;
    }
    setCalcShowingPending(false);

    sceneRef.current?.stopCalculationPreview(true);
    setCalcPreview(null);

    const hadTreeLines =
      treeStatusMode !== 'idle' || treeBrowser !== null || treeActiveOnScreenRef.current;

    if (hadTreeLines) {
      showSearchTreeRef.current = false;
      setShowSearchTree(false);
      suppressTreeAndThreeMovesRef.current = true;
      setSuppressTreeAndThreeMoves(true);
    }

    const activeClip = opponentMessageRef.current?.clipId ?? '';
    const isLineSpecificPrompt =
      activeClip.startsWith('tree_browse_') ||
      activeClip.startsWith('calc_showing_') ||
      activeClip.startsWith('trial_confirm_');

    if (isLineSpecificPrompt) {
      opponentSpeech.stop();
      setOpponentMessage(null);
    }

    if (pendingBotMoveRef.current) {
      if (!isLineSpecificPrompt && opponentMessageRef.current) {
        preserveMessageOnBotCommitRef.current = true;
      }
      flushPendingBotMove(true);
    } else {
      sceneRef.current?.stopSearchTreeThinLines();
      treeActiveOnScreenRef.current = false;
      setTreeStatusMode('idle');
      setTreeBrowser(null);
    }

    setCoachArrows([]);
    setShowBestMoveArrow(false);
    setFrontalTreeViewOpen(false);
    turnStartedAtRef.current = performance.now();
  }, [treeStatusMode, treeBrowser, flushPendingBotMove]);

  // 2) Undo the player's blunder (from Chess Angel modal or banner) and light up stronger alternatives on the 3D board
  const handleUndoAndShowBetter = useCallback(
    (alternatives: { uci: string; san: string }[]) => {
      if (localMoves.length === 0) return;
      botReqIdRef.current++;
      flushPendingBotMove(false);
      awaitingDistractionModalRef.current = false;
      holdBotUntilRef.current = 0;
      if (calcShowingTimerRef.current !== null) {
        window.clearTimeout(calcShowingTimerRef.current);
        calcShowingTimerRef.current = null;
      }
      setCalcShowingPending(false);
      setIsThinkingAi(false);
      sceneRef.current?.stopCalculationPreview(false);
      sceneRef.current?.stopSearchTreeThinLines();
      treeActiveOnScreenRef.current = false;
      setTreeStatusMode('idle');
      setTreeBrowser(null);
      setCalcPreview(null);
      turnStartedAtRef.current = performance.now();
      hesitationStageRef.current = 0;

      // Rewind back to the human's pre-blunder turn (1 ply if AI hasn't moved yet, 2 plies if AI already replied)
      const currentTurn = new Chess(localFen).turn() as PieceColor;
      const stepsBack =
        currentTurn === humanColorActual && localMoves.length >= 2 ? 2 : 1;
      const removedMoves = localMoves.slice(Math.max(0, localMoves.length - stepsBack));
      const nextMoves = localMoves.slice(0, Math.max(0, localMoves.length - stepsBack));
      const nextFen = nextMoves.length > 0 ? nextMoves[nextMoves.length - 1].fen : INITIAL_FEN;

      // Roll back any increment added on the undone move(s)
      const spec = TIME_CONTROLS[timeControl];
      if (spec.initialMs > 0 && spec.incrementMs > 0 && nextMoves.length > 0) {
        for (const rm of removedMoves) {
          const c = rm.color;
          localClockMsRef.current[c] = Math.max(1000, localClockMsRef.current[c] - spec.incrementMs);
          lastRenderedLocalSecRef.current[c] = Math.ceil(localClockMsRef.current[c] / 1000);
        }
        setLocalClocks({ ...localClockMsRef.current });
      }

      setLocalMoves(nextMoves);
      setLocalFen(nextFen);
      setLocalResult(null);
      setViewPly(nextMoves.length);
      setSelectedSquare(null);

      const resolvedAlts =
        alternatives.filter((a) => a.uci.length >= 4).length > 0
          ? alternatives.filter((a) => a.uci.length >= 4)
          : resolveCandidateMovesForFen(nextFen, null, 2);

      const arrows: SuggestionArrow[] = resolvedAlts.map((a, idx) => ({
        from: a.uci.slice(0, 2),
        to: a.uci.slice(2, 4),
        kind: idx === 0 ? 'primary' : 'secondary',
      }));
      setCoachArrows(arrows);

      const doneMsg = createUndoConfirmedMessage(resolvedAlts[0]?.san);
      if (doneMsg) {
        setOpponentMessage({
          ...doneMsg,
          concernedFigures: resolvedAlts[0]
            ? [{ square: resolvedAlts[0].uci.slice(0, 2) as Square, role: 'attacker' }]
            : undefined,
        });
        opponentSpeech.unlock();
        opponentSpeech.playClip(doneMsg.clipId, angelVoice, soundEnabled);
      }
    },
    [
      localMoves,
      localFen,
      humanColorActual,
      timeControl,
      angelVoice,
      soundEnabled,
      flushPendingBotMove,
    ],
  );

  // 4) Accept hesitation hint and illuminate the recommended move on the 3D board
  const handleAcceptHint = useCallback(
    (uci: string, san: string) => {
      if (calcShowingTimerRef.current !== null) {
        window.clearTimeout(calcShowingTimerRef.current);
        calcShowingTimerRef.current = null;
      }
      setCalcShowingPending(false);
      sceneRef.current?.stopCalculationPreview(false);
      sceneRef.current?.stopSearchTreeThinLines();
      treeActiveOnScreenRef.current = false;
      setTreeStatusMode('idle');
      setTreeBrowser(null);
      setCalcPreview(null);
      setFrontalTreeViewOpen(false);

      let chosenUci = '';
      let chosenSan = san;
      if (uci && uci.length >= 4) {
        try {
          const probe = new Chess(displayedFen);
          const mv = probe.move({
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            promotion: (uci.slice(4, 5) || undefined) as PieceType | undefined,
          });
          if (mv) {
            chosenUci = `${mv.from}${mv.to}${mv.promotion || ''}`;
            chosenSan = mv.san;
          }
        } catch {
          // Fall back to resolved candidate below
        }
      }

      if (!chosenUci) {
        const fallbackBest = resolveCandidateMovesForFen(displayedFen, analysis, 1)[0];
        if (fallbackBest) {
          chosenUci = fallbackBest.uci;
          chosenSan = fallbackBest.san;
        }
      }

      if (chosenUci.length >= 4) {
        setCoachArrows([
          {
            from: chosenUci.slice(0, 2),
            to: chosenUci.slice(2, 4),
            kind: 'primary',
          },
        ]);
      }

      turnStartedAtRef.current = performance.now();
      const shownMsg = createHintShownMessage(chosenSan);
      if (shownMsg) {
        setOpponentMessage({
          ...shownMsg,
          concernedFigures:
            chosenUci.length >= 4
              ? [{ square: chosenUci.slice(0, 2) as Square, role: 'attacker' }]
              : undefined,
        });
        opponentSpeech.unlock();
        opponentSpeech.playClip(shownMsg.clipId, angelVoice, soundEnabled);
      }
    },
    [displayedFen, analysis, angelVoice, soundEnabled],
  );

  const handleLoadSavedGame = useCallback(
    (game: SavedGame) => {
      if (activeRoom) {
        mpClientRef.current?.leaveRoom();
        setActiveRoom(null);
        setMyRoomRole(null);
        const url = new URL(window.location.href);
        url.searchParams.delete('room');
        window.history.replaceState({}, '', url.toString());
      }

      clearTacticalTimers();
      casualSessionSnapshotRef.current = null;
      botReqIdRef.current++;
      flushPendingBotMove(false);
      awaitingDistractionModalRef.current = false;
      preserveMessageOnBotCommitRef.current = false;
      holdBotUntilRef.current = 0;
      turnStartedAtRef.current = performance.now();
      hesitationStageRef.current = 0;
      if (calcShowingTimerRef.current !== null) {
        window.clearTimeout(calcShowingTimerRef.current);
        calcShowingTimerRef.current = null;
      }
      setCalcShowingPending(false);
      sceneRef.current?.stopCalculationPreview(false);
      sceneRef.current?.stopSearchTreeThinLines();
      treeActiveOnScreenRef.current = false;
      setTreeStatusMode('idle');
      setCalcPreview(null);
      setCoachArrows([]);
      setIsThinkingAi(false);
      setReplayPlaying(false);
      setActiveReplayGame(null);
      setSelectedSquare(null);
      setPendingPromotion(null);
      const keepActiveLoadSpeech = Boolean(
        opponentMessageRef.current?.clipId.startsWith('load_game_') &&
          voiceStateRef.current === 'speaking',
      );
      if (!keepActiveLoadSpeech) {
        opponentSpeech.stop();
        setOpponentMessage(null);
      }

      currentMatchIdRef.current = game.id;
      const nextTc: TimeControlId = TIME_CONTROLS[game.timeControl] ? game.timeControl : '10+0';
      setTimeControl(nextTc);

      const fallbackMs = TIME_CONTROLS[nextTc].initialMs;
      const restoredClocks =
        game.clocks &&
        typeof game.clocks.w === 'number' &&
        typeof game.clocks.b === 'number' &&
        (fallbackMs === 0 || game.clocks.w > 0 || game.clocks.b > 0)
          ? { w: game.clocks.w, b: game.clocks.b }
          : { w: fallbackMs, b: fallbackMs };
      localClockMsRef.current = { ...restoredClocks };
      lastRenderedLocalSecRef.current = {
        w: Math.ceil(restoredClocks.w / 1000),
        b: Math.ceil(restoredClocks.b / 1000),
      };
      setLocalClocks({ ...restoredClocks });

      const targetMode: 'engine' | 'local' = game.mode === 'local' ? 'local' : 'engine';
      const restoredHumanColor: PieceColor = game.humanColor === 'b' ? 'b' : 'w';
      if (targetMode === 'engine') {
        if (game.engineLevel && ENGINE_LEVELS[game.engineLevel]) {
          setEngineLevel(game.engineLevel);
        }
        setHumanColorActual(restoredHumanColor);
        setHumanColorPref(game.humanColorPref ?? restoredHumanColor);
      }
      setGameMode(targetMode);

      const targetFen =
        game.moves.length > 0
          ? game.moves[game.moves.length - 1].fen
          : game.finalFen || INITIAL_FEN;

      let restoredResult: RoomResult | null = game.result ?? null;
      if (!restoredResult && game.reason !== 'in-progress') {
        try {
          const checkChess = new Chess(targetFen);
          if (checkChess.isCheckmate()) {
            restoredResult = {
              winner: checkChess.turn() === 'w' ? 'b' : 'w',
              reason: 'checkmate',
            };
          } else if (checkChess.isStalemate()) {
            restoredResult = { winner: 'draw', reason: 'stalemate' };
          } else if (checkChess.isDraw()) {
            restoredResult = { winner: 'draw', reason: 'agreement' };
          }
        } catch {
          // keep null so game remains playable
        }
      }

      clockTimeoutAnnouncedForIdRef.current =
        restoredResult?.reason === 'timeout' ? game.id : null;
      setLocalMoves([...game.moves]);
      setLocalFen(targetFen);
      setLocalResult(restoredResult);
      setMoveEvalMeta(game.moveEvalMeta ? { ...game.moveEvalMeta } : {});
      setViewPly(game.moves.length);
      setActiveTab('play');
      setDockCollapsed(true);

      const cam: CameraPreset =
        targetMode === 'engine' && restoredHumanColor === 'b' ? 'black' : 'white';
      setCameraPreset(cam);
      sceneRef.current?.setCameraPreset(cam);
      if (keepActiveLoadSpeech) {
        setOpponentMessage((prev) =>
          prev ? { ...prev, mathSummary: `Restored: ${game.title}` } : prev,
        );
      } else {
        announceControlEvent(createLoadGameMessage(game.title));
      }
      setBotHoldEpoch((n) => n + 1);
    },
    [activeRoom, clearTacticalTimers, flushPendingBotMove, announceControlEvent],
  );

  const handleImportSaveFile = useCallback(
    async (file: File): Promise<boolean> => {
      try {
        const rawText = await file.text();
        const imported = parseImportedSavedGame(rawText, file.name);
        if (!imported) return false;

        setSavedGames((prev) => {
          const next = [imported, ...prev.filter((g) => g.id !== imported.id)];
          persistSavedGames(next);
          return next;
        });
        const fp = `${imported.whiteName}|${imported.blackName}|${imported.moves.map((m) => m.uci).join(',')}`;
        setSavedGameFingerprints((prev) => new Set(prev).add(fp));
        handleLoadSavedGame(imported);
        return true;
      } catch {
        return false;
      }
    },
    [handleLoadSavedGame],
  );

  const handleLoadReplay = useCallback(
    (game: SavedGame) => {
      clearTacticalTimers();
      botReqIdRef.current++;
      flushPendingBotMove(false);
      awaitingDistractionModalRef.current = false;
      holdBotUntilRef.current = 0;
      sceneRef.current?.stopCalculationPreview(false);
      setCalcPreview(null);
      setCoachArrows([]);
      setReplayPlaying(false);
      setActiveReplayGame(game);
      setGameMode('replay');
      setActiveTab('replay');
      setViewPly(0);
      setSelectedSquare(null);
      setCameraPreset('white');
      sceneRef.current?.setCameraPreset('white');
    },
    [clearTacticalTimers, flushPendingBotMove],
  );

  const handleExitReplay = useCallback(() => {
    setReplayPlaying(false);
    setActiveReplayGame(null);
    setGameMode(activeRoom ? 'multiplayer' : 'engine');
    setViewPly(activeRoom ? activeRoom.moves.length : localMoves.length);
  }, [activeRoom, localMoves.length]);

  const handleOpenReplayCurrent = useCallback(() => {
    setActiveTab('replay');
    setDockCollapsed(false);
    setReplayPlaying(false);
    setViewPly(0);
  }, []);

  const handleToggleReplayPlay = useCallback(() => {
    if (activeMoves.length === 0) return;
    if (!replayPlaying && clampedViewPly >= activeMoves.length) {
      setViewPly(0);
      setReplayPlaying(true);
    } else {
      setReplayPlaying((p) => !p);
    }
  }, [activeMoves.length, replayPlaying, clampedViewPly]);

  const handleSelectCameraPreset = useCallback((preset: CameraPreset) => {
    setCameraPreset(preset);
    sceneRef.current?.setCameraPreset(preset);
  }, []);

  // === Tactical Training Mode & Casual Play Session Switchers ===
  const loadPuzzleOntoBoard = useCallback(
    (puzzle: TacticalPuzzle) => {
      clearTacticalTimers();
      clearForkArrowsTimer();
      botReqIdRef.current++;
      flushPendingBotMove(false);
      awaitingDistractionModalRef.current = false;
      holdBotUntilRef.current = 0;
      sceneRef.current?.stopCalculationPreview(false);
      sceneRef.current?.stopSearchTreeThinLines();
      treeActiveOnScreenRef.current = false;
      setTreeStatusMode('idle');
      setTreeBrowser(null);
      setCalcPreview(null);
      setCoachArrows([]);
      setOpponentMessage(null);
      opponentSpeech.stop();

      const limitMs = getPuzzleTimeLimitMs(puzzle);
      setActivePuzzleId(puzzle.id);
      setTacticalStepIdx(0);
      setTacticalStatus('solving');
      setTacticalFeedback(null);
      setTacticalHintStage(0);
      setTacticalLastDelta(null);
      setTacticalLastSolveAward(null);
      setTacticalRemainingMs(limitMs);
      tacticalRemainingMsRef.current = limitMs;
      tacticalElapsedMsRef.current = 0;
      tacticalTimedOutChimedRef.current = false;
      tacticalHadMistakeRef.current = false;
      tacticalUsedHintRef.current = false;

      setLocalMoves([]);
      setLocalFen(puzzle.fen);
      setLocalResult(null);
      setMoveEvalMeta({});
      setViewPly(0);
      setSelectedSquare(null);
      setPendingPromotion(null);

      const cam: CameraPreset = puzzle.solverColor === 'b' ? 'black' : 'white';
      setCameraPreset(cam);
      sceneRef.current?.setCameraPreset(cam);
    },
    [clearTacticalTimers, clearForkArrowsTimer, flushPendingBotMove],
  );

  const getFilteredTacticalPuzzles = useCallback(
    (themeFilter = tacticalThemeFilter, diffFilter = tacticalDifficultyFilter) => {
      const list = TACTICAL_PUZZLES.filter((p) => {
        if (themeFilter !== 'all' && p.theme !== themeFilter) return false;
        if (diffFilter !== 'all' && p.difficulty !== diffFilter) return false;
        return true;
      });
      return list.length > 0 ? list : TACTICAL_PUZZLES;
    },
    [tacticalThemeFilter, tacticalDifficultyFilter],
  );

  const handleStartTacticalTraining = useCallback(
    (puzzleId?: string) => {
      // Snapshot active Casual Play session so switching back restores exact board & clocks
      if (gameMode === 'engine' || gameMode === 'local') {
        casualSessionSnapshotRef.current = {
          mode: gameMode,
          fen: localFen,
          moves: [...localMoves],
          result: localResult,
          clocks: { w: localClockMsRef.current.w, b: localClockMsRef.current.b },
          moveEvalMeta: { ...moveEvalMeta },
          engineLevel,
          humanColorActual,
          humanColorPref,
          timeControl,
        };
      }
      if (activeRoom) {
        mpClientRef.current?.leaveRoom();
        setActiveRoom(null);
        setMyRoomRole(null);
        const url = new URL(window.location.href);
        url.searchParams.delete('room');
        window.history.replaceState({}, '', url.toString());
      }

      let targetPuzzle: TacticalPuzzle | undefined;
      if (puzzleId) {
        targetPuzzle = TACTICAL_PUZZLES.find((p) => p.id === puzzleId);
      }
      if (!targetPuzzle) {
        const pool = getFilteredTacticalPuzzles();
        const firstUnsolved = pool.find((p) => !tacticalStats.puzzleRecords[p.id]?.solved);
        targetPuzzle = firstUnsolved || activePuzzle || pool[0];
      }

      setActiveReplayGame(null);
      setReplayPlaying(false);
      setGameMode('tactical');
      loadPuzzleOntoBoard(targetPuzzle);
      setDockCollapsed(true);
    },
    [
      gameMode,
      localFen,
      localMoves,
      localResult,
      moveEvalMeta,
      engineLevel,
      humanColorActual,
      humanColorPref,
      timeControl,
      activeRoom,
      getFilteredTacticalPuzzles,
      tacticalStats.puzzleRecords,
      activePuzzle,
      loadPuzzleOntoBoard,
    ],
  );

  const handleReturnToCasualPlay = useCallback(() => {
    clearTacticalTimers();
    clearForkArrowsTimer();
    setCoachArrows([]);
    setSelectedSquare(null);
    setPendingPromotion(null);

    const snap = casualSessionSnapshotRef.current;
    if (snap) {
      setEngineLevel(snap.engineLevel);
      setHumanColorActual(snap.humanColorActual);
      setHumanColorPref(snap.humanColorPref);
      setTimeControl(snap.timeControl);
      localClockMsRef.current = { ...snap.clocks };
      lastRenderedLocalSecRef.current = {
        w: Math.ceil(snap.clocks.w / 1000),
        b: Math.ceil(snap.clocks.b / 1000),
      };
      setLocalClocks({ ...snap.clocks });
      setLocalMoves([...snap.moves]);
      setLocalFen(snap.fen);
      setLocalResult(snap.result);
      setMoveEvalMeta({ ...snap.moveEvalMeta });
      setViewPly(snap.moves.length);
      setGameMode(snap.mode);
      setActiveTab('play');
      setDockCollapsed(true);

      const cam: CameraPreset =
        snap.mode === 'engine' && snap.humanColorActual === 'b' ? 'black' : 'white';
      setCameraPreset(cam);
      sceneRef.current?.setCameraPreset(cam);
      return;
    }

    setActiveTab('play');
    handleStartEngineGame(engineLevel, humanColorPref, timeControl, 'none');
  }, [
    clearTacticalTimers,
    clearForkArrowsTimer,
    handleStartEngineGame,
    engineLevel,
    humanColorPref,
    timeControl,
  ]);

  const handleTacticalNextPuzzle = useCallback(() => {
    const pool = getFilteredTacticalPuzzles();
    const curIdx = pool.findIndex((p) => p.id === activePuzzle.id);
    // Prefer next unsolved in pool, otherwise sequential wrap-around
    for (let offset = 1; offset <= pool.length; offset++) {
      const candidate = pool[(Math.max(0, curIdx) + offset) % pool.length];
      if (!tacticalStats.puzzleRecords[candidate.id]?.solved) {
        loadPuzzleOntoBoard(candidate);
        return;
      }
    }
    const nextSequential = pool[(Math.max(0, curIdx) + 1) % pool.length];
    loadPuzzleOntoBoard(nextSequential);
  }, [getFilteredTacticalPuzzles, activePuzzle.id, tacticalStats.puzzleRecords, loadPuzzleOntoBoard]);

  const handleTacticalPrevPuzzle = useCallback(() => {
    const pool = getFilteredTacticalPuzzles();
    const curIdx = pool.findIndex((p) => p.id === activePuzzle.id);
    const prevIdx = curIdx <= 0 ? pool.length - 1 : curIdx - 1;
    loadPuzzleOntoBoard(pool[prevIdx]);
  }, [getFilteredTacticalPuzzles, activePuzzle.id, loadPuzzleOntoBoard]);

  const handleTacticalRetry = useCallback(() => {
    loadPuzzleOntoBoard(activePuzzle);
  }, [activePuzzle, loadPuzzleOntoBoard]);

  const handleTacticalHint = useCallback(() => {
    if (tacticalStatus !== 'solving' && tacticalStatus !== 'wrong') return;
    const expectedUci = activePuzzle.solutionUci[tacticalStepIdx];
    if (!expectedUci || expectedUci.length < 4) return;

    if (!tacticalUsedHintRef.current) {
      tacticalUsedHintRef.current = true;
      setTacticalStats((prev) => recordTacticalHintUsed(prev));
    }

    const fromSq = expectedUci.slice(0, 2);
    const toSq = expectedUci.slice(2, 4);

    if (tacticalHintStage === 0) {
      setSelectedSquare(fromSq);
      setTacticalHintStage(1);
      setTacticalStatus('solving');
      setTacticalFeedback(`Hint: Look for a forcing move with the piece on ${fromSq}.`);
    } else {
      const san = uciToSanInPosition(localFen, expectedUci);
      setSelectedSquare(fromSq);
      setCoachArrows([
        {
          from: fromSq,
          to: toSq,
          kind: activePuzzle.theme === 'fork' ? 'fork' : 'primary',
        },
      ]);
      setTacticalHintStage(2);
      setTacticalStatus('solving');
      setTacticalFeedback(`Winning move: ${san}`);

      if (angelVoiceRef.current === 'on') {
        const hintMsg = createHintShownMessage(san);
        if (hintMsg) {
          setOpponentMessage(hintMsg);
          opponentSpeech.unlock();
          opponentSpeech.playClip(hintMsg.clipId, 'on', soundEnabledRef.current);
        }
      }
    }
  }, [tacticalStatus, activePuzzle, tacticalStepIdx, tacticalHintStage, localFen]);

  const handleTacticalShowSolution = useCallback(() => {
    if (tacticalStatus === 'solved' || tacticalStatus === 'solution-shown') return;
    clearTacticalTimers();
    setSelectedSquare(null);
    setCoachArrows([]);

    if (!tacticalHadMistakeRef.current) {
      tacticalHadMistakeRef.current = true;
      const { next, ratingDelta } = recordTacticalMistakeOrReveal(tacticalStats, activePuzzle);
      setTacticalStats(next);
      setTacticalLastDelta(ratingDelta);
    }

    const remainingUcis = activePuzzle.solutionUci.slice(tacticalStepIdx);
    if (remainingUcis.length === 0) {
      setTacticalStatus('solution-shown');
      showPuzzleMotifArrows(activePuzzle);
      return;
    }

    setTacticalStatus('opponent-replying');
    let stepFen = localFen;
    let stepMoves = [...localMoves];

    remainingUcis.forEach((uci, idx) => {
      const timerId = window.setTimeout(() => {
        try {
          const chess = new Chess(stepFen);
          const from = uci.slice(0, 2);
          const to = uci.slice(2, 4);
          const promotion = (uci.slice(4, 5) || undefined) as PieceType | undefined;
          const res = chess.move({ from, to, promotion });
          if (!res) return;

          const nextFen = chess.fen();
          const rec: MoveRecord = {
            ply: stepMoves.length + 1,
            san: res.san,
            uci: `${res.from}${res.to}${res.promotion || ''}`,
            from: res.from,
            to: res.to,
            color: res.color as PieceColor,
            piece: res.piece as PieceType,
            captured: res.captured as PieceType | undefined,
            promotion: res.promotion as PieceType | undefined,
            fen: nextFen,
            timestamp: Date.now(),
          };

          stepFen = nextFen;
          stepMoves = [...stepMoves, rec];
          lastMoveAnimHintRef.current = { from: res.from, to: res.to };
          setLocalMoves([...stepMoves]);
          setLocalFen(nextFen);
          setViewPly(stepMoves.length);

          if (chess.isCheckmate()) soundEngine.playGameOver();
          else if (chess.inCheck()) soundEngine.playCheck();
          else if (res.captured) soundEngine.playCapture();
          else soundEngine.playMove();

          if (idx === remainingUcis.length - 1) {
            setTacticalStepIdx(activePuzzle.solutionUci.length - 1);
            setTacticalStatus('solution-shown');
            setTacticalFeedback(null);
            showPuzzleMotifArrows(activePuzzle);
          }
        } catch {
          setTacticalStatus('solution-shown');
        }
      }, idx * 580 + 120);
      tacticalTimerIdsRef.current.push(timerId);
    });
  }, [
    tacticalStatus,
    clearTacticalTimers,
    tacticalStats,
    activePuzzle,
    tacticalStepIdx,
    localFen,
    localMoves,
    showPuzzleMotifArrows,
  ]);

  const handlePrimaryHeaderAction = useCallback(() => {
    if (isReplayMode) {
      handleExitReplay();
      return;
    }
    if (gameMode === 'tactical') {
      handleTacticalNextPuzzle();
      return;
    }
    if (gameMode === 'multiplayer' && activeRoom) {
      handleLeaveMultiplayer();
      return;
    }
    if (gameMode === 'local') {
      handleStartLocalGame(timeControl, 'new_match');
    } else {
      handleStartEngineGame(engineLevel, humanColorPref, timeControl, 'new_match');
    }
  }, [
    isReplayMode,
    handleExitReplay,
    gameMode,
    handleTacticalNextPuzzle,
    activeRoom,
    handleLeaveMultiplayer,
    handleStartLocalGame,
    handleStartEngineGame,
    engineLevel,
    humanColorPref,
    timeControl,
  ]);

  const statusNote = useMemo(() => {
    if (!isViewingLatest && !isReplayMode) {
      return `Inspecting Ply ${clampedViewPly}/${activeMoves.length}`;
    }
    if (gameMode === 'multiplayer' && activeRoom?.status === 'waiting') {
      return `Waiting for Opponent · Room ${activeRoom.id}`;
    }
    return null;
  }, [isViewingLatest, isReplayMode, clampedViewPly, activeMoves.length, gameMode, activeRoom]);

  const angelCandidate = useMemo(() => {
    if (gameMode === 'multiplayer') return null;
    if (!analysis || analysis.fen !== displayedFen || analysis.lines.length === 0) return null;
    const top = analysis.lines[0];
    const moveSan = top.pvSan[0];
    if (!moveSan) return null;
    const evalStr = formatEvalLabel(top.scoreCp, top.mateIn);
    return `Chess Angel Candidate: ${moveSan} (${evalStr})`;
  }, [gameMode, analysis, displayedFen]);

  const treeHoldLabel = useMemo(() => {
    if (treeStatusMode === 'developing') {
      return 'Developing full search tree...';
    }
    if (treeStatusMode === 'holding') {
      return isThinkingAi
        ? 'Browsing simulations · click Continue to play move'
        : 'Browsing simulations · click Done to close';
    }
    return null;
  }, [isThinkingAi, treeStatusMode]);

  return (
    <div
      onContextMenu={(e) => {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
        e.preventDefault();
      }}
      onDragStart={(e) => {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
        e.preventDefault();
      }}
      className={`relative w-full h-full overflow-hidden bg-black select-none${
        powerSaveMode ? ' power-save-mode' : ''
      }`}
    >
      {/* Isolated Full-Viewport 3D WebGL Canvas Container (Explicit Non-Zero Sizing) */}
      <div ref={canvasContainerRef} className="webgl-viewport-container z-0" />

      {/* Graceful WebGL Context Loss Fallback */}
      {webglLost && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/95">
          <div className="max-w-sm text-center p-6 rounded-lg border border-white/12 bg-[#141820]">
            <h2 className="font-display text-lg text-[#f4efe4] mb-2">3D Viewport Suspended</h2>
            <p className="text-xs text-[#9aa3b2]">
              WebGL context was temporarily paused by the browser. Touch or restore the tab to resume ChessAngel 3D.
            </p>
          </div>
        </div>
      )}

      {/* Slim Far-Left Evaluation Bar (only visible when Analysis menu is rolled out and frontal view closed) */}
      <EvalBar
        visible={!frontalTreeViewOpen && analysisEnabled && activeTab === 'analysis' && !dockCollapsed}
        analysis={analysis}
        flipped={cameraPreset === 'black'}
      />

      {/* Full-Screen Pure #000000 Black Frontal Thinking-Tree View (replaces 3D board; Chess Angel & her modal stay on top) */}
      {frontalTreeViewOpen && (
        <div
          role="region"
          aria-label="Frontal top-view thinking tree lines on pure black"
          className={`fixed inset-0 z-[25] bg-black flex items-center justify-center ${
            angelVisible ? 'lg:pr-[400px]' : ''
          } p-4 pt-14 sm:p-8 sm:pt-14`}
        >
          <button
            type="button"
            onClick={() => setFrontalTreeViewOpen(false)}
            title="Close frontal thinking-tree view and return to 3D board"
            className="fixed top-12 left-4 z-[26] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#141821] hover:bg-[#1e2533] border border-[#d6ae63]/70 text-xs font-semibold text-[#f7f1e5] shadow-2xl transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-[#f3cf83]" />
            Close
          </button>

          <canvas
            ref={frontalTreeCanvasRef}
            width={1600}
            height={1600}
            className="max-w-full max-h-[calc(100dvh-5rem)] w-auto h-auto aspect-square object-contain bg-black"
          />
        </div>
      )}

      {/* Top Edge HUD: Tactical Training Bar in 'tactical' mode, or Transparent Clock & Player Strip in Casual Play */}
      {gameMode === 'tactical' ? (
        <TacticalTrainingHud
          puzzle={activePuzzle}
          status={tacticalStatus}
          solverStepNumber={Math.floor(tacticalStepIdx / 2) + 1}
          totalSolverSteps={Math.ceil(activePuzzle.solutionUci.length / 2)}
          feedbackText={tacticalFeedback}
          lastRatingDelta={tacticalLastDelta}
          lastSolveAward={tacticalLastSolveAward}
          timeLimitMs={activePuzzleTimeLimitMs}
          remainingMs={tacticalRemainingMs}
          hintStage={tacticalHintStage}
          stats={tacticalStats}
          angelVisible={angelVisible}
          onPrevPuzzle={handleTacticalPrevPuzzle}
          onNextPuzzle={handleTacticalNextPuzzle}
          onRetryPuzzle={handleTacticalRetry}
          onRequestHint={handleTacticalHint}
          onShowSolution={handleTacticalShowSolution}
          onOpenTrainingDeck={() => {
            setActiveTab('training');
            setDockCollapsed(false);
          }}
          onSwitchToCasualPlay={handleReturnToCasualPlay}
        />
      ) : (
        <TopBar
          whiteName={whiteName}
          blackName={blackName}
          whiteClockMs={whiteClockMs}
          blackClockMs={blackClockMs}
          isTimed={isTimed}
          turn={displayedTurn}
          materialDiff={materialDiff}
          isCheck={displayedIsCheck}
          gameResult={activeResult}
          statusNote={statusNote}
          angelCandidate={angelCandidate}
          isThinkingAi={isThinkingAi}
          treeHoldLabel={treeHoldLabel}
          onSkipTreeHold={treeStatusMode !== 'idle' ? handleContinueFromTree : undefined}
          isReplayMode={isReplayMode}
          replayTitle={activeReplayGame?.title}
          onPrimaryAction={handlePrimaryHeaderAction}
          onSaveCurrentGame={() => saveCurrentGameToArchive()}
          onOpenReplayCurrent={handleOpenReplayCurrent}
          canSaveCurrent={activeMoves.length > 0 && !isReplayMode}
          alreadySaved={Boolean(currentFingerprint && savedGameFingerprints.has(currentFingerprint))}
          onEnterTacticalTraining={() => handleStartTacticalTraining()}
        />
      )}

      {/* Transparent Bottom-Left Full Screen / Reduce Button + Prominent Version Mark */}
      <div
        className={`fixed bottom-3 left-3 z-[32] flex items-center gap-2 pointer-events-none ${
          !dockCollapsed ? 'hidden xl:flex' : ''
        }`}
      >
        <PWAInstallButton variant="topbar" />

        <button
          type="button"
          onClick={handleToggleFullscreen}
          aria-pressed={isFullscreen}
          aria-label={isFullscreen ? 'Reduce from full screen' : 'Enter full screen'}
          title={isFullscreen ? 'Reduce screen (F or Esc)' : 'Full screen (F)'}
          className="pointer-events-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-transparent hover:bg-white/10 border border-white/18 hover:border-[#d6ae63]/60 text-[11px] font-medium text-[#e6e1d7]/80 hover:text-[#f7f1e5] transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-[#e3be78]"
        >
          {isFullscreen ? (
            <>
              <Minimize2 className="w-3.5 h-3.5 text-[#d6ae63]" />
              <span>Reduce</span>
            </>
          ) : (
            <>
              <Maximize2 className="w-3.5 h-3.5 text-[#d6ae63]" />
              <span>Full Screen</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleTriggerCreatorTribute}
          aria-label={`ChessAngel 3D v${APP_VERSION}`}
          title={`ChessAngel 3D v${APP_VERSION}`}
          className="pointer-events-auto inline-flex items-baseline px-1.5 py-0.5 rounded-md bg-transparent font-display text-sm sm:text-base font-medium tracking-tight text-[#f5f0e6]/85 hover:text-[#f3d38b] [text-shadow:0_1px_6px_rgba(0,0,0,0.95)] transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-[#e3be78]"
        >
          <span className="hidden sm:inline">ChessAngel 3D&nbsp;</span>
          <span>v{APP_VERSION}</span>
        </button>
      </div>

      <OfflineIndicator />

      {/* Retractable Bottom Menu Dock (opens ONLY when touching the bottom rollout arrow) */}
      <ControlDock
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
        }}
        collapsed={dockCollapsed}
        onToggleCollapse={() => setDockCollapsed((c) => !c)}
        onPrimaryAction={handlePrimaryHeaderAction}
        gameMode={gameMode}
        onStartLocalGame={handleStartLocalGame}
        onStartEngineGame={handleStartEngineGame}
        engineLevel={engineLevel}
        onChangeEngineLevel={(lvl) => {
          setEngineLevel(lvl);
          if (gameMode !== 'engine') {
            handleStartEngineGame(lvl, humanColorPref, timeControl, 'none');
          }
          announceControlEvent(createEngineLevelMessage(lvl));
        }}
        humanColorVsAi={humanColorPref}
        onChangeHumanColorVsAi={(side) => {
          handleStartEngineGame(engineLevel, side, timeControl);
        }}
        timeControl={timeControl}
        onChangeTimeControl={(tc) => {
          setTimeControl(tc);
          if (gameMode === 'engine') {
            handleStartEngineGame(engineLevel, humanColorPref, tc);
          } else if (gameMode === 'local') {
            handleStartLocalGame(tc);
          }
        }}
        cameraPreset={cameraPreset}
        onSelectCameraPreset={handleSelectCameraPreset}
        soundEnabled={soundEnabled}
        onToggleSound={() => {
          const next = !soundEnabled;
          setSoundEnabled(next);
          soundEngine.enabled = next;
          if (!next) {
            opponentSpeech.stop();
            opponentSpeech.setBackgroundMusicEnabled(musicEnabledRef.current, false);
          } else if (musicEnabledRef.current) {
            opponentSpeech.unlock();
            opponentSpeech.setBackgroundMusicEnabled(true, true);
          }
        }}
        musicEnabled={musicEnabled}
        onToggleMusic={handleToggleMusic}
        musicTracks={musicTracks}
        activeMusicTrackIndex={activeMusicTrackIndex}
        onSelectMusicTrack={handleSelectMusicTrack}
        angelVoice={angelVoice}
        onChangeAngelVoice={(mode) => {
          setAngelVoice(mode);
          if (mode === 'off') {
            opponentSpeech.stop();
            if (!musicEnabledRef.current) {
              opponentSpeech.stopBackgroundMusic();
            }
            setOpponentMessage(null);
            if (awaitingDistractionModalRef.current || holdBotUntilRef.current > 0) {
              awaitingDistractionModalRef.current = false;
              holdBotUntilRef.current = 0;
              setBotHoldEpoch((n) => n + 1);
            }
            return;
          }
          hasPlayedWelcomeRef.current = true;
          const introMsg = createIntroMessage();
          setOpponentMessage(introMsg);
          if (introMsg) {
            opponentSpeech.unlock();
            opponentSpeech.playClip(introMsg.clipId, 'on', soundEnabled);
          }
        }}
        angelVisible={angelModalEnabled}
        onChangeAngelVisible={handleSetAngelModalVisible}
        shadowsEnabled={shadowsEnabled}
        onToggleShadows={() => {
          prePowerSaveShadowsRef.current = null;
          setShadowsEnabled((s) => !s);
        }}
        powerSaveMode={powerSaveMode}
        onTogglePowerSaveMode={handleTogglePowerSaveMode}
        showCoordinates={showCoordinates}
        onToggleCoordinates={() => setShowCoordinates((c) => !c)}
        showSearchTree={showSearchTree}
        onToggleSearchTree={handleToggleSearchTree}
        onReplaySearchTree={() => handleShowFullSearchTree()}
        onExportTreeJpg={handleOpenFrontalTreeView}
        canUndo={
          gameMode !== 'multiplayer' &&
          gameMode !== 'tactical' &&
          !isReplayMode &&
          localMoves.length > 0
        }
        onUndo={handleUndoLocal}
        onResignLocal={() => {
          if (localResult || gameMode === 'multiplayer' || gameMode === 'tactical' || isReplayMode)
            return;
          botReqIdRef.current++;
          flushPendingBotMove(false);
          awaitingDistractionModalRef.current = false;
          holdBotUntilRef.current = 0;
          const winner: PieceColor =
            gameMode === 'engine'
              ? humanColorActual === 'w'
                ? 'b'
                : 'w'
              : displayedTurn === 'w'
                ? 'b'
                : 'w';
          setLocalResult({ winner, reason: 'resignation' });
          soundEngine.playGameOver();
          announceControlEvent(createResignMessage(winner));
        }}
        isGameActive={!activeResult && !isReplayMode && gameMode !== 'tactical'}
        analysisEnabled={analysisEnabled}
        onToggleAnalysis={() => setAnalysisEnabled((v) => !v)}
        showBestMoveArrow={showBestMoveArrow}
        onToggleBestMoveArrow={() => setShowBestMoveArrow((v) => !v)}
        analysis={analysis}
        moveHistory={activeMoves}
        viewPly={clampedViewPly}
        onJumpToPly={(ply) => {
          setReplayPlaying(false);
          jumpToPly(ply);
        }}
        moveEvalMeta={moveEvalMeta}
        currentFen={displayedFen}
        currentPgn={currentPgn}
        onPlayEngineMove={(uci) => {
          if (uci.length < 4 || !canInteractWithBoard) return;
          submitMove(uci.slice(0, 2), uci.slice(2, 4), (uci.slice(4, 5) || 'q') as PieceType);
        }}
        isReplayMode={isReplayMode}
        activeReplayGame={activeReplayGame}
        replayPlaying={replayPlaying}
        replaySpeed={replaySpeed}
        onToggleReplayPlay={handleToggleReplayPlay}
        onChangeReplaySpeed={setReplaySpeed}
        onRewindStep={() => {
          setReplayPlaying(false);
          jumpToPly(Math.max(0, clampedViewPly - 2));
        }}
        onFastForwardStep={() => {
          setReplayPlaying(false);
          jumpToPly(Math.min(activeMoves.length, clampedViewPly + 2));
        }}
        savedGames={savedGames}
        classicReplays={CLASSIC_REPLAYS}
        onLoadSavedGame={handleLoadSavedGame}
        onLoadReplay={handleLoadReplay}
        onExitReplay={handleExitReplay}
        onSaveCurrentGame={() => saveCurrentGameToArchive()}
        onExportCurrentGame={handleExportCurrentGame}
        onExportSavedGame={(g) => exportSavedGameJson(g)}
        onImportSaveFile={handleImportSaveFile}
        onDeleteSavedGame={(id) => {
          setSavedGames((prev) => {
            const next = prev.filter((g) => g.id !== id);
            persistSavedGames(next);
            return next;
          });
          if (activeReplayGame?.id === id) {
            handleExitReplay();
          }
        }}
        canSaveCurrent={!isReplayMode && gameMode !== 'tactical'}
        justSaved={justSaved}
        onOpenLoadDrawer={() => announceControlEvent(createLoadGameMessage())}
        onSecretStudioTrigger={ALLOW_VIDEO_STUDIO ? handleSecretStudioTrigger : undefined}
        onTitleTribute={handleTriggerCreatorTribute}
        onStartTacticalTraining={handleStartTacticalTraining}
        onReturnToCasualPlay={handleReturnToCasualPlay}
        activePuzzle={activePuzzle}
        tacticalStats={tacticalStats}
        tacticalThemeFilter={tacticalThemeFilter}
        onChangeTacticalThemeFilter={setTacticalThemeFilter}
        tacticalDifficultyFilter={tacticalDifficultyFilter}
        onChangeTacticalDifficultyFilter={setTacticalDifficultyFilter}
        onResetTacticalStats={() => setTacticalStats(resetTacticalStats())}
        onTacticalHint={handleTacticalHint}
        onTacticalRetry={handleTacticalRetry}
        onTacticalShowSolution={handleTacticalShowSolution}
        onTacticalNextPuzzle={handleTacticalNextPuzzle}
      />

      {/* Pawn Promotion Chooser Modal */}
      {pendingPromotion && (
        <PromotionModal
          color={pendingPromotion.color}
          onSelect={(piece) => {
            const { from, to } = pendingPromotion;
            setPendingPromotion(null);
            submitMove(from, to, piece);
          }}
          onCancel={() => setPendingPromotion(null)}
        />
      )}

      {/* Chess Angel Frameless 3:4 Portrait Video & Framed Black Modal (Fits 95% of Upper-Right Void) */}
      <OpponentSpeechBanner
        visible={angelVisible}
        upperRightVoid={upperRightVoid}
        message={opponentMessage}
        angelVoice={angelVoice}
        soundEnabled={soundEnabled}
        voiceState={voiceState}
        powerSaveMode={powerSaveMode}
        calcPreview={calcPreview}
        treeBrowser={treeBrowser}
        idlePreviewNonce={idlePreviewNonce}
        forcedIdleUrl={previewIdleUrl}
        forcedIdleCueAtSec={dogRunCueSec}
        onForcedIdleCueReached={handleForcedIdleCueReached}
        danceWithStarsActive={danceStarsActive}
        onSelectTreeSimulation={handleSelectTreeSimulation}
        onStepTreeSimulation={handleStepTreeSimulation}
        onToggleTreeOnlyTopThree={handleToggleTreeOnlyTopThree}
        onContinueFromTree={handleContinueFromTree}
        onOpenTreeBrowser={handleReopenTreeBrowser}
        onExportTreeJpg={handleToggleFrontalTreeView}
        frontalTreeViewOpen={frontalTreeViewOpen}
        thinkingLinesProjected={thinkingLinesProjected}
        onSwitchOffThinkingLines={handleSwitchOffThinkingLines}
        proposeThreeMoves={
          !suppressTreeAndThreeMoves || Boolean(treeBrowser) || frontalTreeViewOpen
        }
        onPlayThreeMoves={handlePlayThreeMoves}
        onAnimateTopThreeFromTree={handleAnimateTopThreeFromTree}
        onReplayVoice={() => {
          if (opponentMessage) {
            opponentSpeech.unlock();
            opponentSpeech.playClip(opponentMessage.clipId, 'on', soundEnabled);
          }
        }}
        onWatchCalculatedLines={handleWatchCalculatedLines}
        onConfirmNextBranch={handleConfirmNextBranch}
        onStopCalculationPreview={handleStopCalculationPreview}
        onUndoAndShowBetter={handleUndoAndShowBetter}
        onAcceptHint={handleAcceptHint}
        onTurnOffAngel={() => handleSetAngelModalVisible(false)}
        onDismiss={() => {
          if (calcShowingTimerRef.current !== null) {
            window.clearTimeout(calcShowingTimerRef.current);
            calcShowingTimerRef.current = null;
          }
          setCalcShowingPending(false);
          if (angelModalOffTimerRef.current !== null) {
            window.clearTimeout(angelModalOffTimerRef.current);
            angelModalOffTimerRef.current = null;
            opponentSpeech.stop();
            setOpponentMessage(null);
            setAngelVisible(false);
            return;
          }
          opponentSpeech.stop();
          setOpponentMessage((prev) =>
            prev ? { ...prev, action: undefined, concernedFigures: undefined } : prev,
          );
          if (awaitingDistractionModalRef.current || holdBotUntilRef.current > 0) {
            awaitingDistractionModalRef.current = false;
            holdBotUntilRef.current = 0;
            setBotHoldEpoch((n) => n + 1);
          }
        }}
        onOpenVideoStudio={
          ALLOW_VIDEO_STUDIO && studioUnlocked ? () => setVideoStudioOpen(true) : undefined
        }
      />

      {/* Developer-only Chess Angel Video Studio (completely excluded from consumer production builds via import.meta.env.DEV) */}
      {import.meta.env.DEV && ALLOW_VIDEO_STUDIO && studioUnlocked && videoStudioOpen && LazyAngelVideoStudioModal && (
        <Suspense fallback={null}>
          <LazyAngelVideoStudioModal
            onClose={() => setVideoStudioOpen(false)}
            onLockStudio={() => {
              logoutStudioDeveloperSession();
              setVideoStudioOpen(false);
            }}
            onPreviewCase={(clipId, text, tag) => {
              if (angelModalOffTimerRef.current !== null) {
                window.clearTimeout(angelModalOffTimerRef.current);
                angelModalOffTimerRef.current = null;
              }
              if (calcShowingTimerRef.current !== null) {
                window.clearTimeout(calcShowingTimerRef.current);
                calcShowingTimerRef.current = null;
              }
              setCalcShowingPending(false);
              sceneRef.current?.stopCalculationPreview(true);
              sceneRef.current?.stopSearchTreeThinLines();
              treeActiveOnScreenRef.current = false;
              setTreeStatusMode('idle');
              setTreeBrowser(null);
              setCalcPreview(null);
              setFrontalTreeViewOpen(false);
              clearForkArrowsTimer();
              setCoachArrows([]);

              setAngelModalEnabled(true);
              setAngelVisible(true);
              setPreviewIdleUrl(null);

              // Ensure a playable board position if the current ply is checkmate/stalemate
              let previewFen = displayedFen;
              try {
                if (new Chess(previewFen).moves().length === 0 && clampedViewPly > 0) {
                  const prevPly = clampedViewPly - 1;
                  previewFen = prevPly === 0 ? INITIAL_FEN : activeMoves[prevPly - 1]?.fen ?? INITIAL_FEN;
                  setViewPly(prevPly);
                }
              } catch {
                previewFen = INITIAL_FEN;
              }

              const caseId = extractCaseIdFromClip(clipId);
              const previewMsgId = Date.now();
              let previewFigures = caseId
                ? resolvePreviewConcernedFigures(caseId, previewFen, humanColorActual)
                : undefined;
              let previewAction: OpponentMessage['action'] = undefined;
              let previewMathSummary: string | undefined = undefined;

              if (caseId === 'warn_double' || caseId === 'warn_fork_2step') {
                const fArrows = resolvePreviewForkArrows(caseId, previewFen, humanColorActual);
                if (fArrows.length > 0) {
                  showTemporaryForkArrows(fArrows);
                }
              } else if (caseId === 'hint_shown') {
                const best = resolveCandidateMovesForFen(previewFen, analysis, 1)[0];
                if (best) {
                  setCoachArrows([
                    {
                      from: best.uci.slice(0, 2),
                      to: best.uci.slice(2, 4),
                      kind: 'primary',
                    },
                  ]);
                  previewFigures = [{ square: best.uci.slice(0, 2) as Square, role: 'attacker' }];
                  previewMathSummary = `Top candidate: ${best.san}`;
                }
              } else if (caseId === 'undo_done' || caseId === 'alt_shown') {
                const cands = resolveCandidateMovesForFen(previewFen, analysis, 2);
                if (cands.length > 0) {
                  setCoachArrows(
                    cands.map((c, idx) => ({
                      from: c.uci.slice(0, 2),
                      to: c.uci.slice(2, 4),
                      kind: idx === 0 ? 'primary' : 'secondary',
                    })),
                  );
                  previewFigures = [
                    { square: cands[0].uci.slice(0, 2) as Square, role: 'attacker' },
                  ];
                  previewMathSummary = `Recommended continuation: ${cands[0].san}`;
                }
              } else if (caseId === 'trial_confirm_1' || caseId === 'trial_confirm_2') {
                const cands = resolveCandidateMovesForFen(
                  previewFen,
                  analysis,
                  caseId === 'trial_confirm_2' ? 2 : 1,
                );
                if (cands.length > 0) {
                  setCoachArrows(
                    cands.map((c, idx) => ({
                      from: c.uci.slice(0, 2),
                      to: c.uci.slice(2, 4),
                      kind: idx === 0 ? 'trial-1' : 'trial-2',
                    })),
                  );
                  const focused = cands[cands.length - 1];
                  previewFigures = [
                    { square: focused.uci.slice(0, 2) as Square, role: 'attacker' },
                  ];
                  previewMathSummary = `Branch ${caseId === 'trial_confirm_2' ? 2 : 1}: ${focused.san}`;
                }
              } else if (caseId === 'hesitate_hint') {
                const best = resolveCandidateMovesForFen(previewFen, analysis, 1)[0];
                if (best) {
                  previewAction = {
                    kind: 'hint-offer',
                    bestMoveUci: best.uci,
                    bestMoveSan: best.san,
                  };
                  previewMathSummary = 'Top candidate ready';
                }
              } else if (caseId === 'calc_offer' || caseId === 'calc_pure') {
                const validReport = ensureValidCalcReport(
                  lastBotReportForFenRef.current?.afterFen === previewFen
                    ? lastBotReportForFenRef.current.report
                    : null,
                  previewFen,
                  analysis,
                );
                if (validReport) {
                  previewAction = { kind: 'calc-preview', report: validReport };
                  previewMathSummary = `${validReport.nodes.toLocaleString()} nodes · Depth ${validReport.depth} · ${Math.min(3, validReport.triedLines.length)} branches`;
                }
              } else if (caseId === 'calc_showing') {
                const validReport = ensureValidCalcReport(
                  lastBotReportForFenRef.current?.afterFen === previewFen
                    ? lastBotReportForFenRef.current.report
                    : null,
                  previewFen,
                  analysis,
                );
                if (validReport) {
                  if (validReport.rootFen === previewFen) {
                    setCoachArrows(buildRootPreviewArrowsFromReport(validReport));
                  }
                  previewMathSummary = `${validReport.nodes.toLocaleString()} nodes · Depth ${validReport.depth} · Animating ${Math.min(3, validReport.triedLines.length)} branches`;
                  const prep = prepareHumanCommentaryPlayback(clipId, `preview:${previewMsgId}`);
                  const introSec = Math.max(
                    soundEnabled ? prep.audioSec || 4.8 : 1.8,
                    prep.playToEnd ? prep.videoSec : 0,
                  );
                  const delayMs = Math.max(400, Math.round(introSec * 1000) + 160);
                  setCalcShowingPending(true);
                  calcShowingTimerRef.current = window.setTimeout(() => {
                    calcShowingTimerRef.current = null;
                    startCalcPreviewOnScene(validReport, previewFen);
                  }, delayMs);
                }
              } else if (caseId === 'tree_browse') {
                const validReport = ensureValidCalcReport(null, previewFen, analysis);
                const quick =
                  validReport?.treeEdges && validReport.treeEdges.length > 0
                    ? null
                    : buildQuickSearchTreeForPosition(previewFen);
                const edges =
                  (validReport?.treeEdges && validReport.treeEdges.length > 0
                    ? validReport.treeEdges
                    : null) ||
                  quick?.edges ||
                  [];
                const sims = ensureTreeSimulations(
                  previewFen,
                  validReport?.allSimulations && validReport.allSimulations.length > 0
                    ? validReport.allSimulations
                    : validReport?.triedLines,
                  analysis,
                );
                let previewMoverColor: PieceColor = 'b';
                try {
                  previewMoverColor = new Chess(previewFen).turn() as PieceColor;
                } catch {
                  // default 'b'
                }

                activeTreeRootFenRef.current = previewFen;
                activeTreeFullEdgesRef.current = edges;
                if (edges.length > 0) latestTreeEdgesRef.current = edges;
                if (sims.length > 0) latestAllSimulationsRef.current = sims;
                suppressTreeAndThreeMovesRef.current = false;
                setSuppressTreeAndThreeMoves(false);

                if (edges.length > 0 && sceneRef.current) {
                  treeActiveOnScreenRef.current = true;
                  setTreeStatusMode('holding');
                  sceneRef.current.playSearchTreeThinLines(
                    edges,
                    () => {
                      treeActiveOnScreenRef.current = false;
                      setTreeStatusMode('idle');
                      setTreeBrowser(null);
                    },
                    () => {
                      setTreeStatusMode('holding');
                    },
                  );
                }

                setTreeBrowser({
                  simulations: sims,
                  moverColor: previewMoverColor,
                  selectedIndex: null,
                  onlyTopThree: false,
                  hasPendingBotMove: false,
                  depth: validReport?.depth ?? analysis?.depth ?? 3,
                  nodes:
                    validReport?.nodes ?? analysis?.nodes ?? Math.max(64, sims.length * 32),
                });
              } else if (caseId?.startsWith('wrong_')) {
                const alts = resolveCandidateMovesForFen(previewFen, analysis, 2);
                previewAction = {
                  kind: 'undo-offer',
                  preFen: previewFen,
                  reasonNote: 'Preview Undo proposal',
                  alternatives: alts,
                };
              }

              setOpponentMessage({
                id: previewMsgId,
                clipId,
                text,
                tag,
                tone:
                  caseId === 'hint_shown' ||
                  caseId === 'hesitate_hint' ||
                  caseId === 'undo_done' ||
                  caseId === 'alt_shown'
                    ? 'hint'
                    : caseId === 'calc_showing' ||
                        caseId === 'calc_offer' ||
                        caseId === 'calc_pure' ||
                        caseId === 'trial_confirm_1' ||
                        caseId === 'trial_confirm_2' ||
                        caseId === 'tree_browse'
                      ? 'math'
                      : 'opening',
                speaker: getSpeakerName(),
                mathSummary: previewMathSummary,
                isStudioPreview: true,
                concernedFigures: previewFigures,
                action: previewAction,
              });
              opponentSpeech.unlock();
              opponentSpeech.playClip(clipId, 'on', soundEnabled);
            }}
            onPreviewIdle={(specificIdleUrl) => {
              if (angelModalOffTimerRef.current !== null) {
                window.clearTimeout(angelModalOffTimerRef.current);
                angelModalOffTimerRef.current = null;
              }
              if (calcShowingTimerRef.current !== null) {
                window.clearTimeout(calcShowingTimerRef.current);
                calcShowingTimerRef.current = null;
              }
              setCalcShowingPending(false);
              sceneRef.current?.stopCalculationPreview(true);
              sceneRef.current?.stopSearchTreeThinLines();
              treeActiveOnScreenRef.current = false;
              setTreeStatusMode('idle');
              setTreeBrowser(null);
              setCalcPreview(null);
              setCoachArrows([]);
              setAngelModalEnabled(true);
              setAngelVisible(true);
              opponentSpeech.stop();
              setPreviewIdleUrl(specificIdleUrl || null);
              setOpponentMessage(null);
              setIdlePreviewNonce((n) => n + 1);
            }}
            onTriggerDogEvent={({ playVideo }) => {
              triggerFluffyPuppyEvent({ playVideo, fromStudio: true });
            }}
            onTriggerHamsterChase={() => {
              triggerHamsterChaseEvent({ fromStudio: true });
            }}
            onTriggerDanceStarsEvent={() => {
              triggerDanceWithStarsEvent({ fromStudio: true });
            }}
          />
        </Suspense>
      )}

      {/* Subtle Offline Mode Indicator */}
      {!isOnline && (
        <div className="fixed bottom-4 left-4 z-40 px-3 py-1.5 rounded-md bg-[#231b12]/95 border border-[#d6ae63]/40 text-[11px] font-medium text-[#f0d192] shadow-lg">
          Offline Mode — Chess Angel, Pass &amp; Play, Analysis &amp; Replays Ready
        </div>
      )}
    </div>
  );
}
