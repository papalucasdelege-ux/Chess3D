import * as THREE from 'three';
import type { BoardSkinId, LightingMood } from '../shared/types';

export interface BoardSkinSpec {
  id: BoardSkinId;
  name: string;
  subtitle: string;
  previewSwatches: [string, string, string];
  sceneBg: number;
  fogColor: number;
  tableColor: number;
  lightSquare: {
    baseHex: string;
    grainHex: string;
    pattern: 'wood';
    roughness: number;
    metalness: number;
    clearcoat: number;
  };
  darkSquare: {
    baseHex: string;
    grainHex: string;
    pattern: 'wood';
    roughness: number;
    metalness: number;
    clearcoat: number;
  };
  frameBaseHex: string;
  frameGrainHex: string;
  framePattern: 'wood';
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
    boardEnvIntensity: 0.06,
    pieceEnvIntensity: 0.22,
    coordTextColor: '#d9be95',
    whitePiece: {
      color: 0xccaa7e,
      roughness: 0.34,
      metalness: 0.0,
      clearcoat: 0.42,
      collarColor: 0xb79163,
      collarRoughness: 0.38,
      collarMetalness: 0.0,
      feltColor: 0x321d10,
    },
    blackPiece: {
      color: 0x1f140d,
      roughness: 0.68,
      metalness: 0.0,
      clearcoat: 0.04,
      collarColor: 0x150d08,
      collarRoughness: 0.74,
      collarMetalness: 0.0,
      feltColor: 0x070403,
    },
  },
};

export const SKIN_LIST: BoardSkinSpec[] = [BOARD_SKINS['walnut-maple']];

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
    keyColor: 0xfff5e4,
    keyIntensity: 4.6,
    hemiSky: 0xdbe7fa,
    hemiGround: 0x2c1e14,
    hemiIntensity: 0.38,
    rimColor: 0xd8e6fc,
    rimIntensity: 0.42,
    exposure: 1.0,
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

// Module-level CanvasTexture caches: never instantiate duplicate procedural canvases
const pbrTextureCache = new Map<string, ProceduralPbrMaps>();
const coordLabelTextureCache = new Map<string, THREE.CanvasTexture>();
let cachedContactShadowTexture: THREE.CanvasTexture | null = null;

