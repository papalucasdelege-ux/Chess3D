import { Chess } from 'chess.js';
import type { PieceColor, PieceType } from '../shared/types';

export interface ComposerPiece {
  type: PieceType;
  color: PieceColor;
}

export type ComposerTool =
  | { kind: 'move' }
  | { kind: 'erase' }
  | { kind: 'piece'; color: PieceColor; type: PieceType };

export interface CastlingFlags {
  K: boolean;
  Q: boolean;
  k: boolean;
  q: boolean;
}

export interface ComposerState {
  pieces: Record<string, ComposerPiece>;
  turn: PieceColor;
  castling: CastlingFlags;
  enPassant: string;
  fullmoveNumber: number;
}

export interface ComposerValidation {
  valid: boolean;
  playable: boolean;
  fen: string;
  errors: string[];
  warnings: string[];
  inCheckColor: PieceColor | null;
  legalMoveCount: number;
}

export interface ComposerPreset {
  id: string;
  label: string;
  subtitle: string;
  fen: string;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const STANDARD_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const COMPOSER_PRESETS: readonly ComposerPreset[] = [
  {
    id: 'standard',
    label: 'Standard Start',
    subtitle: 'Full 32-piece match start · White to move',
    fen: STANDARD_FEN,
  },
  {
    id: 'kings-only',
    label: 'Kings Only',
    subtitle: 'Clean canvas with Ke1 & ke8 ready to build',
    fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1',
  },
  {
    id: 'kingside-storm-w',
    label: 'White Kingside Storm',
    subtitle: 'Sharp attacking middlegame · White to move',
    fen: 'r1bq1rk1/pp2ppbp/2np1np1/8/2BNP3/2N1BP2/PPPQ2PP/2KR3R w - - 4 11',
  },
  {
    id: 'sicilian-counter-b',
    label: 'Black Sicilian Counter',
    subtitle: 'Opposite-side castling battle · Black to move',
    fen: 'r3k2r/pp1bqppp/2np1n2/2b1p3/4P3/2NP1NP1/PPPQ1PBP/R1B2RK1 b kq - 2 10',
  },
  {
    id: 'queen-tactics',
    label: 'Open Tactical Clash',
    subtitle: 'Imbalanced heavy-piece battle · White to move',
    fen: '2kr3r/ppp1qppp/2n1bn2/3p4/3P1B2/2PB1N2/PP1Q1PPP/R3K2R w KQ - 4 11',
  },
  {
    id: 'rook-endgame',
    label: 'Lucena Rook Endgame',
    subtitle: 'Classic technical endgame · White to move',
    fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1',
  },
];

export function sanitizeCastlingFlags(
  pieces: Record<string, ComposerPiece>,
  castling: CastlingFlags,
): CastlingFlags {
  const wkOnE1 = pieces.e1?.color === 'w' && pieces.e1?.type === 'k';
  const bkOnE8 = pieces.e8?.color === 'b' && pieces.e8?.type === 'k';
  return {
    K: Boolean(castling.K && wkOnE1 && pieces.h1?.color === 'w' && pieces.h1?.type === 'r'),
    Q: Boolean(castling.Q && wkOnE1 && pieces.a1?.color === 'w' && pieces.a1?.type === 'r'),
    k: Boolean(castling.k && bkOnE8 && pieces.h8?.color === 'b' && pieces.h8?.type === 'r'),
    q: Boolean(castling.q && bkOnE8 && pieces.a8?.color === 'b' && pieces.a8?.type === 'r'),
  };
}

export function getLegalEnPassantSquares(
  pieces: Record<string, ComposerPiece>,
  turn: PieceColor,
): string[] {
  const result: string[] = [];
  if (turn === 'w') {
    // Black just double-pushed a pawn from rank 7 to rank 5 -> target square on rank 6
    for (const f of FILES) {
      const p5 = pieces[`${f}5`];
      if (p5?.color === 'b' && p5.type === 'p' && !pieces[`${f}6`] && !pieces[`${f}7`]) {
        result.push(`${f}6`);
      }
    }
  } else {
    // White just double-pushed a pawn from rank 2 to rank 4 -> target square on rank 3
    for (const f of FILES) {
      const p4 = pieces[`${f}4`];
      if (p4?.color === 'w' && p4.type === 'p' && !pieces[`${f}3`] && !pieces[`${f}2`]) {
        result.push(`${f}3`);
      }
    }
  }
  return result;
}

export function parseFenToComposerState(fen: string): ComposerState {
  const trimmed = (fen || '').trim();
  const parts = trimmed.split(/\s+/);
  const placement = parts[0] || '8/8/8/8/8/8/8/8';
  const turn: PieceColor = parts[1] === 'b' ? 'b' : 'w';
  const castlingRaw = parts[2] || '-';
  const epRaw = parts[3] || '-';
  const fullmoveRaw = Number.parseInt(parts[5] || '1', 10);

  const pieces: Record<string, ComposerPiece> = {};
  const ranks = placement.split('/');
  for (let r = 0; r < 8; r++) {
    const rankStr = ranks[r] || '';
    let c = 0;
    for (let i = 0; i < rankStr.length && c < 8; i++) {
      const ch = rankStr[i];
      if (ch >= '1' && ch <= '8') {
        c += Number(ch);
      } else {
        const lower = ch.toLowerCase();
        if (
          lower === 'p' ||
          lower === 'n' ||
          lower === 'b' ||
          lower === 'r' ||
          lower === 'q' ||
          lower === 'k'
        ) {
          const sq = `${FILES[c]}${8 - r}`;
          pieces[sq] = {
            type: lower as PieceType,
            color: ch === lower ? 'b' : 'w',
          };
        }
        c += 1;
      }
    }
  }

  const castling = sanitizeCastlingFlags(pieces, {
    K: castlingRaw.includes('K'),
    Q: castlingRaw.includes('Q'),
    k: castlingRaw.includes('k'),
    q: castlingRaw.includes('q'),
  });

  const validEps = getLegalEnPassantSquares(pieces, turn);
  const enPassant = validEps.includes(epRaw) ? epRaw : '-';

  return {
    pieces,
    turn,
    castling,
    enPassant,
    fullmoveNumber: Number.isFinite(fullmoveRaw) && fullmoveRaw >= 1 ? fullmoveRaw : 1,
  };
}

export function composerStateToFen(state: ComposerState): string {
  const rankStrings: string[] = [];
  for (let r = 8; r >= 1; r--) {
    let emptyCount = 0;
    let rankStr = '';
    for (let c = 0; c < 8; c++) {
      const sq = `${FILES[c]}${r}`;
      const cell = state.pieces[sq];
      if (!cell) {
        emptyCount += 1;
      } else {
        if (emptyCount > 0) {
          rankStr += String(emptyCount);
          emptyCount = 0;
        }
        rankStr += cell.color === 'w' ? cell.type.toUpperCase() : cell.type;
      }
    }
    if (emptyCount > 0) {
      rankStr += String(emptyCount);
    }
    rankStrings.push(rankStr);
  }

  const sanitizedCastling = sanitizeCastlingFlags(state.pieces, state.castling);
  let castlingField = '';
  if (sanitizedCastling.K) castlingField += 'K';
  if (sanitizedCastling.Q) castlingField += 'Q';
  if (sanitizedCastling.k) castlingField += 'k';
  if (sanitizedCastling.q) castlingField += 'q';
  if (!castlingField) castlingField = '-';

  const validEps = getLegalEnPassantSquares(state.pieces, state.turn);
  const epField = validEps.includes(state.enPassant) ? state.enPassant : '-';
  const fullmove = Math.max(1, Math.floor(state.fullmoveNumber || 1));

  return `${rankStrings.join('/')} ${state.turn} ${castlingField} ${epField} 0 ${fullmove}`;
}

export function invertComposerColors(state: ComposerState): ComposerState {
  const nextPieces: Record<string, ComposerPiece> = {};
  for (const [sq, p] of Object.entries(state.pieces)) {
    const file = sq[0];
    const rank = Number(sq[1]);
    if (!file || !Number.isFinite(rank)) continue;
    const mirroredSq = `${file}${9 - rank}`;
    nextPieces[mirroredSq] = {
      type: p.type,
      color: p.color === 'w' ? 'b' : 'w',
    };
  }
  const nextTurn: PieceColor = state.turn === 'w' ? 'b' : 'w';
  const nextCastling = sanitizeCastlingFlags(nextPieces, {
    K: state.castling.k,
    Q: state.castling.q,
    k: state.castling.K,
    q: state.castling.Q,
  });
  return {
    pieces: nextPieces,
    turn: nextTurn,
    castling: nextCastling,
    enPassant: '-',
    fullmoveNumber: state.fullmoveNumber,
  };
}

export function validateComposerState(state: ComposerState): ComposerValidation {
  const fen = composerStateToFen(state);
  const errors: string[] = [];
  const warnings: string[] = [];

  let whiteKings = 0;
  let blackKings = 0;
  const illegalPawnSquares: string[] = [];

  for (const [sq, p] of Object.entries(state.pieces)) {
    if (p.type === 'k') {
      if (p.color === 'w') whiteKings += 1;
      else blackKings += 1;
    } else if (p.type === 'p') {
      const rank = sq[1];
      if (rank === '1' || rank === '8') {
        illegalPawnSquares.push(sq);
      }
    }
  }

  if (whiteKings !== 1) {
    errors.push(
      whiteKings === 0
        ? 'Place a White King (♔) on the board.'
        : `Only 1 White King is allowed (currently ${whiteKings}).`,
    );
  }
  if (blackKings !== 1) {
    errors.push(
      blackKings === 0
        ? 'Place a Black King (♚) on the board.'
        : `Only 1 Black King is allowed (currently ${blackKings}).`,
    );
  }
  if (illegalPawnSquares.length > 0) {
    errors.push(`Pawns cannot stand on rank 1 or 8 (${illegalPawnSquares.join(', ')}).`);
  }

  if (errors.length > 0) {
    return {
      valid: false,
      playable: false,
      fen,
      errors,
      warnings,
      inCheckColor: null,
      legalMoveCount: 0,
    };
  }

  try {
    const chess = new Chess(fen);
    // Also verify the side NOT to move is not already in check (illegal chess position)
    const oppTurn: PieceColor = state.turn === 'w' ? 'b' : 'w';
    const oppFenParts = fen.split(' ');
    oppFenParts[1] = oppTurn;
    oppFenParts[3] = '-';
    try {
      const oppProbe = new Chess(oppFenParts.join(' '));
      // In oppProbe it is oppTurn's turn; check if state.turn's king can be captured? Wait:
      // Actually in chess, if it is White's turn, BLACK's king cannot already be in check!
      // Let's check if any of state.turn's pieces attack oppTurn's king using chess.isAttacked!
      let oppKingSq: string | null = null;
      for (const [sq, p] of Object.entries(state.pieces)) {
        if (p.type === 'k' && p.color === oppTurn) {
          oppKingSq = sq;
          break;
        }
      }
      if (
        oppKingSq &&
        typeof (oppProbe as unknown as { isAttacked?: (sq: string, by: PieceColor) => boolean })
          .isAttacked === 'function'
      ) {
        const attacked = (
          oppProbe as unknown as { isAttacked: (sq: string, by: PieceColor) => boolean }
        ).isAttacked(oppKingSq, state.turn);
        if (attacked) {
          errors.push(
            `${oppTurn === 'w' ? 'White' : 'Black'} King cannot already be in check when it is ${
              state.turn === 'w' ? 'White' : 'Black'
            } to move.`,
          );
        }
      }
    } catch {
      errors.push('Invalid king check configuration for the selected side to move.');
    }

    if (errors.length > 0) {
      return {
        valid: false,
        playable: false,
        fen,
        errors,
        warnings,
        inCheckColor: null,
        legalMoveCount: 0,
      };
    }

    const legalMoves = chess.moves();
    const inCheckColor: PieceColor | null = chess.inCheck() ? state.turn : null;

    if (chess.isCheckmate()) {
      warnings.push(
        `This position is already Checkmate (${state.turn === 'w' ? 'Black' : 'White'} wins). Adjust a piece or change side to move to play on.`,
      );
    } else if (chess.isStalemate()) {
      warnings.push('This position is already Stalemate (0 legal moves).');
    } else if (chess.isInsufficientMaterial()) {
      warnings.push('Insufficient material — match is an immediate draw unless you add pieces.');
    }

    const playable = legalMoves.length > 0 && !chess.isInsufficientMaterial();

    return {
      valid: true,
      playable,
      fen,
      errors,
      warnings,
      inCheckColor,
      legalMoveCount: legalMoves.length,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid chess position.';
    return {
      valid: false,
      playable: false,
      fen,
      errors: [msg],
      warnings,
      inCheckColor: null,
      legalMoveCount: 0,
    };
  }
}
