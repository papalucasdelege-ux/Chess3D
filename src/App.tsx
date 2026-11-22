import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
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
  loadSavedGames,
  persistSavedGames,
} from './services/gameArchive';
import { EvalBar } from './components/EvalBar';
import { TopBar, type DockTab } from './components/TopBar';
import { ControlDock } from './components/ControlDock';
import { PromotionModal } from './components/PromotionModal';
import { DownloadGameModal } from './components/DownloadGameModal';
import { AngelVideoStudioModal } from './components/AngelVideoStudioModal';
import {
  OpponentSpeechBanner,
  type CalcPreviewProgress,
  type TreeBrowserState,
} from './components/OpponentSpeechBanner';
import {
  buildTopThreeEdges,
  drawSearchTreeTopViewOnCanvas,
  getSimulationColorSpec,
} from './chess/treeJpgExporter';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import {
  IS_VIDEO_STUDIO_DEV_ENV,
  VOICE_CLIP_DURATION_SEC,
  extractCaseIdFromClip,
  getAngelVideoOverridesSnapshot,
  getVideoFileDurationSec,
  resetGameVideoPlayCounts,
} from './chess/angelPortraitVideos';
import {
  composeBotMoveCommentary,
  composeHesitationCommentary,
  createCalcShowingMessage,
  createHintShownMessage,
  createIntroMessage,
  createTreeBrowseMessage,
  createTrialConfirmMessage,
  createUndoConfirmedMessage,
  evaluateHumanMoveCommentary,
  getSpeakerName,
  opponentSpeech,
  resetGameCommentaryCounts,
  resolvePreviewConcernedFigures,
  type AngelVoiceMode,
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
  const [angelVoice, setAngelVoice] = useState<AngelVoiceMode>('on');
  const [showSpeechBubbles, setShowSpeechBubbles] = useState<boolean>(true);
  const [opponentMessage, setOpponentMessage] = useState<OpponentMessage | null>(() =>
    createIntroMessage(),
  );
  const [voiceState, setVoiceState] = useState<VoicePlaybackState>('idle');
  const [speechHighlightWindowOpen, setSpeechHighlightWindowOpen] = useState(false);
  const prevVoiceStateForHighlightRef = useRef<VoicePlaybackState>('idle');
  const [coachArrows, setCoachArrows] = useState<SuggestionArrow[]>([]);
  const [calcPreview, setCalcPreview] = useState<CalcPreviewProgress | null>(null);
  const [treeBrowser, setTreeBrowser] = useState<TreeBrowserState | null>(null);
  const [botHoldEpoch, setBotHoldEpoch] = useState(0);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [videoStudioOpen, setVideoStudioOpen] = useState(false);
  const [idlePreviewNonce, setIdlePreviewNonce] = useState(0);
  const [previewIdleUrl, setPreviewIdleUrl] = useState<string | null>(null);
  const [webglLost, setWebglLost] = useState(false);
  const isOnline = useOnlineStatus();

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
  const [savedGameFingerprints, setSavedGameFingerprints] = useState<Set<string>>(() => new Set());

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
    if (clampedViewPly === 0) return INITIAL_FEN;
    return activeMoves[clampedViewPly - 1]?.fen ?? localFen;
  }, [clampedViewPly, activeMoves, localFen]);

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
  };
  calcPreviewActiveRef.current = calcPreview !== null;
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
  const isTimed = !isReplayMode && TIME_CONTROLS[activeTimeControl].initialMs > 0;
  const whiteClockMs =
    gameMode === 'multiplayer' && activeRoom ? displayRoomClocks.w : localClocks.w;
  const blackClockMs =
    gameMode === 'multiplayer' && activeRoom ? displayRoomClocks.b : localClocks.b;

  const canInteractWithBoard = useMemo(() => {
    if (isReplayMode || !isViewingLatest || activeResult || calcPreview !== null) return false;
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

  // === Save Game Helper ===
  const saveCurrentGameToArchive = useCallback(
    (overrideResult?: RoomResult | null) => {
      if (activeMoves.length === 0) return;
      const res = overrideResult !== undefined ? overrideResult : activeResult;
      const fp = `${whiteName}|${blackName}|${activeMoves.map((m) => m.uci).join(',')}`;
      if (savedGameFingerprints.has(fp)) return;

      const dateIso = new Date().toISOString();
      const resultLabel = resultToScoreLabel(res);
      const title =
        gameMode === 'engine'
          ? `${whiteName} vs ${blackName}`
          : gameMode === 'multiplayer' && activeRoom
            ? `Online #${activeRoom.id} · ${whiteName} vs ${blackName}`
            : `Local Match · ${whiteName} vs ${blackName}`;

      const entry: SavedGame = {
        id: `game_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title,
        whiteName,
        blackName,
        resultLabel,
        reason: res?.reason || 'in-progress',
        mode: gameMode === 'replay' ? 'local' : gameMode,
        skinId: DEFAULT_SKIN,
        timeControl: activeTimeControl,
        dateIso,
        moves: [...activeMoves],
        finalFen: activeMoves[activeMoves.length - 1]?.fen || INITIAL_FEN,
        pgn: buildPgnFromMoves(activeMoves, { whiteName, blackName, resultLabel, dateIso }),
      };

      setSavedGames((prev) => {
        const next = [entry, ...prev];
        persistSavedGames(next);
        return next;
      });
      setSavedGameFingerprints((prev) => new Set(prev).add(fp));
    },
    [
      activeMoves,
      activeResult,
      whiteName,
      blackName,
      savedGameFingerprints,
      gameMode,
      activeRoom,
      activeTimeControl,
    ],
  );

  // Auto-save completed games to archive
  useEffect(() => {
    if (!activeResult || isReplayMode || activeMoves.length < 2) return;
    const key = `${currentFingerprint}|${activeResult.reason}`;
    if (autoSavedSessionRef.current === key) return;
    autoSavedSessionRef.current = key;
    saveCurrentGameToArchive(activeResult);
  }, [activeResult, isReplayMode, activeMoves.length, currentFingerprint, saveCurrentGameToArchive]);

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

        sceneRef.current?.stopCalculationPreview(false);
        sceneRef.current?.stopSearchTreeThinLines();
        treeActiveOnScreenRef.current = false;
        setTreeStatusMode('idle');
        setCalcPreview(null);
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

        if (preEval !== undefined) {
          setMoveEvalMeta((prev) => ({
            ...prev,
            [record.ply]: { ply: record.ply, evalCp: preEval },
          }));
        }

        const over = evaluateLocalGameOver(chess);
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
            const audit = !over ? quickEvaluateHumanMove(preFen, record.uci, nextFen) : null;
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
              setOpponentMessage(msg);
              opponentSpeech.playClip(msg.clipId, angelVoice, soundEnabled);
              if (msg.clipId.startsWith('seduction_') && !over) {
                lastSeductionPlyRef.current = nextMoves.length;
                goodMoveStreakRef.current = 0;
                awaitingDistractionModalRef.current = false;
                const seductionVideoSec =
                  getVideoFileDurationSec(ov.cases.seduction, ov) ?? 0;
                const seductionAudioSec =
                  ov.seductionAudioDuration ?? (VOICE_CLIP_DURATION_SEC[msg.clipId] ?? 4.5);
                const seductionHoldMs =
                  Math.round(Math.max(seductionAudioSec, seductionVideoSec, 4.5) * 1000) + 450;
                holdBotUntilRef.current = performance.now() + seductionHoldMs;
              } else if (msg.action?.kind === 'undo-offer' && !over) {
                awaitingDistractionModalRef.current = false;
                const undoClipSec = VOICE_CLIP_DURATION_SEC[msg.clipId] ?? 6.2;
                holdBotUntilRef.current =
                  performance.now() + Math.round(undoClipSec * 1000) + 4200;
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
            if (preserveMessageOnBotCommitRef.current && !over && !chess.inCheck()) {
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
                opponentSpeech.playClip(msg.clipId, angelVoice, soundEnabled);
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
    ],
  );

  // === Submit Move (routes to Multiplayer Server or Local/Engine) ===
  const submitMove = useCallback(
    (from: string, to: string, promotion?: PieceType) => {
      if (gameMode === 'multiplayer' && activeRoom) {
        lastMoveAnimHintRef.current = { from, to };
        setSelectedSquare(null);
        mpClientRef.current?.sendMove(activeRoom.id, from, to, promotion);
        return;
      }
      commitLocalMove(from, to, promotion || 'q', null);
    },
    [gameMode, activeRoom, commitLocalMove],
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

  // Track speech-duration highlight window for concerned 3D chess figures on warnings & watches
  useEffect(() => {
    const figures = opponentMessage?.concernedFigures;
    if (!opponentMessage || !figures || figures.length === 0 || angelVoice === 'off') {
      setSpeechHighlightWindowOpen(false);
      return;
    }
    setSpeechHighlightWindowOpen(true);
    const fallbackSec = VOICE_CLIP_DURATION_SEC[opponentMessage.clipId] ?? 4.8;
    const windowMs = soundEnabled ? 950 : Math.round(fallbackSec * 1000);
    const timerId = window.setTimeout(() => {
      setSpeechHighlightWindowOpen(false);
    }, windowMs);
    return () => window.clearTimeout(timerId);
  }, [opponentMessage, angelVoice, soundEnabled]);

  useEffect(() => {
    const prev = prevVoiceStateForHighlightRef.current;
    prevVoiceStateForHighlightRef.current = voiceState;
    if (prev === 'speaking' && voiceState !== 'speaking') {
      setSpeechHighlightWindowOpen(false);
    }
  }, [voiceState]);

  const activeSpeechHighlights = useMemo(() => {
    if (
      angelVoice === 'off' ||
      !isViewingLatest ||
      isReplayMode ||
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
      onContextLost: () => setWebglLost(true),
      onContextRestored: () => setWebglLost(false),
    });
    sceneRef.current = scene;

    return () => {
      scene.dispose();
      sceneRef.current = null;
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
            setLocalResult({
              winner: activeTurn === 'w' ? 'b' : 'w',
              reason: 'timeout',
            });
            soundEngine.playGameOver();
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

      // 4. Player Hesitation Detection -> Chess Angel Spoken Hint & 3D Candidate Offer
      if (
        snap.gameMode === 'engine' &&
        !snap.localResult &&
        snap.isViewingLatest &&
        !snap.isThinkingAi &&
        !isPausedForShowcaseOrModal &&
        snap.angelVoice === 'on'
      ) {
        const turn = new Chess(snap.localFen).turn() as PieceColor;
        if (turn === snap.humanColorActual) {
          const idleMs = now - turnStartedAtRef.current;
          if (
            (hesitationStageRef.current === 0 && idleMs >= 18000) ||
            (hesitationStageRef.current === 1 && idleMs >= 44000)
          ) {
            hesitationStageRef.current += 1;
            const hintMsg = composeHesitationCommentary(snap.localFen, snap.analysis);
            if (hintMsg) {
              setOpponentMessage(hintMsg);
              opponentSpeech.playClip(hintMsg.clipId, 'on', snap.soundEnabled);
            }
          }
        }
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
      let moverColor: PieceColor = 'b';
      try {
        moverColor = new Chess(rootFen).turn() as PieceColor;
      } catch {
        // default 'b'
      }
      setTreeBrowser({
        simulations,
        moverColor,
        selectedIndex: null,
        onlyTopThree: false,
        hasPendingBotMove,
        nodes,
        depth,
      });

      const browseMsg = createTreeBrowseMessage(
        simulations.length > 0 ? simulations.length : edges.length,
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

          if (
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

    const prevFen = ply === 1 ? INITIAL_FEN : activeMoves[ply - 2]?.fen;
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
    const bestOverall = allSims[0];
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
      const sim = visibleSims[treeBrowser.selectedIndex];
      const spec = getSimulationColorSpec(
        treeBrowser.selectedIndex,
        sim,
        bestOverall,
        treeBrowser.moverColor,
      );
      const overlayArrows: SuggestionArrow[] = sim.pvUci
        .slice(0, 4)
        .filter((u) => u.length >= 4)
        .map((u, plyIdx) => ({
          from: u.slice(0, 2),
          to: u.slice(2, 4),
          kind: 'primary',
          customColorHex: spec.hex,
          opacityScale: plyIdx === 0 ? 0.98 : Math.max(0.45, 0.82 - plyIdx * 0.14),
        }));

      scene.setSearchTreeBrowserDisplay({
        edges: baseEdges,
        treeOpacity: 0.22,
        overlayArrows,
      });
    } else if (treeBrowser.onlyTopThree) {
      const topThreeArrows: SuggestionArrow[] = visibleSims
        .filter((s) => s.bestMoveUci.length >= 4)
        .map((sim, idx) => {
          const spec = getSimulationColorSpec(
            idx,
            sim,
            bestOverall,
            treeBrowser.moverColor,
          );
          return {
            from: sim.bestMoveUci.slice(0, 2),
            to: sim.bestMoveUci.slice(2, 4),
            kind: idx === 0 ? 'trial-1' : idx === 1 ? 'trial-2' : 'trial-3',
            customColorHex: spec.hex,
            opacityScale: 0.94,
          };
        });

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

      if (e.key === 'm' || e.key === 'M') {
        setSoundEnabled((prev) => {
          const next = !prev;
          soundEngine.enabled = next;
          if (!next) opponentSpeech.stop();
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
    treeBrowser,
    handleStepTreeSimulation,
    handleContinueFromTree,
  ]);

  // === Game & Interactive Coach Handlers ===
  const resetLocalState = useCallback(
    (tc: TimeControlId) => {
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
      const ms = TIME_CONTROLS[tc].initialMs;
      localClockMsRef.current = { w: ms, b: ms };
      lastRenderedLocalSecRef.current = {
        w: Math.ceil(ms / 1000),
        b: Math.ceil(ms / 1000),
      };
      setLocalClocks({ w: ms, b: ms });
    },
    [flushPendingBotMove],
  );

  const handleStartEngineGame = useCallback(
    (level: EngineLevel, colorPref: PieceColor | 'random', tc: TimeControlId) => {
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
      const introMsg = createIntroMessage();
      setOpponentMessage(introMsg);
      if (introMsg && angelVoiceRef.current === 'on') {
        opponentSpeech.unlock();
        opponentSpeech.playClip(introMsg.clipId, 'on', soundEnabledRef.current);
      }
      const cam: CameraPreset = actual === 'b' ? 'black' : 'white';
      setCameraPreset(cam);
      sceneRef.current?.setCameraPreset(cam);
    },
    [activeRoom, resetLocalState],
  );

  const handleStartLocalGame = useCallback(
    (tc: TimeControlId) => {
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
      setCameraPreset('white');
      sceneRef.current?.setCameraPreset('white');
    },
    [activeRoom, resetLocalState],
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
    sceneRef.current?.stopCalculationPreview(false);
    setCalcPreview(null);
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

  // Interactive Chess Angel callbacks:
  // 1) Animate the search-tree branches Chess Angel calculated on the 3D board (slow + click-confirmed between branches)
  const handleWatchCalculatedLines = useCallback(
    (report: BotSearchReport, restoreFenOverride?: string) => {
      const scene = sceneRef.current;
      if (!scene) return;
      setFrontalTreeViewOpen(false);
      opponentSpeech.unlock();
      const showingMsg = createCalcShowingMessage(report);
      if (showingMsg) {
        setOpponentMessage(showingMsg);
        opponentSpeech.playClip(showingMsg.clipId, angelVoice, soundEnabled);
      } else {
        setOpponentMessage(null);
      }

      scene.playCalculationPreview(report, restoreFenOverride || displayedFen, {
        onBranchChange: (branchIndex, totalBranches, pvSan, waitingForConfirm) => {
          setCalcPreview({ branchIndex, totalBranches, pvSan, waitingForConfirm });
        },
        onWaitForBranchConfirm: (completedBranchIndex, _totalBranches, pvSan) => {
          if (completedBranchIndex === 1 || completedBranchIndex === 2) {
            const confirmMsg = createTrialConfirmMessage(completedBranchIndex, pvSan);
            if (confirmMsg) {
              setOpponentMessage(confirmMsg);
              opponentSpeech.playClip(confirmMsg.clipId, angelVoice, soundEnabled);
            } else {
              setOpponentMessage(null);
            }
          }
        },
        onComplete: () => {
          setCalcPreview(null);
          turnStartedAtRef.current = performance.now();
        },
      });
    },
    [angelVoice, soundEnabled, displayedFen],
  );

  const handleConfirmNextBranch = useCallback(() => {
    opponentSpeech.stop();
    sceneRef.current?.confirmNextCalculationBranch();
  }, []);

  const handleStopCalculationPreview = useCallback(() => {
    opponentSpeech.stop();
    sceneRef.current?.stopCalculationPreview(true);
    if (!pendingBotMoveRef.current) {
      sceneRef.current?.stopSearchTreeThinLines();
      treeActiveOnScreenRef.current = false;
      setTreeStatusMode('idle');
    }
    setCalcPreview(null);
    turnStartedAtRef.current = performance.now();
  }, []);

  const [frontalTreeViewOpen, setFrontalTreeViewOpen] = useState(false);
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

  const handleAnimateTopThreeFromTree = useCallback(() => {
    if (!treeBrowser || treeBrowser.simulations.length === 0) return;
    const pendingReport = pendingBotMoveRef.current?.report;
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
    if (pendingBotMoveRef.current) {
      flushPendingBotMove(true);
      window.setTimeout(() => {
        handleWatchCalculatedLines(synthReport);
      }, 120);
    } else {
      setTreeBrowser(null);
      sceneRef.current?.stopSearchTreeThinLines();
      treeActiveOnScreenRef.current = false;
      setTreeStatusMode('idle');
      handleWatchCalculatedLines(synthReport);
    }
  }, [treeBrowser, flushPendingBotMove, handleWatchCalculatedLines]);

  const handlePlayThreeMoves = useCallback(() => {
    setFrontalTreeViewOpen(false);

    if (calcPreview) {
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
      handleWatchCalculatedLines(opponentMessage.action.report);
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

    const fromAnalysisSims =
      analysis?.fen === displayedFen &&
      analysis.allSimulations &&
      analysis.allSimulations.length > 0
        ? analysis.allSimulations
        : analysis?.fen === displayedFen && analysis.lines.length > 0
          ? analysis.lines
          : null;

    const quickBuilt = !fromAnalysisSims ? buildQuickSearchTreeForPosition(displayedFen) : null;
    const sims = fromAnalysisSims || quickBuilt?.allSimulations || [];
    if (sims.length === 0) return;

    const edges =
      (analysis?.fen === displayedFen && analysis.treeEdges && analysis.treeEdges.length > 0
        ? analysis.treeEdges
        : null) ||
      quickBuilt?.edges ||
      [];

    const synthReport: BotSearchReport = {
      rootFen: displayedFen,
      bestMoveUci: sims[0].bestMoveUci,
      depth: analysis?.fen === displayedFen ? analysis.depth : 3,
      nodes: analysis?.fen === displayedFen ? analysis.nodes : sims.length * 32,
      timeMs: 220,
      triedLines: sims.slice(0, 3),
      allSimulations: sims,
      treeEdges: edges,
    };
    handleWatchCalculatedLines(synthReport, displayedFen);
  }, [
    calcPreview,
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

  // 2) Undo the player's blunder (from Chess Angel modal or banner) and light up stronger alternatives on the 3D board
  const handleUndoAndShowBetter = useCallback(
    (alternatives: { uci: string; san: string }[]) => {
      if (localMoves.length === 0) return;
      botReqIdRef.current++;
      flushPendingBotMove(false);
      awaitingDistractionModalRef.current = false;
      holdBotUntilRef.current = 0;
      setIsThinkingAi(false);
      sceneRef.current?.stopCalculationPreview(false);
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

      const arrows: SuggestionArrow[] = alternatives
        .filter((a) => a.uci.length >= 4)
        .map((a, idx) => ({
          from: a.uci.slice(0, 2),
          to: a.uci.slice(2, 4),
          kind: idx === 0 ? 'primary' : 'secondary',
        }));
      setCoachArrows(arrows);

      const doneMsg = createUndoConfirmedMessage(alternatives[0]?.san);
      if (doneMsg) {
        setOpponentMessage(doneMsg);
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
      if (uci.length >= 4) {
        setCoachArrows([
          {
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            kind: 'primary',
          },
        ]);
      }
      turnStartedAtRef.current = performance.now();
      const shownMsg = createHintShownMessage(san);
      if (shownMsg) {
        setOpponentMessage(shownMsg);
        opponentSpeech.unlock();
        opponentSpeech.playClip(shownMsg.clipId, angelVoice, soundEnabled);
      }
    },
    [angelVoice, soundEnabled],
  );

  const handleLoadReplay = useCallback(
    (game: SavedGame) => {
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
    [flushPendingBotMove],
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

  const handlePrimaryHeaderAction = useCallback(() => {
    if (isReplayMode) {
      handleExitReplay();
      return;
    }
    if (gameMode === 'multiplayer' && activeRoom) {
      handleLeaveMultiplayer();
      return;
    }
    if (gameMode === 'local') {
      handleStartLocalGame(timeControl);
    } else {
      handleStartEngineGame(engineLevel, humanColorPref, timeControl);
    }
  }, [
    isReplayMode,
    handleExitReplay,
    gameMode,
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
    <div className="relative w-full h-full overflow-hidden bg-black select-none">
      {/* Isolated Full-Viewport 3D WebGL Canvas Container (Explicit Non-Zero Sizing) */}
      <div ref={canvasContainerRef} className="webgl-viewport-container z-0" />

      {/* Graceful WebGL Context Loss Fallback */}
      {webglLost && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/95">
          <div className="max-w-sm text-center p-6 rounded-lg border border-white/12 bg-[#141820]">
            <h2 className="font-display text-lg text-[#f4efe4] mb-2">3D Viewport Suspended</h2>
            <p className="text-xs text-[#9aa3b2]">
              WebGL context was temporarily paused by the browser. Touch or restore the tab to resume ChessAngel3D.
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
          className="fixed inset-0 z-[25] bg-black flex items-center justify-center lg:pr-[400px] p-4 pt-14 sm:p-8 sm:pt-14"
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

      {/* Top Edge Transparent Chess Clock, Player Names & Chess Angel Candidate Strip */}
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
        onSkipTreeHold={
          treeStatusMode !== 'idle'
            ? handleContinueFromTree
            : undefined
        }
        isReplayMode={isReplayMode}
        replayTitle={activeReplayGame?.title}
        onPrimaryAction={handlePrimaryHeaderAction}
        onSaveCurrentGame={() => saveCurrentGameToArchive()}
        onOpenReplayCurrent={handleOpenReplayCurrent}
        canSaveCurrent={activeMoves.length > 0 && !isReplayMode}
        alreadySaved={Boolean(currentFingerprint && savedGameFingerprints.has(currentFingerprint))}
      />

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
            handleStartEngineGame(lvl, humanColorPref, timeControl);
          }
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
          if (!next) opponentSpeech.stop();
        }}
        angelVoice={angelVoice}
        onChangeAngelVoice={(mode) => {
          setAngelVoice(mode);
          if (mode === 'off') {
            opponentSpeech.stop();
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
        showSpeechBubbles={showSpeechBubbles}
        onToggleSpeechBubbles={() => {
          setShowSpeechBubbles((prev) => !prev);
        }}
        showCoordinates={showCoordinates}
        onToggleCoordinates={() => setShowCoordinates((c) => !c)}
        showSearchTree={showSearchTree}
        onToggleSearchTree={handleToggleSearchTree}
        onReplaySearchTree={() => handleShowFullSearchTree()}
        onExportTreeJpg={handleOpenFrontalTreeView}
        onOpenDownload={() => setDownloadModalOpen(true)}
        canUndo={gameMode !== 'multiplayer' && !isReplayMode && localMoves.length > 0}
        onUndo={handleUndoLocal}
        onResignLocal={() => {
          if (localResult || gameMode === 'multiplayer' || isReplayMode) return;
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
        }}
        isGameActive={!activeResult && !isReplayMode}
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
        onLoadReplay={handleLoadReplay}
        onExitReplay={handleExitReplay}
        onSaveCurrentGame={() => saveCurrentGameToArchive()}
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
        canSaveCurrent={activeMoves.length > 0}
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

      {/* Download & Offline Install Modal */}
      {downloadModalOpen && (
        <DownloadGameModal
          onClose={() => setDownloadModalOpen(false)}
          currentPgn={currentPgn}
          canExportPgn={activeMoves.length > 0}
          onExportTreeJpg={handleOpenFrontalTreeView}
        />
      )}

      {/* Chess Angel Frameless 3:4 Portrait Video & Permanent Framed Black Modal (Never Closes) */}
      <OpponentSpeechBanner
        message={opponentMessage}
        angelVoice={angelVoice}
        soundEnabled={soundEnabled}
        voiceState={voiceState}
        calcPreview={calcPreview}
        treeBrowser={treeBrowser}
        idlePreviewNonce={idlePreviewNonce}
        forcedIdleUrl={previewIdleUrl}
        onSelectTreeSimulation={handleSelectTreeSimulation}
        onStepTreeSimulation={handleStepTreeSimulation}
        onToggleTreeOnlyTopThree={handleToggleTreeOnlyTopThree}
        onContinueFromTree={handleContinueFromTree}
        onExportTreeJpg={handleToggleFrontalTreeView}
        frontalTreeViewOpen={frontalTreeViewOpen}
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
        onDismiss={() => {
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
          IS_VIDEO_STUDIO_DEV_ENV ? () => setVideoStudioOpen(true) : undefined
        }
      />

      {/* Dev-Only Chess Angel Video Studio (Hidden in deployed production build; all saved .mp4s & rules bundle via angel_video_map.json) */}
      {IS_VIDEO_STUDIO_DEV_ENV && videoStudioOpen && (
        <AngelVideoStudioModal
          onClose={() => setVideoStudioOpen(false)}
          onPreviewCase={(clipId, text, tag) => {
            setPreviewIdleUrl(null);
            const caseId = extractCaseIdFromClip(clipId);
            const previewFigures = caseId
              ? resolvePreviewConcernedFigures(caseId, displayedFen, humanColorActual)
              : undefined;
            const previewAction: OpponentMessage['action'] = caseId?.startsWith('wrong_')
              ? {
                  kind: 'undo-offer',
                  preFen: displayedFen,
                  reasonNote: 'Preview Undo proposal',
                  alternatives: [],
                }
              : undefined;
            setOpponentMessage({
              id: Date.now(),
              clipId,
              text,
              tag,
              tone: 'opening',
              speaker: getSpeakerName(),
              isStudioPreview: true,
              concernedFigures: previewFigures,
              action: previewAction,
            });
            opponentSpeech.unlock();
            opponentSpeech.playClip(clipId, 'on', soundEnabled);
          }}
          onPreviewIdle={(specificIdleUrl) => {
            opponentSpeech.stop();
            setPreviewIdleUrl(specificIdleUrl || null);
            setOpponentMessage(null);
            setIdlePreviewNonce((n) => n + 1);
          }}
        />
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
