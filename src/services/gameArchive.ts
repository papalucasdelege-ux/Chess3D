import { Chess } from 'chess.js';
import type { BoardSkinId, MoveRecord, PieceColor, PieceType, SavedGame, TimeControlId } from '../shared/types';

const ARCHIVE_STORAGE_KEY = 'staunton3d_saved_games_v1';

const DEFAULT_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function buildPgnFromMoves(
  moves: MoveRecord[],
  meta: {
    whiteName: string;
    blackName: string;
    resultLabel: string;
    dateIso: string;
    initialFen?: string;
  },
): string {
  const datePart = meta.dateIso.slice(0, 10).replace(/-/g, '.');
  const headerLines = [
    `[Event "ChessAngel 3D Match"]`,
    `[Date "${datePart}"]`,
    `[White "${meta.whiteName}"]`,
    `[Black "${meta.blackName}"]`,
    `[Result "${meta.resultLabel}"]`,
  ];
  if (meta.initialFen && meta.initialFen !== DEFAULT_START_FEN) {
    headerLines.push(`[SetUp "1"]`);
    headerLines.push(`[FEN "${meta.initialFen}"]`);
  }
  const headers = headerLines.join('\n');

  const tokens: string[] = [];
  const startBlack =
    Boolean(meta.initialFen && meta.initialFen.split(/\s+/)[1] === 'b') &&
    moves[0]?.color === 'b';
  if (startBlack && moves.length > 0) {
    tokens.push(`1... ${moves[0].san}`);
    for (let i = 1; i < moves.length; i += 2) {
      const moveNum = Math.floor((i + 1) / 2) + 1;
      const w = moves[i]?.san ?? '';
      const b = moves[i + 1]?.san ?? '';
      tokens.push(b ? `${moveNum}. ${w} ${b}` : `${moveNum}. ${w}`);
    }
  } else {
    for (let i = 0; i < moves.length; i += 2) {
      const moveNum = Math.floor(i / 2) + 1;
      const w = moves[i]?.san ?? '';
      const b = moves[i + 1]?.san ?? '';
      tokens.push(b ? `${moveNum}. ${w} ${b}` : `${moveNum}. ${w}`);
    }
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

export function exportSavedGameJson(game: SavedGame): void {
  const safeSlug = game.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
  const datePart = (game.dateIso || new Date().toISOString()).slice(0, 10);
  const filename = `chessangel-${safeSlug || 'game'}-${datePart}.json`;
  const payload = JSON.stringify(game, null, 2);
  const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function parseImportedSavedGame(rawText: string, fileName?: string): SavedGame | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  // 1. Try JSON save format (single SavedGame object or SavedGame[])
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      const candidate = Array.isArray(parsed) ? parsed[0] : parsed;
      if (candidate && typeof candidate === 'object') {
        if (Array.isArray(candidate.moves)) {
          const chessCheck = new Chess();
          if (candidate.finalFen) {
            try {
              chessCheck.load(String(candidate.finalFen));
            } catch {
              // fallback to reconstructing from moves
            }
          }
          const validMoves = candidate.moves.filter(
            (m: unknown): m is MoveRecord =>
              Boolean(
                m &&
                  typeof m === 'object' &&
                  typeof (m as MoveRecord).san === 'string' &&
                  typeof (m as MoveRecord).from === 'string' &&
                  typeof (m as MoveRecord).to === 'string' &&
                  typeof (m as MoveRecord).fen === 'string',
              ),
          );
          const whiteName =
            typeof candidate.whiteName === 'string' && candidate.whiteName.trim()
              ? candidate.whiteName.trim()
              : 'White';
          const blackName =
            typeof candidate.blackName === 'string' && candidate.blackName.trim()
              ? candidate.blackName.trim()
              : 'Chess Angel';
          const dateIso =
            typeof candidate.dateIso === 'string' && candidate.dateIso
              ? candidate.dateIso
              : new Date().toISOString();
          const resultLabel =
            typeof candidate.resultLabel === 'string' && candidate.resultLabel
              ? candidate.resultLabel
              : '*';
          const finalFen =
            validMoves.length > 0
              ? validMoves[validMoves.length - 1].fen
              : typeof candidate.finalFen === 'string' && candidate.finalFen
                ? candidate.finalFen
                : chessCheck.fen();

          return {
            id: `game_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            title:
              typeof candidate.title === 'string' && candidate.title.trim()
                ? candidate.title.trim()
                : `${whiteName} vs ${blackName}`,
            whiteName,
            blackName,
            resultLabel,
            reason: typeof candidate.reason === 'string' ? candidate.reason : 'in-progress',
            mode:
              candidate.mode === 'local' ||
              candidate.mode === 'engine' ||
              candidate.mode === 'angel-vs-angel' ||
              candidate.mode === 'multiplayer' ||
              candidate.mode === 'classic'
                ? candidate.mode
                : 'engine',
            skinId: 'walnut-maple',
            timeControl:
              candidate.timeControl === '3+0' ||
              candidate.timeControl === '5+3' ||
              candidate.timeControl === '10+0' ||
              candidate.timeControl === 'unlimited'
                ? candidate.timeControl
                : '10+0',
            dateIso,
            moves: validMoves,
            initialFen:
              typeof candidate.initialFen === 'string' && candidate.initialFen.trim()
                ? candidate.initialFen.trim()
                : undefined,
            finalFen,
            pgn:
              typeof candidate.pgn === 'string' && candidate.pgn.trim()
                ? candidate.pgn
                : buildPgnFromMoves(validMoves, {
                    whiteName,
                    blackName,
                    resultLabel,
                    dateIso,
                    initialFen:
                      typeof candidate.initialFen === 'string'
                        ? candidate.initialFen
                        : undefined,
                  }),
            engineLevel: candidate.engineLevel,
            whiteAngelLevel: candidate.whiteAngelLevel,
            blackAngelLevel: candidate.blackAngelLevel,
            humanColor: candidate.humanColor === 'b' ? 'b' : 'w',
            humanColorPref:
              candidate.humanColorPref === 'w' ||
              candidate.humanColorPref === 'b' ||
              candidate.humanColorPref === 'random'
                ? candidate.humanColorPref
                : undefined,
            clocks:
              candidate.clocks &&
              typeof candidate.clocks.w === 'number' &&
              typeof candidate.clocks.b === 'number'
                ? { w: Math.max(0, candidate.clocks.w), b: Math.max(0, candidate.clocks.b) }
                : undefined,
            result: candidate.result ?? null,
            moveEvalMeta:
              candidate.moveEvalMeta && typeof candidate.moveEvalMeta === 'object'
                ? candidate.moveEvalMeta
                : undefined,
          };
        }
      }
    } catch {
      // fall through to PGN parser
    }
  }

  // 2. Try standard PGN format
  try {
    const parser = new Chess();
    parser.loadPgn(trimmed);
    const headers = parser.getHeaders();
    const sanList = parser.history();
    const whiteName = headers.White && headers.White !== '?' ? headers.White : 'White';
    const blackName = headers.Black && headers.Black !== '?' ? headers.Black : 'Chess Angel';
    const resultLabel =
      headers.Result === '1-0' || headers.Result === '0-1' || headers.Result === '1/2-1/2'
        ? headers.Result
        : '*';
    const baseLabel = fileName
      ? fileName.replace(/\.(pgn|json|txt)$/i, '').replace(/[_-]+/g, ' ')
      : '';
    const title =
      headers.Event && headers.Event !== '?' && headers.Event !== 'ChessAngel 3D Match'
        ? `${headers.Event} · ${whiteName} vs ${blackName}`
        : baseLabel || `${whiteName} vs ${blackName}`;
    const reason = parser.isCheckmate()
      ? 'checkmate'
      : parser.isStalemate()
        ? 'stalemate'
        : parser.isDraw()
          ? 'agreement'
          : resultLabel === '*'
            ? 'in-progress'
            : 'resignation';

    const built = buildSavedGameFromSanList({
      id: `game_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title,
      whiteName,
      blackName,
      resultLabel,
      reason,
      mode: 'engine',
      skinId: 'walnut-maple',
      timeControl: '10+0',
      dateIso: new Date().toISOString(),
      sanList,
    });
    if (resultLabel === '1-0') {
      built.result = { winner: 'w', reason: parser.isCheckmate() ? 'checkmate' : 'resignation' };
    } else if (resultLabel === '0-1') {
      built.result = { winner: 'b', reason: parser.isCheckmate() ? 'checkmate' : 'resignation' };
    } else if (resultLabel === '1/2-1/2') {
      built.result = { winner: 'draw', reason: parser.isStalemate() ? 'stalemate' : 'agreement' };
    }
    return built;
  } catch {
    return null;
  }
}
