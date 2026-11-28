import { Chess, type PieceSymbol } from 'chess.js';
import type { EngineLine, PieceColor, SearchTreeEdge } from '../shared/types';

export interface SimulationEvalColorSpec {
  hex: number;
  cssHex: string;
  badgeLabel: string;
  textClass: string;
  borderClass: string;
  dotBgClass: string;
}

/**
 * Assigns a clear, high-contrast color tier to each evaluated simulation on #000000 black,
 * matching both the 3D search-tree lines and the simulation browser UI.
 */
export function getSimulationColorSpec(
  index: number,
  line: EngineLine,
  bestLine: EngineLine | undefined,
  moverColor: PieceColor,
): SimulationEvalColorSpec {
  const sign = moverColor === 'w' ? 1 : -1;
  const bestMoverCp = bestLine ? bestLine.scoreCp * sign : line.scoreCp * sign;
  const lineMoverCp = line.scoreCp * sign;
  const cpDrop = Math.max(0, Math.round(bestMoverCp - lineMoverCp));

  if (index === 0) {
    return {
      hex: 0xfff099,
      cssHex: '#fff099',
      badgeLabel: 'Best #1',
      textClass: 'text-[#fff099]',
      borderClass: 'border-[#f4c45a]/70',
      dotBgClass: 'bg-[#fff099]',
    };
  }
  if (index === 1 || cpDrop <= 35) {
    return {
      hex: 0x38bdf8,
      cssHex: '#38bdf8',
      badgeLabel: index < 3 ? `Best #${index + 1}` : 'Strong',
      textClass: 'text-[#7dd3fc]',
      borderClass: 'border-[#38bdf8]/65',
      dotBgClass: 'bg-[#38bdf8]',
    };
  }
  if (index === 2 || cpDrop <= 95) {
    return {
      hex: 0xa78bfa,
      cssHex: '#a78bfa',
      badgeLabel: index === 2 ? 'Best #3' : 'Playable',
      textClass: 'text-[#c4b5fd]',
      borderClass: 'border-[#a78bfa]/65',
      dotBgClass: 'bg-[#a78bfa]',
    };
  }
  if (cpDrop <= 185) {
    return {
      hex: 0xf4c45a,
      cssHex: '#f4c45a',
      badgeLabel: 'Inaccuracy',
      textClass: 'text-[#fcd34d]',
      borderClass: 'border-[#f4c45a]/55',
      dotBgClass: 'bg-[#f4c45a]',
    };
  }
  return {
    hex: 0xfb7185,
    cssHex: '#fb7185',
    badgeLabel: 'Rejected',
    textClass: 'text-[#fda4af]',
    borderClass: 'border-[#fb7185]/60',
    dotBgClass: 'bg-[#fb7185]',
  };
}

/**
 * Extracts synthetic SearchTreeEdge[] from the top 3 evaluated PV lines so the
 * "Only 3 Best Evaluations" mode can render clean multi-ply colored lines in 3D and JPEG.
 */
export function buildTopThreeEdges(topLines: EngineLine[]): SearchTreeEdge[] {
  const edges: SearchTreeEdge[] = [];
  const seen = new Set<string>();
  const slice = topLines.slice(0, 3);
  slice.forEach((line, lineIdx) => {
    line.pvUci.slice(0, 4).forEach((uci, plyIdx) => {
      if (uci.length < 4) return;
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const key = `${lineIdx}:${plyIdx}:${from}${to}`;
      if (seen.has(key)) return;
      seen.add(key);
      edges.push({
        from,
        to,
        ply: lineIdx === 0 ? 0 : lineIdx === 1 ? 1 : 3,
        chosen: lineIdx === 0,
      });
    });
  });
  return edges;
}

const FOLLOWUP_PIECE_VALUE: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

function scoreQuickFollowUpMove(mv: {
  captured?: string;
  piece: string;
  san: string;
  to: string;
  promotion?: string;
}): number {
  let score = 0;
  if (mv.san.includes('#')) score += 100000;
  if (mv.captured) {
    score +=
      (FOLLOWUP_PIECE_VALUE[mv.captured] ?? 100) * 10 -
      (FOLLOWUP_PIECE_VALUE[mv.piece] ?? 100);
  }
  if (mv.promotion) score += 800;
  if (mv.san.includes('+')) score += 140;
  const fileIdx = mv.to.charCodeAt(0) - 97;
  const rankIdx = Number(mv.to[1]) - 1;
  const centerDist = Math.abs(fileIdx - 3.5) + Math.abs(rankIdx - 3.5);
  score += Math.round((7 - centerDist) * 12);
  return score;
}

/**
 * Resolves a single candidate thinking line into a guaranteed legal, multi-ply
 * follow-up sequence (extending short TT PVs up to `minPlies` when legal moves exist)
 * with per-ply color-coded SearchTreeEdge entries (ply 0 = gold, 1 = cyan, 2 = violet, 3+ = coral).
 */
