import { Chess, type Move } from 'chess.js';
import type {
  BotSearchReport,
  EngineLevel,
  EngineLine,
  MoveQuality,
  SearchTreeEdge,
} from '../shared/types';

// PeSTO-inspired tapered middlegame & endgame material + piece-square tables (White perspective, rank 8 -> rank 1)
const MG_VALUE: Record<string, number> = {
  p: 82,
  n: 337,
  b: 365,
  r: 477,
  q: 1025,
  k: 0,
};

const EG_VALUE: Record<string, number> = {
  p: 94,
  n: 281,
  b: 297,
  r: 512,
  q: 936,
  k: 0,
};

const PHASE_WEIGHT: Record<string, number> = {
  p: 0,
  n: 1,
  b: 1,
  r: 2,
  q: 4,
  k: 0,
};

const MG_PST: Record<string, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    98, 134, 61, 95, 68, 126, 34, -11,
    -6, 7, 26, 31, 65, 56, 25, -20,
    -14, 13, 6, 21, 23, 12, 17, -23,
    -27, -2, -5, 12, 17, 6, 10, -25,
    -26, -4, -4, -10, 3, 3, 33, -12,
    -35, -1, -20, -23, -15, 24, 38, -22,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -167, -89, -34, -49, 61, -97, -15, -107,
    -73, -41, 72, 36, 23, 62, 7, -17,
    -47, 60, 37, 65, 84, 129, 73, 44,
    -9, 17, 19, 53, 37, 69, 18, 22,
    -13, 4, 16, 13, 28, 19, 21, -8,
    -23, -9, 12, 10, 19, 17, 25, -16,
    -29, -53, -12, -3, -1, 18, -14, -19,
    -105, -21, -58, -33, -17, -28, -19, -23,
  ],
  b: [
    -29, 4, -82, -37, -25, -42, 7, -8,
    -26, 16, -18, -13, 30, 59, 18, -47,
    -16, 37, 43, 40, 35, 50, 37, -2,
    -4, 5, 19, 50, 37, 37, 7, -2,
    -6, 13, 13, 26, 34, 12, 10, 4,
    0, 15, 15, 15, 14, 27, 18, 10,
    4, 15, 16, 0, 7, 21, 33, 1,
    -33, -3, -14, -21, -13, -12, -39, -21,
  ],
  r: [
    32, 42, 32, 51, 63, 9, 31, 43,
    27, 32, 58, 62, 80, 67, 26, 44,
    -5, 19, 26, 36, 17, 45, 61, 16,
    -24, -11, 7, 26, 24, 35, -8, -20,
    -36, -26, -12, -1, 9, -7, 6, -23,
    -45, -25, -16, -17, 3, 0, -5, -33,
    -44, -16, -20, -9, -1, 11, -6, -71,
    -19, -13, 1, 17, 16, 7, -37, -26,
  ],
  q: [
    -28, 0, 29, 12, 59, 44, 43, 45,
    -24, -39, -5, 1, -16, 57, 28, 54,
    -13, -17, 7, 8, 29, 56, 47, 57,
    -27, -27, -16, -16, -1, 17, -2, 1,
    -9, -26, -9, -10, -2, -4, 3, -3,
    -14, 2, -11, -2, -5, 2, 14, 5,
    -35, -8, 11, 2, 8, 15, -3, 1,
    -1, -18, -9, 10, -15, -25, -31, -50,
  ],
  k: [
    -65, 23, 16, -15, -56, -34, 2, 13,
    29, -1, -20, -7, -8, -4, -38, -29,
    -9, 24, 2, -16, -20, 6, 22, -22,
    -17, -20, -12, -27, -30, -25, -14, -36,
    -49, -1, -27, -39, -46, -44, -33, -51,
    -14, -14, -22, -46, -44, -30, -15, -27,
    1, 7, -8, -64, -43, -16, 9, 8,
    -15, 36, 12, -54, 8, -28, 24, 14,
  ],
};

