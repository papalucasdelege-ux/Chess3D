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
  private barkRaspCurve: Float32Array<ArrayBuffer> | null = null;
  private lastMoveIdx = -1;
  private lastCaptureIdx = -1;
  private lastCheckIdx = -1;
  private udoBarkAudioUrl: string | null = null;
  private udoBarkRawBytes: ArrayBuffer | null = null;
  private udoBarkDecodedBuffer: AudioBuffer | null = null;
  private udoBarkFetchPromise: Promise<ArrayBuffer | null> | null = null;
  private udoBarkLoopSource: AudioBufferSourceNode | null = null;
  private udoBarkLoopGain: GainNode | null = null;
  private udoBarkLoopPanner: StereoPannerNode | null = null;
  private udoBarkLoopHtmlAudio: HTMLAudioElement | null = null;
  private udoBarkLoopSeq = 0;
  public enabled = true;

  public unlock(): void {
    this.ensureContext();
  }

  public setUdoBarkAudioUrl(url: string | null): void {
    const clean = url && url.trim().length > 0 ? url.trim() : null;
    if (clean === this.udoBarkAudioUrl) return;
    this.stopWildDogBarkLoop();
    this.udoBarkAudioUrl = clean;
    this.udoBarkRawBytes = null;
    this.udoBarkDecodedBuffer = null;
    this.udoBarkFetchPromise = null;
    if (clean && typeof window !== 'undefined') {
      void this.preloadUdoBarkBytes(clean);
    }
  }

  public getUdoBarkAudioUrl(): string | null {
    return this.udoBarkAudioUrl;
  }

  public hasCustomUdoBarkAudio(): boolean {
    return Boolean(this.udoBarkAudioUrl);
  }

  private async preloadUdoBarkBytes(url: string): Promise<ArrayBuffer | null> {
    if (this.udoBarkRawBytes && this.udoBarkAudioUrl === url) {
      return this.udoBarkRawBytes;
    }
    if (this.udoBarkFetchPromise && this.udoBarkAudioUrl === url) {
      return this.udoBarkFetchPromise;
    }
    const p = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          if (this.udoBarkAudioUrl === url) this.udoBarkAudioUrl = null;
          return null;
        }
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('text/html')) {
          if (this.udoBarkAudioUrl === url) this.udoBarkAudioUrl = null;
          return null;
        }
        const bytes = await res.arrayBuffer();
        if (bytes.byteLength < 64) {
          if (this.udoBarkAudioUrl === url) this.udoBarkAudioUrl = null;
          return null;
        }
        if (this.udoBarkAudioUrl === url) {
          this.udoBarkRawBytes = bytes;
        }
        return bytes;
      } catch {
        return null;
      }
    })();
    this.udoBarkFetchPromise = p;
    return p;
  }

  public startWildDogBarkLoop(initialPan = 0): boolean {
    if (!this.enabled || !this.udoBarkAudioUrl || typeof window === 'undefined') {
      return false;
    }
    this.stopWildDogBarkLoop();
    const seq = ++this.udoBarkLoopSeq;
    const url = this.udoBarkAudioUrl;
    const clampedPan = Math.max(-0.95, Math.min(0.95, initialPan));

    const startHtmlLoop = () => {
      if (seq !== this.udoBarkLoopSeq || !this.enabled) return;
      try {
        const audio = new Audio(url);
        audio.loop = true;
        audio.preload = 'auto';
        audio.volume = 0.92;
        this.udoBarkLoopHtmlAudio = audio;
        void audio.play().catch(() => {
          if (this.udoBarkLoopHtmlAudio === audio) {
            this.udoBarkLoopHtmlAudio = null;
          }
        });
      } catch {
        // ignore
      }
    };

    const startWebAudioLoop = (ctx: AudioContext, buf: AudioBuffer) => {
      if (seq !== this.udoBarkLoopSeq || !this.enabled) return;
      try {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.01, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.95, ctx.currentTime + 0.04);

        let panner: StereoPannerNode | null = null;
        if (typeof ctx.createStereoPanner === 'function') {
          panner = ctx.createStereoPanner();
          panner.pan.setValueAtTime(clampedPan, ctx.currentTime);
          src.connect(gain);
          gain.connect(panner);
          panner.connect(ctx.destination);
        } else {
          src.connect(gain);
          gain.connect(ctx.destination);
        }

        this.udoBarkLoopSource = src;
        this.udoBarkLoopGain = gain;
        this.udoBarkLoopPanner = panner;
        src.start(0);
      } catch {
        startHtmlLoop();
      }
    };

    const ctx = this.ensureContext();
    if (ctx && this.udoBarkDecodedBuffer) {
      startWebAudioLoop(ctx, this.udoBarkDecodedBuffer);
      return true;
    }

    if (ctx) {
      void (async () => {
        const bytes = await this.preloadUdoBarkBytes(url);
        if (seq !== this.udoBarkLoopSeq || !this.enabled) return;
        if (bytes) {
          try {
            const decoded = await ctx.decodeAudioData(bytes.slice(0));
            if (seq !== this.udoBarkLoopSeq || !this.enabled) return;
            if (this.udoBarkAudioUrl === url) {
              this.udoBarkDecodedBuffer = decoded;
            }
            startWebAudioLoop(ctx, decoded);
            return;
          } catch {
            // Fall through to HTMLAudio loop
          }
        }
        startHtmlLoop();
      })();
      return true;
    }

    startHtmlLoop();
    return true;
  }

  public updateWildDogBarkLoopPan(pan: number): void {
    if (!this.udoBarkLoopPanner || !this.ctx) return;
    const clampedPan = Math.max(-0.95, Math.min(0.95, pan));
    try {
      this.udoBarkLoopPanner.pan.setTargetAtTime(clampedPan, this.ctx.currentTime, 0.04);
    } catch {
      // ignore
    }
  }

  public stopWildDogBarkLoop(): void {
    this.udoBarkLoopSeq++;
    const src = this.udoBarkLoopSource;
    const gain = this.udoBarkLoopGain;
    const panner = this.udoBarkLoopPanner;
    this.udoBarkLoopSource = null;
    this.udoBarkLoopGain = null;
    this.udoBarkLoopPanner = null;

    if (src) {
      try {
        if (gain && this.ctx) {
          const now = this.ctx.currentTime;
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(Math.max(0.001, gain.gain.value), now);
          gain.gain.linearRampToValueAtTime(0.0001, now + 0.06);
          src.stop(now + 0.07);
        } else {
          src.stop();
        }
      } catch {
        // already stopped
      }
      if (panner) {
        window.setTimeout(() => {
          try {
            src.disconnect();
            gain?.disconnect();
            panner.disconnect();
          } catch {
            // ignore
          }
        }, 120);
      }
    }

    if (this.udoBarkLoopHtmlAudio) {
      try {
        this.udoBarkLoopHtmlAudio.pause();
        this.udoBarkLoopHtmlAudio.currentTime = 0;
      } catch {
        // ignore
      }
      this.udoBarkLoopHtmlAudio = null;
    }
  }

  public previewUdoBarkAudio(durationMs = 2600): void {
    if (!this.hasCustomUdoBarkAudio()) {
      this.playWildDogBark(0, 1);
      return;
    }
    this.startWildDogBarkLoop(0);
    const activeSeq = this.udoBarkLoopSeq;
    window.setTimeout(() => {
      if (this.udoBarkLoopSeq === activeSeq) {
        this.stopWildDogBarkLoop();
      }
    }, Math.max(800, durationMs));
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

  private getBarkRaspCurve(): Float32Array<ArrayBuffer> {
    if (this.barkRaspCurve) return this.barkRaspCurve;
    const n = 512;
    const curve = new Float32Array(new ArrayBuffer(n * 4));
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / (n - 1) - 1;
      // Asymmetric canine vocal-fold saturation + subtle harmonic grit for raspy terrier timbre
      const asym = x >= 0 ? Math.tanh(x * 3.2) : Math.tanh(x * 2.55) * 0.94;
      const grit = 0.11 * Math.sin(x * Math.PI * 5.0) * (1 - Math.abs(x) * 0.45);
      curve[i] = Math.max(-1, Math.min(1, asym + grit));
    }
    this.barkRaspCurve = curve;
    return curve;
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
   * Udo's deeper, raspy wirehaired terrier bark ("RRUFF! WUFF-RRUFF!"):
   * chesty ~235-290 Hz terrier fundamental + ~120 Hz sub-chest warmth,
   * rough glottal vocal-fry FM/AM modulation, asymmetric waveshaper grit,
   * gravelly throat-chuff noise, and stereo panning across the board.
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

    const triggerRaspyBark = (
      startAt: number,
      basePitch: number,
      dur: number,
      gainScale: number,
      withGrowlLead: boolean,
    ) => {
      // Sawtooth glottal pulse + gritty sub-octave chest oscillator
      const osc = ctx.createOscillator();
      const subOsc = ctx.createOscillator();
      const raspLfo = ctx.createOscillator();
      const raspFmGain = ctx.createGain();
      const raspAmGain = ctx.createGain();
      const preDrive = ctx.createGain();
      const shaper = ctx.createWaveShaper();

      osc.type = 'sawtooth';
      subOsc.type = 'sawtooth';
      shaper.curve = this.getBarkRaspCurve();
      shaper.oversample = '2x';

      // Deeper terrier bark contour: gravelly throat onset -> punchy chest peak -> firm downward drop
      const leadStart = withGrowlLead ? basePitch * 0.72 : basePitch * 0.84;
      osc.frequency.setValueAtTime(leadStart, startAt);
      osc.frequency.exponentialRampToValueAtTime(basePitch * 1.22, startAt + dur * 0.24);
      osc.frequency.exponentialRampToValueAtTime(basePitch * 0.62, startAt + dur);

      subOsc.frequency.setValueAtTime(leadStart * 0.5, startAt);
      subOsc.frequency.exponentialRampToValueAtTime(basePitch * 0.61, startAt + dur * 0.24);
      subOsc.frequency.exponentialRampToValueAtTime(basePitch * 0.31, startAt + dur);

      // Rough subharmonic terrier vocal-fry / growl rasp (~58-82 Hz sawtooth flutter on FM & AM)
      const raspHz = 58 + Math.random() * 24;
      raspLfo.type = 'triangle';
      raspLfo.frequency.setValueAtTime(raspHz, startAt);
      raspLfo.frequency.linearRampToValueAtTime(raspHz * 0.78, startAt + dur);

      raspFmGain.gain.setValueAtTime(basePitch * 0.115, startAt);
      raspLfo.connect(raspFmGain);
      raspFmGain.connect(osc.frequency);

      preDrive.gain.setValueAtTime(1.35, startAt);
      raspAmGain.gain.setValueAtTime(0.38, startAt);
      raspLfo.connect(raspAmGain);
      raspAmGain.connect(preDrive.gain);

      // Deeper terrier vocal-tract formants (F1 ~ 580-860 Hz throat/jaw, F2 ~ 1280-1720 Hz bark projection)
      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.frequency.setValueAtTime(570 * this.jitter(0.09), startAt);
      f1.frequency.exponentialRampToValueAtTime(860 * this.jitter(0.09), startAt + dur * 0.26);
      f1.frequency.exponentialRampToValueAtTime(480, startAt + dur);
      f1.Q.setValueAtTime(2.2, startAt);

      const f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.frequency.setValueAtTime(1280 * this.jitter(0.09), startAt);
      f2.frequency.exponentialRampToValueAtTime(1720 * this.jitter(0.09), startAt + dur * 0.25);
      f2.frequency.exponentialRampToValueAtTime(1040, startAt + dur);
      f2.Q.setValueAtTime(2.4, startAt);

      // Warm chest resonance low-pass on the sub-octave
      const chestFilter = ctx.createBiquadFilter();
      chestFilter.type = 'lowpass';
      chestFilter.frequency.setValueAtTime(360, startAt);
      chestFilter.Q.setValueAtTime(1.1, startAt);

      const env = ctx.createGain();
      const peak = 0.31 * vol * gainScale;
      env.gain.setValueAtTime(0.001, startAt);
      env.gain.linearRampToValueAtTime(peak, startAt + (withGrowlLead ? 0.018 : 0.012));
      env.gain.exponentialRampToValueAtTime(peak * 0.66, startAt + dur * 0.54);
      env.gain.exponentialRampToValueAtTime(0.001, startAt + dur + 0.026);

      const subEnv = ctx.createGain();
      subEnv.gain.setValueAtTime(0.001, startAt);
      subEnv.gain.linearRampToValueAtTime(peak * 0.56, startAt + 0.015);
      subEnv.gain.exponentialRampToValueAtTime(0.001, startAt + dur + 0.024);

      osc.connect(preDrive);
      preDrive.connect(shaper);
      shaper.connect(f1);
      shaper.connect(f2);
      f1.connect(env);
      f2.connect(env);
      env.connect(outNode);

      subOsc.connect(chestFilter);
      chestFilter.connect(subEnv);
      subEnv.connect(outNode);

      // Raspy gravelly throat-chuff & breath turbulence modulated by the vocal-fry LFO
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = this.getNoiseBuffer(ctx);
      noiseSrc.loop = true;

      const raspNoiseFilter = ctx.createBiquadFilter();
      raspNoiseFilter.type = 'bandpass';
      raspNoiseFilter.frequency.setValueAtTime(820 * this.jitter(0.12), startAt);
      raspNoiseFilter.frequency.exponentialRampToValueAtTime(1180, startAt + dur * 0.25);
      raspNoiseFilter.frequency.exponentialRampToValueAtTime(640, startAt + dur);
      raspNoiseFilter.Q.setValueAtTime(1.25, startAt);

      const noiseGain = ctx.createGain();
      const noisePeak = 0.165 * vol * gainScale;
      noiseGain.gain.setValueAtTime(0.001, startAt);
      noiseGain.gain.linearRampToValueAtTime(noisePeak, startAt + 0.01);
      noiseGain.gain.exponentialRampToValueAtTime(noisePeak * 0.55, startAt + dur * 0.58);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, startAt + dur + 0.018);

      const noiseRaspMod = ctx.createGain();
      noiseRaspMod.gain.setValueAtTime(noisePeak * 0.36, startAt);
      raspLfo.connect(noiseRaspMod);
      noiseRaspMod.connect(noiseGain.gain);

      noiseSrc.connect(raspNoiseFilter);
      raspNoiseFilter.connect(noiseGain);
      noiseGain.connect(outNode);

      const stopAt = startAt + dur + 0.032;
      osc.start(startAt);
      subOsc.start(startAt);
      raspLfo.start(startAt);
      noiseSrc.start(startAt);

      osc.stop(stopAt);
      subOsc.stop(stopAt);
      raspLfo.stop(stopAt);
      noiseSrc.stop(stopAt);
    };

    // Deeper, raspy terrier pitch (~235-290 Hz instead of high 440-585 Hz squeak)
    const basePitch = (235 + Math.random() * 55) * this.jitter(0.05);
    const dur = 0.118 + Math.random() * 0.042;
    triggerRaspyBark(now, basePitch, dur, 1.0, true);

    // Spirited terrier double-bark ("RRUFF-WUFF!") ~58% of the time
    if (Math.random() < 0.58) {
      const secondAt = now + dur + 0.042 + Math.random() * 0.032;
      const secondDur = dur * 0.9;
      triggerRaspyBark(
        secondAt,
        basePitch * (0.94 + Math.random() * 0.13),
        secondDur,
        0.92,
        false,
      );
      // Occasional third gruff chuff-bark!
      if (Math.random() < 0.24) {
        triggerRaspyBark(
          secondAt + secondDur + 0.038 + Math.random() * 0.028,
          basePitch * (0.88 + Math.random() * 0.12),
          secondDur * 0.82,
          0.78,
          false,
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

