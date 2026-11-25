import { Chess } from 'chess.js';
import type { PieceColor, PieceType } from '../shared/types';

export type TacticalTheme =
  | 'fork'
  | 'pin'
  | 'mate'
  | 'sacrifice'
  | 'discovered'
  | 'deflection';

export type TacticalDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'master';

export interface TacticalMotifArrow {
  from: string;
  to: string;
  kind: 'fork' | 'primary' | 'secondary';
}

export interface TacticalPuzzle {
  id: string;
  index: number;
  title: string;
  theme: TacticalTheme;
  difficulty: TacticalDifficulty;
  rating: number;
  fen: string;
  solverColor: PieceColor;
  /** Odd-length UCI sequence: [solverMove1, opponentReply1, solverMove2, ...] */
  solutionUci: string[];
  objective: string;
  explanation: string;
  motifArrows?: TacticalMotifArrow[];
}

export const TACTICAL_THEME_LABELS: Record<TacticalTheme, string> = {
  fork: 'Forks',
  pin: 'Pins & Skewers',
  mate: 'Checkmates',
  sacrifice: 'Sacrifices',
  discovered: 'Discovered Attacks',
  deflection: 'Deflection & Decoy',
};

export const TACTICAL_DIFFICULTY_LABELS: Record<TacticalDifficulty, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  master: 'Master',
};

export const TACTICAL_THEMES_ORDER: TacticalTheme[] = [
  'fork',
  'pin',
  'mate',
  'sacrifice',
  'discovered',
  'deflection',
];

export const TACTICAL_DIFFICULTIES_ORDER: TacticalDifficulty[] = [
  'beginner',
  'intermediate',
  'advanced',
  'master',
];