const EG_PST: Record<string, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    178, 173, 158, 134, 147, 132, 165, 187,
    94, 100, 85, 67, 56, 53, 82, 84,
    32, 24, 13, 5, -2, 4, 17, 17,
    13, 9, -3, -7, -7, -8, 3, -1,
    4, 7, -6, 1, 0, -5, -1, -8,
    13, 8, 8, 10, 13, 0, 2, -7,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -58, -38, -13, -28, -31, -27, -63, -99,
    -25, -8, -25, -2, -9, -25, -24, -52,
    -24, -20, 10, 9, -1, -9, -19, -41,
    -17, 3, 22, 22, 22, 11, 8, -18,
    -18, -6, 16, 25, 16, 17, 4, -18,
    -23, -3, -1, 15, 10, -3, -20, -22,
    -42, -20, -10, -5, -2, -20, -23, -44,
    -29, -51, -23, -15, -22, -18, -50, -64,
  ],
  b: [
    -14, -21, -11, -8, -7, -9, -17, -24,
    -8, -4, 7, -12, -3, -13, -4, -14,
    2, -8, 0, -1, -2, 6, 0, 4,
    -3, 9, 12, 9, 14, 10, 3, 2,
    -6, 3, 13, 19, 7, 10, -3, -9,
    -12, -3, 8, 10, 13, 3, -7, -15,
    -14, -18, -7, -1, 4, -9, -15, -27,
    -23, -9, -23, -5, -9, -16, -5, -17,
  ],
  r: [
    13, 10, 18, 15, 12, 12, 8, 5,
    11, 13, 13, 11, -3, 3, 8, 3,
    7, 7, 7, 5, 4, -3, -5, -3,
    4, 3, 13, 1, 2, 1, -1, 2,
    3, 5, 8, 4, -5, -6, -8, -11,
    -4, 0, -5, -1, -7, -12, -8, -16,
    -6, -6, 0, 2, -9, -9, -11, -3,
    -9, 2, 3, -1, -5, -13, 4, -20,
  ],
  q: [
    -9, 22, 22, 27, 27, 19, 10, 20,
    -17, 20, 32, 41, 58, 25, 30, 0,
    -20, 6, 9, 49, 47, 35, 19, 9,
    3, 22, 24, 45, 57, 40, 57, 36,
    -18, 28, 19, 47, 31, 34, 39, 23,
    -16, -27, 15, 6, 9, 17, 10, 5,
    -22, -23, -30, -16, -16, -23, -36, -32,
    -33, -28, -22, -43, -5, -32, -20, -41,
  ],
  k: [
    -74, -35, -18, -18, -11, 15, 4, -17,
    -12, 17, 14, 17, 17, 38, 23, 11,
    10, 17, 23, 15, 20, 45, 44, 13,
    -8, 22, 24, 27, 26, 33, 26, 3,
    -18, -4, 21, 24, 27, 23, 9, -11,
    -19, -3, 11, 21, 23, 16, 7, -9,
    -27, -11, 4, 13, 14, 4, -5, -17,
    -53, -34, -21, -11, -28, -14, -24, -43,
  ],
};

const MATE_SCORE = 100000;
const MATE_THRESHOLD = 90000;

interface TTEntry {
  depth: number;
  score: number;
  flag: 0 | 1 | 2; // 0 exact, 1 lowerbound, 2 upperbound
  bestUci: string;
}

export function evaluatePositionWhitePerspective(chess: Chess): number {
  if (chess.isCheckmate()) {
    return chess.turn() === 'w' ? -MATE_SCORE : MATE_SCORE;
  }
  if (chess.isDraw() || chess.isStalemate() || chess.isInsufficientMaterial()) {
    return 0;
  }

  const board = chess.board();
  let mgScore = 0;
  let egScore = 0;
  let phase = 0;
  let whiteBishops = 0;
  let blackBishops = 0;
  const whitePawnFiles = [0, 0, 0, 0, 0, 0, 0, 0];
  const blackPawnFiles = [0, 0, 0, 0, 0, 0, 0, 0];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      if (!cell) continue;
      const type = cell.type;
      const idx = cell.color === 'w' ? r * 8 + c : (7 - r) * 8 + c;
      const mg = MG_VALUE[type] + MG_PST[type][idx];
      const eg = EG_VALUE[type] + EG_PST[type][idx];
      phase += PHASE_WEIGHT[type];

      if (cell.color === 'w') {
        mgScore += mg;
        egScore += eg;
        if (type === 'b') whiteBishops++;
        if (type === 'p') whitePawnFiles[c]++;
      } else {
        mgScore -= mg;
        egScore -= eg;
        if (type === 'b') blackBishops++;
        if (type === 'p') blackPawnFiles[c]++;
      }
    }
  }

  // Bishop pair bonus
  if (whiteBishops >= 2) {
    mgScore += 28;
    egScore += 44;
  }
  if (blackBishops >= 2) {
    mgScore -= 28;
    egScore -= 44;
  }

  // Doubled & isolated pawn penalties
  for (let f = 0; f < 8; f++) {
    if (whitePawnFiles[f] > 1) {
      mgScore -= 14 * (whitePawnFiles[f] - 1);
      egScore -= 20 * (whitePawnFiles[f] - 1);
    }
    if (blackPawnFiles[f] > 1) {
      mgScore += 14 * (blackPawnFiles[f] - 1);
      egScore += 20 * (blackPawnFiles[f] - 1);
    }
    if (whitePawnFiles[f] > 0) {
      const hasNeighbor =
        (f > 0 && whitePawnFiles[f - 1] > 0) || (f < 7 && whitePawnFiles[f + 1] > 0);
      if (!hasNeighbor) {
        mgScore -= 12;
        egScore -= 15;
      }
    }
    if (blackPawnFiles[f] > 0) {
      const hasNeighbor =
        (f > 0 && blackPawnFiles[f - 1] > 0) || (f < 7 && blackPawnFiles[f + 1] > 0);
      if (!hasNeighbor) {
        mgScore += 12;
        egScore += 15;
      }
    }
  }

  const clampedPhase = Math.min(24, phase);
  const score = Math.round((mgScore * clampedPhase + egScore * (24 - clampedPhase)) / 24);
  return score;
}

