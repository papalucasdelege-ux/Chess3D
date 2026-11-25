import { useEffect, useRef, useState, type MutableRefObject } from 'react';

export interface ForcedIdleVideoClock {
  currentTime: number;
  duration: number;
  active: boolean;
}

interface DanceWithStarsAuraProps {
  active: boolean;
  powerSaveMode?: boolean;
  videoClockRef?: MutableRefObject<ForcedIdleVideoClock>;
  portraitCanvasRef?: MutableRefObject<HTMLCanvasElement | null>;
  fallbackDurationSec?: number;
}

type MovieSparkKind = 'dust' | 'ribbon' | 'glint';

interface MovieSparkParticle {
  kind: MovieSparkKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
  twinkleSpeed: number;
  age: number;
  life: number;
  r: number;
  g: number;
  b: number;
  priority: number; // 0..1 threshold for graceful density taper toward video end
}

/**
 * Mirrors the exact micro-particles inside Chess Angel's "Dance with Stars" movie:
 *   - Crisp pinpoint warm ivory & honey-gold fairy-dust specks (`dust`)
 *   - Silky warm amber-gold stardust wisps (`ribbon`) emitted live from bright golden sparks
 *     detected along the playing movie's actual left/right/top/bottom edges
 *   - Rare razor-fine 4-point pinpoint micro-glints (`glint`)
 *
 * Spreads gracefully far across the left side of the screen and mirrors the movie's real arc:
 * calm at t=0..1.0s, awakening as her hands ignite sparks (~1.1s), peaking through her full dance
 * (2.0s..6.8s), and diminishing cleanly all the way down to 0 before the video finishes.
 */
