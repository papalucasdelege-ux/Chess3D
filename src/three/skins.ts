import * as THREE from 'three';
import type { BoardSkinId, LightingMood } from '../shared/types';

export interface BoardSkinSpec {
  id: BoardSkinId;
  name: string;
  subtitle: string;
  previewSwatches: [string, string, string]; // light square, dark square, accent trim
  sceneBg: number;
  fogColor: number;
  tableColor: number;
  lightSquare: {
    baseHex: string;
    grainHex: string;
    pattern: 'wood' | 'marble' | 'slate' | 'malachite' | 'glass';
    roughness: number;
    metalness: number;
    clearcoat: number;
  };
  darkSquare: {
    baseHex: string;
    grainHex: string;
    pattern: 'wood' | 'marble' | 'slate' | 'malachite' | 'glass';
    roughness: number;
    metalness: number;
    clearcoat: number;
  };
  frameBaseHex: string;
  frameGrainHex: string;
  framePattern: 'wood' | 'marble' | 'slate' | 'malachite' | 'glass';
  frameColor: number;
  frameRoughness: number;
  frameMetalness: number;
  boardEnvIntensity: number;
  pieceEnvIntensity: number;
  coordTextColor: string;
  whitePiece: {
    color: number;
    roughness: number;
    metalness: number;
    clearcoat: number;
    collarColor: number;
    collarRoughness: number;
    collarMetalness: number;
    feltColor: number;
  };
  blackPiece: {
    color: number;
    roughness: number;
    metalness: number;
    clearcoat: number;
    collarColor: number;
    collarRoughness: number;
    collarMetalness: number;
    feltColor: number;
  };
  glassMode?: boolean;
}