function moveToUci(m: Move): string {
  return `${m.from}${m.to}${m.promotion || ''}`;
}

function scoreMoveOrder(m: Move, ttUci?: string, killerUci?: string): number {
  const uci = moveToUci(m);
  if (ttUci && uci === ttUci) return 1_000_000;
  let score = 0;
  if (m.captured) {
    score += 100_000 + (MG_VALUE[m.captured] || 100) * 10 - (MG_VALUE[m.piece] || 100);
  }
  if (m.promotion) {
    score += 90_000 + (MG_VALUE[m.promotion] || 900);
  }
  if (killerUci && uci === killerUci) {
    score += 50_000;
  }
  if (m.san.includes('+')) score += 4_000;
  return score;
}

export interface SearchOptions {
  maxDepth: number;
  timeBudgetMs: number;
  multiPv: number;
  onProgress?: (depth: number, lines: EngineLine[], nodes: number, timeMs: number) => void;
  onTreeProgress?: (edges: SearchTreeEdge[], depth: number, nodes: number) => void;
  shouldStop?: () => boolean;
}

export class ChessAnalysisEngine {
  private tt = new Map<string, TTEntry>();
  private killers = new Map<number, string>();
  private nodes = 0;
  private startTime = 0;
  private deadline = 0;
  private aborted = false;
  private currentIterDepth = 1;
  private shouldStopFn?: () => boolean;
  private onTreeProgressFn?: (edges: SearchTreeEdge[], depth: number, nodes: number) => void;
  private lastTreeEmitCount = 0;
  private lastTreeEmitAt = 0;
  private recordedEdges: SearchTreeEdge[] = [];
  private recordedEdgeKeys = new Set<string>();
  private plyEdgeCounts = [0, 0, 0, 0];

  private recordTreeEdge(from: string, to: string, ply: number): void {
    const bucket = Math.min(3, ply);
    const caps = [48, 96, 88, 68];
    if (this.plyEdgeCounts[bucket] >= caps[bucket]) return;
    const key = `${bucket}:${from}${to}`;
    if (this.recordedEdgeKeys.has(key)) return;
    this.recordedEdgeKeys.add(key);
    this.plyEdgeCounts[bucket]++;
    this.recordedEdges.push({ from, to, ply: bucket });

    if (
      this.onTreeProgressFn &&
      this.recordedEdges.length - this.lastTreeEmitCount >= 16
    ) {
      const now = performance.now();
      if (now - this.lastTreeEmitAt >= 40) {
        this.lastTreeEmitCount = this.recordedEdges.length;
        this.lastTreeEmitAt = now;
        this.onTreeProgressFn([...this.recordedEdges], this.currentIterDepth, this.nodes);
      }
    }
  }

  private checkAbort(): boolean {
    if (this.aborted) return true;
    if ((this.nodes & 1023) === 0) {
      if (performance.now() >= this.deadline || this.shouldStopFn?.()) {
        this.aborted = true;
        return true;
      }
    }
    return false;
  }

  private getKey(chess: Chess): string {
    // Strip halfmove/fullmove counters for transposition reuse
    const parts = chess.fen().split(' ');
    return `${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]}`;
  }