export const TACTICAL_PUZZLES: TacticalPuzzle[] = [
  // ==================== BEGINNER (850 - 1080) ====================
  {
    id: 'puz_beg_01',
    index: 1,
    title: 'Back-Rank Corridor Mate',
    theme: 'mate',
    difficulty: 'beginner',
    rating: 860,
    fen: '6k1/1b3ppp/8/8/8/2q5/5PPP/4R1K1 w - - 0 1',
    solverColor: 'w',
    solutionUci: ['e1e8'],
    objective: 'White to move · Mate in 1',
    explanation:
      'Re8# exploits the unguarded eighth rank while Black’s own pawns on f7, g7, and h7 seal the king in.',
    motifArrows: [{ from: 'e1', to: 'e8', kind: 'primary' }],
  },
  {
    id: 'puz_beg_02',
    index: 2,
    title: 'Royal Family Fork on c7',
    theme: 'fork',
    difficulty: 'beginner',
    rating: 910,
    fen: 'r3kb1r/p2p1ppp/8/1q1N4/8/8/PP2QPPP/R3K2R w KQkq - 0 1',
    solverColor: 'w',
    solutionUci: ['d5c7', 'e8d8', 'c7b5'],
    objective: 'White to move · Win the Queen with a royal fork',
    explanation:
      '1. Nc7+ forks Black’s king, queen, and rook simultaneously. Because Qe2 covers e7, 1... Kd8 is forced and 2. Nxb5 wins the queen.',
    motifArrows: [
      { from: 'c7', to: 'e8', kind: 'fork' },
      { from: 'c7', to: 'b5', kind: 'fork' },
      { from: 'c7', to: 'a8', kind: 'fork' },
    ],
  },
  {
    id: 'puz_beg_03',
    index: 3,
    title: 'Arabian Corner Mate',
    theme: 'mate',
    difficulty: 'beginner',
    rating: 960,
    fen: '7k/1R6/p4N2/1p6/8/3r4/6K1/8 w - - 0 1',
    solverColor: 'w',
    solutionUci: ['b7h7'],
    objective: 'White to move · Mate in 1',
    explanation:
      'Rh7# demonstrates the classic Arabian Mate: the knight on f6 both protects the rook on h7 and covers the g8 flight square.',
    motifArrows: [
      { from: 'b7', to: 'h7', kind: 'primary' },
      { from: 'f6', to: 'g8', kind: 'secondary' },
    ],
  },
  {
    id: 'puz_beg_04',
    index: 4,
    title: 'Absolute Pin on the e-File',
    theme: 'pin',
    difficulty: 'beginner',
    rating: 1010,
    fen: 'r3k2r/pp2nppp/8/3q4/8/2N5/PP3PPP/4R1K1 w kq - 0 1',
    solverColor: 'w',
    solutionUci: ['c3d5'],
    objective: 'White to move · Exploit the pinned defender',
    explanation:
      'Nxd5 wins the queen outright because Black’s knight on e7 is absolutely pinned to the king on e8 by Re1.',
    motifArrows: [
      { from: 'c3', to: 'd5', kind: 'primary' },
      { from: 'e1', to: 'e8', kind: 'secondary' },
    ],
  },
  {
    id: 'puz_beg_05',
    index: 5,
    title: 'Diagonal Battery Mate on g2',
    theme: 'mate',
    difficulty: 'beginner',
    rating: 990,
    fen: '6k1/pp3ppp/8/8/6q1/5b2/PPPQP2P/4R1K1 b - - 0 1',
    solverColor: 'b',
    solutionUci: ['g4g2'],
    objective: 'Black to move · Mate in 1',
    explanation:
      'Qg2# delivers close-range checkmate supported by the bishop on f3, cutting off both f1 and h1.',
    motifArrows: [
      { from: 'g4', to: 'g2', kind: 'primary' },
      { from: 'f3', to: 'g2', kind: 'secondary' },
    ],
  },
  {
    id: 'puz_beg_06',
    index: 6,
    title: 'Queen Double-Attack Geometry',
    theme: 'fork',
    difficulty: 'beginner',
    rating: 1060,
    fen: '4kr2/p3pppp/8/3p4/1b6/8/PP3PPP/3Q2K1 w - - 0 1',
    solverColor: 'w',
    solutionUci: ['d1a4', 'e8d8', 'a4b4'],
    objective: 'White to move · Win the loose bishop',
    explanation:
      '1. Qa4+ checks the king along the open a4–e8 diagonal while simultaneously attacking the undefended bishop on b4.',
    motifArrows: [
      { from: 'a4', to: 'e8', kind: 'fork' },
      { from: 'a4', to: 'b4', kind: 'fork' },
    ],
  },

  // ==================== INTERMEDIATE (1180 - 1440) ====================
  {
    id: 'puz_int_01',
    index: 7,
    title: 'Long-Diagonal Bishop Skewer',
    theme: 'pin',
    difficulty: 'intermediate',
    rating: 1190,
    fen: '8/p3p3/B3kp1N/3pp3/8/7q/PP6/1KR5 w - - 0 1',
    solverColor: 'w',
    solutionUci: ['a6c8', 'e6d6', 'c8h3'],
    objective: 'White to move · Skewer the king and queen',
    explanation:
      '1. Bc8+ (protected by Rc1) skewers Black’s king on e6 against the queen on h3. After 1... Kd6, 2. Bxh3 wins the queen.',
    motifArrows: [
      { from: 'a6', to: 'c8', kind: 'primary' },
      { from: 'c8', to: 'h3', kind: 'secondary' },
    ],
  },
  {
    id: 'puz_int_02',
    index: 8,
    title: 'Morphy’s Opera House Finale',
    theme: 'sacrifice',
    difficulty: 'intermediate',
    rating: 1260,
    fen: '4kb1r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 1 16',
    solverColor: 'w',
    solutionUci: ['b3b8', 'd7b8', 'd1d8'],
    objective: 'White to move · Mate in 2 (Paris 1858)',
    explanation:
      '1. Qb8+! sacrifices the queen to deflect Black’s d7-knight off the d-file, allowing 2. Rd8# supported by Bg5.',
    motifArrows: [
      { from: 'b3', to: 'b8', kind: 'primary' },
      { from: 'd1', to: 'd8', kind: 'secondary' },
    ],
  },
  {
    id: 'puz_int_03',
    index: 9,
    title: 'Deflecting the Long-Diagonal Blocker',
    theme: 'deflection',
    difficulty: 'intermediate',
    rating: 1310,
    fen: '6k1/p1p2ppp/2r2q2/6Q1/8/8/PB3PPP/3R2K1 w - - 0 1',
    solverColor: 'w',
    solutionUci: ['d1d8', 'f6d8', 'g5g7'],
    objective: 'White to move · Mate in 2',
    explanation:
      '1. Rd8+! forces 1... Qxd8, deflecting Black’s queen from both guarding g7 and blocking White’s b2-bishop so 2. Qxg7# is mate.',
    motifArrows: [
      { from: 'd1', to: 'd8', kind: 'primary' },
      { from: 'b2', to: 'g7', kind: 'secondary' },
    ],
  },
  {
    id: 'puz_int_04',
    index: 10,
    title: 'Discovered Check on the e-File',
    theme: 'discovered',
    difficulty: 'intermediate',
    rating: 1350,
    fen: '3rk3/pp1p1ppp/8/5p1q/4B3/8/PP3PPP/4R1K1 w - - 0 1',
    solverColor: 'w',
    solutionUci: ['e4f3', 'e8f8', 'f3h5'],
    objective: 'White to move · Win the queen via discovered check',
    explanation:
      '1. Bf3+ uncovers check from Re1 while directly attacking Black’s queen on h5. After 1... Kf8, 2. Bxh5 wins decisive material.',
    motifArrows: [
      { from: 'e4', to: 'f3', kind: 'primary' },
      { from: 'e1', to: 'e8', kind: 'secondary' },
    ],
  },
  {
    id: 'puz_int_05',
    index: 11,
    title: 'Queen Sacrifice into Royal Fork',
    theme: 'fork',
    difficulty: 'intermediate',
    rating: 1390,
    fen: '2r3k1/pp3ppp/1q6/8/3R1n2/B4P2/PP4PP/3Q2K1 b - - 0 1',
    solverColor: 'b',
    solutionUci: ['b6d4', 'd1d4', 'f4e2'],
    objective: 'Black to move · Win a full rook by tactical sequence',
    explanation:
      '1... Qxd4+! eliminates the rook with check, drawing White’s queen onto d4 where 2... Ne2+ forks king and queen.',
    motifArrows: [
      { from: 'e2', to: 'g1', kind: 'fork' },
      { from: 'e2', to: 'd4', kind: 'fork' },
    ],
  },
  {
    id: 'puz_int_06',
    index: 12,
    title: 'Anastasia’s Mate Sacrifice',
    theme: 'mate',
    difficulty: 'intermediate',
    rating: 1430,
    fen: '5r1k/pp2N1pp/2p5/7Q/8/3R4/q4PP1/6K1 w - - 0 1',
    solverColor: 'w',
    solutionUci: ['h5h7', 'h8h7', 'd3h3'],
    objective: 'White to move · Mate in 2',
    explanation:
      'Ne7 controls g6 and g8 while Black’s g7-pawn blocks the king. 1. Qxh7+! Kxh7 opens the h-file for 2. Rh3#.',
    motifArrows: [
      { from: 'h5', to: 'h7', kind: 'primary' },
      { from: 'd3', to: 'h3', kind: 'secondary' },
    ],
  },

  // ==================== ADVANCED (1520 - 1790) ====================
  {
    id: 'puz_adv_01',
    index: 13,
    title: 'Philidor’s Legacy Smothered Mate',
    theme: 'mate',
    difficulty: 'advanced',
    rating: 1560,
    fen: '5rk1/pp4pp/2p5/3Q4/6N1/q7/P4PPP/4R1K1 w - - 0 1',
    solverColor: 'w',
    solutionUci: ['g4h6', 'g8h8', 'd5g8', 'f8g8', 'h6f7'],
    objective: 'White to move · Mate in 3',
    explanation:
      '1. Nh6+ double-check forces 1... Kh8; then 2. Qg8+!! Rxg8 encloses Black’s king inside his own pieces for 3. Nf7#.',
    motifArrows: [
      { from: 'd5', to: 'g8', kind: 'primary' },
      { from: 'h6', to: 'f7', kind: 'secondary' },
    ],
  },
  {
    id: 'puz_adv_02',
    index: 14,
    title: 'Boden’s Criss-Cross Bishops',
    theme: 'sacrifice',
    difficulty: 'advanced',
    rating: 1610,
    fen: '2kr3r/pp1nqppp/2b5/8/5B2/5Q2/PPP1B1PP/3R2K1 w - - 0 1',
    solverColor: 'w',
    solutionUci: ['f3c6', 'b7c6', 'e2a6'],
    objective: 'White to move · Mate in 2',
    explanation:
      '1. Qxc6+! forces 1... bxc6, prying open the a6–c8 diagonal while Bf4 seals c7 and b8 so 2. Ba6# is checkmate.',
    motifArrows: [
      { from: 'e2', to: 'a6', kind: 'primary' },
      { from: 'f4', to: 'b8', kind: 'secondary' },
    ],
  },
  {
    id: 'puz_adv_03',
    index: 15,
    title: 'Réti–Tartakower Immortal (Vienna 1910)',
    theme: 'discovered',
    difficulty: 'advanced',
    rating: 1670,
    fen: 'rnb1kb1r/pp3ppp/2p5/4q3/4n3/3Q4/PPPB1PPP/2KR1BNR w kq - 0 9',
    solverColor: 'w',
    solutionUci: ['d3d8', 'e8d8', 'd2g5', 'd8c7', 'g5d8'],
    objective: 'White to move · Mate in 3',
    explanation:
      '1. Qd8+!! Kxd8 lures the king onto the open d-file for 2. Bg5+! double-check; whether 2... Kc7 (3. Bd8#) or 2... Ke8 (3. Rd8#), mate is unavoidable.',
    motifArrows: [
      { from: 'd3', to: 'd8', kind: 'primary' },
      { from: 'd2', to: 'g5', kind: 'secondary' },
    ],
  },
  {
    id: 'puz_adv_04',
    index: 16,
    title: 'Long-Diagonal Pin Annihilation',
    theme: 'pin',
    difficulty: 'advanced',
    rating: 1710,
    fen: '5rk1/pbp2ppp/8/7q/8/7N/PP1Q1PP1/2B1R2K b - - 0 1',
    solverColor: 'b',
    solutionUci: ['h5h3', 'h1g1', 'h3g2'],
    objective: 'Black to move · Mate in 2',
    explanation:
      'White’s g2-pawn is pinned to Kh1 by Bb7, making 1... Qxh3+!! untouchable. After 2. Kg1, 2... Qxg2# finishes the game.',
    motifArrows: [
      { from: 'b7', to: 'h1', kind: 'secondary' },
      { from: 'h5', to: 'h3', kind: 'primary' },
    ],
  },
  {
    id: 'puz_adv_05',
    index: 17,
    title: 'Decoy into Royal Knight Fork',
    theme: 'deflection',
    difficulty: 'advanced',
    rating: 1750,
    fen: '4rk2/p4ppp/2pp4/1q1N4/8/2P5/PP1Q1PPP/4R1K1 w - - 0 1',
    solverColor: 'w',
    solutionUci: ['e1e8', 'f8e8', 'd5c7'],
    objective: 'White to move · Decoy the king and win the queen',
    explanation:
      'Immediate 1. Nc7? allows 1... Rxe1+ and Black’s queen escapes. 1. Rxe8+! Kxe8 decoys the king onto e8 where 2. Nc7+ forks king and queen.',
    motifArrows: [
      { from: 'c7', to: 'e8', kind: 'fork' },
      { from: 'c7', to: 'b5', kind: 'fork' },
    ],
  },
  {
    id: 'puz_adv_06',
    index: 18,
    title: 'h-File Clearance Queen Sacrifice',
    theme: 'sacrifice',
    difficulty: 'advanced',
    rating: 1780,
    fen: '5rk1/p4p1p/1p4p1/2p5/4R3/1P5Q/PBq2PP1/6K1 w - - 0 1',
    solverColor: 'w',
    solutionUci: ['h3h7', 'g8h7', 'e4h4', 'h7g8', 'h4h8'],
    objective: 'White to move · Mate in 3',
    explanation:
      'With Bb2 attacked by Qc2, every move must check: 1. Qxh7+!! Kxh7 rips open the h-file for 2. Rh4+ Kg8 3. Rh8# supported by Bb2.',
    motifArrows: [
      { from: 'h3', to: 'h7', kind: 'primary' },
      { from: 'b2', to: 'h8', kind: 'secondary' },
    ],
  },

  // ==================== MASTER (1860 - 2160) ====================
  {
    id: 'puz_mas_01',
    index: 19,
    title: 'Luring the Guardian to Smother',
    theme: 'deflection',
    difficulty: 'master',
    rating: 1890,
    fen: '5nrk/ppq3pp/2p5/4Np2/7Q/8/PPP5/1K5R w - - 0 1',
    solverColor: 'w',
    solutionUci: ['h4h7', 'f8h7', 'e5g6'],
    objective: 'White to move · Mate in 2',
    explanation:
      'Immediate 1. Ng6+? fails to 1... Nxg6. Instead, 1. Qxh7+!! forces 1... Nxh7, decoying the f8-knight off g6 and sealing h7 for 2. Ng6#.',
    motifArrows: [
      { from: 'h4', to: 'h7', kind: 'primary' },
      { from: 'e5', to: 'g6', kind: 'secondary' },
    ],
  },
  {
    id: 'puz_mas_02',
    index: 20,
    title: 'Counter-Mate Tempo Sacrifice',
    theme: 'mate',
    difficulty: 'master',
    rating: 1940,
    fen: '4r1k1/pp3p2/2p2Pp1/8/4q3/7R/PP1Q2PP/7K w - - 0 1',
    solverColor: 'w',
    solutionUci: ['h3h8', 'g8h8', 'd2h6', 'h8g8', 'h6g7'],
    objective: 'White to move · Mate in 3 before Black plays Qe1#',
    explanation:
      'Slow setup loses to 1... Qe1#. 1. Rh8+!! Kxh8 drags the king into the corner with tempo, enabling 2. Qh6+ Kg8 3. Qg7#.',
    motifArrows: [
      { from: 'h3', to: 'h8', kind: 'primary' },
      { from: 'd2', to: 'h6', kind: 'secondary' },
    ],
  },
  {
    id: 'puz_mas_03',
    index: 21,
    title: 'Underpromotion Royal Fork',
    theme: 'fork',
    difficulty: 'master',
    rating: 1990,
    fen: '4b3/q1Pk3p/B2r1pp1/8/5Q2/5PP1/6KP/8 w - - 0 1',
    solverColor: 'w',
    solutionUci: ['f4d6', 'd7d6', 'c7c8n'],
    objective: 'White to move · Sac the queen and underpromote',
    explanation:
      '1. Qxd6+!! Kxd6 draws Black’s king onto d6 so 2. c8=N+!! (choosing a knight, not a queen!) forks king on d6 and queen on a7.',
    motifArrows: [
      { from: 'c8', to: 'd6', kind: 'fork' },
      { from: 'c8', to: 'a7', kind: 'fork' },
    ],
  },
  {
    id: 'puz_mas_04',
    index: 22,
    title: 'Eliminating the Central Outpost',
    theme: 'sacrifice',
    difficulty: 'master',
    rating: 2050,
    fen: '3rk2r/pp4pp/2p2p2/q2Qn3/2B5/2P5/PP3PPP/4R1K1 w k - 0 1',
    solverColor: 'w',
    solutionUci: ['e1e5', 'f6e5', 'd5f7'],
    objective: 'White to move · Mate in 2',
    explanation:
      'Black’s e5-knight defends f7 while blocking the e-file. 1. Rxe5+!! forces 1... fxe5 (since Qd5/Bc4 cover d7 and f7), unleashing 2. Qf7#.',
    motifArrows: [
      { from: 'e1', to: 'e5', kind: 'primary' },
      { from: 'd5', to: 'f7', kind: 'secondary' },
    ],
  },
  {
    id: 'puz_mas_05',
    index: 23,
    title: 'Pillsbury’s Corner Demolition',
    theme: 'sacrifice',
    difficulty: 'master',
    rating: 2110,
    fen: '1k1r4/pbp5/1p3p2/7q/8/Q1P3P1/PP3P1P/5RK1 b - - 0 1',
    solverColor: 'b',
    solutionUci: ['h5h2', 'g1h2', 'd8h8', 'h2g1', 'h8h1'],
    objective: 'Black to move · Mate in 3',
    explanation:
      '1... Qxh2+!! clears the h2-pawn blocking the h-file. After 2. Kxh2 Rh8+ 3. Kg1, 3... Rh1# mates thanks to Bb7 sweeping the long diagonal.',
    motifArrows: [
      { from: 'h5', to: 'h2', kind: 'primary' },
      { from: 'b7', to: 'h1', kind: 'secondary' },
    ],
  },
  {
    id: 'puz_mas_06',
    index: 24,
    title: 'Magnetic King-Hunt Pawn Mate',
    theme: 'discovered',
    difficulty: 'master',
    rating: 2160,
    fen: '7r/pk3ppp/1p4q1/3N4/p4B2/PP6/5PBP/2R2QK1 w - - 0 1',
    solverColor: 'w',
    solutionUci: ['f1a6', 'b7a6', 'd5c7', 'a6a5', 'b3b4'],
    objective: 'White to move · Mate in 3',
    explanation:
      '1. Qa6+!! Kxa6 drags the king out; 2. Nc7+! checks while uncovering Bg2 onto b7, forcing 2... Ka5 where the quiet pawn thrust 3. b4# delivers mate.',
    motifArrows: [
      { from: 'f1', to: 'a6', kind: 'primary' },
      { from: 'b3', to: 'b4', kind: 'secondary' },
    ],
  },
];