export function resolveLineFollowUpSequence(
  line: EngineLine,
  rootFen?: string,
  maxPlies = 5,
  minPlies = 4,
): {
  pvUci: string[];
  pvSan: string[];
  edges: SearchTreeEdge[];
} {
  const rawUci =
    line.pvUci && line.pvUci.length > 0
      ? line.pvUci.slice(0, maxPlies)
      : line.bestMoveUci && line.bestMoveUci.length >= 4
        ? [line.bestMoveUci]
        : [];

  const pvUci: string[] = [];
  const pvSan: string[] = [];

  if (rootFen) {
    try {
      const sim = new Chess(rootFen);
      for (const uci of rawUci) {
        if (uci.length < 4) break;
        const mv = sim.move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          promotion: (uci.slice(4, 5) || undefined) as 'q' | 'r' | 'b' | 'n' | undefined,
        });
        if (!mv) break;
        pvUci.push(`${mv.from}${mv.to}${mv.promotion || ''}`);
        pvSan.push(mv.san);
      }

      // If the engine's transposition table cut the branch short, extend cleanly with strong legal replies
      while (pvUci.length > 0 && pvUci.length < minPlies) {
        const legal = sim.moves({ verbose: true });
        if (legal.length === 0) break;
        let bestMove = legal[0];
        let bestScore = scoreQuickFollowUpMove(bestMove);
        for (let i = 1; i < legal.length; i++) {
          const s = scoreQuickFollowUpMove(legal[i]);
          if (s > bestScore) {
            bestScore = s;
            bestMove = legal[i];
          }
        }
        const applied = sim.move({
          from: bestMove.from,
          to: bestMove.to,
          promotion: bestMove.promotion,
        });
        if (!applied) break;
        pvUci.push(`${applied.from}${applied.to}${applied.promotion || ''}`);
        pvSan.push(applied.san);
      }
    } catch {
      // Fallback below if rootFen is invalid
    }
  }

  if (pvUci.length === 0) {
    for (let i = 0; i < rawUci.length; i++) {
      const uci = rawUci[i];
      if (uci.length < 4) continue;
      pvUci.push(uci);
      pvSan.push(line.pvSan?.[i] || uci);
    }
  }

  const edges: SearchTreeEdge[] = [];
  pvUci.forEach((uci, plyIdx) => {
    if (uci.length < 4) return;
    edges.push({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ply: Math.min(3, plyIdx),
      chosen: false,
    });
  });

  return { pvUci, pvSan, edges };
}

export interface SchematicSegment {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  hex: number;
  alpha: number;
  widthScale: number;
}

export interface SchematicCircle {
  cx: number;
  cz: number;
  r: number;
  hex: number;
  alpha: number;
  widthScale: number;
}

function addPolyline(
  out: SchematicSegment[],
  pts: Array<[number, number]>,
  closed: boolean,
  ox: number,
  oz: number,
  hex: number,
  alpha: number,
  widthScale: number,
): void {
  for (let i = 0; i < pts.length - 1; i++) {
    out.push({
      x0: ox + pts[i][0],
      z0: oz + pts[i][1],
      x1: ox + pts[i + 1][0],
      z1: oz + pts[i + 1][1],
      hex,
      alpha,
      widthScale,
    });
  }
  if (closed && pts.length >= 3) {
    const last = pts[pts.length - 1];
    const first = pts[0];
    out.push({
      x0: ox + last[0],
      z0: oz + last[1],
      x1: ox + first[0],
      z1: oz + first[1],
      hex,
      alpha,
      widthScale,
    });
  }
}