  private quiescence(
    chess: Chess,
    alpha: number,
    beta: number,
    qDepth: number,
    ply: number,
  ): number {
    this.nodes++;
    if (this.checkAbort()) return 0;

    const sideSign = chess.turn() === 'w' ? 1 : -1;
    const standPat = evaluatePositionWhitePerspective(chess) * sideSign;
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;
    if (qDepth <= 0) return standPat;

    const moves = chess.moves({ verbose: true }).filter((m) => m.captured || m.promotion);
    moves.sort((a, b) => scoreMoveOrder(b) - scoreMoveOrder(a));

    for (const move of moves) {
      if (ply <= 3) {
        this.recordTreeEdge(move.from, move.to, ply);
      }
      chess.move(move);
      const score = -this.quiescence(chess, -beta, -alpha, qDepth - 1, ply + 1);
      chess.undo();
      if (this.aborted) return 0;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  private negamax(chess: Chess, depth: number, alpha: number, beta: number, ply: number): number {
    this.nodes++;
    if (this.checkAbort()) return 0;

    if (chess.isCheckmate()) {
      return -MATE_SCORE + ply;
    }
    if (chess.isDraw() || chess.isStalemate() || chess.isInsufficientMaterial()) {
      return 0;
    }

    if (depth <= 0) {
      return this.quiescence(chess, alpha, beta, 4, ply);
    }

    const key = this.getKey(chess);
    const origAlpha = alpha;
    const ttEntry = this.tt.get(key);
    if (ttEntry && ttEntry.depth >= depth) {
      if (ttEntry.flag === 0) return ttEntry.score;
      if (ttEntry.flag === 1) alpha = Math.max(alpha, ttEntry.score);
      else if (ttEntry.flag === 2) beta = Math.min(beta, ttEntry.score);
      if (alpha >= beta) return ttEntry.score;
    }

    const moves = chess.moves({ verbose: true });
    if (moves.length === 0) return 0;

    const killer = this.killers.get(ply);
    moves.sort((a, b) => scoreMoveOrder(b, ttEntry?.bestUci, killer) - scoreMoveOrder(a, ttEntry?.bestUci, killer));

    let bestScore = -Infinity;
    let bestUci = moveToUci(moves[0]);

    for (let i = 0; i < moves.length; i++) {
      const move = moves[i];
      if (ply <= 3) {
        this.recordTreeEdge(move.from, move.to, ply);
      }
      chess.move(move);
      let score: number;
      if (i === 0) {
        score = -this.negamax(chess, depth - 1, -beta, -alpha, ply + 1);
      } else {
        // Principal Variation Search (null-window)
        score = -this.negamax(chess, depth - 1, -alpha - 1, -alpha, ply + 1);
        if (score > alpha && score < beta && !this.aborted) {
          score = -this.negamax(chess, depth - 1, -beta, -alpha, ply + 1);
        }
      }
      chess.undo();

      if (this.aborted) return 0;

      if (score > bestScore) {
        bestScore = score;
        bestUci = moveToUci(move);
      }
      if (score > alpha) {
        alpha = score;
      }
      if (alpha >= beta) {
        if (!move.captured) {
          this.killers.set(ply, bestUci);
        }
        break;
      }
    }

    if (this.tt.size > 40000) {
      this.tt.clear();
    }

    const flag: 0 | 1 | 2 = bestScore <= origAlpha ? 2 : bestScore >= beta ? 1 : 0;
    this.tt.set(key, { depth, score: bestScore, flag, bestUci });
    return bestScore;
  }

  private extractPv(fen: string, firstMove: Move, maxLen = 6): { pvUci: string[]; pvSan: string[] } {
    const sim = new Chess(fen);
    const pvUci: string[] = [];
    const pvSan: string[] = [];
    const seen = new Set<string>();

    const m0 = sim.move(firstMove);
    if (!m0) return { pvUci, pvSan };
    pvUci.push(moveToUci(m0));
    pvSan.push(m0.san);
    seen.add(this.getKey(sim));

    for (let i = 1; i < maxLen; i++) {
      const entry = this.tt.get(this.getKey(sim));
      if (!entry || !entry.bestUci) break;
      const from = entry.bestUci.slice(0, 2);
      const to = entry.bestUci.slice(2, 4);
      const promotion = entry.bestUci.slice(4) || undefined;
      try {
        const next = sim.move({ from, to, promotion });
        if (!next) break;
        pvUci.push(moveToUci(next));
        pvSan.push(next.san);
        const nextKey = this.getKey(sim);
        if (seen.has(nextKey)) break;
        seen.add(nextKey);
      } catch {
        break;
      }
    }
    return { pvUci, pvSan };
  }

  public analyze(
    fen: string,
    opts: SearchOptions,
  ): {
    depth: number;
    lines: EngineLine[];
    allSimulations: EngineLine[];
    nodes: number;
    timeMs: number;
    treeEdges: SearchTreeEdge[];
  } {
    const chess = new Chess(fen);
    const legalMoves = chess.moves({ verbose: true });
    this.startTime = performance.now();
    this.deadline = this.startTime + opts.timeBudgetMs;
    this.nodes = 0;
    this.aborted = false;
    this.currentIterDepth = 1;
    this.shouldStopFn = opts.shouldStop;
    this.onTreeProgressFn = opts.onTreeProgress;
    this.lastTreeEmitCount = 0;
    this.lastTreeEmitAt = this.startTime;
    this.killers.clear();
    this.recordedEdges = [];
    this.recordedEdgeKeys.clear();
    this.plyEdgeCounts = [0, 0, 0, 0];

    if (legalMoves.length === 0) {
      this.onTreeProgressFn = undefined;
      return { depth: 0, lines: [], allSimulations: [], nodes: 0, timeMs: 0, treeEdges: [] };
    }

    const sideSign = chess.turn() === 'w' ? 1 : -1;
    let bestLines: EngineLine[] = [];
    let allSimulations: EngineLine[] = [];
    let reachedDepth = 1;

    // Maintain root move ordering across iterations
    let orderedMoves = [...legalMoves];

    for (let depth = 1; depth <= opts.maxDepth; depth++) {
      this.currentIterDepth = depth;
      const scored: { move: Move; scoreFromTurn: number }[] = [];

      for (const move of orderedMoves) {
        this.recordTreeEdge(move.from, move.to, 0);
        chess.move(move);
        const score = -this.negamax(chess, depth - 1, -MATE_SCORE - 10, MATE_SCORE + 10, 1);
        chess.undo();

        if (this.aborted) break;
        scored.push({ move, scoreFromTurn: score });
      }

      if (this.aborted && scored.length < Math.min(3, orderedMoves.length)) {
        break;
      }

      if (scored.length > 0) {
        scored.sort((a, b) => b.scoreFromTurn - a.scoreFromTurn);
        orderedMoves = scored.map((s) => s.move).concat(
          orderedMoves.filter((m) => !scored.some((s) => moveToUci(s.move) === moveToUci(m))),
        );

        allSimulations = scored.map((item, idx) => {
          const scoreWhite = item.scoreFromTurn * sideSign;
          let mateIn: number | null = null;
          if (Math.abs(item.scoreFromTurn) >= MATE_THRESHOLD) {
            const pliesToMate = MATE_SCORE - Math.abs(item.scoreFromTurn);
            const fullMoves = Math.max(1, Math.ceil(pliesToMate / 2));
            mateIn = scoreWhite > 0 ? fullMoves : -fullMoves;
          }
          const pvDepth = idx < Math.max(4, opts.multiPv) ? 6 : 4;
          const { pvUci, pvSan } = this.extractPv(fen, item.move, pvDepth);
          return {
            multipv: idx + 1,
            scoreCp: scoreWhite,
            mateIn,
            pvUci,
            pvSan,
            bestMoveUci: moveToUci(item.move),
          };
        });
        bestLines = allSimulations.slice(0, Math.max(1, opts.multiPv));

        reachedDepth = depth;
        const elapsed = Math.max(1, Math.round(performance.now() - this.startTime));
        opts.onProgress?.(reachedDepth, bestLines, this.nodes, elapsed);
        if (this.recordedEdges.length > this.lastTreeEmitCount) {
          this.lastTreeEmitCount = this.recordedEdges.length;
          this.lastTreeEmitAt = performance.now();
          this.onTreeProgressFn?.([...this.recordedEdges], reachedDepth, this.nodes);
        }
      }

      if (this.aborted) break;
      // Early stop if forced mate already found cleanly
      if (bestLines[0]?.mateIn !== null && Math.abs(bestLines[0].mateIn) <= 2 && depth >= 2) {
        break;
      }
    }

    // Ensure shallow depths still visualize 3-4 plies of candidate branches cleanly
    if (this.plyEdgeCounts[2] < 12 && bestLines.length > 0) {
      for (const line of bestLines.slice(0, 4)) {
        const sim = new Chess(fen);
        try {
          const u0 = line.bestMoveUci;
          const m0 = sim.move({
            from: u0.slice(0, 2),
            to: u0.slice(2, 4),
            promotion: u0.slice(4) || undefined,
          });
          if (!m0) continue;
          const replies = sim.moves({ verbose: true }).slice(0, 5);
          for (const r1 of replies) {
            this.recordTreeEdge(r1.from, r1.to, 1);
            sim.move(r1);
            const r2List = sim.moves({ verbose: true }).slice(0, 4);
            for (const r2 of r2List) {
              this.recordTreeEdge(r2.from, r2.to, 2);
              sim.move(r2);
              const r3List = sim.moves({ verbose: true }).slice(0, 2);
              for (const r3 of r3List) {
                this.recordTreeEdge(r3.from, r3.to, 3);
              }
              sim.undo();
            }
            sim.undo();
          }
        } catch {
          // ignore
        }
      }
    }

    this.onTreeProgressFn = undefined;

    const pvKeySet = new Set<string>();
    const topPv = bestLines[0]?.pvUci ?? [];
    for (let p = 0; p < topPv.length; p++) {
      const u = topPv[p];
      if (u.length >= 4) {
        pvKeySet.add(`${Math.min(3, p)}:${u.slice(0, 4)}`);
      }
    }
    const treeEdges = this.recordedEdges.map((edge) =>
      pvKeySet.has(`${edge.ply}:${edge.from}${edge.to}`) ? { ...edge, chosen: true } : edge,
    );

    const totalMs = Math.max(1, Math.round(performance.now() - this.startTime));
    return {
      depth: reachedDepth,
      lines: bestLines,
      allSimulations,
      nodes: this.nodes,
      timeMs: totalMs,
      treeEdges,
    };
  }

  public pickBotMoveWithReport(
    fen: string,
    level: EngineLevel,
    onTreeProgress?: (edges: SearchTreeEdge[], depth: number, nodes: number) => void,
  ): BotSearchReport | null {
    const chess = new Chess(fen);
    const legalMoves = chess.moves({ verbose: true });
    if (legalMoves.length === 0) return null;

    // Master & Grandmaster opening book (FEN piece+turn+castling prefix -> principled replies)
    const bookKey = fen.split(' ').slice(0, 3).join(' ');
    const OPENING_BOOK: Record<string, string[]> = {
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq': ['e2e4', 'd2d4', 'c2c4', 'g1f3'],
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq': ['c7c5', 'e7e5', 'e7e6', 'c7c6'],
      'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq': ['g8f6', 'd7d5', 'e7e6'],
      'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq': ['g1f3', 'f1c4', 'b1c3'],
      'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq': ['b8c6', 'g8f6'],
      'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq': ['f1b5', 'f1c4', 'd2d4'],
      'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq': ['g1f3', 'b1c3', 'c2c3'],
      'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq': ['d7d6', 'b8c6', 'e7e6'],
      'rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq': ['c2c4', 'g1f3', 'c1f4'],
      'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq': ['c2c4', 'g1f3', 'c1f4'],
    };

    let forcedBookUci: string | null = null;
    if ((level === 'master' || level === 'grandmaster') && OPENING_BOOK[bookKey]) {
      const choices = OPENING_BOOK[bookKey];
      const legalUcis = new Set(legalMoves.map(moveToUci));
      const validBook = choices.filter((u) => legalUcis.has(u));
      if (validBook.length > 0) {
        forcedBookUci = validBook[Math.floor(Math.random() * validBook.length)];
      }
    }

    if (level === 'beginner') {
      const result = this.analyze(fen, {
        maxDepth: 2,
        timeBudgetMs: 180,
        multiPv: 4,
        onTreeProgress,
      });
      let chosenUci = moveToUci(legalMoves[0]);
      if (result.lines.length > 0) {
        if (Math.random() < 0.28) {
          chosenUci = moveToUci(legalMoves[Math.floor(Math.random() * legalMoves.length)]);
        } else {
          const pool = result.lines.slice(0, Math.min(4, result.lines.length));
          chosenUci = pool[Math.floor(Math.random() * pool.length)].bestMoveUci;
        }
      }
      const chosenLine = result.lines.find((l) => l.bestMoveUci === chosenUci) || result.lines[0];
      const chosenKeys = new Set<string>();
      if (chosenLine) {
        chosenLine.pvUci.forEach((u, p) => {
          if (u.length >= 4) chosenKeys.add(`${Math.min(3, p)}:${u.slice(0, 4)}`);
        });
      } else if (chosenUci.length >= 4) {
        chosenKeys.add(`0:${chosenUci.slice(0, 4)}`);
      }
      const markedEdges = result.treeEdges.map((edge) => ({
        from: edge.from,
        to: edge.to,
        ply: edge.ply,
        chosen: chosenKeys.has(`${edge.ply}:${edge.from}${edge.to}`) || undefined,
      }));
      return {
        rootFen: fen,
        bestMoveUci: chosenUci,
        depth: Math.max(1, result.depth),
        nodes: Math.max(legalMoves.length, result.nodes),
        timeMs: result.timeMs,
        triedLines: result.lines.slice(0, 4),
        allSimulations: result.allSimulations,
        treeEdges: markedEdges,
      };
    }

    const config =
      level === 'intermediate'
        ? { maxDepth: 2, timeBudgetMs: 240, multiPv: 4, randomness: 0.38, toleranceCp: 115 }
        : level === 'advanced'
          ? { maxDepth: 3, timeBudgetMs: 460, multiPv: 4, randomness: 0.16, toleranceCp: 60 }
          : level === 'master'
            ? { maxDepth: 4, timeBudgetMs: 820, multiPv: 4, randomness: 0.05, toleranceCp: 22 }
            : { maxDepth: 5, timeBudgetMs: 1380, multiPv: 4, randomness: 0.0, toleranceCp: 0 };

    const result = this.analyze(fen, {
      maxDepth: forcedBookUci ? Math.min(3, config.maxDepth) : config.maxDepth,
      timeBudgetMs: forcedBookUci ? 260 : config.timeBudgetMs,
      multiPv: config.multiPv,
      onTreeProgress,
    });

    let chosenUci = forcedBookUci;
    if (!chosenUci) {
      if (result.lines.length === 0) {
        chosenUci = moveToUci(legalMoves[0]);
      } else if (config.randomness > 0 && result.lines.length > 1 && Math.random() < config.randomness) {
        const topScore = result.lines[0].scoreCp;
        const candidates = result.lines.filter((l) => Math.abs(l.scoreCp - topScore) <= config.toleranceCp);
        const chosen = candidates[Math.floor(Math.random() * candidates.length)] || result.lines[0];
        chosenUci = chosen.bestMoveUci;
      } else {
        chosenUci = result.lines[0].bestMoveUci;
      }
    }

    // Order triedLines so non-chosen alternatives and the chosen branch are all represented cleanly
    const orderedLines = [...result.lines];
    orderedLines.sort((a, b) => {
      if (a.bestMoveUci === chosenUci) return -1;
      if (b.bestMoveUci === chosenUci) return 1;
      return a.multipv - b.multipv;
    });

    // Ensure the actually chosen move's PV spine is highlighted in treeEdges
    const chosenLine = orderedLines.find((l) => l.bestMoveUci === chosenUci) || orderedLines[0];
    const chosenKeys = new Set<string>();
    if (chosenLine) {
      chosenLine.pvUci.forEach((u, p) => {
        if (u.length >= 4) chosenKeys.add(`${Math.min(3, p)}:${u.slice(0, 4)}`);
      });
    } else if (chosenUci && chosenUci.length >= 4) {
      chosenKeys.add(`0:${chosenUci.slice(0, 4)}`);
    }
    const treeEdges = result.treeEdges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      ply: edge.ply,
      chosen: chosenKeys.has(`${edge.ply}:${edge.from}${edge.to}`) || undefined,
    }));

