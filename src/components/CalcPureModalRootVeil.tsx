import { useEffect, useRef, type MutableRefObject } from 'react';
import {
  getCalcPureTreeDensity,
  getCalcPureTreeOffsetX,
  getCalcPureTreeOffsetY,
  subscribeAngelVideoOverrides,
} from '../chess/angelPortraitVideos';

export interface CalcPureVideoClock {
  active: boolean;
  currentTime: number;
  /** Optional imperative wake callback registered by CalcPureModalRootVeil so idle rAF is 0% CPU */
  wake?: () => void;
}

interface CalcPureModalRootVeilProps {
  clockRef: MutableRefObject<CalcPureVideoClock>;
  powerSaveMode?: boolean;
}

interface RootSeg2D {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  w0: number;
  w1: number;
  t0: number;
  t1: number;
  hasVein: boolean;
  sway: number;
}

interface RootLeaf2D {
  x: number;
  y: number;
  angle: number;
  len: number;
  wid: number;
  appearAt: number;
  phase: number;
  bright: number;
}

interface RootSpore2D {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  appearAt: number;
  phase: number;
  isGold: boolean;
}

interface BuiltRootNetwork {
  w: number;
  h: number;
  offsetX: number;
  offsetY: number;
  density: number;
  segs: RootSeg2D[];
  leaves: RootLeaf2D[];
  spores: RootSpore2D[];
}

// Exact timing constants matched frame-for-frame to angel_case_calc_pure.mp4 & CalcPureTree3D
const GROW_START_SEC = 1.82;
const GROW_SPAN_SEC = 2.68;
const DISSOLVE_START_SEC = 5.25;
const DISSOLVE_END_SEC = 6.72;

// Exact 8 bottom root anchors matched to TREE_BORDER_LIMBS (edge: 'bottom') in calcPureTree3D.ts
const BOTTOM_ROOT_SEEDS: ReadonlyArray<{
  tEdge: number;
  fanBias: number;
  curveBend: number;
  thickness: number;
  startOffset: number;
  hasVein: boolean;
}> = [
  { tEdge: 0.08, fanBias: -0.34, curveBend: -0.22, thickness: 5.4, startOffset: 0.14, hasVein: true },
  { tEdge: 0.19, fanBias: -0.24, curveBend: -0.16, thickness: 6.2, startOffset: 0.13, hasVein: true },
  { tEdge: 0.31, fanBias: -0.15, curveBend: -0.12, thickness: 6.8, startOffset: 0.12, hasVein: true },
  { tEdge: 0.43, fanBias: -0.06, curveBend: 0.11, thickness: 7.4, startOffset: 0.11, hasVein: true },
  { tEdge: 0.55, fanBias: 0.07, curveBend: -0.11, thickness: 7.2, startOffset: 0.11, hasVein: true },
  { tEdge: 0.67, fanBias: 0.16, curveBend: 0.14, thickness: 6.5, startOffset: 0.13, hasVein: true },
  { tEdge: 0.79, fanBias: 0.25, curveBend: 0.17, thickness: 5.8, startOffset: 0.14, hasVein: true },
  { tEdge: 0.91, fanBias: 0.34, curveBend: 0.21, thickness: 5.0, startOffset: 0.16, hasVein: false },
];

function createSeededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildRootNetwork(
  w: number,
  h: number,
  offsetX: number,
  offsetY: number,
  density: number,
): BuiltRootNetwork {
  const rng = createSeededRng(419083);
  const segs: RootSeg2D[] = [];
  const leaves: RootLeaf2D[] = [];
  const spores: RootSpore2D[] = [];

  const scale = Math.max(0.72, Math.min(1.28, w / 300));
  const clampedDensity = Math.max(0.25, Math.min(2.5, density));

  const growBranch = (
    xStart: number,
    yStart: number,
    angleStart: number,
    length: number,
    widthStart: number,
    tStart: number,
    tSpan: number,
    bend: number,
    depth: number,
    hasVein: boolean,
  ) => {
    const steps = depth >= 2 ? 9 : 6;
    let cx = xStart;
    let cy = yStart;
    let ang = angleStart;
    const stepLen = length / steps;

    for (let i = 0; i < steps; i++) {
      const u0 = i / steps;
      const u1 = (i + 1) / steps;
      // Gnarled S-curve organic root wobble
      const wave =
        Math.sin(u0 * Math.PI * 1.85 + xStart * 0.03) * bend * 0.32 +
        (rng() - 0.5) * 0.14;
      ang += wave * (1 / steps) * 2.6;

      const nx = cx + Math.cos(ang) * stepLen;
      const ny = cy + Math.sin(ang) * stepLen;

      const w0 = Math.max(0.65, widthStart * (1 - u0 * 0.58));
      const w1 = Math.max(0.55, widthStart * (1 - u1 * 0.58));
      const t0 = tStart + tSpan * u0;
      const t1 = tStart + tSpan * u1;

      segs.push({
        x0: cx,
        y0: cy,
        x1: nx,
        y1: ny,
        w0,
        w1,
        t0,
        t1,
        hasVein: hasVein && w0 >= 2.2 * scale,
        sway: Math.min(1, 0.15 + (ny / Math.max(80, h)) * 0.85),
      });

      // Small glowing emerald undergrowth leaves & sprouts hugging the gnarled roots
      const baseLeafChance = depth === 0 ? 0.62 : depth === 1 ? 0.42 : 0.26;
      const leafChance = Math.min(0.96, baseLeafChance * Math.max(0.3, Math.min(1.65, clampedDensity)));
      if (i >= 1 && rng() < leafChance) {
        const side = rng() < 0.5 ? -1 : 1;
        const leafAng = ang + side * (0.48 + rng() * 0.62);
        leaves.push({
          x: nx,
          y: ny,
          angle: leafAng,
          len: (7.5 + rng() * 6.5) * scale * (depth === 0 ? 0.92 : 1.05),
          wid: (3.2 + rng() * 2.6) * scale,
          appearAt: Math.min(0.95, t1 + 0.025),
          phase: rng() * Math.PI * 2,
          bright: 0.72 + rng() * 0.28,
        });
      }

      // Drifting botanical spores near glowing joints
      if (rng() < Math.min(0.45, 0.18 * clampedDensity)) {
        spores.push({
          x: nx + (rng() - 0.5) * 14,
          y: ny + (rng() - 0.5) * 12,
          vx: (rng() - 0.5) * 10,
          vy: 5 + rng() * 11,
          r: (1.5 + rng() * 2.2) * scale,
          appearAt: Math.min(0.95, t1 + 0.03),
          phase: rng() * Math.PI * 2,
          isGold: rng() < 0.45,
        });
      }

      // Recursive fork into lateral & deeper gnarled sub-roots (scales with Studio density)
      const forkChance = Math.min(
        0.88,
        (depth === 2 ? 0.42 : 0.34) * Math.pow(clampedDensity, 0.78),
      );
      if (depth > 0 && i >= 2 && i <= steps - 2 && rng() < forkChance) {
        const forkSign = (i % 2 === 0 ? 1 : -1) * (rng() < 0.75 ? 1 : -1);
        const forkAngle = ang + forkSign * (0.34 + rng() * 0.42);
        growBranch(
          nx,
          ny,
          forkAngle,
          length * (0.48 + rng() * 0.22),
          w1 * 0.72,
          t1,
          Math.max(0.12, (1 - t1) * 0.58),
          -bend * 0.85,
          depth - 1,
          hasVein && depth >= 2,
        );
      }

      cx = nx;
      cy = ny;
    }

    // Terminal delicate emerald sprout leaf pair at each rootlet tip
    if (depth === 0 || rng() < 0.55 * Math.min(1.4, clampedDensity)) {
      for (const sgn of [-1, 1]) {
        leaves.push({
          x: cx,
          y: cy,
          angle: ang + sgn * (0.38 + rng() * 0.32),
          len: (6.5 + rng() * 5.0) * scale,
          wid: (2.8 + rng() * 2.0) * scale,
          appearAt: Math.min(0.97, tStart + tSpan + 0.015),
          phase: rng() * Math.PI * 2,
          bright: 0.86 + rng() * 0.14,
        });
      }
    }
  };

  const activeSeeds = [...BOTTOM_ROOT_SEEDS];
  if (clampedDensity < 0.97) {
    const keep = Math.max(2, Math.round(BOTTOM_ROOT_SEEDS.length * clampedDensity));
    activeSeeds.length = 0;
    for (let k = 0; k < keep; k++) {
      const idx = Math.min(
        BOTTOM_ROOT_SEEDS.length - 1,
        Math.round((k * (BOTTOM_ROOT_SEEDS.length - 1)) / Math.max(1, keep - 1)),
      );
      activeSeeds.push(BOTTOM_ROOT_SEEDS[idx]);
    }
  } else if (clampedDensity > 1.03) {
    const extra = Math.round(BOTTOM_ROOT_SEEDS.length * (clampedDensity - 1.0));
    for (let k = 0; k < extra; k++) {
      const pairPos = ((k + 0.5) / Math.max(1, extra)) * (BOTTOM_ROOT_SEEDS.length - 1);
      const i0 = Math.min(BOTTOM_ROOT_SEEDS.length - 1, Math.floor(pairPos));
      const i1 = Math.min(BOTTOM_ROOT_SEEDS.length - 1, i0 + 1);
      const f = i0 === i1 ? 0.5 : pairPos - i0;
      const a = BOTTOM_ROOT_SEEDS[i0];
      const b = BOTTOM_ROOT_SEEDS[i1];
      activeSeeds.push({
        tEdge: a.tEdge + (b.tEdge - a.tEdge) * f + (k % 2 === 0 ? 0.015 : -0.015),
        fanBias: a.fanBias + (b.fanBias - a.fanBias) * f,
        curveBend: (a.curveBend + (b.curveBend - a.curveBend) * f) * (k % 2 === 0 ? 1.05 : -0.95),
        thickness: (a.thickness + (b.thickness - a.thickness) * f) * 0.86,
        startOffset: a.startOffset + (b.startOffset - a.startOffset) * f + 0.012,
        hasVein: k % 2 === 0 && (a.hasVein || b.hasVein),
      });
    }
  }

  for (const seed of activeSeeds) {
    const startX = seed.tEdge * w + offsetX * 0.65;
    const startY = -2 + offsetY * 0.35;
    // Downward (+PI/2) gently biased outward to connect straight through to the 3D roots below
    const baseAngle = Math.PI * 0.5 + seed.fanBias * 0.55;
    const reachLen = h * (0.94 + rng() * 0.24);
    growBranch(
      startX,
      startY,
      baseAngle,
      reachLen,
      seed.thickness * scale,
      seed.startOffset,
      0.46 + rng() * 0.16,
      seed.curveBend,
      2,
      seed.hasVein,
    );
  }

  return { w, h, offsetX, offsetY, density: clampedDensity, segs, leaves, spores };
}