function addPieceWireframe(
  type: PieceSymbol,
  color: PieceColor,
  cx: number,
  cz: number,
  segments: SchematicSegment[],
  circles: SchematicCircle[],
): void {
  // White pieces: warm ivory line; Black pieces: cool slate line + subtle inner hatch (no outer circles around pieces)
  const hex = color === 'w' ? 0xe8e2d5 : 0xa5b9cf;
  const glyphAlpha = color === 'w' ? 0.68 : 0.62;

  if (type === 'p') {
    addPolyline(
      segments,
      [
        [-0.15, 0.22],
        [0.15, 0.22],
        [0.12, 0.17],
        [-0.12, 0.17],
      ],
      true,
      cx,
      cz,
      hex,
      glyphAlpha,
      0.9,
    );
    addPolyline(
      segments,
      [
        [-0.1, 0.17],
        [-0.055, -0.01],
        [0.055, -0.01],
        [0.1, 0.17],
      ],
      false,
      cx,
      cz,
      hex,
      glyphAlpha,
      0.9,
    );
    addPolyline(
      segments,
      [
        [-0.095, -0.01],
        [0.095, -0.01],
      ],
      false,
      cx,
      cz,
      hex,
      glyphAlpha,
      0.85,
    );
    circles.push({ cx, cz: cz - 0.105, r: 0.082, hex, alpha: glyphAlpha, widthScale: 0.9 });
    if (color === 'b') {
      addPolyline(
        segments,
        [
          [0, 0.17],
          [0, 0.01],
        ],
        false,
        cx,
        cz,
        hex,
        glyphAlpha * 0.65,
        0.7,
      );
    }
  } else if (type === 'r') {
    addPolyline(
      segments,
      [
        [-0.18, 0.23],
        [0.18, 0.23],
        [0.15, 0.17],
        [-0.15, 0.17],
      ],
      true,
      cx,
      cz,
      hex,
      glyphAlpha,
      0.9,
    );
    addPolyline(
      segments,
      [
        [-0.125, 0.17],
        [-0.115, -0.08],
      ],
      false,
      cx,
      cz,
      hex,
      glyphAlpha,
      0.9,
    );
    addPolyline(
      segments,
      [
        [0.125, 0.17],
        [0.115, -0.08],
      ],
      false,
      cx,
      cz,
      hex,
      glyphAlpha,
      0.9,
    );
    addPolyline(
      segments,
      [
        [-0.155, -0.08],
        [-0.155, -0.21],
        [-0.085, -0.21],
        [-0.085, -0.14],
        [-0.035, -0.14],
        [-0.035, -0.21],
        [0.035, -0.21],
        [0.035, -0.14],
        [0.085, -0.14],
        [0.085, -0.21],
        [0.155, -0.21],
        [0.155, -0.08],
      ],
      true,
      cx,
      cz,
      hex,
      glyphAlpha,
      0.9,
    );
    if (color === 'b') {
      addPolyline(
        segments,
        [
          [-0.05, 0.15],
          [-0.05, -0.06],
        ],
        false,
        cx,
        cz,
        hex,
        glyphAlpha * 0.6,
        0.7,
      );
      addPolyline(
        segments,
        [
          [0.05, 0.15],
          [0.05, -0.06],
        ],
        false,
        cx,
        cz,
        hex,
        glyphAlpha * 0.6,
        0.7,
      );
    }
  } else if (type === 'n') {
    addPolyline(
      segments,
      [
        [-0.18, 0.23],
        [0.18, 0.23],
        [0.14, 0.17],
        [-0.14, 0.17],
      ],
      true,
      cx,
      cz,
      hex,
      glyphAlpha,
      0.9,
    );
    addPolyline(
      segments,
      [
        [-0.12, 0.17],
        [-0.145, 0.03],
        [-0.11, -0.11],
        [-0.045, -0.2],
        [-0.015, -0.25],
        [0.035, -0.195],
        [0.135, -0.135],
        [0.18, -0.065],
        [0.135, -0.025],
        [0.045, -0.045],
        [0.015, 0.025],
        [0.105, 0.105],
        [0.13, 0.17],
      ],
      false,
      cx,
      cz,
      hex,
      glyphAlpha,
      0.9,
    );
    circles.push({ cx: cx + 0.03, cz: cz - 0.13, r: 0.018, hex, alpha: glyphAlpha, widthScale: 0.75 });
    if (color === 'b') {
      addPolyline(
        segments,
        [
          [-0.075, 0.13],
          [-0.095, -0.01],
          [-0.045, -0.13],
        ],
        false,
        cx,
        cz,
        hex,
        glyphAlpha * 0.65,
        0.7,
      );
    }
  } else if (type === 'b') {
    addPolyline(
      segments,
      [
        [-0.17, 0.23],
        [0.17, 0.23],
        [0.135, 0.17],
        [-0.135, 0.17],
      ],
      true,
      cx,
      cz,
      hex,
      glyphAlpha,
      0.9,
    );
    addPolyline(
      segments,
      [
        [-0.12, 0.17],
        [-0.085, 0.09],
        [0.085, 0.09],
        [0.12, 0.17],
      ],
      false,
      cx,
      cz,
      hex,
      glyphAlpha,
      0.9,
    );
    addPolyline(
      segments,
      [
        [-0.085, 0.09],
        [-0.125, -0.02],
        [-0.085, -0.13],
        [0, -0.205],
        [0.085, -0.13],
        [0.125, -0.02],
        [0.085, 0.09],
      ],
      false,
      cx,
      cz,
      hex,
      glyphAlpha,
      0.9,
    );
    circles.push({ cx, cz: cz - 0.24, r: 0.03, hex, alpha: glyphAlpha, widthScale: 0.85 });
    // Classic mitre slit / cross
    addPolyline(
      segments,
      [
        [-0.035, -0.045],
        [0.035, -0.045],
      ],
      false,
      cx,
      cz,
      hex,
      glyphAlpha * 0.85,
      0.75,
    );
    addPolyline(
      segments,
      [
        [0, -0.085],
        [0, -0.005],
      ],
      false,
      cx,
      cz,
      hex,
      glyphAlpha * 0.85,
      0.75,
    );
  } else if (type === 'q') {
    addPolyline(
      segments,
      [
        [-0.19, 0.23],
        [0.19, 0.23],
        [0.155, 0.17],
        [-0.155, 0.17],
      ],
      true,
      cx,
      cz,
      hex,
      glyphAlpha,
      0.9,
    );
    addPolyline(
      segments,
      [
        [-0.145, 0.17],
        [-0.215, -0.105],
        [-0.105, 0.03],
        [-0.095, -0.175],
        [-0.03, 0.02],
        [0, -0.205],
        [0.03, 0.02],
        [0.095, -0.175],
        [0.105, 0.03],
        [0.215, -0.105],
        [0.145, 0.17],
      ],
      true,
      cx,
      cz,
      hex,
      glyphAlpha,
      0.9,
    );
    const pearls: Array<[number, number]> = [
      [-0.215, -0.13],
      [-0.095, -0.2],
      [0, -0.23],
      [0.095, -0.2],
      [0.215, -0.13],
    ];
    for (const [px, pz] of pearls) {
      circles.push({
        cx: cx + px,
        cz: cz + pz,
        r: 0.02,
        hex,
        alpha: glyphAlpha,
        widthScale: 0.8,
      });
    }
  } else if (type === 'k') {
    addPolyline(
      segments,
      [
        [-0.19, 0.24],
        [0.19, 0.24],
        [0.155, 0.18],
        [-0.155, 0.18],
      ],
      true,
      cx,
      cz,
      hex,
      glyphAlpha,
      0.9,
    );
    addPolyline(
      segments,
      [
        [-0.145, 0.18],
        [-0.195, -0.02],
        [-0.115, -0.11],
        [0, -0.13],
        [0.115, -0.11],
        [0.195, -0.02],
        [0.145, 0.18],
      ],
      true,
      cx,
      cz,
      hex,
      glyphAlpha,
      0.9,
    );
    // Center crown rib + unmistakable cross finial
    addPolyline(
      segments,
      [
        [0, 0.18],
        [0, -0.27],
      ],
      false,
      cx,
      cz,
      hex,
      glyphAlpha,
      0.9,
    );
    addPolyline(
      segments,
      [
        [-0.065, -0.21],
        [0.065, -0.21],
      ],
      false,
      cx,
      cz,
      hex,
      glyphAlpha,
      0.9,
    );
  }
}