export const BOARD_SKINS: Record<BoardSkinId, BoardSkinSpec> = {
  'walnut-maple': {
    id: 'walnut-maple',
    name: 'Classic Wood',
    subtitle: 'Matte light maple & oiled dark walnut hardwood',
    previewSwatches: ['#e2c496', '#613c24', '#3b2416'],
    sceneBg: 0x000000,
    fogColor: 0x000000,
    tableColor: 0x000000,
    lightSquare: {
      baseHex: '#dfc194',
      grainHex: '#be9763',
      pattern: 'wood',
      roughness: 0.84,
      metalness: 0.0,
      clearcoat: 0.0,
    },
    darkSquare: {
      baseHex: '#643d24',
      grainHex: '#3e2212',
      pattern: 'wood',
      roughness: 0.8,
      metalness: 0.0,
      clearcoat: 0.0,
    },
    frameBaseHex: '#3f2617',
    frameGrainHex: '#26150b',
    framePattern: 'wood',
    frameColor: 0xffffff,
    frameRoughness: 0.86,
    frameMetalness: 0.0,
    boardEnvIntensity: 0.14,
    pieceEnvIntensity: 0.1,
    coordTextColor: '#d9be95',
    whitePiece: {
      color: 0xcfb48e,
      roughness: 0.94,
      metalness: 0.0,
      clearcoat: 0.0,
      collarColor: 0xbba07a,
      collarRoughness: 0.96,
      collarMetalness: 0.0,
      feltColor: 0x3b2416,
    },
    blackPiece: {
      color: 0x26150c,
      roughness: 0.92,
      metalness: 0.0,
      clearcoat: 0.0,
      collarColor: 0x1a0e07,
      collarRoughness: 0.95,
      collarMetalness: 0.0,
      feltColor: 0x140b06,
    },
  },
  'carrara-nero': {
    id: 'carrara-nero',
    name: 'Carrara Marble',
    subtitle: 'Veined Italian marble & Nero Marquina stone',
    previewSwatches: ['#edece8', '#22262c', '#d4b472'],
    sceneBg: 0x000000,
    fogColor: 0x000000,
    tableColor: 0x000000,
    lightSquare: {
      baseHex: '#ebeae6',
      grainHex: '#b9bec7',
      pattern: 'marble',
      roughness: 0.16,
      metalness: 0.03,
      clearcoat: 0.8,
    },
    darkSquare: {
      baseHex: '#20242a',
      grainHex: '#938568',
      pattern: 'marble',
      roughness: 0.15,
      metalness: 0.06,
      clearcoat: 0.85,
    },
    frameBaseHex: '#2b2e35',
    frameGrainHex: '#1b1d22',
    framePattern: 'marble',
    frameColor: 0xffffff,
    frameRoughness: 0.36,
    frameMetalness: 0.08,
    boardEnvIntensity: 0.52,
    pieceEnvIntensity: 0.62,
    coordTextColor: '#dcd2bd',
    whitePiece: {
      color: 0xf5f3ee,
      roughness: 0.18,
      metalness: 0.05,
      clearcoat: 0.78,
      collarColor: 0xd8d3c8,
      collarRoughness: 0.24,
      collarMetalness: 0.12,
      feltColor: 0x2a2f38,
    },
    blackPiece: {
      color: 0x181b20,
      roughness: 0.16,
      metalness: 0.1,
      clearcoat: 0.85,
      collarColor: 0x353b45,
      collarRoughness: 0.24,
      collarMetalness: 0.18,
      feltColor: 0x2a2f38,
    },
  },
  'obsidian-brass': {
    id: 'obsidian-brass',
    name: 'Obsidian & Slate',
    subtitle: 'Honed slate & volcanic basalt stone',
    previewSwatches: ['#505763', '#191c22', '#2b303a'],
    sceneBg: 0x000000,
    fogColor: 0x000000,
    tableColor: 0x000000,
    lightSquare: {
      baseHex: '#525965',
      grainHex: '#3e444f',
      pattern: 'slate',
      roughness: 0.42,
      metalness: 0.28,
      clearcoat: 0.18,
    },
    darkSquare: {
      baseHex: '#181b21',
      grainHex: '#0f1116',
      pattern: 'slate',
      roughness: 0.36,
      metalness: 0.34,
      clearcoat: 0.22,
    },
    frameBaseHex: '#161920',
    frameGrainHex: '#0c0e13',
    framePattern: 'slate',
    frameColor: 0xffffff,
    frameRoughness: 0.48,
    frameMetalness: 0.22,
    boardEnvIntensity: 0.42,
    pieceEnvIntensity: 0.72,
    coordTextColor: '#aeb6c4',
    whitePiece: {
      color: 0xc8cfd9,
      roughness: 0.24,
      metalness: 0.75,
      clearcoat: 0.35,
      collarColor: 0xe3e8ef,
      collarRoughness: 0.22,
      collarMetalness: 0.82,
      feltColor: 0x14171c,
    },
    blackPiece: {
      color: 0x252a33,
      roughness: 0.24,
      metalness: 0.78,
      clearcoat: 0.35,
      collarColor: 0x454d5c,
      collarRoughness: 0.22,
      collarMetalness: 0.82,
      feltColor: 0x14171c,
    },
  },
  'emerald-ivory': {
    id: 'emerald-ivory',
    name: 'Emerald Malachite',
    subtitle: 'Banded malachite stone & warm limestone',
    previewSwatches: ['#e8e0cc', '#184b3b', '#1c2c26'],
    sceneBg: 0x000000,
    fogColor: 0x000000,
    tableColor: 0x000000,
    lightSquare: {
      baseHex: '#eae2ce',
      grainHex: '#d3c7ad',
      pattern: 'marble',
      roughness: 0.22,
      metalness: 0.03,
      clearcoat: 0.65,
    },
    darkSquare: {
      baseHex: '#184d3c',
      grainHex: '#0d3126',
      pattern: 'malachite',
      roughness: 0.18,
      metalness: 0.08,
      clearcoat: 0.82,
    },
    frameBaseHex: '#1b2c25',
    frameGrainHex: '#101d18',
    framePattern: 'malachite',
    frameColor: 0xffffff,
    frameRoughness: 0.38,
    frameMetalness: 0.1,
    boardEnvIntensity: 0.48,
    pieceEnvIntensity: 0.56,
    coordTextColor: '#d3cab3',
    whitePiece: {
      color: 0xf2ebd8,
      roughness: 0.22,
      metalness: 0.04,
      clearcoat: 0.65,
      collarColor: 0xd9cfb6,
      collarRoughness: 0.28,
      collarMetalness: 0.08,
      feltColor: 0x12382c,
    },
    blackPiece: {
      color: 0x193129,
      roughness: 0.2,
      metalness: 0.32,
      clearcoat: 0.72,
      collarColor: 0x2c5245,
      collarRoughness: 0.24,
      collarMetalness: 0.35,
      feltColor: 0x12382c,
    },
  },
  'arctic-glass': {
    id: 'arctic-glass',
    name: 'Arctic Crystal',
    subtitle: 'Frosted glacier glass & smoked sapphire plinth',
    previewSwatches: ['#d3e1ee', '#284561', '#1b2735'],
    sceneBg: 0x000000,
    fogColor: 0x000000,
    tableColor: 0x000000,
    lightSquare: {
      baseHex: '#d2e2ef',
      grainHex: '#b2cadc',
      pattern: 'glass',
      roughness: 0.12,
      metalness: 0.06,
      clearcoat: 1.0,
    },
    darkSquare: {
      baseHex: '#25425e',
      grainHex: '#182d42',
      pattern: 'glass',
      roughness: 0.14,
      metalness: 0.12,
      clearcoat: 1.0,
    },
    frameBaseHex: '#1b2735',
    frameGrainHex: '#121b26',
    framePattern: 'glass',
    frameColor: 0xffffff,
    frameRoughness: 0.28,
    frameMetalness: 0.3,
    boardEnvIntensity: 0.75,
    pieceEnvIntensity: 0.85,
    coordTextColor: '#c3d6e8',
    whitePiece: {
      color: 0xe6f0f8,
      roughness: 0.12,
      metalness: 0.12,
      clearcoat: 1.0,
      collarColor: 0xb8cde0,
      collarRoughness: 0.18,
      collarMetalness: 0.45,
      feltColor: 0x1e2c3b,
    },
    blackPiece: {
      color: 0x203a56,
      roughness: 0.14,
      metalness: 0.24,
      clearcoat: 1.0,
      collarColor: 0x456b91,
      collarRoughness: 0.18,
      collarMetalness: 0.45,
      feltColor: 0x152230,
    },
    glassMode: true,
  },
};