    return {
      rootFen: fen,
      bestMoveUci: chosenUci,
      depth: Math.max(1, result.depth),
      nodes: Math.max(legalMoves.length, result.nodes),
      timeMs: result.timeMs,
      triedLines: orderedLines.slice(0, 4),
      allSimulations: result.allSimulations,
      treeEdges,
    };
  }

  public pickBotMove(fen: string, level: EngineLevel): string | null {
    return this.pickBotMoveWithReport(fen, level)?.bestMoveUci ?? null;
  }
}

const quickCoachEngine = new ChessAnalysisEngine();

export function buildQuickSearchTreeForPosition(fen: string): {
  edges: SearchTreeEdge[];
  allSimulations: EngineLine[];
  nodes: number;
  depth: number;
} {
  try {
    const res = quickCoachEngine.analyze(fen, {
      maxDepth: 3,
      timeBudgetMs: 180,
      multiPv: 4,
    });
    return {
      edges: res.treeEdges,
      allSimulations: res.allSimulations,
      nodes: res.nodes,
      depth: res.depth,
    };
  } catch {
    return { edges: [], allSimulations: [], nodes: 0, depth: 0 };
  }
}

export interface HumanMoveAudit {
  cpLoss: number;
  bestBeforeCp: number;
  afterPlayedCp: number;
  walkedIntoMate: boolean;
  missedTacticalCapture: boolean;
  alternatives: { uci: string; san: string; scoreCp: number }[];
}