// ==================== COUNTDOWN TIMER & SPEED MULTIPLIER ====================

export interface TacticalSpeedTier {
  multiplier: number;
  label: string;
  tier: 'lightning' | 'swift' | 'sharp' | 'standard' | 'overtime';
}

export interface TacticalSolveAward {
  pointsAwarded: number;
  basePoints: number;
  multiplier: number;
  tierLabel: string;
  solveMs: number;
  timedOut: boolean;
  isNewBestTime: boolean;
}

const DIFFICULTY_BASE_TIME_SEC: Record<TacticalDifficulty, number> = {
  beginner: 45,
  intermediate: 60,
  advanced: 75,
  master: 90,
};

const DIFFICULTY_BASE_POINTS: Record<TacticalDifficulty, number> = {
  beginner: 100,
  intermediate: 150,
  advanced: 220,
  master: 300,
};

/**
 * Returns the countdown time budget in milliseconds calibrated to puzzle difficulty and move depth.
 */
export function getPuzzleTimeLimitMs(puzzle: TacticalPuzzle): number {
  const baseSec = DIFFICULTY_BASE_TIME_SEC[puzzle.difficulty] ?? 60;
  const depthBonusSec = puzzle.solutionUci.length >= 5 ? 15 : 0;
  return (baseSec + depthBonusSec) * 1000;
}

