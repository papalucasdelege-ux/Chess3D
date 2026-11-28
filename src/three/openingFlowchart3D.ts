import * as THREE from 'three';

export const DEFAULT_OPENING_FLOWCHART_START_SEC = 4.65;
export const DEFAULT_OPENING_FLOWCHART_DENSITY = 1.0;
export const MIN_OPENING_FLOWCHART_START_SEC = 0.0;
export const MAX_OPENING_FLOWCHART_START_SEC = 15.0;
export const MIN_OPENING_FLOWCHART_DENSITY = 0.25;
export const MAX_OPENING_FLOWCHART_DENSITY = 2.5;

interface FlowchartPaletteColor {
  rgb: readonly [number, number, number];
}

// Exact neon glowing schematic palette sampled directly from the final dense state of `builtin_opening.mp4`
const FLOWCHART_COLORS: Record<'emerald' | 'cyan' | 'crimson' | 'gold' | 'cobalt', FlowchartPaletteColor> = {
  emerald: { rgb: [0.18, 0.94, 0.46] }, // vivid neon emerald green
  cyan: { rgb: [0.18, 0.86, 0.98] },    // bright electric cyan
  crimson: { rgb: [1.0, 0.24, 0.36] },  // luminous crimson ruby red
  gold: { rgb: [1.0, 0.8, 0.22] },      // warm amber-gold yellow
  cobalt: { rgb: [0.34, 0.62, 1.0] },   // crisp royal cobalt blue
};

type PaletteKey = keyof typeof FLOWCHART_COLORS;

interface BorderHighwaySpec {
  edge: 'left' | 'top';
  /** Normalized coordinate along the edge (0..1: top->bottom on left edge, left->right on top edge) */
  tEdge: number;
  /** Parallel lanes packed tightly side-by-side (matching the video's bundled multi-track PCB highways) */
  lanes: ReadonlyArray<PaletteKey>;
  /** Vertical fan bias on left edge (-1..+1), horizontal fan bias on top edge */
  fanBias: number;
  /** Reach across the 3D scene (0.45..1.05) */
  reachFactor: number;
  /** 3D depth plane offset (negative = nearer camera, positive = deeper over far board) */
  depthLayer: number;
  /** Border-crossing stagger (0..0.16) */
  startOffset: number;
  /** Number of dense vertical comb-bracket clusters attached along this highway */
  combClusters: number;
}

/**
 * Exact multi-lane border-exit highways mapped directly from the final frame (t=9.5s) of `builtin_opening.mp4`:
 * - Left edge (top -> bottom):
 *     0.03–0.21 Emerald dense comb & parallel green bus
 *     0.21–0.25 Crimson accent branch
 *     0.25–0.34 Gold/Amber dense comb & parallel bus
 *     0.34–0.39 Cobalt/Cyan bus & bracket
 *     0.39–0.65 Crimson massive stacked comb clusters & 45° red highways
 *     0.65–0.71 Cobalt/Cyan horizontal bus & fork
 *     0.71–0.85 Emerald dense horizontal bus & comb brackets
 *     0.85–0.96 Cobalt + Emerald lower-left diagonal buses & comb bracket
 * - Top edge (left -> right):
 *     0.06–0.26 Cobalt/Cyan vertical columns
 *     0.30–0.54 Crimson dense vertical comb columns
 *     0.58–0.68 Cobalt vertical column
 *     0.73–0.83 Crimson vertical column
 *     0.88–0.96 Gold vertical column
 */
const BORDER_HIGHWAYS: ReadonlyArray<BorderHighwaySpec> = [
  // === LEFT EDGE: exact top-to-bottom color continuation ===
  { edge: 'left', tEdge: 0.05, lanes: ['emerald', 'cyan'], fanBias: 0.42, reachFactor: 0.94, depthLayer: -0.3, startOffset: 0.02, combClusters: 3 },
  { edge: 'left', tEdge: 0.11, lanes: ['emerald', 'emerald', 'cyan'], fanBias: 0.34, reachFactor: 1.02, depthLayer: 0.15, startOffset: 0.0, combClusters: 4 },
  { edge: 'left', tEdge: 0.17, lanes: ['emerald', 'emerald'], fanBias: 0.26, reachFactor: 0.96, depthLayer: -0.45, startOffset: 0.01, combClusters: 3 },
  { edge: 'left', tEdge: 0.22, lanes: ['crimson', 'gold'], fanBias: 0.2, reachFactor: 0.88, depthLayer: 0.35, startOffset: 0.04, combClusters: 3 },
  { edge: 'left', tEdge: 0.28, lanes: ['gold', 'gold', 'emerald'], fanBias: 0.14, reachFactor: 1.0, depthLayer: -0.15, startOffset: 0.02, combClusters: 4 },
  { edge: 'left', tEdge: 0.34, lanes: ['cobalt', 'cyan'], fanBias: 0.08, reachFactor: 0.92, depthLayer: 0.4, startOffset: 0.03, combClusters: 3 },
  { edge: 'left', tEdge: 0.4, lanes: ['crimson', 'crimson', 'gold'], fanBias: 0.02, reachFactor: 1.04, depthLayer: -0.25, startOffset: 0.0, combClusters: 4 },
  { edge: 'left', tEdge: 0.47, lanes: ['crimson', 'crimson'], fanBias: -0.04, reachFactor: 0.98, depthLayer: 0.1, startOffset: 0.01, combClusters: 4 },
  { edge: 'left', tEdge: 0.54, lanes: ['crimson', 'cobalt', 'crimson'], fanBias: -0.1, reachFactor: 0.94, depthLayer: -0.4, startOffset: 0.02, combClusters: 4 },
  { edge: 'left', tEdge: 0.61, lanes: ['crimson', 'gold'], fanBias: -0.16, reachFactor: 0.86, depthLayer: 0.3, startOffset: 0.04, combClusters: 3 },
  { edge: 'left', tEdge: 0.67, lanes: ['cyan', 'cobalt', 'cobalt'], fanBias: -0.22, reachFactor: 0.92, depthLayer: -0.1, startOffset: 0.03, combClusters: 3 },
  { edge: 'left', tEdge: 0.74, lanes: ['emerald', 'emerald', 'cyan'], fanBias: -0.28, reachFactor: 0.88, depthLayer: 0.25, startOffset: 0.04, combClusters: 4 },
  { edge: 'left', tEdge: 0.81, lanes: ['emerald', 'cobalt'], fanBias: -0.34, reachFactor: 0.8, depthLayer: -0.3, startOffset: 0.06, combClusters: 3 },
  { edge: 'left', tEdge: 0.88, lanes: ['cobalt', 'emerald', 'emerald'], fanBias: -0.4, reachFactor: 0.74, depthLayer: 0.15, startOffset: 0.08, combClusters: 3 },
  { edge: 'left', tEdge: 0.94, lanes: ['emerald', 'cyan'], fanBias: -0.46, reachFactor: 0.64, depthLayer: -0.2, startOffset: 0.1, combClusters: 2 },

  // === TOP EDGE: exact left-to-right color continuation arching upward & left ===
  { edge: 'top', tEdge: 0.1, lanes: ['cobalt', 'cyan'], fanBias: -0.82, reachFactor: 0.84, depthLayer: 0.15, startOffset: 0.03, combClusters: 3 },
  { edge: 'top', tEdge: 0.24, lanes: ['cobalt', 'emerald'], fanBias: -0.66, reachFactor: 0.78, depthLayer: -0.25, startOffset: 0.04, combClusters: 3 },
  { edge: 'top', tEdge: 0.39, lanes: ['crimson', 'crimson'], fanBias: -0.5, reachFactor: 0.72, depthLayer: 0.3, startOffset: 0.02, combClusters: 3 },
  { edge: 'top', tEdge: 0.53, lanes: ['crimson', 'cobalt'], fanBias: -0.36, reachFactor: 0.66, depthLayer: -0.15, startOffset: 0.04, combClusters: 2 },
  { edge: 'top', tEdge: 0.67, lanes: ['cobalt', 'cyan'], fanBias: -0.24, reachFactor: 0.6, depthLayer: 0.25, startOffset: 0.05, combClusters: 2 },
  { edge: 'top', tEdge: 0.8, lanes: ['crimson', 'gold'], fanBias: -0.14, reachFactor: 0.54, depthLayer: -0.2, startOffset: 0.06, combClusters: 2 },
  { edge: 'top', tEdge: 0.92, lanes: ['gold', 'gold'], fanBias: -0.06, reachFactor: 0.48, depthLayer: 0.1, startOffset: 0.07, combClusters: 2 },
];

interface OpeningListBlock {
  header: string;
  rows: ReadonlyArray<string>;
}

/**
 * 16 encyclopedic chess-opening variation list blocks rendered as ultra-crisp micro-typography
 * columns (matching the dense underlined header + stacked variation lines in `builtin_opening.mp4`).
 */
