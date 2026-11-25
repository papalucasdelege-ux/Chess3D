// 100% procedural Web Audio synthesizer for wooden Staunton chess acoustics (zero external audio files)

import { opponentSpeech } from '../chess/opponentVoice';

interface MoveWoodVariant {
  startFreq: number;
  endFreq: number;
  bodyDecay: number;
  bodyGain: number;
  woodFormantFreq: number;
  woodFormantGain: number;
  clickFreq: number;
  clickQ: number;
  clickDuration: number;
  clickGain: number;
  settleDelay?: number;
  settleFreq?: number;
  settleGain?: number;
}

interface CaptureWoodVariant {
  clackLeadMs: number;
  clackStartFreq: number;
  clackEndFreq: number;
  clackClickFreq: number;
  clackGain: number;
  thudStartFreq: number;
  thudEndFreq: number;
  thudDecay: number;
  thudGain: number;
  bodyNoiseFreq: number;
  bodyNoiseQ: number;
  bodyNoiseGain: number;
}

interface CheckWoodVariant {
  woodStartFreq: number;
  woodEndFreq: number;
  woodClickFreq: number;
  woodGain: number;
  settleDelay?: number;
  notes: [number, number];
  noteStep: number;
  noteDecay: number;
  noteWave: OscillatorType;
}

const MOVE_WOOD_VARIANTS: readonly MoveWoodVariant[] = [
  // 1. Warm walnut center-board tap
  {
    startFreq: 184,
    endFreq: 68,
    bodyDecay: 0.072,
    bodyGain: 0.23,
    woodFormantFreq: 335,
    woodFormantGain: 0.055,
    clickFreq: 1280,
    clickQ: 1.35,
    clickDuration: 0.038,
    clickGain: 0.11,
  },
  // 2. Crisp maple square placement
  {
    startFreq: 212,
    endFreq: 78,
    bodyDecay: 0.064,
    bodyGain: 0.21,
    woodFormantFreq: 398,
    woodFormantGain: 0.065,
    clickFreq: 1620,
    clickQ: 1.6,
    clickDuration: 0.034,
    clickGain: 0.125,
  },
  // 3. Soft felted base with micro rim-settle tick
  {
    startFreq: 174,
    endFreq: 64,
    bodyDecay: 0.078,
    bodyGain: 0.22,
    woodFormantFreq: 312,
    woodFormantGain: 0.048,
    clickFreq: 1160,
    clickQ: 1.25,
    clickDuration: 0.042,
    clickGain: 0.098,
    settleDelay: 0.018,
    settleFreq: 1540,
    settleGain: 0.045,
  },
  // 4. Solid weighted Staunton knock
  {
    startFreq: 198,
    endFreq: 71,
    bodyDecay: 0.07,
    bodyGain: 0.245,
    woodFormantFreq: 362,
    woodFormantGain: 0.062,
    clickFreq: 1410,
    clickQ: 1.45,
    clickDuration: 0.039,
    clickGain: 0.118,
  },
  // 5. Tighter perimeter wood tap with quick micro-settle
  {
    startFreq: 222,
    endFreq: 83,
    bodyDecay: 0.06,
    bodyGain: 0.205,
    woodFormantFreq: 424,
    woodFormantGain: 0.058,
    clickFreq: 1710,
    clickQ: 1.7,
    clickDuration: 0.032,
    clickGain: 0.115,
    settleDelay: 0.014,
    settleFreq: 1860,
    settleGain: 0.04,
  },
];