export const SKIN_LIST: BoardSkinSpec[] = [
  BOARD_SKINS['walnut-maple'],
  BOARD_SKINS['carrara-nero'],
  BOARD_SKINS['obsidian-brass'],
  BOARD_SKINS['emerald-ivory'],
  BOARD_SKINS['arctic-glass'],
];

export interface LightingConfig {
  keyColor: number;
  keyIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  rimColor: number;
  rimIntensity: number;
  exposure: number;
}

export const LIGHTING_MOODS: Record<LightingMood, LightingConfig> = {
  'warm-studio': {
    keyColor: 0xfff3de,
    keyIntensity: 3.35,
    hemiSky: 0xd0dff7,
    hemiGround: 0x221912,
    hemiIntensity: 0.24,
    rimColor: 0xc8dbf8,
    rimIntensity: 0.42,
    exposure: 1.04,
  },
  'gallery-cool': {
    keyColor: 0xf4f8ff,
    keyIntensity: 3.25,
    hemiSky: 0xdce8fa,
    hemiGround: 0x181e28,
    hemiIntensity: 0.28,
    rimColor: 0xd4e5ff,
    rimIntensity: 0.44,
    exposure: 1.06,
  },
  'evening-amber': {
    keyColor: 0xffd49b,
    keyIntensity: 3.45,
    hemiSky: 0x8ea6cc,
    hemiGround: 0x1e130c,
    hemiIntensity: 0.2,
    rimColor: 0xffc682,
    rimIntensity: 0.4,
    exposure: 1.02,
  },
};

