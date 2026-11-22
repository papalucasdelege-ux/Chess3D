import { Chess } from 'chess.js';
import type { BoardSkinId, MoveRecord, PieceColor, PieceType, SavedGame, TimeControlId } from '../shared/types';

const ARCHIVE_STORAGE_KEY = 'staunton3d_saved_games_v1';

export function buildPgnFromMoves(
  moves: MoveRecord[],
  meta: { whiteName: string; blackName: string; resultLabel: string; dateIso: string },
): string {
  const datePart = meta.dateIso.slice(0, 10).replace(/-/g, '.');
  const headers = [
    `[Event "ChessAngel3D Match"]`,
    `[Date "${datePart}"]`,
    `[White "${meta.whiteName}"]`,
    `[Black "${meta.blackName}"]`,
    `[Result "${meta.resultLabel}"]`,
  ].join('\n');

  const tokens: string[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    const moveNum = Math.floor(i / 2) + 1;
    const w = moves[i]?.san ?? '';
    const b = moves[i + 1]?.san ?? '';
    tokens.push(b ? `${moveNum}. ${w} ${b}` : `${moveNum}. ${w}`);
  }
  return `${headers}\n\n${tokens.join(' ')} ${meta.resultLabel}`.trim();
}

export function buildSavedGameFromSanList(params: {
  id: string;
  title: string;
  whiteName: string;
  blackName: string;
  resultLabel: string;
  reason: string;
  mode: SavedGame['mode'];
  skinId: BoardSkinId;
  timeControl: TimeControlId;
  dateIso: string;
  sanList: string[];
}): SavedGame {
  const chess = new Chess();
  const moves: MoveRecord[] = [];
  const baseTs = new Date(params.dateIso).getTime() || Date.now();

  for (let i = 0; i < params.sanList.length; i++) {
    const res = chess.move(params.sanList[i]);
    if (!res) break;
    moves.push({
      ply: i + 1,
      san: res.san,
      uci: `${res.from}${res.to}${res.promotion || ''}`,
      from: res.from,
      to: res.to,
      color: res.color as PieceColor,
      piece: res.piece as PieceType,
      captured: res.captured as PieceType | undefined,
      promotion: res.promotion as PieceType | undefined,
      fen: chess.fen(),
      timestamp: baseTs + i * 1000,
    });
  }

  return {
    id: params.id,
    title: params.title,
    whiteName: params.whiteName,
    blackName: params.blackName,
    resultLabel: params.resultLabel,
    reason: params.reason,
    mode: params.mode,
    skinId: params.skinId,
    timeControl: params.timeControl,
    dateIso: params.dateIso,
    moves,
    finalFen: chess.fen(),
    pgn: buildPgnFromMoves(moves, params),
  };
}

// Famous master classics available to inspect immediately in Replay Theatre
export const CLASSIC_REPLAYS: SavedGame[] = [
  buildSavedGameFromSanList({
    id: 'classic_opera_1858',
    title: 'The Opera Game (Paris, 1858)',
    whiteName: 'Paul Morphy',
    blackName: 'Duke Karl & Count Isouard',
    resultLabel: '1-0',
    reason: 'checkmate',
    mode: 'classic',
    skinId: 'walnut-maple',
    timeControl: 'unlimited',
    dateIso: '1858-10-21T20:00:00.000Z',
    sanList: [
      'e4', 'e5', 'Nf3', 'd6', 'd4', 'Bg4', 'dxe5', 'Bxf3', 'Qxf3', 'dxe5',
      'Bc4', 'Nf6', 'Qb3', 'Qe7', 'Nc3', 'c6', 'Bg5', 'b5', 'Nxb5', 'cxb5',
      'Bxb5+', 'Nbd7', 'O-O-O', 'Rd8', 'Rxd7', 'Rxd7', 'Rd1', 'Qe6',
      'Bxd7+', 'Nxd7', 'Qb8+', 'Nxb8', 'Rd8#',
    ],
  }),
  buildSavedGameFromSanList({
    id: 'classic_byrne_fischer_1956',
    title: 'Game of the Century (New York, 1956)',
    whiteName: 'Donald Byrne',
    blackName: 'Bobby Fischer',
    resultLabel: '0-1',
    reason: 'checkmate',
    mode: 'classic',
    skinId: 'walnut-maple',
    timeControl: 'unlimited',
    dateIso: '1956-10-17T18:00:00.000Z',
    sanList: [
      'Nf3', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'd4', 'O-O', 'Bf4', 'd5',
      'Qb3', 'dxc4', 'Qxc4', 'c6', 'e4', 'Nbd7', 'Rd1', 'Nb6', 'Qc5', 'Bg4',
      'Bg5', 'Na4', 'Qa3', 'Nxc3', 'bxc3', 'Nxe4', 'Bxe7', 'Qb6', 'Bc4', 'Nxc3',
      'Bc5', 'Rfe8+', 'Kf1', 'Be6', 'Bxb6', 'Bxc4+', 'Kg1', 'Ne2+', 'Kf1', 'Nxd4+',
      'Kg1', 'Ne2+', 'Kf1', 'Nc3+', 'Kg1', 'axb6', 'Qb4', 'Ra4', 'Qxb6', 'Nxd1',
      'h3', 'Rxa2', 'Kh2', 'Nxf2', 'Re1', 'Rxe1', 'Qd8+', 'Bf8', 'Nxe1', 'Bd5',
      'Nf3', 'Ne4', 'Qb8', 'b5', 'h4', 'h5', 'Ne5', 'Kg7', 'Kg1', 'Bc5+',
      'Kf1', 'Ng3+', 'Ke1', 'Bb4+', 'Kd1', 'Bb3+', 'Kc1', 'Ne2+', 'Kb1', 'Nc3+',
      'Kc1', 'Rc2#',
    ],
  }),
];

export function loadSavedGames(): SavedGame[] {
  try {
    const raw = localStorage.getItem(ARCHIVE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SavedGame[];
  } catch {
    return [];
  }
}

export function persistSavedGames(games: SavedGame[]): void {
  try {
    localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(games.slice(0, 40)));
  } catch {
    // ignore storage quota errors
  }
}