const CAPTURE_WOOD_VARIANTS: readonly CaptureWoodVariant[] = [
  // 1. Boxwood piece-clack into deep walnut thud
  {
    clackLeadMs: 0.02,
    clackStartFreq: 440,
    clackEndFreq: 195,
    clackClickFreq: 1880,
    clackGain: 0.13,
    thudStartFreq: 248,
    thudEndFreq: 56,
    thudDecay: 0.118,
    thudGain: 0.3,
    bodyNoiseFreq: 920,
    bodyNoiseQ: 1.3,
    bodyNoiseGain: 0.2,
  },
  // 2. Direct decisive take (simultaneous dual-wood impact)
  {
    clackLeadMs: 0.0,
    clackStartFreq: 485,
    clackEndFreq: 215,
    clackClickFreq: 2080,
    clackGain: 0.115,
    thudStartFreq: 270,
    thudEndFreq: 60,
    thudDecay: 0.108,
    thudGain: 0.31,
    bodyNoiseFreq: 980,
    bodyNoiseQ: 1.45,
    bodyNoiseGain: 0.21,
  },
  // 3. Brisk wood-on-wood knock & warm board settle
  {
    clackLeadMs: 0.015,
    clackStartFreq: 515,
    clackEndFreq: 230,
    clackClickFreq: 1740,
    clackGain: 0.125,
    thudStartFreq: 234,
    thudEndFreq: 53,
    thudDecay: 0.125,
    thudGain: 0.29,
    bodyNoiseFreq: 860,
    bodyNoiseQ: 1.25,
    bodyNoiseGain: 0.19,
  },
  // 4. Heavy major-piece capture thump
  {
    clackLeadMs: 0.024,
    clackStartFreq: 395,
    clackEndFreq: 175,
    clackClickFreq: 1620,
    clackGain: 0.12,
    thudStartFreq: 256,
    thudEndFreq: 50,
    thudDecay: 0.13,
    thudGain: 0.32,
    bodyNoiseFreq: 810,
    bodyNoiseQ: 1.2,
    bodyNoiseGain: 0.22,
  },
  // 5. Crisp snap-capture slide & tap
  {
    clackLeadMs: 0.012,
    clackStartFreq: 535,
    clackEndFreq: 245,
    clackClickFreq: 2180,
    clackGain: 0.13,
    thudStartFreq: 284,
    thudEndFreq: 64,
    thudDecay: 0.102,
    thudGain: 0.285,
    bodyNoiseFreq: 1090,
    bodyNoiseQ: 1.55,
    bodyNoiseGain: 0.195,
  },
];

const CHECK_WOOD_VARIANTS: readonly CheckWoodVariant[] = [
  // 1. Authoritative walnut knock + warm D5-A5 fifth
  {
    woodStartFreq: 228,
    woodEndFreq: 72,
    woodClickFreq: 1580,
    woodGain: 0.23,
    notes: [587.33, 880.0],
    noteStep: 0.056,
    noteDecay: 0.24,
    noteWave: 'sine',
  },
  // 2. Crisp maple strike + clear E5-A5 fourth
  {
    woodStartFreq: 248,
    woodEndFreq: 79,
    woodClickFreq: 1760,
    woodGain: 0.22,
    settleDelay: 0.015,
    notes: [659.25, 880.0],
    noteStep: 0.052,
    noteDecay: 0.22,
    noteWave: 'sine',
  },
  // 3. Deep Staunton thud + warm marimba-like C5-A5 sixth
  {
    woodStartFreq: 210,
    woodEndFreq: 66,
    woodClickFreq: 1420,
    woodGain: 0.24,
    notes: [523.25, 880.0],
    noteStep: 0.06,
    noteDecay: 0.25,
    noteWave: 'triangle',
  },
  // 4. Focused wood tap + gentle D5-G5-A5-style resonant octave shimmer
  {
    woodStartFreq: 238,
    woodEndFreq: 75,
    woodClickFreq: 1680,
    woodGain: 0.225,
    settleDelay: 0.017,
    notes: [587.33, 987.77],
    noteStep: 0.054,
    noteDecay: 0.23,
    noteWave: 'sine',
  },
];

class ChessSoundEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private lastMoveIdx = -1;
  private lastCaptureIdx = -1;
  private lastCheckIdx = -1;
  public enabled = true;

  public unlock(): void {
    this.ensureContext();
  }

  private ensureContext(): AudioContext | null {
    opponentSpeech.unlock();
    if (!this.enabled || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
      this.noiseBuffer = null;
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private pickVariantIndex(count: number, lastIndex: number): number {
    if (count <= 1) return 0;
    let idx = Math.floor(Math.random() * count);
    if (idx === lastIndex) {
      idx = (idx + 1 + Math.floor(Math.random() * (count - 1))) % count;
    }
    return idx;
  }

  private jitter(spread = 0.025): number {
    return 1 + (Math.random() * 2 - 1) * spread;
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const sampleCount = Math.floor(ctx.sampleRate * 0.2);
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  public playMove(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const idx = this.pickVariantIndex(MOVE_WOOD_VARIANTS.length, this.lastMoveIdx);
    this.lastMoveIdx = idx;
    const v = MOVE_WOOD_VARIANTS[idx];
    const pitchJitter = this.jitter(0.028);
    const gainJitter = this.jitter(0.05);

    // Primary hollow wooden board resonance
    const bodyOsc = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(v.startFreq * pitchJitter, now);
    bodyOsc.frequency.exponentialRampToValueAtTime(v.endFreq * pitchJitter, now + v.bodyDecay);

    bodyGain.gain.setValueAtTime(0.001, now);
    bodyGain.gain.linearRampToValueAtTime(v.bodyGain * gainJitter, now + 0.0035);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + v.bodyDecay + 0.01);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(ctx.destination);
    bodyOsc.start(now);
    bodyOsc.stop(now + v.bodyDecay + 0.015);

    // Subtle boxwood/walnut formant harmonic
    const grainOsc = ctx.createOscillator();
    const grainGain = ctx.createGain();
    grainOsc.type = 'sine';
    grainOsc.frequency.setValueAtTime(v.woodFormantFreq * pitchJitter, now);
    grainOsc.frequency.exponentialRampToValueAtTime(
      v.woodFormantFreq * 0.52 * pitchJitter,
      now + 0.028,
    );

    grainGain.gain.setValueAtTime(0.001, now);
    grainGain.gain.linearRampToValueAtTime(v.woodFormantGain * gainJitter, now + 0.002);
    grainGain.gain.exponentialRampToValueAtTime(0.001, now + 0.032);

    grainOsc.connect(grainGain);
    grainGain.connect(ctx.destination);
    grainOsc.start(now);
    grainOsc.stop(now + 0.036);

    // Felt-and-wood contact transient
    this.playClickNoise(
      ctx,
      now,
      v.clickFreq * pitchJitter,
      v.clickQ,
      v.clickDuration,
      v.clickGain * gainJitter,
    );

    // Optional subtle secondary rim-settle micro-tick
    if (v.settleDelay && v.settleFreq && v.settleGain) {
      const settleAt = now + v.settleDelay * this.jitter(0.08);
      this.playClickNoise(
        ctx,
        settleAt,
        v.settleFreq * pitchJitter,
        1.8,
        0.018,
        v.settleGain * gainJitter,
      );
    }
  }

  public playCapture(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const idx = this.pickVariantIndex(CAPTURE_WOOD_VARIANTS.length, this.lastCaptureIdx);
    this.lastCaptureIdx = idx;
    const v = CAPTURE_WOOD_VARIANTS[idx];
    const pitchJitter = this.jitter(0.03);
    const gainJitter = this.jitter(0.05);

    // Initial piece-on-piece boxwood clack
    const clackOsc = ctx.createOscillator();
    const clackGain = ctx.createGain();
    clackOsc.type = 'triangle';
    clackOsc.frequency.setValueAtTime(v.clackStartFreq * pitchJitter, now);
    clackOsc.frequency.exponentialRampToValueAtTime(v.clackEndFreq * pitchJitter, now + 0.026);

    clackGain.gain.setValueAtTime(0.001, now);
    clackGain.gain.linearRampToValueAtTime(v.clackGain * gainJitter, now + 0.002);
    clackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    clackOsc.connect(clackGain);
    clackGain.connect(ctx.destination);
    clackOsc.start(now);
    clackOsc.stop(now + 0.034);

    this.playClickNoise(
      ctx,
      now,
      v.clackClickFreq * pitchJitter,
      1.9,
      0.028,
      v.clackGain * 1.15 * gainJitter,
    );

    // Weighted landing thud on the walnut/maple square
    const impactAt = now + v.clackLeadMs * this.jitter(0.08);
    const thudOsc = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thudOsc.type = 'sine';
    thudOsc.frequency.setValueAtTime(v.thudStartFreq * pitchJitter, impactAt);
    thudOsc.frequency.exponentialRampToValueAtTime(
      v.thudEndFreq * pitchJitter,
      impactAt + v.thudDecay,
    );

    thudGain.gain.setValueAtTime(0.001, impactAt);
    thudGain.gain.linearRampToValueAtTime(v.thudGain * gainJitter, impactAt + 0.0045);
    thudGain.gain.exponentialRampToValueAtTime(0.001, impactAt + v.thudDecay + 0.012);

    thudOsc.connect(thudGain);
    thudGain.connect(ctx.destination);
    thudOsc.start(impactAt);
    thudOsc.stop(impactAt + v.thudDecay + 0.018);

    this.playClickNoise(
      ctx,
      impactAt,
      v.bodyNoiseFreq * pitchJitter,
      v.bodyNoiseQ,
      0.062,
      v.bodyNoiseGain * gainJitter,
    );
  }

  public playCheck(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const idx = this.pickVariantIndex(CHECK_WOOD_VARIANTS.length, this.lastCheckIdx);
    this.lastCheckIdx = idx;
    const v = CHECK_WOOD_VARIANTS[idx];
    const woodJitter = this.jitter(0.025);
    const gainJitter = this.jitter(0.05);

    // Grounded wooden piece-impact knock so check moves still feel tactile on the board
    const woodOsc = ctx.createOscillator();
    const woodGain = ctx.createGain();
    woodOsc.type = 'triangle';
    woodOsc.frequency.setValueAtTime(v.woodStartFreq * woodJitter, now);
    woodOsc.frequency.exponentialRampToValueAtTime(v.woodEndFreq * woodJitter, now + 0.068);

    woodGain.gain.setValueAtTime(0.001, now);
    woodGain.gain.linearRampToValueAtTime(v.woodGain * gainJitter, now + 0.0035);
    woodGain.gain.exponentialRampToValueAtTime(0.001, now + 0.076);

    woodOsc.connect(woodGain);
    woodGain.connect(ctx.destination);
    woodOsc.start(now);
    woodOsc.stop(now + 0.082);

    this.playClickNoise(ctx, now, v.woodClickFreq * woodJitter, 1.55, 0.036, 0.125 * gainJitter);

    if (v.settleDelay) {
      this.playClickNoise(
        ctx,
        now + v.settleDelay,
        v.woodClickFreq * 1.12 * woodJitter,
        1.8,
        0.018,
        0.042 * gainJitter,
      );
    }

    // Subtle warm acoustic check harmonic accent
    const noteDetune = this.jitter(0.004);
    v.notes.forEach((freq, noteIdx) => {
      const startAt = now + 0.012 + noteIdx * v.noteStep;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = v.noteWave;
      osc.frequency.setValueAtTime(freq * noteDetune, startAt);

      const peak = (v.noteWave === 'triangle' ? 0.082 : 0.098) * gainJitter;
      gain.gain.setValueAtTime(0.001, startAt);
      gain.gain.linearRampToValueAtTime(peak, startAt + 0.009);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + v.noteDecay);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + v.noteDecay + 0.015);
    });
  }

  public playGameOver(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    [392, 493.88, 587.33].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.09);

      gain.gain.setValueAtTime(0.001, now + idx * 0.09);
      gain.gain.linearRampToValueAtTime(0.12, now + idx * 0.09 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.09);
      osc.stop(now + idx * 0.09 + 0.48);
    });
  }

  /**
   * Expressive procedural small fluffy puppy barking wildly ("YIP! ARF-YIP! YIP-YIP!")
   * with bright high-pitched canine formants, excited vibrato, playful breath puff,
   * and right-to-left stereo panning.
   */
  public playWildDogBark(pan = 0, intensity = 1): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const clampedPan = Math.max(-0.95, Math.min(0.95, pan));
    const vol = Math.max(0.25, Math.min(1.2, intensity));

    // Stereo panner output bus (graceful fallback if StereoPannerNode unavailable)
    const outNode: AudioNode =
      typeof ctx.createStereoPanner === 'function'
        ? (() => {
            const p = ctx.createStereoPanner();
            p.pan.setValueAtTime(clampedPan, now);
            p.connect(ctx.destination);
            return p;
          })()
        : ctx.destination;

    const triggerSingleYip = (startAt: number, basePitch: number, dur: number, gainScale: number) => {
      // Bright sawtooth + warm triangle harmonic for lively small-puppy vocal cords
      const osc = ctx.createOscillator();
      const subOsc = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();

      osc.type = 'sawtooth';
      subOsc.type = 'triangle';

      // Excited upward puppy yip scoop -> cute quick downward fall
      osc.frequency.setValueAtTime(basePitch * 0.84, startAt);
      osc.frequency.exponentialRampToValueAtTime(basePitch * 1.56, startAt + dur * 0.28);
      osc.frequency.exponentialRampToValueAtTime(basePitch * 0.78, startAt + dur);

      subOsc.frequency.setValueAtTime(basePitch * 0.5, startAt);
      subOsc.frequency.exponentialRampToValueAtTime(basePitch * 0.82, startAt + dur * 0.28);
      subOsc.frequency.exponentialRampToValueAtTime(basePitch * 0.45, startAt + dur);

      // Lively high-energy puppy yip modulation (~44-58 Hz FM)
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(44 + Math.random() * 14, startAt);
      lfoGain.gain.setValueAtTime(basePitch * 0.065, startAt);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      // Small-puppy vocal-tract formants (F1 ~ 1180Hz, F2 ~ 2450Hz)
      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.frequency.setValueAtTime(1020 * this.jitter(0.1), startAt);
      f1.frequency.exponentialRampToValueAtTime(1480 * this.jitter(0.1), startAt + dur * 0.3);
      f1.frequency.exponentialRampToValueAtTime(860, startAt + dur);
      f1.Q.setValueAtTime(2.8, startAt);

      const f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.frequency.setValueAtTime(2250 * this.jitter(0.1), startAt);
      f2.frequency.exponentialRampToValueAtTime(2880 * this.jitter(0.1), startAt + dur * 0.28);
      f2.frequency.exponentialRampToValueAtTime(1840, startAt + dur);
      f2.Q.setValueAtTime(3.3, startAt);

      const env = ctx.createGain();
      const peak = 0.29 * vol * gainScale;
      env.gain.setValueAtTime(0.001, startAt);
      env.gain.linearRampToValueAtTime(peak, startAt + 0.011);
      env.gain.exponentialRampToValueAtTime(peak * 0.62, startAt + dur * 0.52);
      env.gain.exponentialRampToValueAtTime(0.001, startAt + dur + 0.02);

      const subEnv = ctx.createGain();
      subEnv.gain.setValueAtTime(0.001, startAt);
      subEnv.gain.linearRampToValueAtTime(peak * 0.34, startAt + 0.012);
      subEnv.gain.exponentialRampToValueAtTime(0.001, startAt + dur + 0.018);

      osc.connect(f1);
      osc.connect(f2);
      f1.connect(env);
      f2.connect(env);
      env.connect(outNode);

      subOsc.connect(subEnv);
      subEnv.connect(outNode);

      // Cute breathy puppy puff at yip onset
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = this.getNoiseBuffer(ctx);
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(2100 * this.jitter(0.12), startAt);
      noiseFilter.Q.setValueAtTime(1.8, startAt);
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.001, startAt);
      noiseGain.gain.linearRampToValueAtTime(0.11 * vol * gainScale, startAt + 0.008);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, startAt + Math.min(0.075, dur * 0.68));
      noiseSrc.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(outNode);

      osc.start(startAt);
      subOsc.start(startAt);
      lfo.start(startAt);
      noiseSrc.start(startAt, 0, Math.min(0.12, dur + 0.02));

      const stopAt = startAt + dur + 0.028;
      osc.stop(stopAt);
      subOsc.stop(stopAt);
      lfo.stop(stopAt);
    };

    const basePitch = (440 + Math.random() * 145) * this.jitter(0.05);
    const dur = 0.085 + Math.random() * 0.038;
    triggerSingleYip(now, basePitch, dur, 1.0);

    // Excited rapid puppy double-yip ("YIP-YIP!") ~62% of the time
    if (Math.random() < 0.62) {
      const secondAt = now + dur + 0.032 + Math.random() * 0.028;
      const secondDur = dur * 0.86;
      triggerSingleYip(
        secondAt,
        basePitch * (1.08 + Math.random() * 0.16),
        secondDur,
        0.9,
      );
      // Occasional ecstatic triple-yip!
      if (Math.random() < 0.34) {
        triggerSingleYip(
          secondAt + secondDur + 0.03 + Math.random() * 0.024,
          basePitch * (1.16 + Math.random() * 0.18),
          secondDur * 0.82,
          0.78,
        );
      }
    }
  }

  /**
   * Crisp wooden chess piece knock & secondary bounce rattle when tipped over on the board.
   */
  public playPieceTopple(pan = 0): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const clampedPan = Math.max(-0.9, Math.min(0.9, pan));
    const outNode: AudioNode =
      typeof ctx.createStereoPanner === 'function'
        ? (() => {
            const p = ctx.createStereoPanner();
            p.pan.setValueAtTime(clampedPan, now);
            p.connect(ctx.destination);
            return p;
          })()
        : ctx.destination;

    const taps = [
      { delay: 0, freq: 340 + Math.random() * 140, gain: 0.18, dur: 0.042 },
      { delay: 0.075 + Math.random() * 0.035, freq: 270 + Math.random() * 120, gain: 0.14, dur: 0.036 },
      { delay: 0.15 + Math.random() * 0.04, freq: 390 + Math.random() * 130, gain: 0.08, dur: 0.026 },
    ];

    for (const tap of taps) {
      const t = now + tap.delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(tap.freq, t);
      osc.frequency.exponentialRampToValueAtTime(tap.freq * 0.42, t + tap.dur);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(tap.gain, t + 0.0025);
      gain.gain.exponentialRampToValueAtTime(0.001, t + tap.dur + 0.01);
      osc.connect(gain);
      gain.connect(outNode);
      osc.start(t);
      osc.stop(t + tap.dur + 0.015);

      const src = ctx.createBufferSource();
      src.buffer = this.getNoiseBuffer(ctx);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1450 + Math.random() * 650, t);
      filter.Q.setValueAtTime(2.1, t);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(tap.gain * 0.72, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.028);
      src.connect(filter);
      filter.connect(ng);
      ng.connect(outNode);
      src.start(t, 0, 0.032);
    }
  }

  /**
   * Cute rapid mini-hamster squeaks & playful chase chirps ("squeak-peep!") with stereo panning.
   */
  public playHamsterSqueak(pan = 0, variant: 'grey' | 'white' = 'white'): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const clampedPan = Math.max(-0.92, Math.min(0.92, pan));
    const outNode: AudioNode =
      typeof ctx.createStereoPanner === 'function'
        ? (() => {
            const p = ctx.createStereoPanner();
            p.pan.setValueAtTime(clampedPan, now);
            p.connect(ctx.destination);
            return p;
          })()
        : ctx.destination;

    const triggerChirp = (startAt: number, baseHz: number, dur: number, gainPeak: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      // Quick adorable upward chirp -> playful little tail bend
      osc.frequency.setValueAtTime(baseHz * 0.88, startAt);
      osc.frequency.exponentialRampToValueAtTime(baseHz * 1.42, startAt + dur * 0.45);
      osc.frequency.exponentialRampToValueAtTime(baseHz * 1.05, startAt + dur);

      gain.gain.setValueAtTime(0.0008, startAt);
      gain.gain.linearRampToValueAtTime(gainPeak, startAt + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0008, startAt + dur + 0.012);

      osc.connect(gain);
      gain.connect(outNode);
      osc.start(startAt);
      osc.stop(startAt + dur + 0.018);
    };

    const baseHz = variant === 'white' ? 2150 + Math.random() * 520 : 1720 + Math.random() * 440;
    const dur = 0.052 + Math.random() * 0.026;
    triggerChirp(now, baseHz, dur, 0.11);

    // Rapid playful double-squeak ~72% of the time
    if (Math.random() < 0.72) {
      const t2 = now + dur + 0.026 + Math.random() * 0.022;
      triggerChirp(t2, baseHz * (1.08 + Math.random() * 0.14), dur * 0.85, 0.095);
    }
  }

  private playClickNoise(
    ctx: AudioContext,
    startTime: number,
    centerFreq: number,
    q: number,
    duration: number,
    peakGain: number,
  ): void {
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(centerFreq, startTime);
    filter.Q.setValueAtTime(q, startTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.001, peakGain), startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(startTime, 0, duration + 0.01);
  }
}

export const soundEngine = new ChessSoundEngine();