const OPENING_LIST_BLOCKS: ReadonlyArray<OpeningListBlock> = [
  {
    header: 'RUY LOPEZ · MORPHY',
    rows: [
      '3.Bb5 a6 4.Ba4 Nf6',
      '5.O-O Be7 6.Re1 b5',
      '7.Bb3 d6 8.c3 O-O',
      '9.h3 Na5 10.Bc2 c5',
      '11.d4 Qc7 12.Nbd2',
      'Chigorin · Breyer',
      'Marshall 8...d5',
      'Zaitsev 9...Bb7',
    ],
  },
  {
    header: 'SICILIAN NAJDORF',
    rows: [
      '1.e4 c5 2.Nf3 d6',
      '3.d4 cxd4 4.Nxd4',
      '5.Nc3 a6 6.Bg5 e6',
      '6.Be3 e5 7.Nb3 Be6',
      '6.Bc4 e6 7.Bb3 b5',
      '6.Be2 e5 7.Nb3 Be7',
      '6.f3 Qb6 7.Qd2',
      'Poisoned Pawn 7...Qb6',
    ],
  },
  {
    header: "QUEEN'S GAMBIT DEC",
    rows: [
      '1.d4 d5 2.c4 e6',
      '3.Nc3 Nf6 4.Bg5 Be7',
      '5.e3 O-O 6.Nf3 h6',
      '7.Bh4 b6 8.cxd5',
      'Orthodox · Tartakower',
      'Lasker 7...Ne4',
      'Exchange 4.cxd5 exd5',
      'Ragozin 4...Bb4',
    ],
  },
  {
    header: 'ITALIAN · GIUOCO',
    rows: [
      '1.e4 e5 2.Nf3 Nc6',
      '3.Bc4 Bc5 4.c3 Nf6',
      '5.d3 d6 6.O-O a6',
      'Evans 4.b4 Bxb4',
      'Two Knights 3...Nf6',
      '4.Ng5 d5 5.exd5 Na5',
      'Fried Liver 5...Nxd5',
      'Pianissimo 5.d3 a5',
    ],
  },
  {
    header: 'FRENCH · WINAWER',
    rows: [
      '1.e4 e6 2.d4 d5',
      '3.Nc3 Bb4 4.e5 c5',
      '5.a3 Bxc3+ 6.bxc3',
      '7.Qg4 Qc7 8.Qxg7',
      'Tarrasch 3.Nd2 c5',
      'Advance 3.e5 c5 4.c3',
      'Classical 3...Nf6',
      'Rubinstein 3...dxe4',
    ],
  },
  {
    header: 'CARO-KANN DEFENSE',
    rows: [
      '1.e4 c6 2.d4 d5',
      '3.Nc3 dxe4 4.Nxe4',
      '4...Bf5 5.Ng3 Bg6',
      '6.h4 h6 7.Nf3 Nd7',
      'Advance 3.e5 Bf5',
      'Panov 3.exd5 cxd5',
      '4.c4 Nf6 5.Nc3 e6',
      'Karpov 4...Nd7',
    ],
  },
  {
    header: "KING'S INDIAN DEF",
    rows: [
      '1.d4 Nf6 2.c4 g6',
      '3.Nc3 Bg7 4.e4 d6',
      '5.Nf3 O-O 6.Be2 e5',
      '7.O-O Nc6 8.d5 Ne7',
      'Mar del Plata 9.Ne1',
      'Samisch 5.f3 O-O',
      'Four Pawns 5.f4 O-O',
      'Fianchetto 4.g3 O-O',
    ],
  },
  {
    header: 'NIMZO-INDIAN DEF',
    rows: [
      '1.d4 Nf6 2.c4 e6',
      '3.Nc3 Bb4 4.e3 O-O',
      '5.Bd3 d5 6.Nf3 c5',
      'Rubinstein 7.O-O Nc6',
      'Classical 4.Qc2 O-O',
      'Samisch 4.a3 Bxc3+',
      'Leningrad 4.Bg5 h6',
      'Kasparov 4.Nf3 c5',
    ],
  },
  {
    header: 'SICILIAN DRAGON',
    rows: [
      '1.e4 c5 2.Nf3 d6',
      '3.d4 cxd4 4.Nxd4',
      '5.Nc3 g6 6.Be3 Bg7',
      '7.f3 O-O 8.Qd2 Nc6',
      'Yugoslav 9.Bc4 Bd7',
      '10.O-O-O Rc8 11.Bb3',
      'Accelerated 4...g6',
      'Maroczy 5.c4 Bg7',
    ],
  },
  {
    header: 'ENGLISH OPENING',
    rows: [
      '1.c4 e5 2.Nc3 Nf6',
      '3.Nf3 Nc6 4.g3 d5',
      'Reversed Sicilian',
      'Symmetrical 1...c5',
      'Hedgehog · Maroczy',
      'Botvinnik 2.g3 g6',
      'Four Knights 4.e3',
      'Bremen 2...Nf6 3.g3',
    ],
  },
  {
    header: 'SLAV & SEMI-SLAV',
    rows: [
      '1.d4 d5 2.c4 c6',
      '3.Nf3 Nf6 4.Nc3 e6',
      '5.e3 Nbd7 6.Bd3 dxc4',
      'Meran 7.Bxc4 b5',
      'Moscow 5.Bg5 h6',
      'Botvinnik 5...dxc4',
      'Chebanenko 4...a6',
      'Main Line 4...dxc4',
    ],
  },
  {
    header: 'GRUNFELD DEFENSE',
    rows: [
      '1.d4 Nf6 2.c4 g6',
      '3.Nc3 d5 4.cxd5',
      '4...Nxd5 5.e4 Nxc3',
      '6.bxc3 Bg7 7.Bc4 c5',
      'Exchange 8.Ne2 Nc6',
      'Russian 4.Nf3 Bg7',
      '5.Qb3 dxc4 6.Qxc4',
      'Fianchetto 4.g3 Bg7',
    ],
  },
  {
    header: 'SCOTCH & VIENNA',
    rows: [
      '1.e4 e5 2.Nf3 Nc6',
      '3.d4 exd4 4.Nxd4',
      'Classical 4...Bc5',
      'Schmidt 4...Nf6',
      'Mieses 5.Nxc6 bxc6',
      'Vienna 2.Nc3 Nf6',
      '3.f4 d5 4.fxe5 Nxe4',
      'Gambit 3.Bc4 Nxe4',
    ],
  },
  {
    header: 'CATALAN OPENING',
    rows: [
      '1.d4 Nf6 2.c4 e6',
      '3.g3 d5 4.Bg2 Be7',
      '5.Nf3 O-O 6.O-O dxc4',
      'Open 7.Qc2 a6 8.Qxc4',
      'Closed 6...c6 7.Qc2',
      '7...b6 8.Nbd2 Bb7',
      'Bogo 4...Bb4+ 5.Bd2',
      'Classical 7.Ne5 Nc6',
    ],
  },
  {
    header: 'BERLIN & PETROFF',
    rows: [
      '3.Bb5 Nf6 4.O-O Nxe4',
      '5.d4 Nd6 6.Bxc6 dxc6',
      '7.dxe5 Nf5 8.Qxd8+',
      'Rio de Janeiro 5...Be7',
      'Petroff 2.Nf3 Nf6',
      '3.Nxe5 d6 4.Nf3 Nxe4',
      '5.d4 d5 6.Bd3 Nc6',
      'Stafford 3...Nc6',
    ],
  },
  {
    header: 'BENONI & DUTCH',
    rows: [
      '1.d4 Nf6 2.c4 c5',
      '3.d5 e6 4.Nc3 exd5',
      '5.cxd5 d6 6.e4 g6',
      'Taimanov 7.f4 Bg7',
      'Benko 3...b5 4.cxb5',
      'Dutch 1.d4 f5 2.g3',
      'Leningrad 2...Nf6 g6',
      'Stonewall 4...d5 c6',
    ],
  },
];

interface CachedFlowchartTextures {
  nodeDotTex: THREE.CanvasTexture;
  listAtlasTex: THREE.CanvasTexture;
}

let cachedFlowchartTextures: CachedFlowchartTextures | null = null;