// Deterministic pseudo-random helper for crisp procedural grain
function hash2d(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

// Smooth 1D value noise for organic cathedral wood rings
function noise1d(t: number, seed: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  const a = hash2d(i, seed, 31);
  const b = hash2d(i + 1, seed, 31);
  return a + (b - a) * u;
}

export interface ProceduralPbrMaps {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

export function createProceduralPbrMaps(
  baseHex: string,
  grainHex: string,
  pattern: 'wood' | 'marble' | 'slate' | 'malachite' | 'glass',
  seed: number,
  maxAnisotropy: number,
  options?: { size?: number; tileSeam?: boolean },
): ProceduralPbrMaps {
  const size = options?.size ?? 512;
  const tileSeam = options?.tileSeam ?? true;

  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const actx = albedoCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bctx = bumpCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rctx = roughCanvas.getContext('2d')!;

  // Base fills
  actx.fillStyle = baseHex;
  actx.fillRect(0, 0, size, size);

  bctx.fillStyle = '#888888';
  bctx.fillRect(0, 0, size, size);

  rctx.fillStyle = '#c8c8c8'; // mid-high base roughness multiplier
  rctx.fillRect(0, 0, size, size);

  if (pattern === 'wood') {
    // Subtle organic plank tonal variation across the width
    const plankGrad = actx.createLinearGradient(0, 0, 0, size);
    plankGrad.addColorStop(0, 'rgba(0,0,0,0.04)');
    plankGrad.addColorStop(0.35, 'rgba(255,245,230,0.03)');
    plankGrad.addColorStop(0.7, 'rgba(0,0,0,0.03)');
    plankGrad.addColorStop(1, 'rgba(255,245,230,0.02)');
    actx.fillStyle = plankGrad;
    actx.fillRect(0, 0, size, size);

    // Layered organic cathedral / straight hardwood grain rings
    const lines = 128;
    const knotX = size * (0.25 + hash2d(seed, 3, 5) * 0.5);
    const knotY = size * (0.2 + hash2d(seed, 7, 11) * 0.6);

    for (let i = 0; i < lines; i++) {
      const yBase = (i / lines) * size;
      const toneAlpha = 0.08 + hash2d(i, seed, 9) * 0.24;
      const width = 0.8 + hash2d(i, seed, 1) * 3.1;

      actx.strokeStyle = grainHex;
      actx.globalAlpha = toneAlpha;
      actx.lineWidth = width;

      bctx.strokeStyle = i % 3 === 0 ? '#686868' : '#9c9c9c';
      bctx.globalAlpha = 0.22 + hash2d(i, seed, 4) * 0.18;
      bctx.lineWidth = width * 0.85;

      rctx.strokeStyle = i % 2 === 0 ? '#dcdcdc' : '#b2b2b2';
      rctx.globalAlpha = 0.28;
      rctx.lineWidth = width;

      actx.beginPath();
      bctx.beginPath();
      rctx.beginPath();

      for (let x = 0; x <= size; x += 8) {
        const dx = (x - knotX) / size;
        const dy = (yBase - knotY) / size;
        const knotDeflect = Math.exp(-(dx * dx * 6 + dy * dy * 10)) * (dy >= 0 ? 14 : -14);
        const wave =
          Math.sin(x * 0.014 + seed * 1.7 + i * 0.16) * 5.2 +
          (noise1d(x * 0.02 + i * 0.13, seed) - 0.5) * 4.5 +
          knotDeflect;
        const py = yBase + wave;
        if (x === 0) {
          actx.moveTo(x, py);
          bctx.moveTo(x, py);
          rctx.moveTo(x, py);
        } else {
          actx.lineTo(x, py);
          bctx.lineTo(x, py);
          rctx.lineTo(x, py);
        }
      }
      actx.stroke();
      bctx.stroke();
      rctx.stroke();
    }

    // Fine open-grain hardwood pores (recessed in bump map + matte in roughness map)
    for (let p = 0; p < 520; p++) {
      const px = hash2d(p, seed, 18) * size;
      const py = hash2d(p, seed, 19) * size;
      const pw = 6 + hash2d(p, seed, 20) * 28;
      const ph = 0.9 + hash2d(p, seed, 21) * 1.2;

      actx.fillStyle = grainHex;
      actx.globalAlpha = 0.09 + hash2d(p, seed, 17) * 0.12;
      actx.fillRect(px, py, pw, ph);

      bctx.fillStyle = '#383838';
      bctx.globalAlpha = 0.35;
      bctx.fillRect(px, py, pw, ph);

      rctx.fillStyle = '#f2f2f2';
      rctx.globalAlpha = 0.45;
      rctx.fillRect(px, py, pw, ph);
    }

    // Ultra-fine cross-fiber micro texture
    for (let m = 0; m < 160; m++) {
      const mx = hash2d(m, seed, 41) * size;
      const my = hash2d(m, seed, 42) * size;
      const mw = 12 + hash2d(m, seed, 43) * 40;
      actx.fillStyle = '#ffffff';
      actx.globalAlpha = 0.025;
      actx.fillRect(mx, my, mw, 1);
    }
  } else if (pattern === 'marble') {
    for (let v = 0; v < 18; v++) {
      actx.strokeStyle = grainHex;
      actx.globalAlpha = 0.14 + hash2d(v, seed, 2) * 0.24;
      actx.lineWidth = 0.8 + hash2d(v, seed, 3) * 3.0;

      bctx.strokeStyle = '#6f6f6f';
      bctx.globalAlpha = 0.16;
      bctx.lineWidth = 1.4;

      rctx.strokeStyle = '#dfdfdf';
      rctx.globalAlpha = 0.22;
      rctx.lineWidth = 1.6;

      actx.beginPath();
      bctx.beginPath();
      rctx.beginPath();
      let x = hash2d(v, seed, 4) * size * 0.35;
      let y = hash2d(v, seed, 5) * size;
      actx.moveTo(x, y);
      bctx.moveTo(x, y);
      rctx.moveTo(x, y);
      for (let s = 0; s < 18; s++) {
        x += size / 16;
        y += (Math.sin(s * 0.65 + v + seed) + (hash2d(s, v, seed) - 0.5)) * 16;
        actx.lineTo(x, y);
        bctx.lineTo(x, y);
        rctx.lineTo(x, y);
      }
      actx.stroke();
      bctx.stroke();
      rctx.stroke();
    }
  } else if (pattern === 'malachite') {
    for (let b = 0; b < 40; b++) {
      actx.strokeStyle = grainHex;
      actx.globalAlpha = 0.18 + (b % 3) * 0.12;
      actx.lineWidth = 2.0 + (b % 4) * 1.4;
      const cx = size * (0.2 + hash2d(b, seed, 7) * 0.6);
      const cy = size * (0.2 + hash2d(b, seed, 8) * 0.6);
      actx.beginPath();
      actx.ellipse(cx, cy, 32 + b * 6.5, 20 + b * 4.5, 0.35 + seed * 0.2, 0, Math.PI * 2);
      actx.stroke();

      bctx.strokeStyle = b % 2 === 0 ? '#787878' : '#969696';
      bctx.globalAlpha = 0.18;
      bctx.lineWidth = 2;
      bctx.beginPath();
      bctx.ellipse(cx, cy, 32 + b * 6.5, 20 + b * 4.5, 0.35 + seed * 0.2, 0, Math.PI * 2);
      bctx.stroke();
    }
  } else if (pattern === 'slate') {
    for (let i = 0; i < 650; i++) {
      const px = hash2d(i, seed, 10) * size;
      const py = hash2d(i, seed, 11) * size;
      const w = 6 + hash2d(i, seed, 12) * 38;
      const h = 1.5 + hash2d(i, seed, 13) * 4;
      actx.fillStyle = i % 2 === 0 ? grainHex : '#ffffff';
      actx.globalAlpha = i % 2 === 0 ? 0.18 : 0.035;
      actx.fillRect(px, py, w, h);

      bctx.fillStyle = i % 2 === 0 ? '#606060' : '#a8a8a8';
      bctx.globalAlpha = 0.24;
      bctx.fillRect(px, py, w, h);

      rctx.fillStyle = i % 2 === 0 ? '#dcdcdc' : '#b8b8b8';
      rctx.globalAlpha = 0.28;
      rctx.fillRect(px, py, w, h);
    }
  } else if (pattern === 'glass') {
    const grad = actx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, baseHex);
    grad.addColorStop(0.5, grainHex);
    grad.addColorStop(1, baseHex);
    actx.globalAlpha = 0.45;
    actx.fillStyle = grad;
    actx.fillRect(0, 0, size, size);

    actx.strokeStyle = '#ffffff';
    actx.globalAlpha = 0.1;
    actx.lineWidth = 1.2;
    for (let i = 0; i < 20; i++) {
      const offset = (i / 20) * size;
      actx.beginPath();
      actx.moveTo(offset, 0);
      actx.lineTo(offset + 42, size);
      actx.stroke();
    }
  }

  // Subtle recessed wood-veneer join seam on tile perimeter
  if (tileSeam) {
    actx.globalAlpha = pattern === 'wood' ? 0.16 : 0.08;
    actx.strokeStyle = pattern === 'wood' ? grainHex : '#000000';
    actx.lineWidth = 3;
    actx.strokeRect(1.5, 1.5, size - 3, size - 3);

    bctx.globalAlpha = 0.45;
    bctx.strokeStyle = '#2a2a2a';
    bctx.lineWidth = 3;
    bctx.strokeRect(1.5, 1.5, size - 3, size - 3);
  }

  const aniso = Math.min(8, maxAnisotropy);

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = aniso;
  map.needsUpdate = true;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.anisotropy = aniso;
  bumpMap.needsUpdate = true;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = aniso;
  roughnessMap.needsUpdate = true;

  return { map, bumpMap, roughnessMap };
}

export function createTableSurfaceMaps(
  baseHex: string,
  maxAnisotropy: number,
): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;

  const b = document.createElement('canvas');
  b.width = size;
  b.height = size;
  const bctx = b.getContext('2d')!;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  // Subtle matte dark wood/slate micro-grain so the tabletop reads as a physical surface
  for (let i = 0; i < 120; i++) {
    const y = (i / 120) * size;
    ctx.strokeStyle = i % 2 === 0 ? '#000000' : '#ffffff';
    ctx.globalAlpha = i % 2 === 0 ? 0.1 : 0.025;
    ctx.lineWidth = 1 + hash2d(i, 91, 2) * 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (hash2d(i, 92, 3) - 0.5) * 8);
    ctx.stroke();

    bctx.strokeStyle = i % 2 === 0 ? '#6c6c6c' : '#949494';
    bctx.globalAlpha = 0.25;
    bctx.lineWidth = 1.5;
    bctx.beginPath();
    bctx.moveTo(0, y);
    bctx.lineTo(size, y + (hash2d(i, 92, 3) - 0.5) * 8);
    bctx.stroke();
  }

  const aniso = Math.min(8, maxAnisotropy);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(8, 8);
  map.anisotropy = aniso;

  const bumpMap = new THREE.CanvasTexture(b);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(8, 8);
  bumpMap.anisotropy = aniso;

  return { map, bumpMap };
}

export function createCoordinateLabelTexture(
  label: string,
  textColor: string,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = textColor;
  ctx.font = '600 54px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, size / 2, size / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, maxAnisotropy);
  texture.needsUpdate = true;
  return texture;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.14, size / 2, size / 2, size * 0.5);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.34)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