/**
 * Translucent glowing golden-mahogany & emerald root veil that grows seamlessly downward
 * from the bottom seam of `angel_case_calc_pure.mp4` RIGHT THROUGH the glass modal card
 * into the 3D `CalcPureTree3D` roots below — while keeping all text and buttons 100% crisp & clickable.
 */
export function CalcPureModalRootVeil({
  clockRef,
  powerSaveMode = false,
}: CalcPureModalRootVeilProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const powerSaveRef = useRef<boolean>(powerSaveMode);
  powerSaveRef.current = powerSaveMode;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let running = false;
    let lastDrawMs = 0;
    let smoothProgress = 0;
    let currentOpacity = 0;
    let animClock = 0;
    let network: BuiltRootNetwork | null = null;
    let prevActive = false;

    const ensureNetwork = () => {
      const rect = canvas.getBoundingClientRect();
      const cw = Math.max(40, Math.round(rect.width));
      const ch = Math.max(40, Math.round(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      const targetW = Math.round(cw * dpr);
      const targetH = Math.round(ch * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      const curOffX = getCalcPureTreeOffsetX();
      const curOffY = getCalcPureTreeOffsetY();
      const curDensity = getCalcPureTreeDensity();
      if (
        !network ||
        Math.abs(network.w - cw) > 6 ||
        Math.abs(network.h - ch) > 6 ||
        network.offsetX !== curOffX ||
        network.offsetY !== curOffY ||
        Math.abs(network.density - curDensity) > 0.005
      ) {
        network = buildRootNetwork(cw, ch, curOffX, curOffY, curDensity);
      }
      return { cw, ch, dpr };
    };

    const drawFrame = (nowMs: number) => {
      rafId = 0;
      const dt = lastDrawMs > 0 ? Math.min(0.06, Math.max(0.004, (nowMs - lastDrawMs) / 1000)) : 0.016;
      if (powerSaveRef.current && lastDrawMs > 0 && nowMs - lastDrawMs < 42) {
        rafId = window.requestAnimationFrame(drawFrame);
        return;
      }
      lastDrawMs = nowMs;
      animClock += dt;

      const clk = clockRef.current;
      const active = clk.active;
      const vidSec = clk.currentTime;

      if (active && !prevActive && vidSec < 1.5) {
        smoothProgress = 0;
      }
      prevActive = active;

      if (active) {
        const targetProg = Math.max(
          0,
          Math.min(1.04, (vidSec - GROW_START_SEC) / GROW_SPAN_SEC),
        );
        smoothProgress += (targetProg - smoothProgress) * Math.min(1, dt * 10.5);

        const fadeIn = Math.max(0, Math.min(1, (vidSec - (GROW_START_SEC + 0.14)) / 0.34));
        let dissolve = 1;
        if (vidSec >= DISSOLVE_START_SEC) {
          const dk = Math.max(
            0,
            Math.min(1, (vidSec - DISSOLVE_START_SEC) / (DISSOLVE_END_SEC - DISSOLVE_START_SEC)),
          );
          dissolve = (1 - dk) * (1 - dk);
        }
        currentOpacity = fadeIn * dissolve;
      } else {
        currentOpacity = Math.max(0, currentOpacity - dt * 2.8);
      }

      const { cw, ch, dpr } = ensureNetwork();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);

      if (currentOpacity <= 0.008 || !network) {
        if (!active) {
          running = false;
          smoothProgress = 0;
          lastDrawMs = 0;
          return;
        }
        rafId = window.requestAnimationFrame(drawFrame);
        return;
      }

      const prog = smoothProgress;
      // Keep roots clearly visible threading through the translucent modal glass
      // without ever competing with the bright white/amber text inside the card
      const masterAlpha = currentOpacity * 0.58;

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Soft top-seam golden-emerald root glow where video connects directly into modal top
      const seamGlow = ctx.createLinearGradient(0, 0, 0, Math.min(54, ch * 0.36));
      seamGlow.addColorStop(0, `rgba(218, 152, 54, ${(masterAlpha * 0.42).toFixed(3)})`);
      seamGlow.addColorStop(0.5, `rgba(74, 210, 96, ${(masterAlpha * 0.14).toFixed(3)})`);
      seamGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = seamGlow;
      ctx.fillRect(0, 0, cw, Math.min(54, ch * 0.36));

      // 1. Gnarled golden-copper braided root limbs + crimson glowing sap veins
      const segs = network.segs;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (prog <= s.t0) continue;
        const frac = s.t1 > s.t0 ? Math.min(1, (prog - s.t0) / (s.t1 - s.t0)) : 1;
        const swayX0 = Math.sin(animClock * 1.4 + s.y0 * 0.025 + s.x0 * 0.015) * 1.8 * s.sway;
        const swayX1 = Math.sin(animClock * 1.4 + s.y1 * 0.025 + s.x1 * 0.015) * 1.8 * s.sway;

        const x0 = s.x0 + swayX0;
        const y0 = s.y0;
        const x1 = x0 + (s.x1 + swayX1 - x0) * frac;
        const y1 = y0 + (s.y1 - y0) * frac;
        const width = (s.w0 + (s.w1 - s.w0) * frac * 0.5);

        // Soften opacity slightly in the horizontal center so text stays effortless to read
        const centerDist = Math.abs(((x0 + x1) * 0.5) / cw - 0.5) * 2; // 0 at center, 1 at edges
        const edgeBoost = 0.72 + centerDist * 0.42;
        const segAlpha = Math.min(1, masterAlpha * edgeBoost);

        // Warm mahogany outer bark glow
        ctx.strokeStyle = `rgba(148, 72, 22, ${(segAlpha * 0.72).toFixed(3)})`;
        ctx.lineWidth = width + 2.0;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();

        // Luminous golden-amber braided bark core
        ctx.strokeStyle = `rgba(232, 168, 66, ${(segAlpha * 0.92).toFixed(3)})`;
        ctx.lineWidth = Math.max(0.8, width * 0.68);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();

        // Crimson-ruby sap energy vein on major roots (exact visual echo of calc_pure video)
        if (s.hasVein) {
          const pulse = 0.78 + 0.22 * Math.sin(animClock * 3.1 - y0 * 0.04);
          ctx.strokeStyle = `rgba(255, 62, 68, ${(segAlpha * 0.62 * pulse).toFixed(3)})`;
          ctx.lineWidth = Math.max(0.7, width * 0.28);
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }

        // Bright emerald-gold sprouting frontier sparkle at active growing tips
        if (frac > 0.05 && frac < 0.98) {
          ctx.fillStyle = `rgba(175, 255, 142, ${(segAlpha * 0.95).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(x1, y1, Math.max(1.8, width * 0.55), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 2. Pointed luminous emerald undergrowth leaves unfurling along the roots
      const leaves = network.leaves;
      for (let i = 0; i < leaves.length; i++) {
        const lf = leaves[i];
        const delta = prog - lf.appearAt;
        if (delta <= 0) continue;
        const pop = Math.min(1, delta / 0.09);
        const unfurl = 1 - Math.pow(1 - pop, 2.2) + Math.sin(pop * Math.PI) * 0.1;
        const swayX = Math.sin(animClock * 1.4 + lf.y * 0.025 + lf.x * 0.015) * 1.8;
        const flutter = Math.sin(animClock * 2.5 + lf.phase) * 0.09;

        const len = lf.len * unfurl;
        const wid = lf.wid * unfurl;
        const alpha = masterAlpha * lf.bright * 0.92;

        ctx.save();
        ctx.translate(lf.x + swayX, lf.y);
        ctx.rotate(lf.angle + flutter);

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(len * 0.45, -wid, len, 0);
        ctx.quadraticCurveTo(len * 0.45, wid, 0, 0);
        ctx.closePath();

        const g = ctx.createLinearGradient(0, 0, len, 0);
        g.addColorStop(0, `rgba(22, 138, 52, ${(alpha * 0.78).toFixed(3)})`);
        g.addColorStop(0.62, `rgba(82, 236, 108, ${(alpha * 0.94).toFixed(3)})`);
        g.addColorStop(1, `rgba(205, 255, 180, ${alpha.toFixed(3)})`);
        ctx.fillStyle = g;
        ctx.fill();

        // Crisp luminous center leaf vein
        ctx.strokeStyle = `rgba(225, 255, 200, ${(alpha * 0.7).toFixed(3)})`;
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(1, 0);
        ctx.lineTo(len * 0.86, 0);
        ctx.stroke();

        ctx.restore();
      }

      // 3. Tiny drifting emerald & warm-gold botanical spores
      const spores = network.spores;
      for (let i = 0; i < spores.length; i++) {
        const sp = spores[i];
        const delta = prog - sp.appearAt;
        if (delta <= 0) continue;
        const u = (animClock * 0.24 + sp.phase) % 1;
        const env = Math.sin(u * Math.PI) * Math.min(1, delta / 0.12);
        const sx = sp.x + sp.vx * u + Math.sin(animClock * 2 + sp.phase) * 3;
        const sy = sp.y + sp.vy * u;
        const alpha = masterAlpha * env * 0.85;
        if (alpha <= 0.01) continue;

        ctx.fillStyle = sp.isGold
          ? `rgba(255, 224, 132, ${alpha.toFixed(3)})`
          : `rgba(148, 255, 158, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, sp.r * (0.7 + 0.4 * env), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      if (active || currentOpacity > 0.008) {
        rafId = window.requestAnimationFrame(drawFrame);
      } else {
        running = false;
        lastDrawMs = 0;
      }
    };

    const wake = () => {
      if (running) return;
      running = true;
      lastDrawMs = 0;
      rafId = window.requestAnimationFrame(drawFrame);
    };

    clockRef.current.wake = wake;
    if (clockRef.current.active) {
      wake();
    }

    const unsubscribeOverrides = subscribeAngelVideoOverrides(() => {
      network = null;
      if (clockRef.current.active) {
        wake();
      }
    });

    return () => {
      unsubscribeOverrides();
      if (clockRef.current.wake === wake) {
        clockRef.current.wake = undefined;
      }
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [clockRef]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 z-20 w-full h-full pointer-events-none rounded-xl overflow-hidden mix-blend-screen"
    />
  );
}