/**
 * Fast synchronous depth-2 mathematical audit of a human move so Chess Angel
 * can immediately explain mistakes, quantify evaluation loss, and highlight
 * stronger alternatives on the 3D board.
 */
export function quickEvaluateHumanMove(
  preFen: string,
  playedUci: string,
  postFen: string,
): HumanMoveAudit | null {
  try {
    const preChess = new Chess(preFen);
    const mover = preChess.turn();
    const sign = mover === 'w' ? 1 : -1;

    const preRes = quickCoachEngine.analyze(preFen, {
      maxDepth: 2,
      timeBudgetMs: 90,
      multiPv: 4,
    });
    if (preRes.lines.length === 0) return null;

    const postRes = quickCoachEngine.analyze(postFen, {
      maxDepth: 2,
      timeBudgetMs: 70,
      multiPv: 1,
    });

    const bestLine = preRes.lines[0];
    const bestBeforeWhite = bestLine.scoreCp;
    const afterWhite =
      postRes.lines.length > 0
        ? postRes.lines[0].scoreCp
        : evaluatePositionWhitePerspective(new Chess(postFen));

    const bestForMover = bestBeforeWhite * sign;
    const playedPreLine = preRes.lines.find((l) => l.bestMoveUci === playedUci) || null;
    const playedIsBestMove = bestLine.bestMoveUci === playedUci;

    // Use same-depth comparison when playedUci was already scored in preRes.lines to avoid
    // depth-2 vs depth-3 horizon swings falsely penalizing the engine's own top recommendation.
    const afterForMover = playedPreLine ? playedPreLine.scoreCp * sign : afterWhite * sign;
    const cpLoss = playedIsBestMove ? 0 : Math.max(0, Math.round(bestForMover - afterForMover));

    const bestAlreadyMated =
      bestLine.mateIn !== null &&
      bestLine.mateIn !== undefined &&
      Math.sign(bestLine.mateIn) === -sign &&
      Math.abs(bestLine.mateIn) <= 2;

    const walkedIntoMate =
      !playedIsBestMove &&
      !bestAlreadyMated &&
      postRes.lines[0]?.mateIn !== null &&
      postRes.lines[0]?.mateIn !== undefined &&
      Math.sign(postRes.lines[0].mateIn) === -sign &&
      Math.abs(postRes.lines[0].mateIn) <= 2;

    const bestFirstSan = bestLine.pvSan[0] || '';
    const missedTacticalCapture =
      !playedIsBestMove &&
      cpLoss >= 145 &&
      (bestFirstSan.includes('x') || bestFirstSan.includes('+'));

    const alternatives = playedIsBestMove
      ? []
      : preRes.lines
          .filter(
            (l) =>
              l.bestMoveUci !== playedUci &&
              (l.scoreCp * sign - afterForMover >= 55 ||
                (l.multipv === 1 && (cpLoss >= 55 || walkedIntoMate))),
          )
          .slice(0, 2)
          .map((l) => ({
            uci: l.bestMoveUci,
            san: l.pvSan[0] || l.bestMoveUci,
            scoreCp: l.scoreCp,
          }));

    return {
      cpLoss,
      bestBeforeCp: bestBeforeWhite,
      afterPlayedCp: afterWhite,
      walkedIntoMate,
      missedTacticalCapture,
      alternatives,
    };
  } catch {
    return null;
  }
}

export function classifyMoveQuality(cpLoss: number): MoveQuality {
  if (cpLoss <= 18) return 'best';
  if (cpLoss <= 45) return 'excellent';
  if (cpLoss <= 95) return 'good';
  if (cpLoss <= 170) return 'inaccuracy';
  if (cpLoss <= 300) return 'mistake';
  return 'blunder';
}

export function formatEvalLabel(scoreCp: number, mateIn: number | null): string {
  if (mateIn !== null) {
    return `${mateIn > 0 ? '+' : '-'}M${Math.abs(mateIn)}`;
  }
  const pawns = scoreCp / 100;
  if (Math.abs(pawns) < 0.05) return '0.0';
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`;
}

export function evalToWhiteWinPercent(scoreCp: number, mateIn: number | null): number {
  if (mateIn !== null) return mateIn > 0 ? 98 : 2;
  // Smooth logistic mapping used in modern chess UIs
  const clamped = Math.max(-1200, Math.min(1200, scoreCp));
  const pct = 50 + 50 * (2 / (1 + Math.exp(-0.0038 * clamped)) - 1);
  return Math.max(4, Math.min(96, pct));
}