export function createProceduralPbrMaps(
  baseHex: string,
  grainHex: string,
  pattern: 'wood',
  seed: number,
  maxAnisotropy: number,
  options?: {
    size?: number;
    tileSeam?: boolean;
    rotateQuarter?: boolean;
    grainContrast?: number;
    smoothTurned?: boolean;
  },
): ProceduralPbrMaps {
  const size = options?.size ?? 512;
  const tileSeam = options?.tileSeam ?? true;
  const rotateQuarter = options?.rotateQuarter ?? false;
  const grainContrast = options?.grainContrast ?? 1;
  const smoothTurned = options?.smoothTurned ?? false;
  const cacheKey = `${baseHex}|${grainHex}|${pattern}|${seed}|${size}|${tileSeam ? 1 : 0}|${rotateQuarter ? 1 : 0}|${grainContrast.toFixed(2)}|${smoothTurned ? 1 : 0}`;

  const existing = pbrTextureCache.get(cacheKey);
  if (existing) return existing;

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

  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  rctx.fillStyle = smoothTurned ? '#989898' : '#c8c8c8';
  rctx.fillRect(0, 0, size, size);

  if (smoothTurned) {
    // Silky French-polished boxwood / ebony for lathe-turned Staunton figures (zero coarse pores or roughness pits)
    const silkGrad = actx.createLinearGradient(0, 0, 0, size);
    silkGrad.addColorStop(0, 'rgba(0,0,0,0.035)');
    silkGrad.addColorStop(0.5, 'rgba(255,248,236,0.025)');
    silkGrad.addColorStop(1, 'rgba(0,0,0,0.03)');
    actx.fillStyle = silkGrad;
    actx.fillRect(0, 0, size, size);

    const silkLines = 96;
    for (let i = 0; i < silkLines; i++) {
      const yBase = (i / silkLines) * size;
      const width = 1.2 + hash2d(i, seed, 1) * 2.4;

      actx.strokeStyle = grainHex;
      actx.globalAlpha = (0.035 + hash2d(i, seed, 9) * 0.065) * grainContrast;
      actx.lineWidth = width;

      bctx.strokeStyle = i % 2 === 0 ? '#7d7d7d' : '#838383';
      bctx.globalAlpha = 0.07;
      bctx.lineWidth = width;

      rctx.strokeStyle = i % 2 === 0 ? '#9d9d9d' : '#939393';
      rctx.globalAlpha = 0.06;
      rctx.lineWidth = width;

      actx.beginPath();
      bctx.beginPath();
      rctx.beginPath();
      for (let x = 0; x <= size; x += 12) {
        const py =
          yBase +
          Math.sin(x * 0.011 + seed * 1.3 + i * 0.14) * 3.0 +
          (noise1d(x * 0.014 + i * 0.11, seed) - 0.5) * 2.0;
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
  } else {
    // Subtle organic plank tonal variation across the width
    const plankGrad = actx.createLinearGradient(0, 0, 0, size);
    const shadeAlpha = Math.min(0.14, 0.04 * grainContrast);
    plankGrad.addColorStop(0, `rgba(0,0,0,${shadeAlpha.toFixed(3)})`);
    plankGrad.addColorStop(0.35, 'rgba(255,245,230,0.03)');
    plankGrad.addColorStop(0.7, `rgba(0,0,0,${(shadeAlpha * 0.85).toFixed(3)})`);
    plankGrad.addColorStop(1, 'rgba(255,245,230,0.02)');
    actx.fillStyle = plankGrad;
    actx.fillRect(0, 0, size, size);

    // Layered organic cathedral / straight hardwood grain rings
    const lines = 128;
    const knotX = size * (0.25 + hash2d(seed, 3, 5) * 0.5);
    const knotY = size * (0.2 + hash2d(seed, 7, 11) * 0.6);

    for (let i = 0; i < lines; i++) {
      const yBase = (i / lines) * size;
      const toneAlpha = Math.min(0.62, (0.08 + hash2d(i, seed, 9) * 0.24) * grainContrast);
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
      actx.globalAlpha = Math.min(0.45, (0.09 + hash2d(p, seed, 17) * 0.12) * grainContrast);
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
  }

  // Subtle recessed wood-veneer join seam on tile perimeter
  if (tileSeam) {
    actx.globalAlpha = 0.16;
    actx.strokeStyle = grainHex;
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
  if (rotateQuarter) {
    map.center.set(0.5, 0.5);
    map.rotation = Math.PI / 2;
  }
  map.needsUpdate = true;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.anisotropy = aniso;
  if (rotateQuarter) {
    bumpMap.center.set(0.5, 0.5);
    bumpMap.rotation = Math.PI / 2;
  }
  bumpMap.needsUpdate = true;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = aniso;
  if (rotateQuarter) {
    roughnessMap.center.set(0.5, 0.5);
    roughnessMap.rotation = Math.PI / 2;
  }
  roughnessMap.needsUpdate = true;

  const result: ProceduralPbrMaps = { map, bumpMap, roughnessMap };
  pbrTextureCache.set(cacheKey, result);
  return result;
}

export function createCoordinateLabelTexture(
  label: string,
  textColor: string,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const key = `${label}|${textColor}`;
  const cached = coordLabelTextureCache.get(key);
  if (cached) return cached;

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
  coordLabelTextureCache.set(key, texture);
  return texture;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  if (cachedContactShadowTexture) return cachedContactShadowTexture;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.28,
    size / 2,
    size / 2,
    size * 0.49,
  );
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
  grad.addColorStop(0.65, 'rgba(0, 0, 0, 0.32)');
  grad.addColorStop(0.88, 'rgba(0, 0, 0, 0.08)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  cachedContactShadowTexture = texture;
  return texture;
}