export function getPuzzleBasePoints(difficulty: TacticalDifficulty): number {
  return DIFFICULTY_BASE_POINTS[difficulty] ?? 100;
}

/**
 * Computes the live speed score multiplier from remaining countdown time.
 * - >= 70% remaining -> 3.0x (Lightning)
 * - >= 45% remaining -> 2.0x (Swift)
 * - >= 20% remaining -> 1.5x (Sharp)
 * -  > 0%  remaining -> 1.0x (On Time)
 * -    0%  remaining -> 0.5x (Overtime)
 */
export function computeTacticalSpeedMultiplier(
  remainingMs: number,
  timeLimitMs: number,
): TacticalSpeedTier {
  if (timeLimitMs <= 0 || remainingMs <= 0) {
    return { multiplier: 0.5, label: 'Overtime', tier: 'overtime' };
  }
  const ratio = Math.min(1, Math.max(0, remainingMs / timeLimitMs));
  if (ratio >= 0.7) {
    return { multiplier: 3.0, label: 'Lightning', tier: 'lightning' };
  }
  if (ratio >= 0.45) {
    return { multiplier: 2.0, label: 'Swift', tier: 'swift' };
  }
  if (ratio >= 0.2) {
    return { multiplier: 1.5, label: 'Sharp', tier: 'sharp' };
  }
  return { multiplier: 1.0, label: 'On Time', tier: 'standard' };
}

