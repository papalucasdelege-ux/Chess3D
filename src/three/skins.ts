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
    subtitle: 'Deep oiled American walnut frame & squares with warm natural beige maple & sycamore marquetry',
    previewSwatches: ['#b29c7a', '#9c968d', '#311a0d'],
    sceneBg: 0x000000,
    fogColor: 0x000000,
    tableColor: 0x000000,
    lightSquare: {
      baseHex: '#b29c7a',
      grainHex: '#7d6444',
      pattern: 'wood',
      roughness: 0.76,
      metalness: 0.0,
      clearcoat: 0.05,
    },
    darkSquare: {
      baseHex: '#311a0d',
      grainHex: '#1b0d05',
      pattern: 'wood',
      roughness: 0.71,
      metalness: 0.0,
      clearcoat: 0.06,
    },
    frameBaseHex: '#30190c',
    frameGrainHex: '#1a0c05',
    framePattern: 'wood',
    frameColor: 0xffffff,
    frameRoughness: 0.71,
    frameMetalness: 0.0,
    boardEnvIntensity: 0.075,
    pieceEnvIntensity: 0.22,
    coordTextColor: '#bfaa8b',
    whitePiece: {
      color: 0x9c968d,
      roughness: 0.62,
      metalness: 0.0,
      clearcoat: 0.06,
      collarColor: 0x827b72,
      collarRoughness: 0.66,
      collarMetalness: 0.0,
      feltColor: 0x2d190d,
    },
    blackPiece: {
      color: 0x160d08,
      roughness: 0.66,
      metalness: 0.0,
      clearcoat: 0.05,
      collarColor: 0x0f0905,
      collarRoughness: 0.72,
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
    keyIntensity: 4.1,
    hemiSky: 0xdbe7fa,
    hemiGround: 0x24170f,
    hemiIntensity: 0.34,
    rimColor: 0xd8e6fc,
    rimIntensity: 0.46,
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

// Seamless periodic 2D value noise on integer periods [px, py] so UV repeat (e.g. 6x6 frame) has zero seams
function periodicNoise2d(u: number, v: number, px: number, py: number, seed: number): number {
  const x = u * px;
  const y = v * py;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const x0 = ((ix % px) + px) % px;
  const x1 = (x0 + 1) % px;
  const y0 = ((iy % py) + py) % py;
  const y1 = (y0 + 1) % py;

  const n00 = hash2d(x0, y0, seed);
  const n10 = hash2d(x1, y0, seed);
  const n01 = hash2d(x0, y1, seed);
  const n11 = hash2d(x1, y1, seed);

  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function periodicFbm2d(u: number, v: number, basePx: number, basePy: number, seed: number): number {
  return (
    periodicNoise2d(u, v, basePx, basePy, seed) * 0.56 +
    periodicNoise2d(u, v, basePx * 2, basePy * 2, seed + 17) * 0.29 +
    periodicNoise2d(u, v, basePx * 4, basePy * 4, seed + 37) * 0.15
  );
}

function hexToRgbTuple(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export interface ProceduralPbrMaps {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

// Module-level CanvasTexture caches: never instantiate duplicate procedural canvases
const pbrTextureCache = new Map<string, ProceduralPbrMaps>();
const coordLabelTextureCache = new Map<string, THREE.CanvasTexture>();
const coordEmbossedMapsCache = new Map<string, ProceduralPbrMaps>();
let cachedContactShadowTexture: THREE.CanvasTexture | null = null;

export type WoodFigureStyle = 'frame' | 'cathedral' | 'ribbon' | 'curly' | 'burl' | 'quartersawn';

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
    figureStyle?: WoodFigureStyle;
  },
): ProceduralPbrMaps {
  const size = options?.size ?? 512;
  const tileSeam = options?.tileSeam ?? true;
  const rotateQuarter = options?.rotateQuarter ?? false;
  const grainContrast = options?.grainContrast ?? 1;
  const smoothTurned = options?.smoothTurned ?? false;
  const figureStyle: WoodFigureStyle = options?.figureStyle ?? 'frame';
  const cacheKey = `v6|${baseHex}|${grainHex}|${pattern}|${seed}|${size}|${tileSeam ? 1 : 0}|${rotateQuarter ? 1 : 0}|${grainContrast.toFixed(2)}|${smoothTurned ? 1 : 0}|${figureStyle}`;

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

  if (smoothTurned) {
    // Base fills for lathe-turned Staunton figures
    actx.fillStyle = baseHex;
    actx.fillRect(0, 0, size, size);

    bctx.fillStyle = '#808080';
    bctx.fillRect(0, 0, size, size);

    rctx.fillStyle = '#989898';
    rctx.fillRect(0, 0, size, size);

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
    // Rich, calm cabinetmaker marquetry wood generator:
    // Smooth cosine/FBM figure (never harsh zebra stripes) with distinct plank characters & ring densities per seed
    // ('cathedral', 'ribbon', 'curly', 'burl', 'quartersawn', or continuous 'frame') so every checker has visible organic character.
    const [baseR, baseG, baseB] = hexToRgbTuple(baseHex);
    const [grainR, grainG, grainB] = hexToRgbTuple(grainHex);
    const isLightVeneer = baseR + baseG + baseB > 420;

    const bgImg = actx.createImageData(size, size);
    const bgData = bgImg.data;
    const phaseU = hash2d(seed, 2, 7) * Math.PI * 2;
    const phaseV = hash2d(seed, 4, 9) * Math.PI * 2;
    const centerU = 0.22 + hash2d(seed, 14, 3) * 0.56;
    const centerV = 0.22 + hash2d(seed, 16, 5) * 0.56;
    const curlFreq = 2 + (seed % 4);
    const archRingFreq = 5.6 + hash2d(seed, 21, 3) * 4.4;
    const archAspectX = 0.85 + hash2d(seed, 22, 5) * 0.7;
    const archAspectY = 2.9 + hash2d(seed, 23, 7) * 1.9;
    const ribbonBroadFreq = 2 + (seed % 3);
    const ribbonMedFreq = 5 + ((seed * 3) % 5);
    const warpStrength = 0.21 + hash2d(seed, 25, 11) * 0.16;

    for (let py = 0; py < size; py++) {
      const v = py / size;
      let dvCenter = v - centerV;
      if (dvCenter > 0.5) dvCenter -= 1;
      if (dvCenter < -0.5) dvCenter += 1;

      for (let px = 0; px < size; px++) {
        const u = px / size;
        let duCenter = u - centerU;
        if (duCenter > 0.5) duCenter -= 1;
        if (duCenter < -0.5) duCenter += 1;

        const warp = (periodicFbm2d(u, v, 2, 3, seed + 5) - 0.5) * warpStrength;
        const fineFiber = (periodicNoise2d(u, v, 4, 36, seed + 19) - 0.5) * 0.17;

        let figure = 0.35;
        let chatoyance = 0;

        if (figureStyle === 'cathedral') {
          // Soft crown-cut parabolic cathedral arches (classic luxury marquetry veneer)
          const archDist =
            Math.sqrt(duCenter * duCenter * archAspectX + dvCenter * dvCenter * archAspectY) +
            warp * 0.58;
          const rings = 0.5 - 0.5 * Math.cos(archDist * Math.PI * archRingFreq + phaseV);
          const heartGlow = Math.exp(-(duCenter * duCenter * 5.2 + dvCenter * dvCenter * 9.5));
          figure = rings * 0.56 + heartGlow * 0.27 + fineFiber;
        } else if (figureStyle === 'ribbon') {
          // Quarter-sawn interlocking ribbon stripes of naturally varying width
          const vWarped = v + warp * 0.24 + Math.sin(u * Math.PI * 2 + phaseU) * 0.035;
          const broad = 0.5 - 0.5 * Math.cos(vWarped * Math.PI * 2 * ribbonBroadFreq + phaseV);
          const med = 0.5 - 0.5 * Math.cos(vWarped * Math.PI * 2 * ribbonMedFreq + phaseU);
          figure = broad * 0.46 + med * 0.32 + fineFiber;
          chatoyance = Math.sin(vWarped * Math.PI * 2 * ribbonBroadFreq + phaseV) * 4.2;
        } else if (figureStyle === 'curly') {
          // Figured fiddleback / curly cross-grain shimmer paired with gentle longitudinal flow
          const longFlow =
            0.5 - 0.5 * Math.cos((v + warp * 0.2) * Math.PI * 2 * (3 + (seed % 3)) + phaseV);
          const crossCurl =
            Math.sin(u * Math.PI * 2 * curlFreq + warp * 3.4 + phaseU) * 0.5 + 0.5;
          figure = longFlow * 0.44 + crossCurl * 0.31 + fineFiber;
          chatoyance = (crossCurl - 0.5) * 8.5;
        } else if (figureStyle === 'burl') {
          // Warm swirled heartwood burl drift with organic clouding
          const swirl = periodicFbm2d(u + warp * 0.38, v - warp * 0.38, 3, 3, seed + 29);
          const eye = Math.exp(-(duCenter * duCenter * 8.5 + dvCenter * dvCenter * 8.5));
          const eyeRing = 0.5 - 0.5 * Math.cos((swirl * 1.95 + eye * 1.15) * Math.PI * 2 + phaseV);
          figure = eyeRing * 0.48 + (swirl - 0.5) * 0.38 + fineFiber;
          chatoyance = (0.5 - eye) * 4.5;
        } else if (figureStyle === 'quartersawn') {
          // Tight straight-grained sycamore / maple quartersawn plank with subtle medullary ray fleck
          const tightLines = 0.5 - 0.5 * Math.cos((v + warp * 0.11) * Math.PI * 2 * 9 + phaseV);
          const rayFleck = periodicNoise2d(u, v, 14, 5, seed + 47) - 0.5;
          const sapDrift = 0.5 - 0.5 * Math.cos((v + warp * 0.15) * Math.PI * 2 * 2 + phaseU);
          figure = tightLines * 0.33 + sapDrift * 0.32 + rayFleck * 0.26 + fineFiber * 1.1;
          chatoyance = rayFleck * 6.5;
        } else {
          // Continuous straight-milled cabinet frame walnut
          const gentleBand = 0.5 - 0.5 * Math.cos((v + warp * 0.14) * Math.PI * 2 * 2 + phaseV);
          figure = gentleBand * 0.34 + (warp + 0.14) * 0.45 + fineFiber * 0.75;
        }

        const t = Math.max(0, Math.min(1, figure * grainContrast));
        const idx = (py * size + px) * 4;
        bgData[idx] = Math.max(
          0,
          Math.min(255, Math.round(baseR + chatoyance + (grainR - baseR) * t)),
        );
        bgData[idx + 1] = Math.max(
          0,
          Math.min(255, Math.round(baseG + chatoyance * 0.82 + (grainG - baseG) * t)),
        );
        bgData[idx + 2] = Math.max(
          0,
          Math.min(255, Math.round(baseB + chatoyance * 0.62 + (grainB - baseB) * t)),
        );
        bgData[idx + 3] = 255;
      }
    }
    actx.putImageData(bgImg, 0, 0);

    bctx.fillStyle = '#808080';
    bctx.fillRect(0, 0, size, size);

    rctx.fillStyle = '#c4c4c4';
    rctx.fillRect(0, 0, size, size);

    // Organic flowing wood fibers & soft grain ribbons (periodic across X & Y)
    const lines =
      figureStyle === 'quartersawn'
        ? 104
        : figureStyle === 'ribbon'
          ? 68
          : figureStyle === 'cathedral'
            ? 76
            : 88;
    const knotU = centerU;
    const knotV = centerV;
    const waveCycles = 1 + (seed % 2);
    const wavePhase = hash2d(seed, 12, 15) * Math.PI * 2;
    const deflectAmp =
      figureStyle === 'cathedral'
        ? 23
        : figureStyle === 'burl'
          ? 19
          : figureStyle === 'quartersawn'
            ? 4.5
            : figureStyle === 'curly'
              ? 8
              : 11;
    const fiberContrastBoost = isLightVeneer ? 1.18 : 1.0;

    const strokePeriodicLine = (yOffset: number, i: number, toneAlpha: number, width: number) => {
      const yBase = (i / lines) * size + yOffset;

      actx.strokeStyle = grainHex;
      actx.globalAlpha = toneAlpha;
      actx.lineWidth = width;

      bctx.strokeStyle = i % 3 === 0 ? '#707070' : '#8e8e8e';
      bctx.globalAlpha = 0.14 + hash2d(i, seed, 4) * 0.1;
      bctx.lineWidth = width * 0.85;

      rctx.strokeStyle = i % 2 === 0 ? '#d4d4d4' : '#b4b4b4';
      rctx.globalAlpha = 0.18;
      rctx.lineWidth = width;

      actx.beginPath();
      bctx.beginPath();
      rctx.beginPath();

      const steps = 64;
      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        const x = u * size;
        let du = u - knotU;
        if (du > 0.5) du -= 1;
        if (du < -0.5) du += 1;
        let dv = i / lines - knotV;
        if (dv > 0.5) dv -= 1;
        if (dv < -0.5) dv += 1;

        const knotDeflect =
          Math.exp(-(du * du * 7.5 + dv * dv * 12)) * (dv >= 0 ? deflectAmp : -deflectAmp);
        const periodicJitter =
          (periodicNoise2d(u, i / lines, 4, 14, seed + 31) - 0.5) * 5.2;
        const wave =
          Math.sin(u * Math.PI * 2 * waveCycles + wavePhase + i * 0.17) * 5.8 +
          periodicJitter +
          knotDeflect;
        const py = yBase + wave;
        if (s === 0) {
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
    };

    for (let i = 0; i < lines; i++) {
      const isBroadRibbon = i % 5 === 0;
      const toneAlpha = Math.min(
        0.36,
        ((isBroadRibbon ? 0.105 : 0.052) + hash2d(i, seed, 9) * 0.145) *
          grainContrast *
          fiberContrastBoost,
      );
      const width = (isBroadRibbon ? 3.2 : 1.2) + hash2d(i, seed, 1) * (isBroadRibbon ? 5.4 : 2.8);
      strokePeriodicLine(0, i, toneAlpha, width);
      if (i < 8) {
        strokePeriodicLine(size, i, toneAlpha, width);
      } else if (i >= lines - 8) {
        strokePeriodicLine(-size, i, toneAlpha, width);
      }
    }

    // Delicate open-grain walnut/maple micro-pores (wrapped seamlessly across X)
    const poreCount = 380;
    for (let p = 0; p < poreCount; p++) {
      const px = hash2d(p, seed, 18) * size;
      const py = hash2d(p, seed, 19) * size;
      const pw = 7 + hash2d(p, seed, 20) * 22;
      const ph = 0.85 + hash2d(p, seed, 21) * 1.05;
      const alpha = Math.min(0.24, (0.05 + hash2d(p, seed, 17) * 0.08) * grainContrast);

      const drawPoreAt = (xPos: number) => {
        actx.fillStyle = grainHex;
        actx.globalAlpha = alpha;
        actx.fillRect(xPos, py, pw, ph);

        bctx.fillStyle = '#565656';
        bctx.globalAlpha = 0.2;
        bctx.fillRect(xPos, py, pw, ph);

        rctx.fillStyle = '#dedede';
        rctx.globalAlpha = 0.24;
        rctx.fillRect(xPos, py, pw, ph);
      };

      drawPoreAt(px);
      if (px + pw > size) {
        drawPoreAt(px - size);
      }
    }

    // Soft satin medullary ray flecks
    for (let m = 0; m < 110; m++) {
      const mx = hash2d(m, seed, 41) * size;
      const my = hash2d(m, seed, 42) * size;
      const mw = 14 + hash2d(m, seed, 43) * 34;
      actx.fillStyle = '#fff5e4';
      actx.globalAlpha = 0.016;
      actx.fillRect(mx, my, mw, 1);
      if (mx + mw > size) {
        actx.fillRect(mx - size, my, mw, 1);
      }
    }

    actx.globalAlpha = 1;
    bctx.globalAlpha = 1;
    rctx.globalAlpha = 1;
  }

  // Subtle cabinetmaker's veneer inlay join on individual board squares (omitted on solid outer frame)
  if (tileSeam) {
    actx.globalAlpha = 0.13;
    actx.strokeStyle = grainHex;
    actx.lineWidth = 2;
    actx.strokeRect(1, 1, size - 2, size - 2);

    bctx.globalAlpha = 0.36;
    bctx.strokeStyle = '#303030';
    bctx.lineWidth = 2;
    bctx.strokeRect(1, 1, size - 2, size - 2);

    actx.globalAlpha = 1;
    bctx.globalAlpha = 1;
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

/**
 * Generates cached PBR maps (RGBA wood-stamped albedo, 3D carved groove bumpMap, and roughnessMap)
 * so board coordinates look subtly embossed/stamped directly into the oiled walnut wood frame.
 */
export function createEmbossedCoordinateMaps(
  label: string,
  textColor: string,
  frameGrainHex: string,
  maxAnisotropy: number,
): ProceduralPbrMaps {
  const cacheKey = `emboss_v2|${label}|${textColor}|${frameGrainHex}`;
  const existing = coordEmbossedMapsCache.get(cacheKey);
  if (existing) return existing;

  const size = 192;
  const cx = size / 2;
  const cy = size / 2 + 3;
  const fontSpec = '600 82px "JetBrains Mono", monospace';

  // 1. RGBA Albedo + Alpha: recessed walnut cavity lip + warm wood-fiber stamped glyph interior
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const actx = albedoCanvas.getContext('2d')!;
  actx.clearRect(0, 0, size, size);
  actx.textAlign = 'center';
  actx.textBaseline = 'middle';
  actx.lineJoin = 'round';
  actx.lineCap = 'round';
  actx.font = fontSpec;

  // Outer micro-bevel wood compression rim around the stamped groove
  actx.strokeStyle = 'rgba(218, 188, 148, 0.24)';
  actx.lineWidth = 6.5;
  actx.strokeText(label, cx, cy);

  // Pressed dark walnut cavity wall right around the glyph perimeter
  actx.strokeStyle = 'rgba(18, 8, 3, 0.82)';
  actx.lineWidth = 3.6;
  actx.strokeText(label, cx, cy);

  // Isolate interior glyph fill on a temporary scratch layer (drawn once per unique A-H / 1-8 glyph)
  const glyphCanvas = document.createElement('canvas');
  glyphCanvas.width = size;
  glyphCanvas.height = size;
  const gctx = glyphCanvas.getContext('2d')!;
  gctx.textAlign = 'center';
  gctx.textBaseline = 'middle';
  gctx.font = fontSpec;

  // Warm muted wood-stamped base tone (blends `textColor` with warm oiled walnut/maple fiber)
  const [tr, tg, tb] = hexToRgbTuple(textColor);
  const [gr, gg, gb] = hexToRgbTuple(frameGrainHex);
  const stampedR = Math.round(tr * 0.78 + gr * 0.22);
  const stampedG = Math.round(tg * 0.76 + gg * 0.24);
  const stampedB = Math.round(tb * 0.73 + gb * 0.27);
  gctx.fillStyle = `rgba(${stampedR}, ${stampedG}, ${stampedB}, 0.88)`;
  gctx.fillText(label, cx, cy);

  // Subtle wood-grain fibers running across the stamped interior so it belongs to the timber
  gctx.globalCompositeOperation = 'source-atop';
  for (let y = 0; y < size; y += 3) {
    const n = hash2d(y, label.charCodeAt(0), 19);
    gctx.fillStyle =
      n > 0.52
        ? `rgba(${gr}, ${gg}, ${gb}, ${(0.08 + n * 0.14).toFixed(3)})`
        : `rgba(245, 224, 192, ${(0.04 + (1 - n) * 0.08).toFixed(3)})`;
    gctx.fillRect(0, y, size, 1.6);
  }

  // Subtle inner recessed edge darkening inside the pressed letter floor
  gctx.globalCompositeOperation = 'source-atop';
  gctx.strokeStyle = 'rgba(22, 10, 4, 0.42)';
  gctx.lineWidth = 2.2;
  gctx.strokeText(label, cx, cy);

  actx.drawImage(glyphCanvas, 0, 0);

  // 2. 3D Height / Bump Map: neutral 128 wood plane, 150 raised outer compression lip, 30 debossed carved groove
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bctx = bumpCanvas.getContext('2d')!;
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);
  bctx.textAlign = 'center';
  bctx.textBaseline = 'middle';
  bctx.lineJoin = 'round';
  bctx.lineCap = 'round';
  bctx.font = fontSpec;
  bctx.filter = 'blur(1.1px)';

  bctx.strokeStyle = '#989898';
  bctx.lineWidth = 6.2;
  bctx.strokeText(label, cx, cy);

  bctx.strokeStyle = '#3c3c3c';
  bctx.lineWidth = 3.2;
  bctx.strokeText(label, cx, cy);

  bctx.fillStyle = '#1e1e1e';
  bctx.fillText(label, cx, cy);
  bctx.filter = 'none';

  // 3. Roughness Map: slightly more matte inside the stamped wood recess, satin on the bevel rim
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rctx = roughCanvas.getContext('2d')!;
  rctx.fillStyle = '#a8a8a8';
  rctx.fillRect(0, 0, size, size);
  rctx.textAlign = 'center';
  rctx.textBaseline = 'middle';
  rctx.lineJoin = 'round';
  rctx.font = fontSpec;
  rctx.strokeStyle = '#888888';
  rctx.lineWidth = 5.0;
  rctx.strokeText(label, cx, cy);
  rctx.fillStyle = '#c8c8c8';
  rctx.fillText(label, cx, cy);

  const aniso = Math.min(8, maxAnisotropy);

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = aniso;
  map.needsUpdate = true;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.anisotropy = aniso;
  bumpMap.needsUpdate = true;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.anisotropy = aniso;
  roughnessMap.needsUpdate = true;

  const maps: ProceduralPbrMaps = { map, bumpMap, roughnessMap };
  coordEmbossedMapsCache.set(cacheKey, maps);
  return maps;
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
