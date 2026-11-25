export type PieceColor = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export type BoardSkinId = 'walnut-maple';

export type LightingMood = 'warm-studio';

export type CameraPreset = 'white' | 'black' | 'top' | 'cinematic';

export type GameMode = 'engine' | 'local' | 'tactical' | 'multiplayer' | 'replay';

export type EngineLevel = 'beginner' | 'intermediate' | 'advanced' | 'master' | 'grandmaster';

export interface EngineLevelSpec {
  id: EngineLevel;
  label: string;
  elo: string;
  description: string;
}

export const ENGINE_LEVELS: Record<EngineLevel, EngineLevelSpec> = {
  beginner: { id: 'beginner', label: 'Beginner', elo: '800', description: 'Shallow search depth with gentle tactical pacing' },
  intermediate: { id: 'intermediate', label: 'Club', elo: '1200', description: 'Balanced tactical tree evaluation' },
  advanced: { id: 'advanced', label: 'Candidate', elo: '1600', description: 'Sharp multi-branch alpha-beta search' },
  master: { id: 'master', label: 'Master', elo: '2000', description: 'Deep PVS calculation and positional precision' },
  grandmaster: { id: 'grandmaster', label: 'Grandmaster', elo: '2400', description: 'Full-depth search tree, transposition tables & endgame precision' },
};

export interface SavedGame {
  id: string;
  title: string;
  whiteName: string;
  blackName: string;
  resultLabel: string;
  reason: string;
  mode: 'engine' | 'local' | 'multiplayer' | 'classic';
  skinId: BoardSkinId;
  timeControl: TimeControlId;
  dateIso: string;
  moves: MoveRecord[];
  finalFen: string;
  pgn: string;
  engineLevel?: EngineLevel;
  humanColor?: PieceColor;
  humanColorPref?: PieceColor | 'random';
  clocks?: { w: number; b: number };
  result?: RoomResult | null;
  moveEvalMeta?: Record<number, AnalyzedMoveMeta>;
}

export type TimeControlId = '3+0' | '5+3' | '10+0' | 'unlimited';

export interface TimeControlSpec {
  id: TimeControlId;
  label: string;
  initialMs: number;
  incrementMs: number;
}

export const TIME_CONTROLS: Record<TimeControlId, TimeControlSpec> = {
  '3+0': { id: '3+0', label: '3+0 Blitz', initialMs: 3 * 60 * 1000, incrementMs: 0 },
  '5+3': { id: '5+3', label: '5+3 Blitz', initialMs: 5 * 60 * 1000, incrementMs: 3000 },
  '10+0': { id: '10+0', label: '10+0 Rapid', initialMs: 10 * 60 * 1000, incrementMs: 0 },
  unlimited: { id: 'unlimited', label: 'Unlimited', initialMs: 0, incrementMs: 0 },
};

export interface MoveRecord {
  ply: number;
  san: string;
  uci: string;
  from: string;
  to: string;
  color: PieceColor;
  piece: PieceType;
  captured?: PieceType;
  promotion?: PieceType;
  fen: string;
  timestamp: number;
}

export type MoveQuality = 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export interface AnalyzedMoveMeta {
  ply: number;
  evalCp: number; // White-perspective centipawns after move
  quality?: MoveQuality;
  cpLoss?: number;
}

export interface EngineLine {
  multipv: number;
  scoreCp: number; // Always from White's perspective
  mateIn: number | null; // Positive = White mates in N, Negative = Black mates in N
  pvUci: string[];
  pvSan: string[];
  bestMoveUci: string;
}

export interface SearchTreeEdge {
  from: string;
  to: string;
  ply: number;
  chosen?: boolean;
}

export interface BotSearchReport {
  rootFen: string;
  bestMoveUci: string;
  depth: number;
  nodes: number;
  timeMs: number;
  triedLines: EngineLine[];
  allSimulations?: EngineLine[];
  treeEdges?: SearchTreeEdge[];
}

export interface AnalysisSnapshot {
  fen: string;
  depth: number;
  nodes: number;
  nps: number;
  timeMs: number;
  lines: EngineLine[];
  allSimulations?: EngineLine[];
  treeEdges?: SearchTreeEdge[];
  isSearching: boolean;
}

export interface RoomPlayer {
  name: string;
  connected: boolean;
}

export type RoomStatus = 'waiting' | 'active' | 'finished';

export interface RoomResult {
  winner: PieceColor | 'draw';
  reason:
    | 'checkmate'
    | 'stalemate'
    | 'insufficient'
    | 'threefold'
    | 'fifty-move'
    | 'resignation'
    | 'timeout'
    | 'agreement';
}

export interface RoomState {
  id: string;
  isPublic: boolean;
  skinId: BoardSkinId;
  timeControl: TimeControlId;
  status: RoomStatus;
  fen: string;
  turn: PieceColor;
  moves: MoveRecord[];
  players: {
    w: RoomPlayer | null;
    b: RoomPlayer | null;
  };
  spectatorCount: number;
  clocks: {
    w: number;
    b: number;
  };
  lastClockUpdateAt: number | null;
  drawOfferFrom: PieceColor | null;
  rematchVotes: PieceColor[];
  result: RoomResult | null;
  createdAt: number;
}

export interface PublicRoomSummary {
  id: string;
  hostName: string;
  timeControl: TimeControlId;
  skinId: BoardSkinId;
  playersCount: number;
  spectatorCount: number;
  status: RoomStatus;
}

export type ClientToServerMessage =
  | { type: 'client:hello'; clientId: string; name: string }
  | { type: 'rooms:list' }
  | {
      type: 'room:create';
      name: string;
      preferredColor: PieceColor | 'random';
      timeControl: TimeControlId;
      skinId: BoardSkinId;
      isPublic: boolean;
    }
  | { type: 'room:join'; roomId: string; name: string }
  | { type: 'room:leave' }
  | { type: 'matchmaking:join'; name: string; timeControl: TimeControlId; skinId: BoardSkinId }
  | { type: 'matchmaking:cancel' }
  | { type: 'game:move'; roomId: string; from: string; to: string; promotion?: PieceType }
  | { type: 'game:resign'; roomId: string }
  | { type: 'game:draw-offer'; roomId: string }
  | { type: 'game:draw-respond'; roomId: string; accept: boolean }
  | { type: 'game:rematch'; roomId: string }
  | { type: 'room:skin'; roomId: string; skinId: BoardSkinId };

export type ServerToClientMessage =
  | { type: 'server:welcome'; clientId: string; onlineCount: number }
  | { type: 'server:presence'; onlineCount: number; queueCount: number }
  | { type: 'rooms:list'; rooms: PublicRoomSummary[] }
  | { type: 'matchmaking:queued'; position: number; timeControl: TimeControlId }
  | { type: 'matchmaking:cancelled' }
  | { type: 'room:joined'; room: RoomState; role: PieceColor | 'spectator' }
  | { type: 'room:state'; room: RoomState }
  | { type: 'room:error'; message: string }
  | { type: 'game:move-rejected'; reason: string; fen: string };