export function formatTacticalCountdown(remainingMs: number): string {
  const clamped = Math.max(0, remainingMs);
  if (clamped === 0) return '0:00';
  if (clamped < 10_000) {
    return `0:0${(clamped / 1000).toFixed(1)}`;
  }
  const totalSec = Math.ceil(clamped / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function formatSolveDuration(solveMs: number): string {
  const clamped = Math.max(100, solveMs);
  if (clamped < 60_000) {
    return `${(clamped / 1000).toFixed(1)}s`;
  }
  const totalSec = Math.round(clamped / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

// ==================== PERFORMANCE STATISTICS & PERSISTENCE ====================

export interface PuzzleAttemptRecord {
  solved: boolean;
  clean: boolean;
  attempts: number;
  lastPlayedIso: string;
  bestSolveMs?: number;
  bestScore?: number;
  bestMultiplier?: number;
}

export interface ThemeStatBucket {
  attempted: number;
  solved: number;
  clean: number;
}

export interface RecentTacticalHistoryEntry {
  puzzleId: string;
  title: string;
  theme: TacticalTheme;
  puzzleRating: number;
  solved: boolean;
  clean: boolean;
  ratingDelta: number;
  timestamp: number;
  solveMs?: number;
  multiplier?: number;
  pointsAwarded?: number;
}

export interface TacticalTrainingStats {
  rating: number;
  totalScore: number;
  attemptedCount: number;
  solvedCount: number;
  cleanSolvedCount: number;
  currentStreak: number;
  bestStreak: number;
  hintsUsed: number;
  totalSolveMs: number;
  timedSolveCount: number;
  fastestSolveMs: number | null;
  bestMultiplier: number;
  puzzleRecords: Record<string, PuzzleAttemptRecord>;
  themeStats: Record<TacticalTheme, ThemeStatBucket>;
  recentHistory: RecentTacticalHistoryEntry[];
}

const TACTICAL_STATS_STORAGE_KEY = 'chess_angel_tactical_stats_v1';
const INITIAL_TACTICAL_RATING = 1200;

function createEmptyThemeStats(): Record<TacticalTheme, ThemeStatBucket> {
  return {
    fork: { attempted: 0, solved: 0, clean: 0 },
    pin: { attempted: 0, solved: 0, clean: 0 },
    mate: { attempted: 0, solved: 0, clean: 0 },
    sacrifice: { attempted: 0, solved: 0, clean: 0 },
    discovered: { attempted: 0, solved: 0, clean: 0 },
    deflection: { attempted: 0, solved: 0, clean: 0 },
  };
}

export function createInitialTacticalStats(): TacticalTrainingStats {
  return {
    rating: INITIAL_TACTICAL_RATING,
    totalScore: 0,
    attemptedCount: 0,
    solvedCount: 0,
    cleanSolvedCount: 0,
    currentStreak: 0,
    bestStreak: 0,
    hintsUsed: 0,
    totalSolveMs: 0,
    timedSolveCount: 0,
    fastestSolveMs: null,
    bestMultiplier: 1.0,
    puzzleRecords: {},
    themeStats: createEmptyThemeStats(),
    recentHistory: [],
  };
}

export function loadTacticalStats(): TacticalTrainingStats {
  if (typeof window === 'undefined') return createInitialTacticalStats();
  try {
    const raw = window.localStorage.getItem(TACTICAL_STATS_STORAGE_KEY);
    if (!raw) return createInitialTacticalStats();
    const parsed = JSON.parse(raw) as Partial<TacticalTrainingStats>;
    const defaults = createInitialTacticalStats();
    return {
      rating: typeof parsed.rating === 'number' ? parsed.rating : defaults.rating,
      totalScore: typeof parsed.totalScore === 'number' ? parsed.totalScore : defaults.totalScore,
      attemptedCount:
        typeof parsed.attemptedCount === 'number' ? parsed.attemptedCount : defaults.attemptedCount,
      solvedCount: typeof parsed.solvedCount === 'number' ? parsed.solvedCount : defaults.solvedCount,
      cleanSolvedCount:
        typeof parsed.cleanSolvedCount === 'number'
          ? parsed.cleanSolvedCount
          : defaults.cleanSolvedCount,
      currentStreak:
        typeof parsed.currentStreak === 'number' ? parsed.currentStreak : defaults.currentStreak,
      bestStreak: typeof parsed.bestStreak === 'number' ? parsed.bestStreak : defaults.bestStreak,
      hintsUsed: typeof parsed.hintsUsed === 'number' ? parsed.hintsUsed : defaults.hintsUsed,
      totalSolveMs:
        typeof parsed.totalSolveMs === 'number' ? parsed.totalSolveMs : defaults.totalSolveMs,
      timedSolveCount:
        typeof parsed.timedSolveCount === 'number'
          ? parsed.timedSolveCount
          : defaults.timedSolveCount,
      fastestSolveMs:
        typeof parsed.fastestSolveMs === 'number' && parsed.fastestSolveMs > 0
          ? parsed.fastestSolveMs
          : defaults.fastestSolveMs,
      bestMultiplier:
        typeof parsed.bestMultiplier === 'number' && parsed.bestMultiplier > 0
          ? parsed.bestMultiplier
          : defaults.bestMultiplier,
      puzzleRecords:
        parsed.puzzleRecords && typeof parsed.puzzleRecords === 'object'
          ? parsed.puzzleRecords
          : {},
      themeStats: {
        ...defaults.themeStats,
        ...(parsed.themeStats || {}),
      },
      recentHistory: Array.isArray(parsed.recentHistory) ? parsed.recentHistory.slice(0, 20) : [],
    };
  } catch {
    return createInitialTacticalStats();
  }
}

export function persistTacticalStats(stats: TacticalTrainingStats): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TACTICAL_STATS_STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // Ignore quota errors
  }
}

export function resetTacticalStats(): TacticalTrainingStats {
  const fresh = createInitialTacticalStats();
  persistTacticalStats(fresh);
  return fresh;
}

function computeEloDelta(playerRating: number, puzzleRating: number, score: number): number {
  const expected = 1 / (1 + Math.pow(10, (puzzleRating - playerRating) / 400));
  return Math.round(28 * (score - expected));
}

/**
 * Records the first mistake/solution-reveal on an active puzzle attempt so repeated retries
 * on the same puzzle do not penalize rating multiple times.
 */
export function recordTacticalMistakeOrReveal(
  prev: TacticalTrainingStats,
  puzzle: TacticalPuzzle,
): { next: TacticalTrainingStats; ratingDelta: number } {
  const delta = Math.min(-4, computeEloDelta(prev.rating, puzzle.rating, 0));
  const nextRating = Math.max(600, prev.rating + delta);
  const existingRec = prev.puzzleRecords[puzzle.id];
  const prevBucket = prev.themeStats[puzzle.theme] || { attempted: 0, solved: 0, clean: 0 };

  const next: TacticalTrainingStats = {
    ...prev,
    rating: nextRating,
    attemptedCount: prev.attemptedCount + 1,
    currentStreak: 0,
    puzzleRecords: {
      ...prev.puzzleRecords,
      [puzzle.id]: {
        ...existingRec,
        solved: Boolean(existingRec?.solved),
        clean: Boolean(existingRec?.clean),
        attempts: (existingRec?.attempts || 0) + 1,
        lastPlayedIso: new Date().toISOString(),
      },
    },
    themeStats: {
      ...prev.themeStats,
      [puzzle.theme]: {
        ...prevBucket,
        attempted: prevBucket.attempted + 1,
      },
    },
    recentHistory: [
      {
        puzzleId: puzzle.id,
        title: puzzle.title,
        theme: puzzle.theme,
        puzzleRating: puzzle.rating,
        solved: false,
        clean: false,
        ratingDelta: delta,
        timestamp: Date.now(),
      },
      ...prev.recentHistory,
    ].slice(0, 20),
  };
  persistTacticalStats(next);
  return { next, ratingDelta: delta };
}

/**
 * Records a completed puzzle solve, including countdown speed multiplier and score points.
 */
export function recordTacticalSolve(
  prev: TacticalTrainingStats,
  puzzle: TacticalPuzzle,
  opts: {
    hadMistake: boolean;
    usedHint: boolean;
    solveMs: number;
    remainingMs: number;
    timeLimitMs: number;
  },
): { next: TacticalTrainingStats; ratingDelta: number; award: TacticalSolveAward } {
  const timedOut = opts.remainingMs <= 0;
  const isClean = !opts.hadMistake && !opts.usedHint;
  const existingRec = prev.puzzleRecords[puzzle.id];
  const alreadyCleanBefore = Boolean(existingRec?.clean);
  const alreadySolvedBefore = Boolean(existingRec?.solved);

  const speedTier = computeTacticalSpeedMultiplier(opts.remainingMs, opts.timeLimitMs);
  const basePoints = getPuzzleBasePoints(puzzle.difficulty);

  // Determine effective multiplier & score award
  let effectiveMultiplier = speedTier.multiplier;
  let effectiveTierLabel = speedTier.label;
  let rawPoints = basePoints * effectiveMultiplier;

  if (opts.hadMistake) {
    effectiveMultiplier = timedOut ? 0.5 : 1.0;
    effectiveTierLabel = timedOut ? 'Overtime' : 'Recovered';
    rawPoints = basePoints * 0.4 * (timedOut ? 0.5 : 1.0);
  } else if (opts.usedHint) {
    effectiveMultiplier = Math.min(1.5, speedTier.multiplier);
    rawPoints = basePoints * effectiveMultiplier * 0.6;
  }

  // Repeat practice solves award 25% points while still tracking personal best solve time
  const pointsAwarded = Math.max(
    10,
    Math.round(alreadySolvedBefore ? rawPoints * 0.25 : rawPoints),
  );

  let ratingDelta = 0;
  if (isClean) {
    ratingDelta = alreadyCleanBefore
      ? 2
      : Math.max(5, computeEloDelta(prev.rating, puzzle.rating, 1));
  } else if (!opts.hadMistake && opts.usedHint) {
    ratingDelta = alreadyCleanBefore ? 1 : 4;
  }

  const nextRating = Math.max(600, prev.rating + ratingDelta);
  const nextStreak =
    isClean && !timedOut ? prev.currentStreak + 1 : opts.hadMistake ? 0 : prev.currentStreak;
  const nextBestStreak = Math.max(prev.bestStreak, nextStreak);
  const prevBucket = prev.themeStats[puzzle.theme] || { attempted: 0, solved: 0, clean: 0 };

  const countNewAttempt = !opts.hadMistake;
  const normalizedSolveMs = Math.max(100, Math.round(opts.solveMs));
  const prevBestSolveMs = existingRec?.bestSolveMs;
  const isNewBestTime =
    prevBestSolveMs === undefined || normalizedSolveMs < prevBestSolveMs;
  const nextRecordBestSolveMs = isNewBestTime ? normalizedSolveMs : prevBestSolveMs;
  const nextRecordBestScore = Math.max(existingRec?.bestScore || 0, pointsAwarded);
  const nextRecordBestMultiplier = Math.max(
    existingRec?.bestMultiplier || 0,
    effectiveMultiplier,
  );
  const nextFastestSolveMs =
    prev.fastestSolveMs === null
      ? normalizedSolveMs
      : Math.min(prev.fastestSolveMs, normalizedSolveMs);

  const award: TacticalSolveAward = {
    pointsAwarded,
    basePoints,
    multiplier: effectiveMultiplier,
    tierLabel: effectiveTierLabel,
    solveMs: normalizedSolveMs,
    timedOut,
    isNewBestTime: Boolean(prevBestSolveMs !== undefined && isNewBestTime),
  };

  const next: TacticalTrainingStats = {
    ...prev,
    rating: nextRating,
    totalScore: prev.totalScore + pointsAwarded,
    attemptedCount: prev.attemptedCount + (countNewAttempt ? 1 : 0),
    solvedCount: prev.solvedCount + 1,
    cleanSolvedCount: prev.cleanSolvedCount + (isClean ? 1 : 0),
    currentStreak: nextStreak,
    bestStreak: nextBestStreak,
    totalSolveMs: prev.totalSolveMs + normalizedSolveMs,
    timedSolveCount: prev.timedSolveCount + 1,
    fastestSolveMs: nextFastestSolveMs,
    bestMultiplier: Math.max(prev.bestMultiplier, effectiveMultiplier),
    puzzleRecords: {
      ...prev.puzzleRecords,
      [puzzle.id]: {
        solved: true,
        clean: alreadyCleanBefore || isClean,
        attempts: (existingRec?.attempts || 0) + (countNewAttempt ? 1 : 0),
        lastPlayedIso: new Date().toISOString(),
        bestSolveMs: nextRecordBestSolveMs,
        bestScore: nextRecordBestScore,
        bestMultiplier: nextRecordBestMultiplier,
      },
    },
    themeStats: {
      ...prev.themeStats,
      [puzzle.theme]: {
        attempted: prevBucket.attempted + (countNewAttempt ? 1 : 0),
        solved: prevBucket.solved + 1,
        clean: prevBucket.clean + (isClean ? 1 : 0),
      },
    },
    recentHistory: [
      {
        puzzleId: puzzle.id,
        title: puzzle.title,
        theme: puzzle.theme,
        puzzleRating: puzzle.rating,
        solved: true,
        clean: isClean,
        ratingDelta,
        timestamp: Date.now(),
        solveMs: normalizedSolveMs,
        multiplier: effectiveMultiplier,
        pointsAwarded,
      },
      ...prev.recentHistory,
    ].slice(0, 20),
  };
  persistTacticalStats(next);
  return { next, ratingDelta, award };
}

export function recordTacticalHintUsed(prev: TacticalTrainingStats): TacticalTrainingStats {
  const next: TacticalTrainingStats = {
    ...prev,
    hintsUsed: prev.hintsUsed + 1,
  };
  persistTacticalStats(next);
  return next;
}

// ==================== PUZZLE MOVE VALIDATION ====================

export interface PuzzleMoveEvaluation {
  legal: boolean;
  correct: boolean;
  completedPuzzle: boolean;
  san: string;
  uci: string;
  nextFen: string;
  captured?: PieceType;
  inCheck: boolean;
  isCheckmate: boolean;
}

export function evaluateTacticalMoveAttempt(
  currentFen: string,
  from: string,
  to: string,
  promotion: PieceType | undefined,
  puzzle: TacticalPuzzle,
  stepIndex: number,
): PuzzleMoveEvaluation {
  const chess = new Chess(currentFen);
  try {
    const move = chess.move({ from, to, promotion: promotion || 'q' });
    if (!move) {
      return {
        legal: false,
        correct: false,
        completedPuzzle: false,
        san: '',
        uci: '',
        nextFen: currentFen,
        inCheck: false,
        isCheckmate: false,
      };
    }

    const playedUci = `${move.from}${move.to}${move.promotion || ''}`;
    const expectedUci = puzzle.solutionUci[stepIndex] || '';
    const isImmediateMate = chess.isCheckmate();

    // Accept exact expected solution move OR any legal checkmate in 1 (e.g. alternate mate on final ply)
    const isCorrect = playedUci === expectedUci || isImmediateMate;
    const isFinalPly = stepIndex >= puzzle.solutionUci.length - 1 || isImmediateMate;

    return {
      legal: true,
      correct: isCorrect,
      completedPuzzle: isCorrect && isFinalPly,
      san: move.san,
      uci: playedUci,
      nextFen: chess.fen(),
      captured: move.captured as PieceType | undefined,
      inCheck: chess.inCheck(),
      isCheckmate: isImmediateMate,
    };
  } catch {
    return {
      legal: false,
      correct: false,
      completedPuzzle: false,
      san: '',
      uci: '',
      nextFen: currentFen,
      inCheck: false,
      isCheckmate: false,
    };
  }
}

export function uciToSanInPosition(fen: string, uci: string): string {
  if (!uci || uci.length < 4) return uci;
  try {
    const chess = new Chess(fen);
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = (uci.slice(4, 5) || undefined) as PieceType | undefined;
    const move = chess.move({ from, to, promotion });
    return move ? move.san : uci;
  } catch {
    return uci;
  }
}