function getFlowchartTextures(): CachedFlowchartTextures {
  if (cachedFlowchartTextures) return cachedFlowchartTextures;

  // 1. Crisp pinpoint neon circuit via / junction dot (128x128)
  const dotCanvas = document.createElement('canvas');
  dotCanvas.width = 128;
  dotCanvas.height = 128;
  const dCtx = dotCanvas.getContext('2d');
  if (dCtx) {
    dCtx.clearRect(0, 0, 128, 128);
    const halo = dCtx.createRadialGradient(64, 64, 0, 64, 64, 56);
    halo.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    halo.addColorStop(0.22, 'rgba(255, 255, 255, 0.96)');
    halo.addColorStop(0.38, 'rgba(225, 244, 255, 0.45)');
    halo.addColorStop(0.66, 'rgba(180, 225, 255, 0.12)');
    halo.addColorStop(1, 'rgba(180, 225, 255, 0.0)');
    dCtx.fillStyle = halo;
    dCtx.fillRect(0, 0, 128, 128);
  }

  // 2. 4x4 Ultra-Crisp Borderless Micro-Typography List Atlas (1024x1024 -> 16 tiles of 256x256)
  // Designed to match the exact look of the dense opening-variation text columns in `builtin_opening.mp4`:
  // colored underlined section header + 8 tightly stacked hairline variation lines with mini ticks (NO bulky box!).
  const atlasSize = 1024;
  const tileSize = 256;
  const listCanvas = document.createElement('canvas');
  listCanvas.width = atlasSize;
  listCanvas.height = atlasSize;
  const cCtx = listCanvas.getContext('2d');
  if (cCtx) {
    cCtx.clearRect(0, 0, atlasSize, atlasSize);
    for (let idx = 0; idx < 16; idx++) {
      const col = idx % 4;
      const row = Math.floor(idx / 4);
      const x0 = col * tileSize;
      const y0 = row * tileSize;
      const block = OPENING_LIST_BLOCKS[idx % OPENING_LIST_BLOCKS.length];

      cCtx.save();
      cCtx.translate(x0, y0);

      // Right-aligned or left-aligned micro-column (alternating for natural schematic rhythm)
      const padX = 12;

      // Crisp header title (matches the glowing colored title bars at the top of each bracket in the video)
      cCtx.fillStyle = 'rgba(255, 255, 255, 0.98)';
      cCtx.font = '700 18px ui-monospace, SFMono-Regular, Menlo, monospace';
      cCtx.textBaseline = 'middle';
      cCtx.fillText(block.header, padX + 4, 20);

      // Luminous header underline bar
      cCtx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      cCtx.lineWidth = 2.6;
      cCtx.beginPath();
      cCtx.moveTo(padX, 34);
      cCtx.lineTo(tileSize - padX, 34);
      cCtx.stroke();

      // 8 densely packed micro-variation lines with tiny connector ticks on the right (where the comb spine sits!)
      const startY = 54;
      const stepY = 24.5;
      cCtx.font = '600 14.5px ui-monospace, SFMono-Regular, Menlo, monospace';
      for (let r = 0; r < block.rows.length; r++) {
        const ry = startY + r * stepY;

        // Tiny glowing horizontal stub connecting the text row visually into the vertical comb spine
        cCtx.strokeStyle = 'rgba(255, 255, 255, 0.62)';
        cCtx.lineWidth = 1.6;
        cCtx.beginPath();
        cCtx.moveTo(tileSize - 10, ry);
        cCtx.lineTo(tileSize - 2, ry);
        cCtx.stroke();

        // Crisp dot tick on the left edge of each variation line
        cCtx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        cCtx.beginPath();
        cCtx.arc(padX + 4, ry, 2.2, 0, Math.PI * 2);
        cCtx.fill();

        // Micro-text variation line
        cCtx.fillStyle = r % 2 === 0 ? 'rgba(248, 252, 255, 0.94)' : 'rgba(225, 238, 250, 0.84)';
        cCtx.fillText(block.rows[r], padX + 12, ry);
      }

      cCtx.restore();
    }
  }

  const nodeDotTex = new THREE.CanvasTexture(dotCanvas);
  nodeDotTex.colorSpace = THREE.SRGBColorSpace;

  const listAtlasTex = new THREE.CanvasTexture(listCanvas);
  listAtlasTex.colorSpace = THREE.SRGBColorSpace;
  listAtlasTex.anisotropy = 4;

  cachedFlowchartTextures = { nodeDotTex, listAtlasTex };
  return cachedFlowchartTextures;
}

interface BranchSegment {
  p0: THREE.Vector3;
  p1: THREE.Vector3;
  t0: number;
  t1: number;
  width0: number;
  width1: number;
  rgb: readonly [number, number, number];
}

interface NodeSpec {
  pos: THREE.Vector3;
  appearAt: number;
  scale: number;
  rgb: readonly [number, number, number];
  phase: number;
}

interface ListBlockSpec {
  pos: THREE.Vector3;
  appearAt: number;
  scaleW: number;
  scaleH: number;
  rgb: readonly [number, number, number];
  tileCol: number;
  tileRow: number;
  phase: number;
}

interface PulsePath {
  points: THREE.Vector3[];
  tStart: number;
  tEnd: number;
  rgb: readonly [number, number, number];
}

interface PulseParticle {
  pathIdx: number;
  u: number;
  speed: number;
  scale: number;
}

const RIBBON_VERT = /* glsl */ `
  attribute vec3 aDir;
  attribute float aSide;
  attribute float aWidth;
  attribute float aTime;
  attribute vec3 aColor;

  varying vec2 vUv;
  varying float vTime;
  varying vec3 vColor;

  void main() {
    vUv = uv;
    vTime = aTime;
    vColor = aColor;

    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    // Project segment tangent into view space and expand cleanly perpendicular to it (razor-sharp camera-facing PCB trace)
    vec3 viewDir = normalize((modelViewMatrix * vec4(aDir, 0.0)).xyz + vec3(0.0, 0.0, 1e-5));
    vec3 toCam = normalize(-mvPos.xyz);
    vec3 sideVec = cross(toCam, viewDir);
    float sLen = length(sideVec);
    if (sLen < 1e-4) {
      sideVec = vec3(0.0, 1.0, 0.0);
    } else {
      sideVec /= sLen;
    }

    mvPos.xyz += sideVec * (aSide * aWidth);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const RIBBON_FRAG = /* glsl */ `
  uniform float uProgress;
  uniform float uOpacity;
  uniform float uClock;

  varying vec2 vUv;
  varying float vTime;
  varying vec3 vColor;

  void main() {
    if (uOpacity <= 0.002) discard;

    // Progressive growth reveal along each PCB trace & comb bracket
    float reveal = 1.0 - smoothstep(uProgress - 0.018, uProgress + 0.004, vTime);
    if (reveal <= 0.004) discard;

    // Crisp hairline PCB core + tight controlled neon bloom matching the fine video traces
    float d = abs(vUv.y * 2.0 - 1.0);
    float core = exp(-d * d * 30.0);
    float glow = exp(-d * d * 7.2) * 0.36;

    // Luminous hot growing-tip spark right where each branch is actively extending
    float tipDist = abs(vTime - uProgress);
    float tipFlare = exp(-tipDist * tipDist * 3000.0) * step(0.005, uProgress) * (1.0 - smoothstep(0.97, 1.02, uProgress));

    // Subtle outward-flowing neon circuit current wave
    float wave = 0.88 + 0.12 * sin(vTime * 52.0 - uClock * 6.2);

    vec3 col = vColor * (core * 1.34 + glow) * wave + vec3(1.0, 0.98, 0.94) * (core * 0.36 + tipFlare * 1.15);
    float alpha = (core * 0.96 + glow * 0.54 + tipFlare * 0.78) * reveal * uOpacity;

    gl_FragColor = vec4(col * alpha, alpha);
  }
`;

const LIST_VERT = /* glsl */ `
  attribute vec2 aTileUv;
  attribute vec3 aCardColor;
  attribute float aCardAlpha;

  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    // Map unit quad UV (0..1) into the 4x4 micro-typography list atlas cell
    vUv = vec2(aTileUv.x + uv.x * 0.25, aTileUv.y + uv.y * 0.25);
    vColor = aCardColor;
    vAlpha = aCardAlpha;
    vec4 mvPos = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const LIST_FRAG = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uOpacity;

  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float aTotal = vAlpha * uOpacity;
    if (aTotal <= 0.004) discard;
    vec4 texel = texture2D(uAtlas, vUv);
    float lum = texel.a;
    if (lum <= 0.02) discard;
    // Match video's crisp tinted header + warm legible micro-text rows
    vec3 col = mix(vColor * 1.22, vec3(0.96, 0.98, 1.0), smoothstep(0.55, 0.96, lum) * 0.56);
    float outAlpha = lum * aTotal * 0.9;
    gl_FragColor = vec4(col * outAlpha, outAlpha);
  }
