import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Move, type Square } from 'chess.js';
import { ChessScene3D } from './three/ChessScene3D';
import { soundEngine } from './three/sound';
import { classifyMoveQuality } from './chess/engine';
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
import { OpponentSpeechBanner } from './components/OpponentSpeechBanner';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import {
  composeOpponentMessage,
  createIntroMessage,
  getSpeakerName,
  opponentSpeech,
  type OpponentMessage,
  type OpponentVoiceGender,
  type VoicePlaybackState,
} from './chess/opponentVoice';
import {
  ENGINE_LEVELS,
  TIME_CONTROLS,
  type AnalysisSnapshot,
  type AnalyzedMoveMeta,
  type BoardSkinId,
  type CameraPreset,
  type EngineLevel,
  type GameMode,
  type LightingMood,
  type MoveRecord,
  type PieceColor,
  type PieceType,
  type PublicRoomSummary,
  type RoomResult,
  type RoomState,
  type SavedGame,
  type TimeControlId,
} from './shared/types';

const INITIAL_FEN = new Chess().fen();
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
  // === UI & Studio Preferences ===
  const [activeTab, setActiveTab] = useState<DockTab>('play');
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [skinId, setSkinId] = useState<BoardSkinId>('walnut-maple');
  const [lightingMood, setLightingMood] = useState<LightingMood>('warm-studio');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('white');
  const [showCoordinates, setShowCoordinates] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [opponentVoice, setOpponentVoice] = useState<OpponentVoiceGender>('female');
  const [showSpeechBubbles, setShowSpeechBubbles] = useState<boolean>(false);
  const [opponentMessage, setOpponentMessage] = useState<OpponentMessage | null>(null);
  const [voiceState, setVoiceState] = useState<VoicePlaybackState>('idle');
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [webglLost, setWebglLost] = useState(false);
  const isOnline = useOnlineStatus();

  // === Game Mode & Local/AI State ===
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
      return localStorage.getItem('staunton3d_player_name') || 'Grandmaster';
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

  // === Refs ===
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<ChessScene3D | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const analysisReqIdRef = useRef(0);
  const botReqIdRef = useRef(0);
  const mpClientRef = useRef<MultiplayerClient | null>(null);
  const lastMoveAnimHintRef = useRef<{ from: string; to: string } | null>(null);
  const prevEvalByFenRef = useRef<Map<string, number>>(new Map());
  const autoSavedSessionRef = useRef<string | null>(null);

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
      const prefix = opponentVoice === 'off' ? 'AI' : getSpeakerName(opponentVoice);
      const aiLabel = `${prefix} · ${ENGINE_LEVELS[engineLevel].label} (${ENGINE_LEVELS[engineLevel].elo})`;
      return humanColorActual === 'w'
        ? { whiteName: playerName || 'White', blackName: aiLabel }
        : { whiteName: aiLabel, blackName: playerName || 'Black' };
    }
    return { whiteName: 'White', blackName: 'Black' };
  }, [isReplayMode, activeReplayGame, gameMode, activeRoom, engineLevel, humanColorActual, playerName, opponentVoice]);

  const activeTimeControl: TimeControlId =
    gameMode === 'multiplayer' && activeRoom ? activeRoom.timeControl : timeControl;
  const isTimed = !isReplayMode && TIME_CONTROLS[activeTimeControl].initialMs > 0;
  const whiteClockMs = gameMode === 'multiplayer' && activeRoom ? displayRoomClocks.w : localClocks.w;
  const blackClockMs = gameMode === 'multiplayer' && activeRoom ? displayRoomClocks.b : localClocks.b;

  const canInteractWithBoard = useMemo(() => {
    if (isReplayMode || !isViewingLatest || activeResult) return false;
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
        resultLabel: isReplayMode && activeReplayGame ? activeReplayGame.resultLabel : resultToScoreLabel(activeResult),
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
        skinId,
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
      skinId,
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
    (from: string, to: string, promotion: PieceType = 'q'): boolean => {
      const chess = new Chess(localFen);
      const preEval = prevEvalByFenRef.current.get(localFen);

      try {
        const res = chess.move({ from, to, promotion });
        if (!res) return false;

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

        // Apply increment if timed
        const spec = TIME_CONTROLS[timeControl];
        if (spec.initialMs > 0 && spec.incrementMs > 0 && localMoves.length > 0) {
          const movedColor = res.color as PieceColor;
          setLocalClocks((prev) => ({
            ...prev,
            [movedColor]: prev[movedColor] + spec.incrementMs,
          }));
        }

        // Record approximate pre-eval tag for move classification once post-move analysis finishes
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

        // Situational adversary commentary & voice warning in AI mode
        if (gameMode === 'engine' && opponentVoice !== 'off') {
          const aiColor: PieceColor = humanColorActual === 'w' ? 'b' : 'w';
          const msg = composeOpponentMessage({
            fen: nextFen,
            lastMove: record,
            aiColor,
            humanColor: humanColorActual,
            plyCount: nextMoves.length,
            gender: opponentVoice,
            analysis,
          });
          if (msg) {
            setOpponentMessage(msg);
            opponentSpeech.playClip(msg.clipId, opponentVoice, soundEnabled);
          }
        }

        return true;
      } catch {
        return false;
      }
    },
    [localFen, localMoves, timeControl, gameMode, opponentVoice, humanColorActual, analysis, soundEnabled],
  );

  // === Submit Move (routes to Multiplayer Server or Local/AI) ===
  const submitMove = useCallback(
    (from: string, to: string, promotion?: PieceType) => {
      if (gameMode === 'multiplayer' && activeRoom) {
        lastMoveAnimHintRef.current = { from, to };
        setSelectedSquare(null);
        mpClientRef.current?.sendMove(activeRoom.id, from, to, promotion);
        return;
      }
      commitLocalMove(from, to, promotion || 'q');
    },
    [gameMode, activeRoom, commitLocalMove],
  );

  // === Click Handler from 3D Raycaster ===
  const handleSquareClick = useCallback(
    (square: string) => {
      if (!canInteractWithBoard) return;

      // If a square is already selected, try making a move to clicked square
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

      // Otherwise select own piece on this square
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

  // Keep latest click callback in ref for Three.js scene mount
  const squareClickRef = useRef(handleSquareClick);
  squareClickRef.current = handleSquareClick;

  // Keep Web Audio unlocked on user gestures and subscribe to live opponent voice state
  useEffect(() => {
    const onGesture = () => {
      opponentSpeech.unlock();
    };
    window.addEventListener('pointerdown', onGesture, { passive: true });
    window.addEventListener('keydown', onGesture, { passive: true });
    const unsubState = opponentSpeech.subscribe(setVoiceState);
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
      unsubState();
    };
  }, []);

  // === Mount Three.js 3D Scene ONCE ===
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const scene = new ChessScene3D(container, 'walnut-maple', 'warm-studio', {
      onSquareClick: (sq) => squareClickRef.current(sq),
      onContextLost: () => setWebglLost(true),
      onContextRestored: () => setWebglLost(false),
    });
    sceneRef.current = scene;

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Sync visual state to 3D scene
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
    showCoordinates,
  ]);

  // Sync Skin & Lighting Mood to 3D scene
  useEffect(() => {
    sceneRef.current?.setSkin(skinId);
  }, [skinId]);

  useEffect(() => {
    sceneRef.current?.setLightingMood(lightingMood);
  }, [lightingMood]);

  // === Initialize Web Worker for Analysis & AI Opponent ===
  const commitLocalMoveRef = useRef(commitLocalMove);
  commitLocalMoveRef.current = commitLocalMove;

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
        setAnalysis({
          fen: msg.fen,
          depth: msg.depth,
          nodes: msg.nodes,
          nps,
          timeMs: msg.timeMs,
          lines: msg.lines,
          isSearching: msg.type === 'progress',
        });
      } else if (msg.type === 'bot-move') {
        if (msg.requestId !== botReqIdRef.current) return;
        setIsThinkingAi(false);
        if (msg.bestMoveUci && msg.bestMoveUci.length >= 4) {
          const from = msg.bestMoveUci.slice(0, 2);
          const to = msg.bestMoveUci.slice(2, 4);
          const promo = (msg.bestMoveUci.slice(4, 5) || 'q') as PieceType;
          commitLocalMoveRef.current(from, to, promo);
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

  // Trigger continuous position analysis when enabled (and not during active AI bot search)
  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;

    if (!analysisEnabled || isThinkingAi) {
      return;
    }

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

  // Trigger AI Opponent move when it's AI's turn
  useEffect(() => {
    if (gameMode !== 'engine' || localResult || !isViewingLatest) return;
    const chess = new Chess(localFen);
    const turn = chess.turn() as PieceColor;
    const aiColor: PieceColor = humanColorActual === 'w' ? 'b' : 'w';
    if (turn !== aiColor) return;

    const worker = workerRef.current;
    if (!worker) return;

    setIsThinkingAi(true);
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
  }, [gameMode, localFen, localResult, humanColorActual, engineLevel, isViewingLatest]);

  // Local countdown clock
  useEffect(() => {
    if (gameMode === 'multiplayer' || isReplayMode || localResult) return;
    if (TIME_CONTROLS[timeControl].initialMs <= 0 || localMoves.length === 0) return;

    const timer = window.setInterval(() => {
      const turn = new Chess(localFen).turn() as PieceColor;
      setLocalClocks((prev) => {
        const nextVal = Math.max(0, prev[turn] - 250);
        if (nextVal <= 0) {
          setLocalResult({ winner: turn === 'w' ? 'b' : 'w', reason: 'timeout' });
          soundEngine.playGameOver();
        }
        return { ...prev, [turn]: nextVal };
      });
    }, 250);

    return () => window.clearInterval(timer);
  }, [gameMode, isReplayMode, localResult, timeControl, localMoves.length, localFen]);

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
              setSkinId(msg.room.skinId);
              setDisplayRoomClocks(msg.room.clocks);
              prevRoomMoveCountRef.current = msg.room.moves.length;
              setViewPly(msg.room.moves.length);
              setSelectedSquare(null);
              const preset: CameraPreset = msg.role === 'b' ? 'black' : 'white';
              setCameraPreset(preset);
              sceneRef.current?.setCameraPreset(preset);

              // Update URL query param cleanly so user can copy/share
              const url = new URL(window.location.href);
              url.searchParams.set('room', msg.room.id);
              window.history.replaceState({}, '', url.toString());
              break;
            }
            case 'room:state': {
              const room = msg.room;
              setActiveRoom(room);
              setSkinId(room.skinId);
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

    // Auto-join room from URL ?room=XXXXXX if present
    const roomParam = new URLSearchParams(window.location.search).get('room');
    if (roomParam) {
      setActiveTab('multiplayer');
      client.joinRoom(roomParam, playerName);
    }

    return () => {
      client.disconnect();
      mpClientRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Smooth client interpolation of authoritative server room clocks
  useEffect(() => {
    if (gameMode !== 'multiplayer' || !activeRoom) return;
    setDisplayRoomClocks(activeRoom.clocks);

    const spec = TIME_CONTROLS[activeRoom.timeControl];
    if (
      spec.initialMs <= 0 ||
      activeRoom.status !== 'active' ||
      activeRoom.moves.length === 0 ||
      !activeRoom.lastClockUpdateAt
    ) {
      return;
    }

    const tick = window.setInterval(() => {
      const elapsed = Math.max(0, Date.now() - (activeRoom.lastClockUpdateAt || Date.now()));
      const turn = activeRoom.turn;
      setDisplayRoomClocks({
        w: turn === 'w' ? Math.max(0, activeRoom.clocks.w - elapsed) : activeRoom.clocks.w,
        b: turn === 'b' ? Math.max(0, activeRoom.clocks.b - elapsed) : activeRoom.clocks.b,
      });
    }, 200);

    return () => window.clearInterval(tick);
  }, [gameMode, activeRoom]);

  // === Replay Theatre Auto-Playback Timer ===
  const jumpToPly = useCallback(
    (targetPly: number) => {
      const clamped = Math.max(0, Math.min(activeMoves.length, targetPly));
      // Smoothly animate 3D piece when stepping forward by 1 ply
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

  // === Keyboard Shortcuts (H = Zen Mode, Left/Right = step moves, Space = replay play/pause) ===
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((c) => !c);
      } else if (e.key === 'm' || e.key === 'M') {
        setSoundEnabled((prev) => {
          const next = !prev;
          soundEngine.enabled = next;
          if (!next) opponentSpeech.stop();
          return next;
        });
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
  }, [jumpToPly, clampedViewPly, activeTab, activeMoves.length, replayPlaying]);

  // === Game Control Handlers ===
  const resetLocalState = useCallback((tc: TimeControlId) => {
    botReqIdRef.current++;
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
    setLocalClocks({ w: ms, b: ms });
  }, []);

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
    if (gameMode === 'multiplayer' || isReplayMode || localMoves.length === 0 || isThinkingAi) {
      return;
    }
    // In vs AI mode, undo back 2 plies (AI + human) if it's human's turn so user gets their move back
    const stepsBack = gameMode === 'engine' && localMoves.length >= 2 && displayedTurn === humanColorActual ? 2 : 1;
    const nextMoves = localMoves.slice(0, Math.max(0, localMoves.length - stepsBack));
    const nextFen = nextMoves.length > 0 ? nextMoves[nextMoves.length - 1].fen : INITIAL_FEN;
    setLocalMoves(nextMoves);
    setLocalFen(nextFen);
    setLocalResult(null);
    setViewPly(nextMoves.length);
    setSelectedSquare(null);
  }, [gameMode, isReplayMode, localMoves, isThinkingAi, displayedTurn, humanColorActual]);

  const handleLoadReplay = useCallback((game: SavedGame) => {
    setReplayPlaying(false);
    setActiveReplayGame(game);
    setGameMode('replay');
    setActiveTab('replay');
    setSkinId(game.skinId);
    setViewPly(0);
    setSelectedSquare(null);
    setCameraPreset('white');
    sceneRef.current?.setCameraPreset('white');
  }, []);

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

  const handleSelectSkin = useCallback(
    (id: BoardSkinId) => {
      setSkinId(id);
      if (gameMode === 'multiplayer' && activeRoom && myRoomRole !== 'spectator') {
        mpClientRef.current?.updateRoomSkin(activeRoom.id, id);
      }
    },
    [gameMode, activeRoom, myRoomRole],
  );

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

  return (
    <div className="relative w-full h-full overflow-hidden bg-black select-none">
      {/* Isolated Full-Viewport 3D WebGL Canvas Container */}
      <div ref={canvasContainerRef} className="fixed inset-0 z-0" />

      {/* Graceful WebGL Context Loss Fallback */}
      {webglLost && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/95">
          <div className="max-w-sm text-center p-6 rounded-lg border border-white/12 bg-[#141820]">
            <h2 className="font-display text-lg text-[#f4efe4] mb-2">3D Viewport Suspended</h2>
            <p className="text-xs text-[#9aa3b2]">
              WebGL context was temporarily paused by the browser. Click anywhere or restore the tab to resume the 3D board.
            </p>
          </div>
        </div>
      )}

      {/* Slim Far-Left Evaluation Bar (zero center occlusion) */}
      <EvalBar
        visible={analysisEnabled}
        analysis={analysis}
        flipped={cameraPreset === 'black'}
      />

      {/* Minimal 3-Zone Top Bar + Unboxed Match Clock Strip */}
      <TopBar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          setDockCollapsed(false);
        }}
        gameMode={gameMode}
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
        isThinkingAi={isThinkingAi}
        isReplayMode={isReplayMode}
        replayTitle={activeReplayGame?.title}
        onPrimaryAction={handlePrimaryHeaderAction}
        onSaveCurrentGame={() => saveCurrentGameToArchive()}
        onOpenReplayCurrent={handleOpenReplayCurrent}
        canSaveCurrent={activeMoves.length > 0 && !isReplayMode}
        alreadySaved={Boolean(currentFingerprint && savedGameFingerprints.has(currentFingerprint))}
      />

      {/* Unified Collapsible Bottom Control Dock */}
      <ControlDock
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          setDockCollapsed(false);
        }}
        collapsed={dockCollapsed}
        onToggleCollapse={() => setDockCollapsed((c) => !c)}
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
        opponentVoice={opponentVoice}
        onChangeOpponentVoice={(gender) => {
          setOpponentVoice(gender);
          if (gender === 'off') {
            opponentSpeech.stop();
            setOpponentMessage(null);
            return;
          }
          const introMsg = createIntroMessage(gender);
          setOpponentMessage(introMsg);
          opponentSpeech.unlock();
          opponentSpeech.playClip(introMsg.clipId, gender, soundEnabled);
        }}
        showSpeechBubbles={showSpeechBubbles}
        onToggleSpeechBubbles={() => {
          setShowSpeechBubbles((prev) => !prev);
        }}
        onOpenDownload={() => setDownloadModalOpen(true)}
        canUndo={gameMode !== 'multiplayer' && !isReplayMode && localMoves.length > 0 && !isThinkingAi}
        onUndo={handleUndoLocal}
        onResignLocal={() => {
          if (localResult || gameMode === 'multiplayer' || isReplayMode) return;
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
        wsStatus={wsStatus}
        onlineCount={onlineCount}
        queueCount={queueCount}
        playerName={playerName}
        onChangePlayerName={(name) => {
          setPlayerName(name);
          try {
            localStorage.setItem('staunton3d_player_name', name);
          } catch {
            // ignore
          }
          mpClientRef.current?.setPlayerName(name);
        }}
        inQueue={inQueue}
        onJoinMatchmaking={() => {
          setRoomError(null);
          mpClientRef.current?.joinMatchmaking(playerName, timeControl, skinId);
        }}
        onCancelMatchmaking={() => mpClientRef.current?.cancelMatchmaking()}
        publicRooms={publicRooms}
        activeRoom={activeRoom}
        myRoomRole={myRoomRole}
        roomError={roomError}
        onCreateRoom={(preferredColor, isPublic) => {
          setRoomError(null);
          mpClientRef.current?.createRoom({
            name: playerName,
            preferredColor,
            timeControl,
            skinId,
            isPublic,
          });
        }}
        onJoinRoom={(roomId) => {
          setRoomError(null);
          mpClientRef.current?.joinRoom(roomId, playerName);
        }}
        onLeaveRoom={handleLeaveMultiplayer}
        onOfferDraw={() => activeRoom && mpClientRef.current?.offerDraw(activeRoom.id)}
        onRespondDraw={(accept) =>
          activeRoom && mpClientRef.current?.respondDraw(activeRoom.id, accept)
        }
        onResignOnline={() => activeRoom && mpClientRef.current?.resign(activeRoom.id)}
        onVoteRematch={() => activeRoom && mpClientRef.current?.voteRematch(activeRoom.id)}
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
        skinId={skinId}
        onSelectSkin={handleSelectSkin}
        lightingMood={lightingMood}
        onSelectLightingMood={setLightingMood}
        showCoordinates={showCoordinates}
        onToggleCoordinates={() => setShowCoordinates((c) => !c)}
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
        />
      )}

      {/* Situational Adversary Commentary Banner (only shown when explicitly enabled in menu) */}
      {gameMode === 'engine' && opponentVoice !== 'off' && showSpeechBubbles && (
        <OpponentSpeechBanner
          message={opponentMessage}
          soundEnabled={soundEnabled}
          voiceState={voiceState}
          onReplayVoice={() => {
            if (opponentMessage) {
              opponentSpeech.unlock();
              opponentSpeech.playClip(opponentMessage.clipId, opponentVoice, soundEnabled);
            }
          }}
          onDismiss={() => {
            opponentSpeech.stop();
            setOpponentMessage(null);
          }}
        />
      )}

      {/* Subtle Offline Mode Indicator */}
      {!isOnline && (
        <div className="fixed bottom-4 left-4 z-40 px-3 py-1.5 rounded-md bg-[#231b12]/95 border border-[#d6ae63]/40 text-[11px] font-medium text-[#f0d192] shadow-lg">
          Offline Mode — AI, Pass &amp; Play, Analysis &amp; Replays Ready
        </div>
      )}
    </div>
  );
}