/**
 * Generates ultra-thin technical schematic geometry for the 8x8 chessboard grid,
 * dark-square corner ticks, outer frame, and every piece in `fen` on #000000 black.
 */
export function buildSchematicUnderlay(fen?: string): {
  segments: SchematicSegment[];
  circles: SchematicCircle[];
} {
  const segments: SchematicSegment[] = [];
  const circles: SchematicCircle[] = [];

  // 1. Outer architectural frame (-4.11 .. +4.11) & inner board boundary (-4.0 .. +4.0)
  addPolyline(
    segments,
    [
      [-4.11, -4.11],
      [4.11, -4.11],
      [4.11, 4.11],
      [-4.11, 4.11],
    ],
    true,
    0,
    0,
    0xd6ae63,
    0.44,
    0.95,
  );

  // 2. Thin 8x8 chessboard grid (-4.0 .. +4.0)
  for (let i = 0; i <= 8; i++) {
    const c = -4.0 + i;
    const isBorder = i === 0 || i === 8;
    const hex = isBorder ? 0xe2e8f0 : 0xcbd5e1;
    const alpha = isBorder ? 0.44 : 0.31;
    const widthScale = isBorder ? 1.0 : 0.84;
    // Vertical file line
    segments.push({ x0: c, z0: -4.0, x1: c, z1: 4.0, hex, alpha, widthScale });
    // Horizontal rank line
    segments.push({ x0: -4.0, z0: c, x1: 4.0, z1: c, hex, alpha, widthScale });
  }

  // 3. Subtle diagonal corner ticks on dark squares (thin lines, zero solid fill)
  for (let fileIdx = 0; fileIdx < 8; fileIdx++) {
    for (let rankIdx = 0; rankIdx < 8; rankIdx++) {
      const isDark = (fileIdx + rankIdx) % 2 === 0; // a1 (0+0=0) is dark
      if (!isDark) continue;
      const sx = fileIdx - 3.5;
      const sz = 3.5 - rankIdx;
      segments.push({
        x0: sx - 0.48,
        z0: sz + 0.36,
        x1: sx - 0.36,
        z1: sz + 0.48,
        hex: 0x94a3b8,
        alpha: 0.23,
        widthScale: 0.72,
      });
      segments.push({
        x0: sx + 0.36,
        z0: sz - 0.48,
        x1: sx + 0.48,
        z1: sz - 0.36,
        hex: 0x94a3b8,
        alpha: 0.23,
        widthScale: 0.72,
      });
    }
  }

  // 4. Ultra-thin wireframe silhouettes of every piece in the FEN
  if (fen) {
    try {
      const chess = new Chess(fen);
      const board = chess.board();
      for (let r = 0; r < 8; r++) {
        const rankIdx = 7 - r; // row 0 is rank 8 (rankIdx 7), row 7 is rank 1 (rankIdx 0)
        for (let f = 0; f < 8; f++) {
          const cell = board[r][f];
          if (!cell) continue;
          const cx = f - 3.5;
          const cz = 3.5 - rankIdx;
          addPieceWireframe(cell.type, cell.color, cx, cz, segments, circles);
        }
      }
    } catch {
      // ignore invalid FEN
    }
  }

  return { segments, circles };
}

function squareToWorld2D(sq: string): [number, number] {
  const fileIdx = sq.charCodeAt(0) - 97;
  const rankIdx = Number(sq[1]) - 1;
  return [fileIdx - 3.5, 3.5 - rankIdx];
}

function hexToCss(hex: number, scale = 1, alpha = 1): string {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * scale));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * scale));
  const b = Math.min(255, Math.round((hex & 255) * scale));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const FILE_LABELS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANK_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8'];

/**
 * Draws the lines of a Chess Angel thinking tree in frontal orthographic top view
 * on a pure #000000 black background with a delicate, ultra-thin technical line underlay
 * of the 8x8 chessboard, coordinates, and pieces from `fen` directly onto `canvas`.
 */