`;

// Pre-allocated math helpers for zero-GC per-frame updates
const _mat4 = new THREE.Matrix4();
const _scaleVec = new THREE.Vector3();
const _zeroScale = new THREE.Vector3(0, 0, 0);
const _idQuat = new THREE.Quaternion();
const _tmpPos = new THREE.Vector3();
const _tmpCol = new THREE.Color();
const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _camForward = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camUp = new THREE.Vector3();

/**
 * 3D Multicolor Opening Flowchart Extension (`OpeningFlowchart3D`):
 * Visually continues the dense, encyclopedic multicolor PCB / tournament-bracket opening tree
 * from the end state of Chess Angel's `builtin_opening.mp4` video directly across the portrait
 * modal's left & top borders into 3D space — featuring tightly bundled parallel neon buses,
 * crisp 45° & 90° miters, dense multi-prong vertical comb brackets, borderless micro-typography
 * chess-opening variation lists, pinpoint vias, and racing data photons.
 */
export class OpeningFlowchart3D {
  public readonly root = new THREE.Group();

  private ribbonMesh: THREE.Mesh | null = null;
  private ribbonGeo: THREE.BufferGeometry | null = null;
  private ribbonMat: THREE.ShaderMaterial | null = null;

  private nodeMesh: THREE.InstancedMesh | null = null;
  private nodeGeo: THREE.PlaneGeometry | null = null;
  private nodeMat: THREE.MeshBasicMaterial | null = null;
  private nodes: NodeSpec[] = [];

  private listMesh: THREE.InstancedMesh | null = null;
  private listGeo: THREE.PlaneGeometry | null = null;
  private listMat: THREE.ShaderMaterial | null = null;
  private listAlphaAttr: THREE.InstancedBufferAttribute | null = null;
  private listBlocks: ListBlockSpec[] = [];

  private pulseMesh: THREE.InstancedMesh | null = null;
  private pulseGeo: THREE.PlaneGeometry | null = null;
  private pulseMat: THREE.MeshBasicMaterial | null = null;
  private pulsePaths: PulsePath[] = [];
  private pulses: PulseParticle[] = [];

  // Live synced state
  private builtForKey = '';
  private active = false;
  private holdingPostEnd = false;
  private holdElapsed = 0;
  private fadingOut = false;
  private fadeOutElapsed = 0;
  private readonly HOLD_AFTER_END_SEC = 1.35;
  private readonly FADE_OUT_DURATION = 1.65;
  private videoTimeSec = 0;
  private smoothProgress = 0;
  private clockSec = 0;
  private currentOpacity = 0;

  // Timeline synced to `builtin_opening.mp4` (10.08s), tunable from Chess Angel Video Studio:
  // Default: border traces emerge at 4.65s and reach full encyclopedic end-state by ~9.35s
  private borderStartSec = DEFAULT_OPENING_FLOWCHART_START_SEC;
  private densityScale = DEFAULT_OPENING_FLOWCHART_DENSITY;
  private readonly FULL_GROW_SPAN_SEC = 4.65;

  constructor() {
    this.root.name = 'OpeningFlowchart3D';
    this.root.visible = false;
  }

  public setConfig(startSec: number, density: number): void {
    const nextStart = Number.isFinite(startSec)
      ? THREE.MathUtils.clamp(
          Math.round(startSec * 100) / 100,
          MIN_OPENING_FLOWCHART_START_SEC,
          MAX_OPENING_FLOWCHART_START_SEC,
        )
      : DEFAULT_OPENING_FLOWCHART_START_SEC;
    const nextDensity = Number.isFinite(density)
      ? THREE.MathUtils.clamp(
          Math.round(density * 100) / 100,
          MIN_OPENING_FLOWCHART_DENSITY,
          MAX_OPENING_FLOWCHART_DENSITY,
        )
      : DEFAULT_OPENING_FLOWCHART_DENSITY;
    this.borderStartSec = nextStart;
    this.densityScale = nextDensity;
  }

  private getEffectiveGrowSpanSec(): number {
    // Finish smoothly near the ~9.35s video end state when delayed, while keeping 4.65s max span
    return Math.max(1.5, Math.min(this.FULL_GROW_SPAN_SEC, 9.35 - this.borderStartSec));
  }

  public isActive(): boolean {
    return this.active || this.holdingPostEnd || this.fadingOut;
  }

  /**
   * Synchronizes the 3D flowchart with live playback of `builtin_opening.mp4`.
   * Rebuilds camera-projected border anchors automatically once per trigger / portrait layout / density change.
   */
  public syncWithOpeningVideo(
    isPlayingOpening: boolean,
    currentTimeSec: number,
    portraitRect: DOMRect | null,
    canvasRect: DOMRect | null,
    camera: THREE.PerspectiveCamera,
    boardTopY: number,
  ): void {
    if (isPlayingOpening) {
      this.videoTimeSec = currentTimeSec;
      const startSec = this.borderStartSec;
      const growSpan = this.getEffectiveGrowSpanSec();
      if (currentTimeSec >= startSec - 0.12) {
        const densityTag = Math.round(this.densityScale * 100);
        const layoutKey =
          portraitRect && canvasRect
            ? `${Math.round(portraitRect.left / 10)}_${Math.round(portraitRect.top / 10)}_${Math.round(portraitRect.width / 10)}_${Math.round(canvasRect.width / 16)}_d${densityTag}`
            : `fallback_d${densityTag}`;
        const densityChanged = this.builtForKey !== layoutKey;
        if (
          !this.active ||
          (!this.ribbonMesh && !this.fadingOut && !this.holdingPostEnd) ||
          densityChanged
        ) {
          this.buildGeometry(portraitRect, canvasRect, camera, boardTopY);
          this.builtForKey = layoutKey;
          this.smoothProgress = THREE.MathUtils.clamp(
            (currentTimeSec - startSec) / growSpan,
            0,
            1.05,
          );
          this.currentOpacity = THREE.MathUtils.clamp(
            (currentTimeSec - (startSec - 0.1)) / 0.3,
            0,
            1,
          );
        }
        this.active = true;
        this.holdingPostEnd = false;
        this.holdElapsed = 0;
        this.fadingOut = false;
        this.fadeOutElapsed = 0;
        this.root.visible = true;
      } else if (this.active || this.holdingPostEnd || this.fadingOut) {
        // Opening video restarted from t=0 or start timer was pushed past current playback time: cleanly reset
        this.smoothProgress = 0;
        this.active = false;
        this.holdingPostEnd = false;
        this.holdElapsed = 0;
        this.fadingOut = false;
        this.fadeOutElapsed = 0;
        this.root.visible = false;
      }
    } else if (this.active) {
      // Video reached its end state: briefly hold the full dense 3D flowchart continuation, then dissolve gracefully
      this.active = false;
      this.holdingPostEnd = true;
      this.holdElapsed = 0;
      this.fadingOut = false;
      this.fadeOutElapsed = 0;
    }
  }

  public stopImmediately(): void {
    this.active = false;
    this.holdingPostEnd = false;
    this.holdElapsed = 0;
    this.fadingOut = false;
    this.fadeOutElapsed = 0;
    this.smoothProgress = 0;
    this.currentOpacity = 0;
    this.root.visible = false;
  }

  private clearBuiltMeshes(): void {
    if (this.ribbonMesh) {
      this.root.remove(this.ribbonMesh);
      this.ribbonMesh = null;
    }
    this.ribbonGeo?.dispose();
    this.ribbonGeo = null;
    this.ribbonMat?.dispose();
    this.ribbonMat = null;

    if (this.nodeMesh) {
      this.root.remove(this.nodeMesh);
      this.nodeMesh = null;
    }
    this.nodeGeo?.dispose();
    this.nodeGeo = null;
    this.nodeMat?.dispose();
    this.nodeMat = null;

    if (this.listMesh) {
      this.root.remove(this.listMesh);
      this.listMesh = null;
    }
    this.listGeo?.dispose();
    this.listGeo = null;
    this.listMat?.dispose();
    this.listMat = null;
    this.listAlphaAttr = null;

    if (this.pulseMesh) {
      this.root.remove(this.pulseMesh);
      this.pulseMesh = null;
    }
    this.pulseGeo?.dispose();
    this.pulseGeo = null;
    this.pulseMat?.dispose();
    this.pulseMat = null;

    this.nodes = [];
    this.listBlocks = [];
    this.pulsePaths = [];
    this.pulses = [];
  }

  /**
   * Projects the exact portrait modal border pixels into 3D world space and generates an ultra-dense,
   * multi-lane 45°/90° PCB opening flowchart with stacked vertical tournament-comb brackets and
   * micro-typography chess-opening lists mirroring the exact end state of `builtin_opening.mp4`.
   */
  private buildGeometry(
    portraitRect: DOMRect | null,
    canvasRect: DOMRect | null,
    camera: THREE.PerspectiveCamera,
    boardTopY: number,
  ): void {
    this.clearBuiltMeshes();

    const tex = getFlowchartTextures();

    // Deterministic PRNG for dense, balanced, architectural schematic layout
    let seed = 91733;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    camera.updateMatrixWorld();
    camera.getWorldDirection(_camForward).normalize();
    _camRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    _camUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();

    // Float the 3D flowchart canopy cleanly across the viewport in rich layered 3D space above the chessboard
    const boardCenter = new THREE.Vector3(0, boardTopY + 1.2, 0);
    const camToBoard = boardCenter.clone().sub(camera.position);
    const baseEyeDepth = Math.max(5.5, camToBoard.dot(_camForward) * 0.84);

    const halfFovTan = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
    const worldSpanY = 2 * baseEyeDepth * halfFovTan;
    const worldSpanX = worldSpanY * camera.aspect;

    // Project exact screen pixel (clientX, clientY) onto `eyeDepth` along the view ray
    const projectScreenToWorld = (clientX: number, clientY: number, eyeDepth: number): THREE.Vector3 => {
      if (!canvasRect || canvasRect.width < 10 || canvasRect.height < 10) {
        return new THREE.Vector3(3.6, boardTopY + 2.2, -1.5);
      }
      _ndc.x = ((clientX - canvasRect.left) / canvasRect.width) * 2 - 1;
      _ndc.y = -((clientY - canvasRect.top) / canvasRect.height) * 2 + 1;
      _raycaster.setFromCamera(_ndc, camera);
      const rayCos = Math.max(0.32, _raycaster.ray.direction.dot(_camForward));
      return _raycaster.ray.origin
        .clone()
        .addScaledVector(_raycaster.ray.direction, eyeDepth / rayCos);
    };

    // Determine exact portrait video frame rect (560x752 portrait aspect inside the modal)
    let pLeft: number;
    let pTop: number;
    let pW: number;
    let pH: number;
    if (portraitRect && portraitRect.width > 12 && portraitRect.height > 12) {
      pLeft = portraitRect.left;
      pTop = portraitRect.top;
      pW = portraitRect.width;
      pH = Math.min(portraitRect.height, portraitRect.width * (752 / 560));
    } else if (canvasRect) {
      pW = Math.min(260, canvasRect.width * 0.24);
      pH = pW * (752 / 560);
      pLeft = canvasRect.right - pW - 18;
      pTop = canvasRect.top + 18;
    } else {
      pW = 240;
      pH = 320;
      pLeft = 900;
      pTop = 24;
    }

    // Span all the way from the portrait's left edge across the full left/upper 3D canvas
    const leftEdgeFrac = canvasRect
      ? THREE.MathUtils.clamp((pLeft - canvasRect.left) / Math.max(1, canvasRect.width), 0.28, 0.94)
      : 0.72;
    const maxReachWorld = worldSpanX * Math.max(0.54, leftEdgeFrac * 0.95);
    const unitScale = THREE.MathUtils.clamp(worldSpanY / 11.2, 0.55, 1.38);
    const canvasH = canvasRect && canvasRect.height > 10 ? canvasRect.height : 800;
    const portraitHeightRatio = THREE.MathUtils.clamp(
      pH / Math.max(240, canvasH) / 0.36,
      0.72,
      1.08,
    );

    const segments: BranchSegment[] = [];
    const minWorldY = boardTopY + 0.32;

    const clampAboveBoard = (v: THREE.Vector3): THREE.Vector3 => {
      if (v.y < minWorldY) v.y = minWorldY;
      return v;
    };

    const addPolyline = (
      pts: THREE.Vector3[],
      tStart: number,
      tEnd: number,
      width: number,
      rgb: readonly [number, number, number],
      recordPulsePath: boolean,
      addCornerNodes: boolean,
      addTipNode: boolean,
      entryWidthScale = 1.0,
    ) => {
      if (pts.length < 2) return;
      let totalLen = 0;
      const cumLen: number[] = [0];
      for (let i = 1; i < pts.length; i++) {
        totalLen += pts[i].distanceTo(pts[i - 1]);
        cumLen.push(totalLen);
      }
      if (totalLen < 1e-4) return;

      const evalWidthAt = (s: number): number => {
        if (entryWidthScale === 1.0) return width;
        const ramp = THREE.MathUtils.smoothstep(s, 0.0, 0.38);
        return width * THREE.MathUtils.lerp(entryWidthScale, 1.0, ramp);
      };

      for (let i = 1; i < pts.length; i++) {
        const s0 = cumLen[i - 1] / totalLen;
        const s1 = cumLen[i] / totalLen;
        const segT0 = THREE.MathUtils.lerp(tStart, tEnd, s0);
        const segT1 = THREE.MathUtils.lerp(tStart, tEnd, s1);
        const w0 = evalWidthAt(s0);
        const w1 = evalWidthAt(s1);
        segments.push({
          p0: pts[i - 1],
          p1: pts[i],
          t0: segT0,
          t1: segT1,
          width0: w0,
          width1: w1,
          rgb,
        });
        if (addCornerNodes && i < pts.length - 1) {
          this.nodes.push({
            pos: pts[i].clone(),
            appearAt: segT1,
            scale: w1 * 2.05,
            rgb,
            phase: rand() * Math.PI * 2,
          });
        }
      }

      if (addTipNode) {
        const wTip = evalWidthAt(1.0);
        this.nodes.push({
          pos: pts[pts.length - 1].clone(),
          appearAt: tEnd,
          scale: wTip * 2.35,
          rgb,
          phase: rand() * Math.PI * 2,
        });
      }

      if (recordPulsePath) {
        this.pulsePaths.push({
          points: pts.map((p) => p.clone()),
          tStart,
          tEnd,
          rgb,
        });
      }
    };

    // Camera-aligned schematic basis for crisp 90° orthogonal & 45° diagonal PCB traces in 3D space
    const dirLeft = _camRight.clone().negate();
    const dirUp = _camUp.clone();
    const dirDepth = _camForward.clone();

    let listTileCounter = 0;
    const density = this.densityScale;
    // Gently refine ribbon line width as density increases so tightly packed PCB traces stay razor-crisp
    const widthDensityFactor =
      density > 1.0
        ? 1 / Math.pow(density, 0.24)
        : density < 1.0
          ? Math.min(1.16, 1 / Math.pow(density, 0.12))
          : 1.0;
    const traceScale = unitScale * widthDensityFactor * portraitHeightRatio;

    /**
     * Spawns a dense orthogonal tournament-comb bracket cluster — the exact signature visual motif
     * of the final frame of `builtin_opening.mp4`!
     * Structure:
     *   - Short orthogonal feed stub into a vertical spine
     *   - Tightly stacked horizontal prongs branching leftward (scaled by `densityScale`)
     *   - Optional nested secondary mini-bracket off the outer/mid prongs
     *   - Crisp borderless micro-typography opening-variation list tucked directly beside the prongs!
     */
    const addCombBracketCluster = (
      origin: THREE.Vector3,
      tStart: number,
      rgb: readonly [number, number, number],
      scaleFactor: number,
      verticalBias: number,
      attachList: boolean,
    ) => {
      const baseProngs = 5 + Math.floor(rand() * 4); // 5..8 tightly stacked prongs at 1.0x density
      const prongCount =
        density === 1.0
          ? baseProngs
          : Math.max(2, Math.min(16, Math.round(baseProngs * THREE.MathUtils.clamp(density, 0.35, 1.9))));
      const spacingScale =
        density > 1.0
          ? 1 / Math.pow(density, 0.42)
          : density < 1.0
            ? 1 / Math.pow(density, 0.18)
            : 1.0;
      const prongSpacing = (0.088 + rand() * 0.024) * unitScale * scaleFactor * spacingScale;
      const totalH = (prongCount - 1) * prongSpacing;
      const spineCenterOffset = verticalBias * totalH * 0.35;
      const feedLen = (0.14 + rand() * 0.14) * unitScale * scaleFactor;
      const prongLen = (0.16 + rand() * 0.12) * unitScale * scaleFactor;
      const lineW = 0.0094 * traceScale * Math.max(0.78, scaleFactor);

      const spineMid = origin.clone().addScaledVector(dirLeft, feedLen);
      clampAboveBoard(spineMid);
      const tFeedEnd = Math.min(0.96, tStart + 0.045);
      addPolyline([origin.clone(), spineMid], tStart, tFeedEnd, lineW * 1.12, rgb, false, true, false);

      // Top and bottom of vertical comb spine
      const spineTop = spineMid
        .clone()
        .addScaledVector(dirUp, totalH * 0.5 + spineCenterOffset);
      const spineBot = spineMid
        .clone()
        .addScaledVector(dirUp, -totalH * 0.5 + spineCenterOffset);
      clampAboveBoard(spineTop);
      clampAboveBoard(spineBot);

      const tSpineEnd = Math.min(0.98, tFeedEnd + 0.07);
      // Draw spine expanding both upward and downward simultaneously from the feed junction!
      addPolyline([spineMid.clone(), spineTop], tFeedEnd, tSpineEnd, lineW, rgb, false, false, false);
      addPolyline([spineMid.clone(), spineBot], tFeedEnd, tSpineEnd, lineW, rgb, false, false, false);

      const subForkProb = THREE.MathUtils.clamp(0.64 * density, 0.14, 0.96);
      const midProngIdx = Math.floor(prongCount / 2);

      // Draw every horizontal comb prong radiating left off the vertical spine
      for (let p = 0; p < prongCount; p++) {
        const frac = prongCount > 1 ? p / (prongCount - 1) : 0.5;
        const pRoot = spineBot.clone().lerp(spineTop, frac);
        const distFromMid = Math.abs(frac - 0.5) * 2;
        const tProngStart = THREE.MathUtils.lerp(tFeedEnd, tSpineEnd, distFromMid);
        const tProngEnd = Math.min(0.995, tProngStart + 0.045 + rand() * 0.025);

        const thisProngLen = prongLen * (p === 0 || p === prongCount - 1 ? 1.18 : 0.82 + rand() * 0.36);
        const pTip = pRoot.clone().addScaledVector(dirLeft, thisProngLen);
        clampAboveBoard(pTip);

        addPolyline(
          [pRoot, pTip],
          tProngStart,
          tProngEnd,
          lineW * 0.88,
          rgb,
          false,
          false,
          p === 0 || p === prongCount - 1 || p % 3 === 0,
        );

        // Nested secondary mini-fork (2-prong micro-bracket) on outer rungs (plus mid rung at high density)
        const eligibleForSubFork =
          p === 0 || p === prongCount - 1 || (density >= 1.45 && p === midProngIdx);
        if (eligibleForSubFork && scaleFactor > 0.72 && rand() < subForkProb) {
          const subSpan = prongSpacing * 1.15;
          const subStub = prongLen * 0.55;
          for (const subSign of [-1, 1]) {
            const subKnee = pTip.clone().addScaledVector(dirUp, subSign * subSpan * 0.5);
            const subEnd = subKnee.clone().addScaledVector(dirLeft, subStub);
            clampAboveBoard(subKnee);
            clampAboveBoard(subEnd);
            addPolyline(
              [pTip.clone(), subKnee, subEnd],
              tProngEnd,
              Math.min(0.998, tProngEnd + 0.045),
              lineW * 0.75,
              rgb,
              false,
              false,
              false,
            );
          }
        }
      }

      // Attach an ultra-crisp micro-typography chess-opening variation column directly next to the comb prongs!
      const shouldAttachList = attachList && (density >= 0.85 || rand() < density * 1.15);
      if (shouldAttachList) {
        const tileIdx = listTileCounter++ % 16;
        const listCenter = spineBot.clone().lerp(spineTop, 0.5);
        const listScaleDensity = density > 1.0 ? 1 / Math.pow(density, 0.12) : 1.0;
        const listH = Math.max(0.46 * unitScale, totalH * 1.16 * listScaleDensity);
        const listW = listH * 0.96;
        // Tuck the text column neatly to the left of the prong tips so lines & text interlock seamlessly
        listCenter.addScaledVector(dirLeft, prongLen + listW * 0.5);
        clampAboveBoard(listCenter);

        this.listBlocks.push({
          pos: listCenter,
          appearAt: Math.min(0.98, tSpineEnd + 0.02),
          scaleW: listW,
          scaleH: listH,
          rgb,
          tileCol: tileIdx % 4,
          tileRow: 3 - Math.floor(tileIdx / 4),
          phase: rand() * Math.PI * 2,
        });
      }
    };

    // Build multi-lane border-exit highways + parallel sibling lanes + dense comb clusters scaled by density!
    const lanePitchPx = Math.max(2.0, pH * 0.0076);
    const highwayKeepStride = density < 0.38 ? 3 : density < 0.62 ? 2 : 1;

    for (let hIdx = 0; hIdx < BORDER_HIGHWAYS.length; hIdx++) {
      if (highwayKeepStride > 1 && hIdx % highwayKeepStride !== 0) {
        continue;
      }
      const hw = BORDER_HIGHWAYS[hIdx];
      const laneCount =
        density === 1.0
          ? hw.lanes.length
          : Math.max(1, Math.min(6, Math.round(hw.lanes.length * density)));
      const laneSpacingScale = laneCount > hw.lanes.length ? hw.lanes.length / laneCount : 1.0;
      const depthShift = hw.depthLayer * unitScale * 0.95;

      // Shared highway geometry template so parallel lanes stay tightly bundled like real PCB ribbon tracks!
      const baseReach = maxReachWorld * hw.reachFactor * (0.9 + rand() * 0.16);
      const run1Frac = 0.08 + rand() * 0.07;
      const diag1Frac = 0.14 + rand() * 0.11;
      const run2Frac = 0.24 + rand() * 0.14;
      const diag2Frac = 0.12 + rand() * 0.09;
      const run3Frac = 0.22 + rand() * 0.14;
      const ySign1 = hw.fanBias >= 0 ? 1 : -1;
      const yMag1 = 0.44 + Math.abs(hw.fanBias) * 0.82;
      const ySign2 = (hIdx % 2 === 0 ? 1 : -1) * (Math.abs(hw.fanBias) > 0.26 ? ySign1 : 1);

      for (let laneIdx = 0; laneIdx < laneCount; laneIdx++) {
        const colKey = hw.lanes[laneIdx % hw.lanes.length];
        const col = FLOWCHART_COLORS[colKey].rgb;
        const laneOffset = (laneIdx - (laneCount - 1) * 0.5) * lanePitchPx * laneSpacingScale;
        const laneWorldOffset =
          (laneIdx - (laneCount - 1) * 0.5) * 0.032 * unitScale * laneSpacingScale;

        // Overlap 1.5px inside the portrait frame so there is ZERO gap at the video boundary!
        const clientX =
          hw.edge === 'left'
            ? pLeft + 1.5
            : THREE.MathUtils.clamp(pLeft + pW * hw.tEdge + laneOffset, pLeft + 4, pLeft + pW - 4);
        const clientY =
          hw.edge === 'left'
            ? THREE.MathUtils.clamp(pTop + pH * hw.tEdge + laneOffset, pTop + 4, pTop + pH - 4)
            : pTop + 1.5;

        const anchor = projectScreenToWorld(clientX, clientY, baseEyeDepth);
        const t0 = hw.startOffset + laneIdx * 0.012;

        // Crisp subtle entry dot right on the portrait border matching the video's fine trace gauge
        if (laneIdx === 0) {
          this.nodes.push({
            pos: anchor.clone(),
            appearAt: t0,
            scale: 0.036 * traceScale,
            rgb: col,
            phase: rand() * Math.PI * 2,
          });
        }

        // Each sibling lane peels off cleanly at staggered lengths just like the video's multi-color trunk bundles!
        const laneReach = baseReach * (1.0 - laneIdx * 0.14 + (rand() - 0.5) * 0.06);
        const trunkPts: THREE.Vector3[] = [anchor.clone()];
        const cur = anchor.clone();

        if (hw.edge === 'left') {
          // 1. Straight horizontal exit out of left video border
          cur.addScaledVector(dirLeft, laneReach * run1Frac);
          cur.addScaledVector(dirDepth, depthShift * 0.25);
          clampAboveBoard(cur);
          trunkPts.push(cur.clone());

          // 2. Crisp 45° diagonal PCB bend fanning upward/downward
          const d1 = laneReach * diag1Frac;
          cur.addScaledVector(dirLeft, d1 * 0.72);
          cur.addScaledVector(dirUp, ySign1 * d1 * 0.54 * yMag1 + laneWorldOffset);
          cur.addScaledVector(dirDepth, depthShift * 0.45);
          clampAboveBoard(cur);
          trunkPts.push(cur.clone());

          // 3. Long horizontal PCB bus run across the dark canopy
          cur.addScaledVector(dirLeft, laneReach * run2Frac);
          cur.addScaledVector(dirDepth, depthShift * 0.2);
          clampAboveBoard(cur);
          trunkPts.push(cur.clone());

          // 4. Second 45° diagonal miter peel-off (sibling lanes split apart here!)
          const d2 = laneReach * diag2Frac * (laneIdx === 0 ? 1.0 : 0.85);
          const laneSign2 = laneIdx === 0 ? ySign2 : laneIdx % 2 === 1 ? -ySign2 : ySign1;
          cur.addScaledVector(dirLeft, d2 * 0.72);
          cur.addScaledVector(dirUp, laneSign2 * d2 * 0.52);
          clampAboveBoard(cur);
          trunkPts.push(cur.clone());

          // 5. Outer horizontal bus shelf
          cur.addScaledVector(dirLeft, laneReach * run3Frac);
          clampAboveBoard(cur);
          trunkPts.push(cur.clone());
        } else {
          // Top-edge parallel highway: rises straight out of the top video border, then crisp 45° left & horizontal run
          const rise1 = worldSpanY * (0.045 + rand() * 0.045 + laneIdx * 0.015);
          cur.addScaledVector(dirUp, rise1);
          cur.addScaledVector(dirDepth, depthShift * 0.3);
          trunkPts.push(cur.clone());

          const dLeft = laneReach * (0.28 + rand() * 0.14);
          cur.addScaledVector(dirLeft, dLeft * 0.74);
          cur.addScaledVector(dirUp, dLeft * 0.34);
          cur.addScaledVector(dirDepth, depthShift * 0.45);
          trunkPts.push(cur.clone());

          cur.addScaledVector(dirLeft, laneReach * (0.44 + rand() * 0.18));
          cur.addScaledVector(dirUp, laneWorldOffset * 1.4);
          clampAboveBoard(cur);
          trunkPts.push(cur.clone());
        }

        const tTrunkEnd = THREE.MathUtils.clamp(t0 + 0.42 + rand() * 0.14, 0.36, 0.68);
        const trunkWidth = (laneIdx === 0 ? 0.0142 : 0.011) * traceScale;
        addPolyline(trunkPts, t0, tTrunkEnd, trunkWidth, col, laneIdx === 0, true, false, 0.78);

        // Attach a dense comb-bracket + micro-typography list right at the tip of every lane!
        addCombBracketCluster(
          trunkPts[trunkPts.length - 1],
          tTrunkEnd,
          col,
          laneIdx === 0 ? 1.0 : 0.84,
          ySign1 * (laneIdx === 0 ? 0.3 : -0.3),
          true,
        );

        // Dense mid-highway orthogonal 45°/90° spurs + comb clusters (matching the packed interior of the video!)
        const baseSpurCount = laneIdx === 0 ? hw.combClusters : Math.max(1, hw.combClusters - 2);
        const spurCount =
          density === 1.0
            ? baseSpurCount
            : Math.max(density < 0.45 ? 0 : 1, Math.min(8, Math.round(baseSpurCount * density)));
        for (let sIdx = 0; sIdx < spurCount; sIdx++) {
          const segIdx = Math.min(trunkPts.length - 2, 1 + (sIdx % Math.max(1, trunkPts.length - 2)));
          const segLerp = 0.25 + ((sIdx * 0.37 + laneIdx * 0.23) % 0.65);
          const spurOrigin = trunkPts[segIdx].clone().lerp(trunkPts[segIdx + 1], segLerp);
          const approxFrac = (segIdx + segLerp) / Math.max(1, trunkPts.length - 1);
          const tSpurStart = THREE.MathUtils.lerp(t0, tTrunkEnd, approxFrac);
          const tSpurEnd = THREE.MathUtils.clamp(tSpurStart + 0.16 + rand() * 0.12, tSpurStart + 0.1, 0.88);

          const spurSign = (hIdx + laneIdx + sIdx) % 2 === 0 ? 1 : -1;
          const spurDiag = (0.24 + rand() * 0.34) * unitScale;
          const spurRun = (0.32 + rand() * 0.56) * unitScale;
          const spurDepth = (rand() - 0.5) * 0.62 * unitScale;

          const pKnee = spurOrigin
            .clone()
            .addScaledVector(dirLeft, spurDiag * 0.7)
            .addScaledVector(dirUp, spurSign * spurDiag * 0.7)
            .addScaledVector(dirDepth, spurDepth * 0.5);
          clampAboveBoard(pKnee);

          const pEnd = pKnee
            .clone()
            .addScaledVector(dirLeft, spurRun)
            .addScaledVector(dirDepth, spurDepth * 0.5);
          clampAboveBoard(pEnd);

          const spurW = 0.0105 * traceScale;
          addPolyline([spurOrigin, pKnee, pEnd], tSpurStart, tSpurEnd, spurW, col, laneIdx === 0 && sIdx === 0, true, false);

          // Spawn a crisp comb-bracket + micro-text column at the spur's end!
          addCombBracketCluster(
            pEnd,
            tSpurEnd,
            col,
            0.78 + rand() * 0.24,
            spurSign * 0.4,
            sIdx % 2 === 0 || laneIdx === 0,
          );

          // Add tight cross-tie hairline connectors between nearby parallel levels (authentic PCB schematic richness)
          const addCrossTie =
            density >= 0.55 &&
            (sIdx % 2 === 1 || (density >= 1.5 && sIdx % 2 === 0 && laneIdx === 0));
          if (addCrossTie) {
            const tapPt = pKnee.clone().lerp(pEnd, 0.45);
            const dropPt = tapPt
              .clone()
              .addScaledVector(dirUp, -spurSign * (0.18 + rand() * 0.18) * unitScale);
            const tailPt = dropPt.clone().addScaledVector(dirLeft, (0.28 + rand() * 0.32) * unitScale);
            clampAboveBoard(dropPt);
            clampAboveBoard(tailPt);
            const tTieStart = THREE.MathUtils.lerp(tSpurStart, tSpurEnd, 0.55);
            const tTieEnd = Math.min(0.95, tTieStart + 0.11);
            addPolyline(
              [tapPt, dropPt, tailPt],
              tTieStart,
              tTieEnd,
              0.0082 * traceScale,
              col,
              false,
              false,
              true,
            );
          }
        }
      }
    }

    // 1. Assemble SINGLE batched GPU Ribbon BufferGeometry for ALL 2,000+ crisp PCB traces & comb brackets
    const segCount = segments.length;
    const positions = new Float32Array(segCount * 4 * 3);
    const dirs = new Float32Array(segCount * 4 * 3);
    const sides = new Float32Array(segCount * 4);
    const widths = new Float32Array(segCount * 4);
    const times = new Float32Array(segCount * 4);
    const colors = new Float32Array(segCount * 4 * 3);
    const uvs = new Float32Array(segCount * 4 * 2);
    const indices = new Uint32Array(segCount * 6);

    const segDir = new THREE.Vector3();
    for (let i = 0; i < segCount; i++) {
      const seg = segments[i];
      segDir.subVectors(seg.p1, seg.p0);
      if (segDir.lengthSq() < 1e-8) segDir.set(1, 0, 0);
      else segDir.normalize();

      // Tiny longitudinal overlap so 45° & 90° PCB corners fuse cleanly with zero hairline miter gap
      const pad0 = seg.width0 * 0.46;
      const pad1 = seg.width1 * 0.46;
      const p0x = seg.p0.x - segDir.x * pad0;
      const p0y = seg.p0.y - segDir.y * pad0;
      const p0z = seg.p0.z - segDir.z * pad0;
      const p1x = seg.p1.x + segDir.x * pad1;
      const p1y = seg.p1.y + segDir.y * pad1;
      const p1z = seg.p1.z + segDir.z * pad1;

      const vBase = i * 4;
      const verts: ReadonlyArray<[number, number, number, number, number, number, number, number]> = [
        [p0x, p0y, p0z, -1, seg.width0, seg.t0, 0, 0],
        [p0x, p0y, p0z, +1, seg.width0, seg.t0, 0, 1],
        [p1x, p1y, p1z, -1, seg.width1, seg.t1, 1, 0],
        [p1x, p1y, p1z, +1, seg.width1, seg.t1, 1, 1],
      ];

      for (let k = 0; k < 4; k++) {
        const vi = vBase + k;
        const [vx, vy, vz, side, wVal, tVal, uCoord, vCoord] = verts[k];
        positions[vi * 3] = vx;
        positions[vi * 3 + 1] = vy;
        positions[vi * 3 + 2] = vz;

        dirs[vi * 3] = segDir.x;
        dirs[vi * 3 + 1] = segDir.y;
        dirs[vi * 3 + 2] = segDir.z;

        sides[vi] = side;
        widths[vi] = wVal;
        times[vi] = tVal;

        colors[vi * 3] = seg.rgb[0];
        colors[vi * 3 + 1] = seg.rgb[1];
        colors[vi * 3 + 2] = seg.rgb[2];

        uvs[vi * 2] = uCoord;
        uvs[vi * 2 + 1] = vCoord;
      }

      const iBase = i * 6;
      indices[iBase] = vBase;
      indices[iBase + 1] = vBase + 1;
      indices[iBase + 2] = vBase + 2;
      indices[iBase + 3] = vBase + 1;
      indices[iBase + 4] = vBase + 3;
      indices[iBase + 5] = vBase + 2;
    }

    this.ribbonGeo = new THREE.BufferGeometry();
    this.ribbonGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.ribbonGeo.setAttribute('aDir', new THREE.BufferAttribute(dirs, 3));
    this.ribbonGeo.setAttribute('aSide', new THREE.BufferAttribute(sides, 1));
    this.ribbonGeo.setAttribute('aWidth', new THREE.BufferAttribute(widths, 1));
    this.ribbonGeo.setAttribute('aTime', new THREE.BufferAttribute(times, 1));
    this.ribbonGeo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    this.ribbonGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.ribbonGeo.setIndex(new THREE.BufferAttribute(indices, 1));

    this.ribbonMat = new THREE.ShaderMaterial({
      vertexShader: RIBBON_VERT,
      fragmentShader: RIBBON_FRAG,
      uniforms: {
        uProgress: { value: 0 },
        uOpacity: { value: 0 },
        uClock: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    this.ribbonMesh = new THREE.Mesh(this.ribbonGeo, this.ribbonMat);
    this.ribbonMesh.frustumCulled = false;
    this.ribbonMesh.renderOrder = 7;
    this.root.add(this.ribbonMesh);

    // 2. InstancedMesh for Crisp Pinpoint Circuit Junction & Terminal Nodes
    this.nodeGeo = new THREE.PlaneGeometry(1, 1);
    this.nodeMat = new THREE.MeshBasicMaterial({
      map: tex.nodeDotTex,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.nodeMesh = new THREE.InstancedMesh(this.nodeGeo, this.nodeMat, Math.max(1, this.nodes.length));
    this.nodeMesh.frustumCulled = false;
    this.nodeMesh.renderOrder = 8;
    _mat4.compose(_tmpPos.set(0, 0, 0), _idQuat, _zeroScale);
    _tmpCol.setRGB(0, 0, 0);
    for (let i = 0; i < this.nodes.length; i++) {
      this.nodeMesh.setMatrixAt(i, _mat4);
      this.nodeMesh.setColorAt(i, _tmpCol);
    }
    this.nodeMesh.instanceMatrix.needsUpdate = true;
    if (this.nodeMesh.instanceColor) this.nodeMesh.instanceColor.needsUpdate = true;
    this.root.add(this.nodeMesh);

    // 3. InstancedMesh for Ultra-Dense Borderless Micro-Typography Opening Variation Lists (1 draw call!)
    const listCount = Math.max(1, this.listBlocks.length);
    this.listGeo = new THREE.PlaneGeometry(1.0, 1.0);
    const tileUvs = new Float32Array(listCount * 2);
    const listColors = new Float32Array(listCount * 3);
    const listAlphas = new Float32Array(listCount);
    for (let i = 0; i < this.listBlocks.length; i++) {
      const b = this.listBlocks[i];
      tileUvs[i * 2] = b.tileCol * 0.25;
      tileUvs[i * 2 + 1] = b.tileRow * 0.25;
      listColors[i * 3] = b.rgb[0];
      listColors[i * 3 + 1] = b.rgb[1];
      listColors[i * 3 + 2] = b.rgb[2];
      listAlphas[i] = 0;
    }
    this.listGeo.setAttribute('aTileUv', new THREE.InstancedBufferAttribute(tileUvs, 2));
    this.listGeo.setAttribute('aCardColor', new THREE.InstancedBufferAttribute(listColors, 3));
    this.listAlphaAttr = new THREE.InstancedBufferAttribute(listAlphas, 1);
    this.listGeo.setAttribute('aCardAlpha', this.listAlphaAttr);

    this.listMat = new THREE.ShaderMaterial({
      vertexShader: LIST_VERT,
      fragmentShader: LIST_FRAG,
      uniforms: {
        uAtlas: { value: tex.listAtlasTex },
        uOpacity: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.listMesh = new THREE.InstancedMesh(this.listGeo, this.listMat, listCount);
    this.listMesh.frustumCulled = false;
    this.listMesh.renderOrder = 8;
    for (let i = 0; i < listCount; i++) {
      this.listMesh.setMatrixAt(i, _mat4);
    }
    this.listMesh.instanceMatrix.needsUpdate = true;
    this.root.add(this.listMesh);

    // 4. InstancedMesh for Tiny Racing Data-Signal Photons traveling along the parallel opening buses
    const basePulseCount = Math.min(88, Math.max(28, this.pulsePaths.length * 2));
    const pulseCount =
      density === 1.0
        ? basePulseCount
        : Math.min(180, Math.max(12, Math.round(basePulseCount * THREE.MathUtils.clamp(density, 0.4, 2.0))));
    this.pulseGeo = new THREE.PlaneGeometry(1, 1);
    this.pulseMat = new THREE.MeshBasicMaterial({
      map: tex.nodeDotTex,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.pulseMesh = new THREE.InstancedMesh(this.pulseGeo, this.pulseMat, pulseCount);
    this.pulseMesh.frustumCulled = false;
    this.pulseMesh.renderOrder = 9;
    for (let i = 0; i < pulseCount; i++) {
      this.pulses.push({
        pathIdx: i % Math.max(1, this.pulsePaths.length),
        u: rand(),
        speed: 0.22 + rand() * 0.24,
        scale: (0.056 + rand() * 0.034) * traceScale,
      });
      this.pulseMesh.setMatrixAt(i, _mat4);
      this.pulseMesh.setColorAt(i, _tmpCol);
    }
    this.pulseMesh.instanceMatrix.needsUpdate = true;
    if (this.pulseMesh.instanceColor) this.pulseMesh.instanceColor.needsUpdate = true;
    this.root.add(this.pulseMesh);
  }

  /**
   * Advances progressive branch growth, comb-bracket expansion, micro-typography list pop-ins,
   * racing data photons, end-state hold, and graceful post-video fade-out.
   */
  public update(dt: number, cameraQuat: THREE.Quaternion): boolean {
    if (!this.active && !this.holdingPostEnd && !this.fadingOut) return false;
    if (
      !this.ribbonMat ||
      !this.nodeMesh ||
      !this.listMesh ||
      !this.listMat ||
      !this.listAlphaAttr ||
      !this.pulseMesh
    ) {
      return false;
    }

    this.clockSec += dt;

    if (this.active) {
      const startSec = this.borderStartSec;
      const growSpan = this.getEffectiveGrowSpanSec();
      const targetProgress = THREE.MathUtils.clamp(
        (this.videoTimeSec - startSec) / growSpan,
        0,
        1.05,
      );
      this.smoothProgress = THREE.MathUtils.lerp(
        this.smoothProgress,
        targetProgress,
        Math.min(1, dt * 11.5),
      );
      this.currentOpacity = THREE.MathUtils.clamp(
        (this.videoTimeSec - (startSec - 0.1)) / 0.3,
        0,
        1,
      );
    } else if (this.holdingPostEnd) {
      // Smoothly finish any remaining tips to full 100% dense end-state while holding!
      this.smoothProgress = THREE.MathUtils.lerp(this.smoothProgress, 1.05, Math.min(1, dt * 6.0));
      this.currentOpacity = 1;
      this.holdElapsed += dt;
      if (this.holdElapsed >= this.HOLD_AFTER_END_SEC) {
        this.holdingPostEnd = false;
        this.fadingOut = true;
        this.fadeOutElapsed = 0;
      }
    } else if (this.fadingOut) {
      this.fadeOutElapsed += dt;
      const k = THREE.MathUtils.clamp(this.fadeOutElapsed / this.FADE_OUT_DURATION, 0, 1);
      this.currentOpacity = (1 - k) * (1 - k);
      if (k >= 1) {
        this.fadingOut = false;
        this.root.visible = false;
        return false;
      }
    }

    const prog = this.smoothProgress;
    const op = this.currentOpacity;

    // Update GPU ribbon uniforms
    this.ribbonMat.uniforms.uProgress.value = prog;
    this.ribbonMat.uniforms.uOpacity.value = op;
    this.ribbonMat.uniforms.uClock.value = this.clockSec;
    this.listMat.uniforms.uOpacity.value = op;

    // Update pinpoint circuit junction & terminal nodes
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const delta = prog - n.appearAt;
      if (delta <= 0) {
        _mat4.compose(n.pos, cameraQuat, _zeroScale);
        _tmpCol.setRGB(0, 0, 0);
      } else {
        const pop = Math.min(1, delta / 0.04);
        const flash = Math.exp(-delta * 20.0) * 0.48;
        const breathe = 0.94 + 0.08 * Math.sin(this.clockSec * 4.2 + n.phase);
        const s = n.scale * (pop * (1.0 + flash) * breathe);
        _scaleVec.setScalar(s);
        _mat4.compose(n.pos, cameraQuat, _scaleVec);
        const bright = op * pop * (1.0 + flash * 0.7);
        _tmpCol.setRGB(n.rgb[0] * bright, n.rgb[1] * bright, n.rgb[2] * bright);
      }
      this.nodeMesh.setMatrixAt(i, _mat4);
      this.nodeMesh.setColorAt(i, _tmpCol);
    }
    this.nodeMesh.instanceMatrix.needsUpdate = true;
    if (this.nodeMesh.instanceColor) this.nodeMesh.instanceColor.needsUpdate = true;

    // Update dense micro-typography chess-opening variation list columns
    const alphaArray = this.listAlphaAttr.array as Float32Array;
    for (let i = 0; i < this.listBlocks.length; i++) {
      const b = this.listBlocks[i];
      const delta = prog - b.appearAt;
      if (delta <= 0) {
        _mat4.compose(b.pos, cameraQuat, _zeroScale);
        alphaArray[i] = 0;
      } else {
        const pop = Math.min(1, delta / 0.06);
        const easeOut = 1 - (1 - pop) * (1 - pop);
        const shimmer = 0.92 + 0.08 * Math.sin(this.clockSec * 3.1 + b.phase);
        _scaleVec.set(b.scaleW * (0.82 + 0.18 * easeOut), b.scaleH * (0.82 + 0.18 * easeOut), 1);
        _mat4.compose(b.pos, cameraQuat, _scaleVec);
        alphaArray[i] = easeOut * shimmer;
      }
      this.listMesh.setMatrixAt(i, _mat4);
    }
    this.listMesh.instanceMatrix.needsUpdate = true;
    this.listAlphaAttr.needsUpdate = true;

    // Update racing neon data-signal photons traveling along revealed parallel highways
    for (let i = 0; i < this.pulses.length; i++) {
      const p = this.pulses[i];
      const path = this.pulsePaths[p.pathIdx];
      if (!path || path.points.length < 2 || prog <= path.tStart + 0.03) {
        _mat4.compose(_tmpPos.set(0, 0, 0), cameraQuat, _zeroScale);
        _tmpCol.setRGB(0, 0, 0);
      } else {
        p.u = (p.u + dt * p.speed) % 1;
        const maxRevealedU = THREE.MathUtils.clamp(
          (prog - path.tStart) / Math.max(0.02, path.tEnd - path.tStart),
          0,
          1,
        );
        const uCur = p.u * maxRevealedU;
        const segFloat = uCur * (path.points.length - 1);
        const idx0 = Math.min(path.points.length - 2, Math.floor(segFloat));
        const frac = segFloat - idx0;
        _tmpPos.lerpVectors(path.points[idx0], path.points[idx0 + 1], frac);

        const edgeFade = Math.sin(Math.min(1, p.u) * Math.PI);
        const borderTaper = 0.76 + 0.24 * THREE.MathUtils.smoothstep(uCur, 0.0, 0.28);
        const s = p.scale * (0.62 + 0.42 * edgeFade) * borderTaper;
        _scaleVec.setScalar(s);
        _mat4.compose(_tmpPos, cameraQuat, _scaleVec);

        const bright = op * edgeFade * 1.15;
        _tmpCol.setRGB(
          Math.min(1.3, path.rgb[0] * bright + 0.25 * bright),
          Math.min(1.3, path.rgb[1] * bright + 0.25 * bright),
          Math.min(1.3, path.rgb[2] * bright + 0.25 * bright),
        );
      }
      this.pulseMesh.setMatrixAt(i, _mat4);
      this.pulseMesh.setColorAt(i, _tmpCol);
    }
    this.pulseMesh.instanceMatrix.needsUpdate = true;
    if (this.pulseMesh.instanceColor) this.pulseMesh.instanceColor.needsUpdate = true;

    return true;
  }

  public dispose(): void {
    this.stopImmediately();
    this.clearBuiltMeshes();
  }
}