export function DanceWithStarsAura({
  active,
  powerSaveMode = false,
  videoClockRef,
  portraitCanvasRef,
  fallbackDurationSec = 10.08,
}: DanceWithStarsAuraProps) {
  const [mounted, setMounted] = useState(active);
  const activeRef = useRef(active);
  activeRef.current = active;
  const powerSaveRef = useRef(powerSaveMode);
  powerSaveRef.current = powerSaveMode;
  const fallbackDurRef = useRef(fallbackDurationSec);
  fallbackDurRef.current = fallbackDurationSec;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (active) {
      setMounted(true);
    }
  }, [active]);

  useEffect(() => {
    if (!mounted) return;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Tiny low-res border probe canvas (24x48 = 1152 px) for real-time edge-spark tracking
    const PROBE_W = 24;
    const PROBE_H = 48;
    const probeCanvas = document.createElement('canvas');
    probeCanvas.width = PROBE_W;
    probeCanvas.height = PROBE_H;
    const probeCtx = probeCanvas.getContext('2d', { willReadFrequently: true });

    let rafId = 0;
    let lastTs = performance.now();
    let activeFade = activeRef.current ? 0.02 : 0;
    let elapsed = 0;
    let lastProbeAt = 0;

    let width = 620;
    let height = 420;
    let dpr = 1;

    // Exact bounds of Chess Angel's portrait video inside our expanded canvas
    let innerL = 360;
    let innerR = 560;
    let innerT = 48;
    let innerB = 360;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = Math.max(200, Math.round(rect.width));
      height = Math.max(160, Math.round(rect.height));
      dpr = Math.min(powerSaveRef.current ? 1.25 : 2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);

      const parentRect = container.parentElement?.getBoundingClientRect();
      if (parentRect && parentRect.width > 40 && parentRect.height > 40) {
        innerL = Math.max(24, parentRect.left - rect.left);
        innerR = Math.min(width - 8, innerL + parentRect.width);
        innerT = Math.max(12, parentRect.top - rect.top);
        innerB = Math.min(height - 12, innerT + parentRect.height);
      } else {
        innerL = Math.round(width * 0.6);
        innerR = Math.round(width - 40);
        innerT = 48;
        innerB = Math.max(innerT + 120, height - 56);
      }
    };
    resize();

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(container);
    if (container.parentElement) {
      ro?.observe(container.parentElement);
    }

    // Movie-sampled warm ivory / champagne / honey-amber dust palette
    const pickMoviePalette = (): [number, number, number] => {
      const r = Math.random();
      if (r < 0.45) return [255, 250, 234]; // crisp starlight ivory-white
      if (r < 0.8) return [252, 214, 128]; // warm champagne-gold dust
      return [232, 168, 66]; // rich honey-amber ribbon dust
    };

    const spawnAmbientSpark = (initial = false): MovieSparkParticle => {
      const innerW = Math.max(60, innerR - innerL);
      const innerH = Math.max(80, innerB - innerT);
      const leftSpan = Math.max(100, innerL - 10);
      const rightSpan = Math.max(18, width - innerR - 6);
      const topSpan = Math.max(16, innerT - 6);
      const bottomSpan = Math.max(18, height - innerB - 6);

      const roll = Math.random();
      const kind: MovieSparkKind =
        roll < 0.74 ? 'dust' : roll < 0.91 ? 'ribbon' : 'glint';

      let x = innerL;
      let y = innerT + innerH * 0.5;
      let vx = -14;
      let vy = -6;

      const zone = Math.random();
      if (zone < 0.72) {
        // Wide cosmic fairy-dust field spreading far onto the left side of the screen
        const distNorm = Math.pow(Math.random(), 1.32);
        x = innerL + 6 - distNorm * leftSpan;
        const vertSpread = innerH + topSpan * 0.7 + bottomSpan * 0.7 + distNorm * 52;
        y = innerT - topSpan * 0.45 - distNorm * 22 + Math.random() * vertSpread;
        vx = -(8 + Math.random() * 22) * (0.65 + 0.55 * distNorm);
        vy = (Math.random() - 0.56) * 14;
      } else if (zone < 0.86) {
        // Soft sky extension just above her frame sweeping left
        x = innerL - leftSpan * 0.48 + Math.random() * (innerW + leftSpan * 0.48 + rightSpan * 0.4);
        y = innerT - Math.random() * topSpan * 0.88;
        vx = -(5 + Math.random() * 14);
        vy = -2 - Math.random() * 7;
      } else {
        // Subtle right-edge & lower-edge continuation so the frame melts into darkness
        const isRight = Math.random() < 0.55;
        if (isRight) {
          x = innerR - 4 + Math.random() * rightSpan * 0.88;
          y = innerT + Math.random() * (innerH + bottomSpan * 0.4);
          vx = 3 + Math.random() * 10;
          vy = (Math.random() - 0.55) * 10;
        } else {
          x = innerL - leftSpan * 0.35 + Math.random() * (innerW + leftSpan * 0.35);
          y = innerB - 10 + Math.random() * bottomSpan * 0.85;
          vx = -(6 + Math.random() * 16);
          vy = -4 - Math.random() * 10;
        }
      }

      const [r, g, b] = pickMoviePalette();
      const life =
        kind === 'glint'
          ? 0.9 + Math.random() * 1.1
          : kind === 'ribbon'
            ? 1.8 + Math.random() * 2.0
            : 2.0 + Math.random() * 2.6;

      // Matched 1:1 to the micro-dots & tiny glints inside angel_special_dance_stars.mp4
      const size =
        kind === 'glint'
          ? 2.1 + Math.random() * 1.9
          : kind === 'ribbon'
            ? 0.6 + Math.random() * 0.85
            : 0.65 + Math.random() * 1.25;

      return {
        kind,
        x,
        y,
        vx,
        vy,
        size,
        phase: Math.random() * Math.PI * 2,
        twinkleSpeed:
          kind === 'glint'
            ? 4.6 + Math.random() * 3.4
            : 2.0 + Math.random() * 3.4,
        age: initial ? Math.random() * life : 0,
        life,
        r,
        g,
        b,
        priority: Math.random(),
      };
    };

    const maxAmbientCount = powerSaveRef.current ? 72 : 138;
    const particles: MovieSparkParticle[] = [];
    for (let i = 0; i < maxAmbientCount; i++) {
      particles.push(spawnAmbientSpark(true));
    }

    // Live edge-emitted particles spawned directly from glowing golden sparks in the movie!
    const maxEmittedCount = powerSaveRef.current ? 55 : 130;
    const emittedSparks: MovieSparkParticle[] = [];

    // Sample the live playing movie's left & right edges to emit exact corresponding sparks
    const sampleMovieBorderAndEmit = (movieEnvelope: number) => {
      if (!probeCtx || movieEnvelope < 0.08) return;
      const srcCanvas = portraitCanvasRef?.current;
      if (!srcCanvas || srcCanvas.width < 32 || srcCanvas.height < 32) return;

      const innerH = Math.max(80, innerB - innerT);
      const srcW = srcCanvas.width;
      const srcH = srcCanvas.height;

      try {
        // Sample the outer 14% left band of the playing movie into PROBE_W x PROBE_H
        const stripSrcW = Math.max(8, Math.round(srcW * 0.14));
        probeCtx.clearRect(0, 0, PROBE_W, PROBE_H);
        probeCtx.drawImage(srcCanvas, 0, 0, stripSrcW, srcH, 0, 0, PROBE_W, PROBE_H);
        const data = probeCtx.getImageData(0, 0, PROBE_W, PROBE_H).data;

        // Find bright isolated or warm-gold spark pixels sitting on dark black background
        let spawnedThisTick = 0;
        const maxSpawnPerTick = powerSaveRef.current ? 3 : 6;

        for (let py = 2; py < PROBE_H - 2 && spawnedThisTick < maxSpawnPerTick; py++) {
          // Focus on the leftmost columns of the movie (where ribbons & stars exit left)
          for (let px = 1; px < Math.min(12, PROBE_W - 1); px++) {
            const idx = (py * PROBE_W + px) * 4;
            const cr = data[idx];
            const cg = data[idx + 1];
            const cb = data[idx + 2];
            const luma = 0.299 * cr + 0.587 * cg + 0.114 * cb;

            // Must be bright enough to be a spark/golden ribbon pixel
            if (luma < 62) continue;
            // Warm gold or crisp ivory starlight (exclude cool blue sash highlights)
            if (cb > cr + 14) continue;

            // Check that at least one immediate neighbor is very dark (star/dust on black space,
            // NOT a solid uniform dress/skin/floor region!)
            const upIdx = ((py - 1) * PROBE_W + px) * 4;
            const dnIdx = ((py + 1) * PROBE_W + px) * 4;
            const ltIdx = (py * PROBE_W + (px - 1)) * 4;
            const rtIdx = (py * PROBE_W + (px + 1)) * 4;
            const minNeighborLuma = Math.min(
              0.299 * data[upIdx] + 0.587 * data[upIdx + 1] + 0.114 * data[upIdx + 2],
              0.299 * data[dnIdx] + 0.587 * data[dnIdx + 1] + 0.114 * data[dnIdx + 2],
              0.299 * data[ltIdx] + 0.587 * data[ltIdx + 1] + 0.114 * data[ltIdx + 2],
              0.299 * data[rtIdx] + 0.587 * data[rtIdx + 1] + 0.114 * data[rtIdx + 2],
            );
            const avgNeighborLuma =
              (0.299 * data[upIdx] + 0.587 * data[upIdx + 1] + 0.114 * data[upIdx + 2] +
                0.299 * data[dnIdx] + 0.587 * data[dnIdx + 1] + 0.114 * data[dnIdx + 2] +
                0.299 * data[ltIdx] + 0.587 * data[ltIdx + 1] + 0.114 * data[ltIdx + 2] +
                0.299 * data[rtIdx] + 0.587 * data[rtIdx + 1] + 0.114 * data[rtIdx + 2]) *
              0.25;

            const isWarmGoldRibbon = cr > 95 && cr - cb > 26 && minNeighborLuma < 45;
            const isPinpointSpark = luma - avgNeighborLuma > 26 && minNeighborLuma < 34;

            if (!isWarmGoldRibbon && !isPinpointSpark) continue;
            if (Math.random() > 0.32 * movieEnvelope) continue;

            // Emit a matching spark right out of this exact movie border Y position!
            const normY = (py + (Math.random() - 0.5)) / PROBE_H;
            const spawnY = innerT + normY * innerH;
            const spawnX = innerL + (px / PROBE_W) * 8 - 2;

            // Preserve the movie pixel's warm golden/ivory tint, boosted cleanly for additive glow
            const boost = 255 / Math.max(185, cr);
            const er = Math.min(255, Math.round(cr * boost));
            const eg = Math.min(248, Math.round(cg * boost));
            const eb = Math.min(232, Math.round(cb * boost));

            const kind: MovieSparkKind =
              isPinpointSpark && luma > 155 && Math.random() < 0.22
                ? 'glint'
                : isWarmGoldRibbon
                  ? 'ribbon'
                  : 'dust';

            const speedBoost = isWarmGoldRibbon ? 1.35 : 1.0;
            const p: MovieSparkParticle = {
              kind,
              x: spawnX,
              y: spawnY,
              vx: -(24 + Math.random() * 54) * speedBoost,
              vy: (normY - 0.52) * 18 + (Math.random() - 0.55) * 18,
              size:
                kind === 'glint'
                  ? 2.2 + Math.random() * 1.7
                  : kind === 'ribbon'
                    ? 0.65 + Math.random() * 0.9
                    : 0.7 + Math.random() * 1.15,
              phase: Math.random() * Math.PI * 2,
              twinkleSpeed: 3.0 + Math.random() * 4.0,
              age: 0,
              life: 1.4 + Math.random() * 2.2,
              r: er,
              g: eg,
              b: eb,
              priority: Math.random() * 0.7,
            };

            if (emittedSparks.length >= maxEmittedCount) {
              emittedSparks.shift();
            }
            emittedSparks.push(p);
            spawnedThisTick++;
            break; // at most one emission per row per tick
          }
        }
      } catch {
        // Ignore SecurityError or transient canvas state
      }
    };

    const drawPinpointGlint = (
      x: number,
      y: number,
      radius: number,
      alpha: number,
      r: number,
      g: number,
      b: number,
    ) => {
      if (alpha <= 0.008) return;
      ctx.save();
      ctx.translate(x, y);

      // Soft warm micro-halo
      const haloR = radius * 1.65;
      const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, haloR);
      halo.addColorStop(0, `rgba(255, 252, 238, ${(alpha * 0.72).toFixed(3)})`);
      halo.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${(alpha * 0.34).toFixed(3)})`);
      halo.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, haloR, 0, Math.PI * 2);
      ctx.fill();

      // Razor-fine upright + needle diamond matching the tiny glints in the movie
      const inner = Math.max(0.32, radius * 0.14);
      ctx.fillStyle = `rgba(255, 252, 240, ${(alpha * 0.96).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(0, -radius);
      ctx.lineTo(inner, -inner);
      ctx.lineTo(radius, 0);
      ctx.lineTo(inner, inner);
      ctx.lineTo(0, radius);
      ctx.lineTo(-inner, inner);
      ctx.lineTo(-radius, 0);
      ctx.lineTo(-inner, -inner);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    };

    const drawDustSpeck = (
      x: number,
      y: number,
      radius: number,
      alpha: number,
      r: number,
      g: number,
      b: number,
      isRibbon: boolean,
    ) => {
      if (alpha <= 0.008) return;
      // Soft amber-gold mist glow around ribbon dust; tighter crisp halo on sky starlight specks
      const haloMul = isRibbon ? 3.4 : 2.35;
      const haloR = radius * haloMul;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, haloR);
      grad.addColorStop(0, `rgba(255, 253, 244, ${(alpha * 0.94).toFixed(3)})`);
      grad.addColorStop(
        isRibbon ? 0.32 : 0.42,
        `rgba(${r}, ${g}, ${b}, ${(alpha * (isRibbon ? 0.56 : 0.46)).toFixed(3)})`,
      );
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, haloR, 0, Math.PI * 2);
      ctx.fill();

      // Crisp micro pinpoint core (matches the sharp white-gold dots in the movie!)
      if (!isRibbon || radius > 0.85) {
        ctx.fillStyle = `rgba(255, 253, 245, ${(alpha * 0.92).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.45, radius * 0.48), 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const renderParticleList = (
      list: MovieSparkParticle[],
      dt: number,
      masterEnvelope: number,
      tailDiminish: number,
      isEmitted: boolean,
    ) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.age += dt;
        if (p.age >= p.life) {
          if (isEmitted) {
            list.splice(i, 1);
          } else if (activeRef.current && masterEnvelope > 0.05 && p.priority <= tailDiminish) {
            list[i] = spawnAmbientSpark(false);
          }
          continue;
        }

        // Smoothly thin particle count as the video approaches its end
        const densityGate =
          tailDiminish >= 0.99
            ? 1
            : Math.max(0, Math.min(1, (tailDiminish - p.priority * 0.6) / 0.4));
        if (densityGate <= 0.01) continue;

        // Gentle aerodynamic drag on edge-emitted wisps so they billow gracefully leftward
        if (isEmitted) {
          const drag = Math.pow(0.76, dt);
          p.vx *= drag;
          p.vy = p.vy * Math.pow(0.84, dt) - 1.8 * dt;
        }

        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.x += Math.sin(elapsed * 1.6 + p.phase) * 2.4 * dt;
        p.y += Math.cos(elapsed * 1.3 + p.phase) * 1.4 * dt;

        const lifeT = p.age / p.life;
        const lifeEnv =
          lifeT < 0.16 ? lifeT / 0.16 : lifeT > 0.68 ? (1 - lifeT) / 0.32 : 1;
        const twinkleRaw = 0.5 + 0.5 * Math.sin(elapsed * p.twinkleSpeed + p.phase);
        const twinkle = 0.35 + 0.65 * (twinkleRaw * twinkleRaw);

        // Soft feather at the far-left edge so stars never clip against an invisible box
        const leftFeather = p.x < 44 ? Math.max(0, p.x / 44) : 1;
        const topFeather = p.y < 22 ? Math.max(0, p.y / 22) : 1;
        const bottomFeather = p.y > height - 22 ? Math.max(0, (height - p.y) / 22) : 1;

        const alpha = Math.min(
          1,
          lifeEnv *
            twinkle *
            masterEnvelope *
            densityGate *
            leftFeather *
            topFeather *
            bottomFeather,
        );
        if (alpha <= 0.008) continue;

        if (p.kind === 'glint') {
          drawPinpointGlint(
            p.x,
            p.y,
            p.size * (0.78 + 0.32 * twinkleRaw),
            alpha,
            p.r,
            p.g,
            p.b,
          );
        } else {
          drawDustSpeck(
            p.x,
            p.y,
            p.size * (0.84 + 0.24 * twinkleRaw),
            alpha,
            p.r,
            p.g,
            p.b,
            p.kind === 'ribbon',
          );
        }
      }
    };

    const render = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;
      elapsed += dt;

      if (activeRef.current) {
        activeFade = Math.min(1, activeFade + dt / 0.45);
      } else {
        activeFade = Math.max(0, activeFade - dt / 0.8);
      }

      // Sync exact choreography envelope to the live playing movie clock:
      //  - 0.00..0.09 (0.0s..0.9s): calm portrait before her hands ignite sparks -> 0
      //  - 0.09..0.21 (0.9s..2.1s): golden dust blossoms right as her hands spark up -> 0..1
      //  - 0.21..0.66 (2.1s..6.7s): full fairy-dust starfield & live edge-ribbon emission -> 1
      //  - 0.66..0.90 (6.7s..9.1s): diminishes smoothly all the way down to 0 before she finishes!
      const clock = videoClockRef?.current;
      const hasLiveClock = Boolean(
        clock && clock.active && Number.isFinite(clock.duration) && clock.duration > 0.5,
      );
      const curSec = hasLiveClock ? Math.max(0, clock!.currentTime) : elapsed;
      const durSec = hasLiveClock
        ? clock!.duration
        : Math.max(4.0, fallbackDurRef.current || 10.08);
      const progress = Math.max(0, Math.min(1, curSec / durSec));

      // Awakening curve matching her hands raising at ~1.0s
      let introBloom = 1;
      if (progress < 0.09) {
        introBloom = 0;
      } else if (progress < 0.21) {
        const u = (progress - 0.09) / 0.12;
        introBloom = u * u * (3 - 2 * u);
      }

      // Smooth diminish to 0 matching the movie's particles fading out by ~9.0s (90% of clip)
      let tailDiminish = 1;
      if (progress > 0.66) {
        const t = Math.min(1, (progress - 0.66) / 0.24);
        const smooth = Math.max(0, 1 - t * t * (3 - 2 * t));
        tailDiminish = smooth * smooth;
      }

      const masterEnvelope = activeFade * introBloom * tailDiminish;

      if (!activeRef.current && activeFade <= 0.002) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setMounted(false);
        return;
      }

      // Probe the movie's real border pixels at ~20Hz to spill matching sparks straight out of the video!
      if (activeRef.current && masterEnvelope > 0.08 && now - lastProbeAt >= 50) {
        lastProbeAt = now;
        sampleMovieBorderAndEmit(masterEnvelope);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      if (masterEnvelope <= 0.003) {
        rafId = window.requestAnimationFrame(render);
        return;
      }

      ctx.globalCompositeOperation = 'lighter';
      renderParticleList(particles, dt, masterEnvelope, tailDiminish, false);
      renderParticleList(emittedSparks, dt, masterEnvelope, tailDiminish, true);

      rafId = window.requestAnimationFrame(render);
    };

    rafId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(rafId);
      ro?.disconnect();
    };
  }, [mounted, videoClockRef, portraitCanvasRef]);

  if (!mounted) return null;

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none select-none absolute -top-12 -bottom-14 -left-[min(52vw,520px)] -right-14 z-30 overflow-visible"
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}