export function drawSearchTreeTopViewOnCanvas(
  canvas: HTMLCanvasElement,
  edges: SearchTreeEdge[],
  fen?: string,
): void {
  const size = Math.max(512, canvas.width || 1600);
  if (canvas.width !== size) canvas.width = size;
  if (canvas.height !== size) canvas.height = size;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;

  const scaleFactor = size / 2048;

  // Strictly pure #000000 black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const worldExtent = 4.42;
  const toPx = (wx: number, wz: number): [number, number] => [
    ((wx + worldExtent) / (2 * worldExtent)) * size,
    ((wz + worldExtent) / (2 * worldExtent)) * size,
  ];
  const worldLenToPx = (len: number): number => (len / (2 * worldExtent)) * size;

  // 1. Draw thin-line chessboard & piece schematic underlay
  const underlay = buildSchematicUnderlay(fen);
  for (const seg of underlay.segments) {
    const [x0, y0] = toPx(seg.x0, seg.z0);
    const [x1, y1] = toPx(seg.x1, seg.z1);
    ctx.lineWidth = Math.max(1.2, 2.3 * seg.widthScale * scaleFactor);
    ctx.strokeStyle = hexToCss(seg.hex, 1, seg.alpha);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  for (const cir of underlay.circles) {
    const [cx, cy] = toPx(cir.cx, cir.cz);
    const rPx = worldLenToPx(cir.r);
    ctx.lineWidth = Math.max(1.2, 2.3 * cir.widthScale * scaleFactor);
    ctx.strokeStyle = hexToCss(cir.hex, 1, cir.alpha);
    ctx.beginPath();
    ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Subtle coordinate labels around the outer margin
  ctx.font = `400 ${Math.round(24 * scaleFactor)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  ctx.fillStyle = 'rgba(203, 213, 225, 0.44)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let f = 0; f < 8; f++) {
    const [bx, by] = toPx(f - 3.5, 4.26);
    const [tx, ty] = toPx(f - 3.5, -4.26);
    ctx.fillText(FILE_LABELS[f], bx, by);
    ctx.fillText(FILE_LABELS[f], tx, ty);
  }
  for (let r = 0; r < 8; r++) {
    const [lx, ly] = toPx(-4.26, 3.5 - r);
    const [rx, ry] = toPx(4.26, 3.5 - r);
    ctx.fillText(RANK_LABELS[r], lx, ly);
    ctx.fillText(RANK_LABELS[r], rx, ry);
  }

  // 2. Draw bright colored thinking-tree lines on top of the schematic underlay
  const valid = edges.filter((e) => e.from.length >= 2 && e.to.length >= 2 && e.from !== e.to);
  const ordered = valid
    .map((e, idx) => ({ e, idx }))
    .sort((a, b) => (a.e.ply !== b.e.ply ? a.e.ply - b.e.ply : a.idx - b.idx))
    .map((x, orderedIdx) => ({
      edge: x.e,
      orderedIdx,
      layerY: x.e.ply * 0.004 + (x.e.chosen ? 0.02 : 0),
    }))
    .sort((a, b) => (a.layerY !== b.layerY ? a.layerY - b.layerY : a.orderedIdx - b.orderedIdx));

  for (const { edge, orderedIdx } of ordered) {
    const [startX, startZ] = squareToWorld2D(edge.from);
    const [endX, endZ] = squareToWorld2D(edge.to);
    const dx = endX - startX;
    const dz = endZ - startZ;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.2) continue;

    const dirX = dx / dist;
    const dirZ = dz / dist;
    const perpX = -dirZ;
    const perpZ = dirX;

    const lat = edge.chosen ? 0 : ((orderedIdx % 7) - 3) * 0.03;
    const sx = startX + dirX * 0.12 + perpX * lat;
    const sz = startZ + dirZ * 0.12 + perpZ * lat;
    const ex = endX - dirX * 0.1 + perpX * lat;
    const ez = endZ - dirZ * 0.1 + perpZ * lat;

    const barbBack = 0.105;
    const barbWing = 0.058;
    const b1x = ex - dirX * barbBack + perpX * barbWing;
    const b1z = ez - dirZ * barbBack + perpZ * barbWing;
    const b2x = ex - dirX * barbBack - perpX * barbWing;
    const b2z = ez - dirZ * barbBack - perpZ * barbWing;

    const hex = edge.chosen
      ? 0xfff099
      : edge.ply === 0
        ? 0xf4c45a
        : edge.ply === 1
          ? 0x38bdf8
          : edge.ply === 2
            ? 0xa78bfa
            : 0xfb7185;

    const alpha = edge.chosen ? 1.0 : 0.92;
    const [pSx, pSy] = toPx(sx, sz);
    const [pEx, pEy] = toPx(ex, ez);
    const [pB1x, pB1y] = toPx(b1x, b1z);
    const [pB2x, pB2y] = toPx(b2x, b2z);

    ctx.lineWidth = (edge.chosen ? 4.0 : 2.5) * scaleFactor;

    const grad = ctx.createLinearGradient(pSx, pSy, pEx, pEy);
    grad.addColorStop(0, hexToCss(hex, 0.74, alpha));
    grad.addColorStop(1, hexToCss(hex, 1.0, alpha));

    ctx.strokeStyle = grad;
    ctx.beginPath();
    ctx.moveTo(pSx, pSy);
    ctx.lineTo(pEx, pEy);
    ctx.stroke();

    ctx.strokeStyle = hexToCss(hex, 1.0, alpha);
    ctx.beginPath();
    ctx.moveTo(pEx, pEy);
    ctx.lineTo(pB1x, pB1y);
    ctx.moveTo(pEx, pEy);
    ctx.lineTo(pB2x, pB2y);
    ctx.stroke();
  }
}

export function exportSearchTreeTopViewJpg(
  edges: SearchTreeEdge[],
  fen?: string,
  filename = 'chess_angel_thinking_tree_top_view.jpg',
): void {
  if (typeof document === 'undefined' || edges.length === 0) return;
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 2048;
  drawSearchTreeTopViewOnCanvas(canvas, edges, fen);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.98);
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export interface CandidateSubTree {
  rootUci: string;
  rootSan: string;
  isBestOverall: boolean;
  edges: SearchTreeEdge[];
}

const QUICK_PIECE_VAL: Record<string, number> = {
  p: 100,
  n: 320,
  b: 335,
  r: 500,
  q: 920,
  k: 0,
};

function quickMovePriority(m: {
  from: string;
  to: string;
  piece: string;
  captured?: string;
  promotion?: string;
  san: string;
}): number {
  let score = 0;
  if (m.captured) {
    score += (QUICK_PIECE_VAL[m.captured] || 100) * 6 - (QUICK_PIECE_VAL[m.piece] || 100) * 0.4;
  }
  if (m.promotion) score += 750;
  if (m.san.includes('+')) score += 260;
  const tf = m.to.charCodeAt(0) - 97;
  const tr = Number(m.to[1]) - 1;
  const centerDist = Math.hypot(tf - 3.5, tr - 3.5);
  score += Math.max(0, 4.2 - centerDist) * 28;
  if (m.piece === 'n' || m.piece === 'b' || m.piece === 'q') score += 24;
  return score;
}

/**
 * Builds distinct multi-ply (4-ply) candidate sub-trees for a mid-game position,
 * ordered so exploratory candidate trees develop rapidly one after another and
 * culminate on Chess Angel's #1 chosen Principal Variation tree.
 */
export function buildCandidateSubTrees(
  fen: string,
  simulations?: EngineLine[],
  maxTrees = 14,
): CandidateSubTree[] {
  let rootChess: Chess;
  try {
    rootChess = new Chess(fen);
  } catch {
    return [];
  }

  const legal = rootChess.moves({ verbose: true });
  if (legal.length === 0) return [];

  const simRank = new Map<string, number>();
  const simPvMap = new Map<string, string[]>();
  if (simulations && simulations.length > 0) {
    simulations.forEach((sim, idx) => {
      simRank.set(sim.bestMoveUci, idx);
      simPvMap.set(sim.bestMoveUci, sim.pvUci);
    });
  }

  const rankedMoves = [...legal].sort((a, b) => {
    const uciA = `${a.from}${a.to}${a.promotion || ''}`;
    const uciB = `${b.from}${b.to}${b.promotion || ''}`;
    const rA = simRank.get(uciA);
    const rB = simRank.get(uciB);
    if (rA !== undefined && rB !== undefined) return rA - rB;
    if (rA !== undefined) return -1;
    if (rB !== undefined) return 1;
    return quickMovePriority(b) - quickMovePriority(a);
  });

  const selected = rankedMoves.slice(0, Math.min(maxTrees, rankedMoves.length));
  if (selected.length === 0) return [];

  // Put exploratory candidate trees first (from plausible alternatives toward top contenders),
  // ending with the #1 best tree so the animation finishes on the winning PV spine.
  const bestMove = selected[0];
  const others = selected.slice(1).reverse();
  const sequence = [...others, bestMove];

  const trees: CandidateSubTree[] = [];

  for (const m0 of sequence) {
    const rootUci = `${m0.from}${m0.to}${m0.promotion || ''}`;
    const isBestOverall = m0 === bestMove;
    const knownPv = simPvMap.get(rootUci) || [];
    const edges: SearchTreeEdge[] = [];
    const seen = new Set<string>();

    const pushEdge = (from: string, to: string, ply: number, chosen = false) => {
      if (from === to) return;
      const key = `${ply}:${from}${to}`;
      if (seen.has(key)) return;
      seen.add(key);
      edges.push({ from, to, ply, chosen: chosen || undefined });
    };

    const sim = new Chess(fen);
    try {
      sim.move(m0);
      pushEdge(m0.from, m0.to, 0, isBestOverall);

      const replies = sim
        .moves({ verbose: true })
        .sort((a, b) => {
          const uA = `${a.from}${a.to}${a.promotion || ''}`;
          const uB = `${b.from}${b.to}${b.promotion || ''}`;
          if (knownPv[1] === uA) return -1;
          if (knownPv[1] === uB) return 1;
          return quickMovePriority(b) - quickMovePriority(a);
        })
        .slice(0, 3);

      replies.forEach((r1, r1Idx) => {
        const isPv1 = isBestOverall && r1Idx === 0;
        pushEdge(r1.from, r1.to, 1, isPv1);
        sim.move(r1);

        const counters = sim
          .moves({ verbose: true })
          .sort((a, b) => {
            const uA = `${a.from}${a.to}${a.promotion || ''}`;
            const uB = `${b.from}${b.to}${b.promotion || ''}`;
            if (r1Idx === 0 && knownPv[2] === uA) return -1;
            if (r1Idx === 0 && knownPv[2] === uB) return 1;
            return quickMovePriority(b) - quickMovePriority(a);
          })
          .slice(0, r1Idx === 0 ? 2 : 1);

        counters.forEach((r2, r2Idx) => {
          const isPv2 = isPv1 && r2Idx === 0;
          pushEdge(r2.from, r2.to, 2, isPv2);

          if (r1Idx <= 1 && r2Idx === 0) {
            sim.move(r2);
            const leaves = sim
              .moves({ verbose: true })
              .sort((a, b) => {
                const uA = `${a.from}${a.to}${a.promotion || ''}`;
                const uB = `${b.from}${b.to}${b.promotion || ''}`;
                if (isPv2 && knownPv[3] === uA) return -1;
                if (isPv2 && knownPv[3] === uB) return 1;
                return quickMovePriority(b) - quickMovePriority(a);
              })
              .slice(0, isPv2 ? 2 : 1);

            leaves.forEach((r3, r3Idx) => {
              pushEdge(r3.from, r3.to, 3, isPv2 && r3Idx === 0);
            });
            sim.undo();
          }
        });

        sim.undo();
      });
    } catch {
      // ignore invalid branch
    }

    if (edges.length > 0) {
      trees.push({
        rootUci,
        rootSan: m0.san,
        isBestOverall,
        edges,
      });
    }
  }

  return trees;
}

export const DEFAULT_MIDGAME_TREE_FEN =
  'r2r2k1/1pq1bppp/p1n1bn2/3p2B1/3P4/1BN1PN2/PPQ2PPP/2RR2K1 w - - 6 15';

/**
 * Records a crisp 60fps frontal top-view video animation on #000000 pure black
 * where each candidate thinking tree develops one after another quite quickly
 * over the thin-line chessboard & pieces underlay, then triggers a file download.
 */
export async function exportSearchTreeTopViewVideo(
  fen?: string,
  simulations?: EngineLine[],
  onProgress?: (pct: number) => void,
): Promise<void> {
  if (typeof document === 'undefined' || typeof MediaRecorder === 'undefined') return;

  // Use a rich mid-game position if the current board is still on ply 0-4
  let targetFen = fen || DEFAULT_MIDGAME_TREE_FEN;
  try {
    const check = new Chess(targetFen);
    const fullMove = Number(targetFen.split(' ')[5] || '1');
    if (fullMove < 6 && (!simulations || simulations.length === 0) && check.fen().startsWith('rnbqkbnr')) {
      targetFen = DEFAULT_MIDGAME_TREE_FEN;
    }
  } catch {
    targetFen = DEFAULT_MIDGAME_TREE_FEN;
  }

  const trees = buildCandidateSubTrees(targetFen, simulations, 14);
  if (trees.length === 0) return;

  const size = 1080;
  const scaleRatio = size / 2048;

  // Pre-render static #000000 background + thin-line chessboard & pieces underlay once
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = size;
  bgCanvas.height = size;
  const bgCtx = bgCanvas.getContext('2d', { alpha: false });
  if (!bgCtx) return;

  bgCtx.fillStyle = '#000000';
  bgCtx.fillRect(0, 0, size, size);
  bgCtx.lineCap = 'round';
  bgCtx.lineJoin = 'round';

  const worldExtent = 4.42;
  const toPx = (wx: number, wz: number): [number, number] => [
    ((wx + worldExtent) / (2 * worldExtent)) * size,
    ((wz + worldExtent) / (2 * worldExtent)) * size,
  ];
  const worldLenToPx = (len: number): number => (len / (2 * worldExtent)) * size;

  const underlay = buildSchematicUnderlay(targetFen);
  for (const seg of underlay.segments) {
    const [x0, y0] = toPx(seg.x0, seg.z0);
    const [x1, y1] = toPx(seg.x1, seg.z1);
    bgCtx.lineWidth = Math.max(1.05, 2.3 * seg.widthScale * scaleRatio);
    bgCtx.strokeStyle = hexToCss(seg.hex, 1, seg.alpha);
    bgCtx.beginPath();
    bgCtx.moveTo(x0, y0);
    bgCtx.lineTo(x1, y1);
    bgCtx.stroke();
  }
  for (const cir of underlay.circles) {
    const [cx, cy] = toPx(cir.cx, cir.cz);
    const rPx = worldLenToPx(cir.r);
    bgCtx.lineWidth = Math.max(1.05, 2.3 * cir.widthScale * scaleRatio);
    bgCtx.strokeStyle = hexToCss(cir.hex, 1, cir.alpha);
    bgCtx.beginPath();
    bgCtx.arc(cx, cy, rPx, 0, Math.PI * 2);
    bgCtx.stroke();
  }

  bgCtx.font = `400 ${Math.round(24 * scaleRatio)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  bgCtx.fillStyle = 'rgba(203, 213, 225, 0.44)';
  bgCtx.textAlign = 'center';
  bgCtx.textBaseline = 'middle';
  for (let f = 0; f < 8; f++) {
    const [bx, by] = toPx(f - 3.5, 4.26);
    const [tx, ty] = toPx(f - 3.5, -4.26);
    bgCtx.fillText(FILE_LABELS[f], bx, by);
    bgCtx.fillText(FILE_LABELS[f], tx, ty);
  }
  for (let r = 0; r < 8; r++) {
    const [lx, ly] = toPx(-4.26, 3.5 - r);
    const [rx, ry] = toPx(4.26, 3.5 - r);
    bgCtx.fillText(RANK_LABELS[r], lx, ly);
    bgCtx.fillText(RANK_LABELS[r], rx, ry);
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const mimeCandidates = [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  const chosenMime =
    mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
  const ext = chosenMime.includes('mp4') ? 'mp4' : 'webm';

  const stream = canvas.captureStream(60);
  const recorder = new MediaRecorder(stream, {
    ...(chosenMime ? { mimeType: chosenMime } : {}),
    videoBitsPerSecond: 12_000_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };

  const introSec = 0.2;
  const perTreeSec = 0.36;
  const finaleGrowSec = 0.45;
  const holdSec = 0.95;
  const totalSec = introSec + trees.length * perTreeSec + finaleGrowSec + holdSec;

  const drawGrowingEdge = (
    edge: SearchTreeEdge,
    edgeIdx: number,
    growT: number,
    alpha: number,
    highlightChosen: boolean,
  ) => {
    if (growT <= 0.01 || alpha <= 0.01) return;
    const [startX, startZ] = squareToWorld2D(edge.from);
    const [endX, endZ] = squareToWorld2D(edge.to);
    const dx = endX - startX;
    const dz = endZ - startZ;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.2) return;

    const dirX = dx / dist;
    const dirZ = dz / dist;
    const perpX = -dirZ;
    const perpZ = dirX;

    const isSpine = Boolean(edge.chosen && highlightChosen);
    const lat = isSpine ? 0 : ((edgeIdx % 7) - 3) * 0.028;
    const sx = startX + dirX * 0.12 + perpX * lat;
    const sz = startZ + dirZ * 0.12 + perpZ * lat;
    const fullEx = endX - dirX * 0.1 + perpX * lat;
    const fullEz = endZ - dirZ * 0.1 + perpZ * lat;

    const eased = 1 - Math.pow(1 - Math.min(1, Math.max(0, growT)), 2.4);
    const ex = sx + (fullEx - sx) * eased;
    const ez = sz + (fullEz - sz) * eased;

    const hex = isSpine
      ? 0xfff099
      : edge.ply === 0
        ? 0xf4c45a
        : edge.ply === 1
          ? 0x38bdf8
          : edge.ply === 2
            ? 0xa78bfa
            : 0xfb7185;

    const [pSx, pSy] = toPx(sx, sz);
    const [pEx, pEy] = toPx(ex, ez);

    ctx.lineWidth = (isSpine ? 4.2 : 2.55) * scaleRatio;
    const grad = ctx.createLinearGradient(pSx, pSy, pEx, pEy);
    grad.addColorStop(0, hexToCss(hex, 0.72, alpha));
    grad.addColorStop(1, hexToCss(hex, 1.0, alpha));
    ctx.strokeStyle = grad;
    ctx.beginPath();
    ctx.moveTo(pSx, pSy);
    ctx.lineTo(pEx, pEy);
    ctx.stroke();

    if (eased > 0.25) {
      const barbScale = Math.min(1, (eased - 0.25) / 0.45);
      const barbBack = 0.105 * barbScale;
      const barbWing = 0.058 * barbScale;
      const [pB1x, pB1y] = toPx(
        ex - dirX * barbBack + perpX * barbWing,
        ez - dirZ * barbBack + perpZ * barbWing,
      );
      const [pB2x, pB2y] = toPx(
        ex - dirX * barbBack - perpX * barbWing,
        ez - dirZ * barbBack - perpZ * barbWing,
      );
      ctx.strokeStyle = hexToCss(hex, 1.0, alpha);
      ctx.beginPath();
      ctx.moveTo(pEx, pEy);
      ctx.lineTo(pB1x, pB1y);
      ctx.moveTo(pEx, pEy);
      ctx.lineTo(pB2x, pB2y);
      ctx.stroke();
    }
  };

  await new Promise<void>((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: chosenMime || `video/${ext}` });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chess_angel_midgame_tree_animation.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      onProgress?.(100);
      resolve();
    };

    recorder.start();
    const startMs = performance.now();

    const step = (now: number) => {
      const elapsedSec = (now - startMs) / 1000;
      const pct = Math.min(99, Math.round((elapsedSec / totalSec) * 100));
      onProgress?.(pct);

      ctx.drawImage(bgCanvas, 0, 0);

      const allTreesEndSec = introSec + trees.length * perTreeSec;
      const inFinale = elapsedSec >= allTreesEndSec;
      const finaleT = inFinale
        ? Math.min(1, (elapsedSec - allTreesEndSec) / finaleGrowSec)
        : 0;

      // 1. Render completed and currently developing candidate trees sequentially
      trees.forEach((tree, tIdx) => {
        const treeStart = introSec + tIdx * perTreeSec;
        if (elapsedSec < treeStart) return;

        const localSec = elapsedSec - treeStart;
        const isCurrent = localSec < perTreeSec;
        const afterFinishSec = Math.max(0, localSec - perTreeSec);

        // Settle completed trees to subtle 0.36 alpha, then brighten to 0.66 in finale
        const settledAlpha = inFinale
          ? 0.36 + 0.3 * finaleT
          : Math.max(0.36, 0.96 - Math.min(1, afterFinishSec / 0.18) * 0.6);

        tree.edges.forEach((edge, eIdx) => {
          const plyStart = edge.ply * 0.075;
          const plyDur = 0.095;
          const growT = isCurrent ? (localSec - plyStart) / plyDur : 1;
          if (growT <= 0) return;

          const edgeAlpha = isCurrent ? 0.96 : settledAlpha;
          drawGrowingEdge(
            edge,
            tIdx * 13 + eIdx,
            growT,
            edgeAlpha,
            Boolean(tree.isBestOverall && (!isCurrent || edge.ply === 0)),
          );
        });
      });

      // 2. Finale highlight: surge the winning Principal Variation spine on top
      if (inFinale) {
        const bestTree = trees.find((t) => t.isBestOverall);
        if (bestTree) {
          bestTree.edges
            .filter((e) => e.chosen)
            .forEach((edge, idx) => {
              const segStart = idx * 0.08;
              const grow = Math.min(1, Math.max(0, (elapsedSec - allTreesEndSec - segStart) / 0.12));
              drawGrowingEdge(edge, idx, grow, 1.0, true);
            });
        }
      }

      if (elapsedSec < totalSec) {
        requestAnimationFrame(step);
      } else {
        recorder.stop();
      }
    };

    requestAnimationFrame(step);
  });
}

