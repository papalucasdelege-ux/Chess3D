import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Film,
  GitBranch,
  Lightbulb,
  Maximize2,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Volume2,
} from 'lucide-react';
import type { BotSearchReport, EngineLine, PieceColor } from '../shared/types';
import { formatEvalLabel } from '../chess/engine';
import { getSimulationColorSpec } from '../chess/treeJpgExporter';
import {
  VOICE_CLIP_DURATION_SEC,
  getAngelIdleVideoPool,
  isUtterancePlayToEnd,
  isVideoUrlPlayToEnd,
  pickNextAngelIdleVideo,
  resolveActiveEscapeCues,
  resolveAngelIdleVideo,
  resolveAngelSpeakingVideo,
  resolveDefaultSpeakingLipVideo,
  shouldExtendWithDefaultLipSync,
  subscribeAngelVideoOverrides,
  type AngelEscapeCueKey,
  type ResolvedActiveEscapeCue,
} from '../chess/angelPortraitVideos';
import {
  opponentSpeech,
  type AngelVoiceMode,
  type OpponentMessage,
  type VoiceClipId,
  type VoicePlaybackState,
} from '../chess/opponentVoice';

export interface CalcPreviewProgress {
  branchIndex: number;
  totalBranches: number;
  pvSan: string[];
  waitingForConfirm?: boolean;
}

export interface TreeBrowserState {
  simulations: EngineLine[];
  moverColor: PieceColor;
  selectedIndex: number | null;
  onlyTopThree: boolean;
  hasPendingBotMove: boolean;
  nodes?: number;
  depth?: number;
}

interface ChessAngelPortraitVideoProps {
  clipId?: VoiceClipId | null;
  speechText?: string | null;
  forcedIdleUrl?: string | null;
  isSpeaking: boolean;
  soundEnabled: boolean;
  angelVoice: AngelVoiceMode;
  triggerKey: string;
  compact?: boolean;
  hasCardBelow: boolean;
  onClick?: () => void;
  title?: string;
}

const IS_MOBILE_DEVICE =
  typeof navigator !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent);

/**
 * Hard-silences any lady portrait HTMLVideoElement regardless of what video file
 * or codec is loaded: locks defaultMuted, muted, volume = 0, and disables any
 * embedded HTMLMediaElement audioTracks so zero sound can ever be emitted.
 */
function silenceVideoElement(video: HTMLVideoElement | null): void {
  if (!video) return;
  if (!video.defaultMuted) video.defaultMuted = true;
  if (!video.muted) video.muted = true;
  if (video.volume !== 0) video.volume = 0;

  const withTracks = video as HTMLVideoElement & {
    audioTracks?: { length: number; [index: number]: { enabled: boolean } };
  };
  if (withTracks.audioTracks) {
    for (let i = 0; i < withTracks.audioTracks.length; i++) {
      if (withTracks.audioTracks[i] && withTracks.audioTracks[i].enabled) {
        withTracks.audioTracks[i].enabled = false;
      }
    }
  }
}

const PORTRAIT_CANVAS_W = 554;
const PORTRAIT_CANVAS_H = 740;
const PROBE_SIZE = 32;
const BLEND_TO_IDLE_MS = 1650;
const BLEND_TO_SPEAK_MS = 780;
const ESCAPE_BLEND_IN_MS = 260;
const ESCAPE_BLEND_OUT_MS = 520;
const PRE_END_MORPH_LEAD_SEC = 1.15;
const ESCAPE_PRE_END_LEAD_SEC = 0.52;
const PRE_EOS_STOP_SEC = 0.1;

/** Calm stillness window (28s–40s) between idle listening variations so she never checks her watch repeatedly */
function nextCalmIdlePauseMs(): number {
  return 28_000 + Math.floor(Math.random() * 12_000);
}

/** C2-continuous quintic smoothstep (zero velocity & acceleration jump at 0 and 1) */
function quinticSmooth(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** Center-crop (`object-cover`) draw helper with optional subtle eye-anchored morph scale */
function drawCoverSource(
  ctx: CanvasRenderingContext2D,
  source: HTMLVideoElement | HTMLCanvasElement,
  srcW: number,
  srcH: number,
  destW: number,
  destH: number,
  scale = 1,
): void {
  if (srcW <= 0 || srcH <= 0) return;
  const srcAspect = srcW / srcH;
  const destAspect = destW / destH;

  let sx = 0;
  let sy = 0;
  let sw = srcW;
  let sh = srcH;

  if (srcAspect > destAspect) {
    sw = srcH * destAspect;
    sx = (srcW - sw) * 0.5;
  } else if (srcAspect < destAspect) {
    sh = srcW / destAspect;
    sy = (srcH - sh) * 0.5;
  }

  if (scale !== 1) {
    // Anchor micro morph alignment around Chess Angel's eyes/face focal center (50% X, 30% Y)
    const ax = destW * 0.5;
    const ay = destH * 0.3;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.scale(scale, scale);
    ctx.translate(-ax, -ay);
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, destW, destH);
    ctx.restore();
  } else {
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, destW, destH);
  }
}

function createPortraitOffscreenCanvas(): HTMLCanvasElement {
  const off = document.createElement('canvas');
  off.width = PORTRAIT_CANVAS_W;
  off.height = PORTRAIT_CANVAS_H;
  return off;
}

function ChessAngelPortraitVideo({
  clipId,
  speechText,
  forcedIdleUrl,
  isSpeaking,
  soundEnabled,
  angelVoice,
  triggerKey,
  compact = false,
  hasCardBelow,
  onClick,
  title,
}: ChessAngelPortraitVideoProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const video0Ref = useRef<HTMLVideoElement | null>(null);
  const video1Ref = useRef<HTMLVideoElement | null>(null);
  const escapeVideoRef = useRef<HTMLVideoElement | null>(null);

  // Imperative non-reactive video compositor buffers (strict React decoupling)
  const slotCanvasesRef = useRef<[HTMLCanvasElement, HTMLCanvasElement] | null>(null);
  const escapeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const escapePrevCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const workCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const probeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const probeCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const outgoingFallbackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const masterCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const activeSlotRef = useRef<0 | 1>(0);
  const outgoingSlotRef = useRef<0 | 1>(1);
  const activeRoleRef = useRef<'speaking' | 'idle'>('speaking');
  const autoMorphTriggeredRef = useRef<boolean>(false);

  const slotUrlRef = useRef<[string, string]>(['', '']);
  const slotAutoPlayRef = useRef<[boolean, boolean]>([false, false]);
  const slotHasFrameRef = useRef<[boolean, boolean]>([false, false]);
  const slotPeakLumaRef = useRef<[number, number]>([0, 0]);
  const slotSafeEndedRef = useRef<[boolean, boolean]>([false, false]);

  // Dedicated 3rd-layer Special Escape Overlay ("you" finger-point & "push a button" below)
  const escapeUrlRef = useRef<string>('');
  const escapeAutoPlayRef = useRef<boolean>(false);
  const escapeTargetSeekSecRef = useRef<number>(0);
  const escapeLaunchSeekSecRef = useRef<number>(0);
  const escapeSeekAppliedRef = useRef<boolean>(false);
  const escapeHasFrameRef = useRef<boolean>(false);
  const escapePeakLumaRef = useRef<number>(0);
  const escapeSafeEndedRef = useRef<boolean>(false);
  const escapePhaseRef = useRef<'inactive' | 'entering' | 'playing' | 'exiting'>('inactive');
  const activeEscapeCueKeyRef = useRef<AngelEscapeCueKey | null>(null);
  const activeEscapeSpokenWordSecRef = useRef<number>(0);
  const escapeWaitingFrameRef = useRef<boolean>(false);
  const escapeStartedAtMsRef = useRef<number>(0);
  const hasEscapePrevRef = useRef<boolean>(false);
  const escapeBlendStartAtRef = useRef<number>(0);
  const escapeStartAlphaRef = useRef<number>(0);
  const escapeCurrentAlphaRef = useRef<number>(0);
  const pausedBaseForEscapeRef = useRef<boolean>(false);
  const utteranceWallStartMsRef = useRef<number>(0);
  const utteranceMaxWindowSecRef = useRef<number>(0);
  const pendingEscapeCuesRef = useRef<ResolvedActiveEscapeCue[]>([]);
  const deferredPostVideoCuesRef = useRef<ResolvedActiveEscapeCue[]>([]);
  const playingPostVideoEscapeRef = useRef<boolean>(false);

  const hasMasterFrameRef = useRef<boolean>(false);
  const useLiveOutgoingRef = useRef<boolean>(false);
  const waitingForIncomingFrameRef = useRef<boolean>(false);
  const isBlendingRef = useRef<boolean>(false);
  const blendStartAtRef = useRef<number>(0);
  const blendDurationMsRef = useRef<number>(BLEND_TO_IDLE_MS);

  const rafIdRef = useRef<number | null>(null);
  const idleCycleTimerRef = useRef<number | null>(null);
  const plannedIdleUrlRef = useRef<string>('');
  const lastPlayedIdleUrlRef = useRef<string>('');
  const lastTriggerRef = useRef<string>('');
  const lastRequestedSpeakingUrlRef = useRef<string>('');
  const lastSpeakingStartMsRef = useRef<number>(0);
  const prevSpeakingRef = useRef<boolean>(false);
  const isSpeakingLiveRef = useRef<boolean>(isSpeaking);
  const soundEnabledLiveRef = useRef<boolean>(soundEnabled);
  const angelVoiceLiveRef = useRef<AngelVoiceMode>(angelVoice);
  const clipIdLiveRef = useRef<VoiceClipId | null | undefined>(clipId);
  const activeSlotClipIdRef = useRef<VoiceClipId | null | undefined>(clipId);
  const speechTextLiveRef = useRef<string | null | undefined>(speechText);
  const isInExtendedLipSyncRef = useRef<boolean>(false);
  const deferredTransitionRef = useRef<{
    url: string;
    role: 'speaking' | 'idle';
    isExtendedLip?: boolean;
    clipId?: VoiceClipId | null;
    speechText?: string | null;
    rearmEscapeCues?: boolean;
  } | null>(null);
  isSpeakingLiveRef.current = isSpeaking;
  soundEnabledLiveRef.current = soundEnabled;
  angelVoiceLiveRef.current = angelVoice;
  clipIdLiveRef.current = clipId;
  speechTextLiveRef.current = speechText;

  const [overrideTick, setOverrideTick] = useState(0);
  useEffect(() => {
    return subscribeAngelVideoOverrides(() => {
      setOverrideTick((n) => n + 1);
    });
  }, []);

  const primaryIdleVideoSrc = resolveAngelIdleVideo();
  const idlePoolKey = getAngelIdleVideoPool().join('|');
  const isIdleTrigger = triggerKey.startsWith('idle');
  const resolvedSpeakingSrc = isIdleTrigger
    ? null
    : resolveAngelSpeakingVideo(clipId, triggerKey);
  const useIdleForUtterance = isIdleTrigger || !resolvedSpeakingSrc;
  const desiredSrc = useIdleForUtterance
    ? forcedIdleUrl || primaryIdleVideoSrc
    : resolvedSpeakingSrc;

  const getVideoBySlot = (slot: 0 | 1): HTMLVideoElement | null =>
    slot === 0 ? video0Ref.current : video1Ref.current;

  const ensureBuffers = () => {
    if (!slotCanvasesRef.current) {
      slotCanvasesRef.current = [createPortraitOffscreenCanvas(), createPortraitOffscreenCanvas()];
    }
    if (!escapeCanvasRef.current) {
      escapeCanvasRef.current = createPortraitOffscreenCanvas();
    }
    if (!escapePrevCanvasRef.current) {
      escapePrevCanvasRef.current = createPortraitOffscreenCanvas();
    }
    if (!workCanvasRef.current) {
      workCanvasRef.current = createPortraitOffscreenCanvas();
    }
    if (!outgoingFallbackCanvasRef.current) {
      outgoingFallbackCanvasRef.current = createPortraitOffscreenCanvas();
    }
    if (!masterCanvasRef.current) {
      masterCanvasRef.current = createPortraitOffscreenCanvas();
    }
    if (!probeCanvasRef.current) {
      const p = document.createElement('canvas');
      p.width = PROBE_SIZE;
      p.height = PROBE_SIZE;
      probeCanvasRef.current = p;
      probeCtxRef.current = p.getContext('2d', { willReadFrequently: true });
    }
  };

  /**
   * Measures central portrait luminance on a 32x32 downsampled sensor so neither
   * trailing fade-to-black frames in an uploaded .mp4 nor browser EOS black buffers
   * can ever overwrite Chess Angel or make her disappear.
   */
  const measurePortraitLuminance = (candidateCanvas: HTMLCanvasElement): number => {
    ensureBuffers();
    const pctx = probeCtxRef.current;
    if (!pctx) return 100;

    pctx.clearRect(0, 0, PROBE_SIZE, PROBE_SIZE);
    pctx.drawImage(candidateCanvas, 0, 0, PROBE_SIZE, PROBE_SIZE);
    // Central 18x26 portrait region covering face, hair & ivory/sky-blue robe
    const img = pctx.getImageData(7, 3, 18, 26).data;
    let sum = 0;
    const count = img.length / 4;
    for (let i = 0; i < img.length; i += 4) {
      sum += 0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2];
    }
    return count > 0 ? sum / count : 0;
  };

  /**
   * Safely decodes the latest frame of `slot` into `slotCanvasesRef.current[slot]`
   * ONLY if Chess Angel is visibly bright (never black/dimmed/EOS).
   */
  const sampleSlotVideoFrame = (slot: 0 | 1): boolean => {
    ensureBuffers();
    const video = getVideoBySlot(slot);
    const slotCanvases = slotCanvasesRef.current;
    const workCanvas = workCanvasRef.current;
    if (!video || !slotCanvases || !workCanvas) return false;

    silenceVideoElement(video);
    if (video.loop) video.loop = false;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (video.readyState < 2 || vw <= 0 || vh <= 0 || video.ended || slotSafeEndedRef.current[slot]) {
      return slotHasFrameRef.current[slot];
    }

    const fullLength =
      slot === activeSlotRef.current &&
      activeRoleRef.current === 'speaking' &&
      !isInExtendedLipSyncRef.current
        ? isUtterancePlayToEnd(slotUrlRef.current[slot], activeSlotClipIdRef.current)
        : isVideoUrlPlayToEnd(slotUrlRef.current[slot]);
    const eosGuardSec = fullLength ? 0.025 : PRE_EOS_STOP_SEC;
    const dur = video.duration;
    const cur = video.currentTime;
    const nearEos = Number.isFinite(dur) && dur > 0.4 && cur >= dur - eosGuardSec;

    const wctx = workCanvas.getContext('2d');
    if (!wctx) return slotHasFrameRef.current[slot];

    wctx.globalAlpha = 1;
    wctx.clearRect(0, 0, PORTRAIT_CANVAS_W, PORTRAIT_CANVAS_H);
    drawCoverSource(
      wctx,
      video,
      vw,
      vh,
      PORTRAIT_CANVAS_W,
      PORTRAIT_CANVAS_H,
      1,
    );

    const luma = measurePortraitLuminance(workCanvas);
    const peak = slotPeakLumaRef.current[slot];
    const minLumaFloor = fullLength ? 14 : 22;
    const minLumaRatio = fullLength ? 0.42 : 0.68;
    const minAllowedLuma = peak > 0 ? Math.max(minLumaFloor, peak * minLumaRatio) : minLumaFloor;

    if (luma >= minAllowedLuma) {
      if (luma > peak) {
        slotPeakLumaRef.current[slot] = luma;
      }
      const sctx = slotCanvases[slot].getContext('2d');
      if (sctx) {
        sctx.globalAlpha = 1;
        sctx.clearRect(0, 0, PORTRAIT_CANVAS_W, PORTRAIT_CANVAS_H);
        sctx.drawImage(workCanvas, 0, 0, PORTRAIT_CANVAS_W, PORTRAIT_CANVAS_H);
        slotHasFrameRef.current[slot] = true;
      }

      if (nearEos) {
        // Pause cleanly BEFORE browser EOS can ever flush the hardware decoder to black
        video.pause();
        slotSafeEndedRef.current[slot] = true;
      }
    } else if (cur > 0.35 && peak > 0) {
      // Video file began fading/cutting to black at the tail: reject dark frame & freeze bright frame!
      video.pause();
      slotSafeEndedRef.current[slot] = true;
    }

    return slotHasFrameRef.current[slot];
  };

  /**
   * Luminance-verified frame sampler for the 3rd-layer Special Escape Overlay video (`point_you` / `push_button`).
   */
  const sampleEscapeVideoFrame = (): boolean => {
    ensureBuffers();
    const video = escapeVideoRef.current;
    const escCanvas = escapeCanvasRef.current;
    const workCanvas = workCanvasRef.current;
    if (!video || !escCanvas || !workCanvas) return false;

    silenceVideoElement(video);
    if (video.loop) video.loop = false;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (video.readyState < 2 || vw <= 0 || vh <= 0 || video.ended || escapeSafeEndedRef.current) {
      return escapeHasFrameRef.current;
    }

    const fullLength = isVideoUrlPlayToEnd(escapeUrlRef.current);
    const eosGuardSec = fullLength ? 0.025 : PRE_EOS_STOP_SEC;
    const dur = video.duration;
    const cur = video.currentTime;
    const nearEos = Number.isFinite(dur) && dur > 0.35 && cur >= dur - eosGuardSec;

    const wctx = workCanvas.getContext('2d');
    if (!wctx) return escapeHasFrameRef.current;

    wctx.globalAlpha = 1;
    wctx.clearRect(0, 0, PORTRAIT_CANVAS_W, PORTRAIT_CANVAS_H);
    drawCoverSource(wctx, video, vw, vh, PORTRAIT_CANVAS_W, PORTRAIT_CANVAS_H, 1);

    const luma = measurePortraitLuminance(workCanvas);
    const peak = escapePeakLumaRef.current;
    const minLumaFloor = fullLength ? 14 : 22;
    const minLumaRatio = fullLength ? 0.42 : 0.68;
    const minAllowedLuma = peak > 0 ? Math.max(minLumaFloor, peak * minLumaRatio) : minLumaFloor;

    if (luma >= minAllowedLuma) {
      if (luma > peak) {
        escapePeakLumaRef.current = luma;
      }
      const ectx = escCanvas.getContext('2d');
      if (ectx) {
        ectx.globalAlpha = 1;
        ectx.clearRect(0, 0, PORTRAIT_CANVAS_W, PORTRAIT_CANVAS_H);
        ectx.drawImage(workCanvas, 0, 0, PORTRAIT_CANVAS_W, PORTRAIT_CANVAS_H);
        escapeHasFrameRef.current = true;
      }

      if (nearEos) {
        video.pause();
        escapeSafeEndedRef.current = true;
      }
    } else if (cur > 0.25 && peak > 0) {
      video.pause();
      escapeSafeEndedRef.current = true;
    }

    return escapeHasFrameRef.current;
  };

  const applyEscapeTargetSeek = (video: HTMLVideoElement, forceExact: boolean) => {
    const rawSeek = Math.max(0, escapeTargetSeekSecRef.current);
    const dur = video.duration;
    const clampedSeek =
      Number.isFinite(dur) && dur > 0.5 ? Math.min(rawSeek, Math.max(0, dur - 0.35)) : rawSeek;
    const diff = Math.abs(video.currentTime - clampedSeek);
    if (forceExact ? diff > 0.02 : diff > 0.08) {
      try {
        video.currentTime = clampedSeek;
      } catch {
        // ignore if metadata not yet seekable
      }
    }
    escapeSeekAppliedRef.current = true;
  };

  const loadEscapeVideo = (url: string, autoPlay: boolean, startSeekSec = 0) => {
    const video = escapeVideoRef.current;
    if (!video || !url) return;

    silenceVideoElement(video);
    video.loop = false;
    escapeAutoPlayRef.current = autoPlay;
    escapeTargetSeekSecRef.current = Math.max(0, startSeekSec);
    if (autoPlay) {
      escapeLaunchSeekSecRef.current = Math.max(0, startSeekSec);
    }
    escapePeakLumaRef.current = 0;
    escapeSafeEndedRef.current = false;

    if (escapeUrlRef.current === url && video.readyState >= 1) {
      applyEscapeTargetSeek(video, !autoPlay);
      if (autoPlay) {
        const p = video.play();
        if (p) p.catch(() => {});
      } else {
        video.pause();
        if (video.readyState >= 2) {
          sampleEscapeVideoFrame();
        }
      }
      return;
    }

    escapeSeekAppliedRef.current = false;
    escapeHasFrameRef.current = false;
    escapeUrlRef.current = url;
    video.src = url;
    video.load();
  };

  const resumePausedBaseVideoAfterEscape = () => {
    if (!pausedBaseForEscapeRef.current) return;
    pausedBaseForEscapeRef.current = false;
    const baseVid = getVideoBySlot(activeSlotRef.current);
    if (
      baseVid &&
      !baseVid.ended &&
      !slotSafeEndedRef.current[activeSlotRef.current]
    ) {
      const p = baseVid.play();
      if (p) p.catch(() => {});
    }
  };

  const isCurrentSlotNoCut = (): boolean => {
    const slot = activeSlotRef.current;
    const url = slotUrlRef.current[slot];
    if (isVideoUrlPlayToEnd(url)) return true;
    if (activeRoleRef.current === 'speaking' && !isInExtendedLipSyncRef.current) {
      return isUtterancePlayToEnd(url, activeSlotClipIdRef.current);
    }
    return false;
  };

  const resetEscapeOverlayState = (resumeBase: boolean, clearPostVideo = true) => {
    pendingEscapeCuesRef.current = [];
    if (clearPostVideo) {
      deferredPostVideoCuesRef.current = [];
      playingPostVideoEscapeRef.current = false;
    }
    escapePhaseRef.current = 'inactive';
    activeEscapeCueKeyRef.current = null;
    activeEscapeSpokenWordSecRef.current = 0;
    escapeWaitingFrameRef.current = false;
    hasEscapePrevRef.current = false;
    escapeStartedAtMsRef.current = 0;
    escapeCurrentAlphaRef.current = 0;
    escapeStartAlphaRef.current = 0;
    const escVid = escapeVideoRef.current;
    if (escVid && !escVid.paused) {
      escVid.pause();
    }
    if (resumeBase) {
      resumePausedBaseVideoAfterEscape();
    } else {
      pausedBaseForEscapeRef.current = false;
    }
  };

  const armEscapeCuesForUtterance = (
    targetUrl: string = desiredSrc,
    forClipId: VoiceClipId | null | undefined = clipIdLiveRef.current,
    forSpeechText: string | null | undefined = speechTextLiveRef.current,
  ) => {
    resetEscapeOverlayState(false, true);
    if (triggerKey.startsWith('idle')) {
      utteranceWallStartMsRef.current = 0;
      utteranceMaxWindowSecRef.current = 0;
      return;
    }
    const cues = resolveActiveEscapeCues(forSpeechText, forClipId);
    utteranceWallStartMsRef.current = performance.now();
    const estTalk = forClipId ? VOICE_CLIP_DURATION_SEC[forClipId] ?? 6.0 : 6.0;
    utteranceMaxWindowSecRef.current = estTalk + 1.5;

    const baseNoCut = isUtterancePlayToEnd(targetUrl, forClipId);
    if (baseNoCut) {
      // When No Cut is enabled on a video anywhere in Chess Angel Video Studio,
      // never cut into the video mid-playback — queue the "button" part to play right afterwards!
      const buttonAfterCues = cues
        .filter((c) => c.key === 'push_button')
        .map((c) => ({ ...c, videoStartSeekSec: 0 }));
      pendingEscapeCuesRef.current = [];
      deferredPostVideoCuesRef.current = buttonAfterCues;
      if (buttonAfterCues.length > 0) {
        loadEscapeVideo(buttonAfterCues[0].videoUrl, false, 0);
      }
      return;
    }

    pendingEscapeCuesRef.current = cues;
    deferredPostVideoCuesRef.current = [];

    if (pendingEscapeCuesRef.current.length > 0) {
      const first = pendingEscapeCuesRef.current[0];
      loadEscapeVideo(first.videoUrl, false, first.videoStartSeekSec);
    }
  };

  const copyCanvasTo = (src: HTMLCanvasElement, dst: HTMLCanvasElement) => {
    const dctx = dst.getContext('2d');
    if (!dctx) return;
    dctx.globalAlpha = 1;
    dctx.clearRect(0, 0, PORTRAIT_CANVAS_W, PORTRAIT_CANVAS_H);
    dctx.drawImage(src, 0, 0, PORTRAIT_CANVAS_W, PORTRAIT_CANVAS_H);
  };

  const clearIdleCycleTimer = () => {
    if (idleCycleTimerRef.current !== null) {
      window.clearTimeout(idleCycleTimerRef.current);
      idleCycleTimerRef.current = null;
    }
  };

  const stopRenderLoop = () => {
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  };

  const loadVideoIntoSlot = (slot: 0 | 1, url: string, autoPlay: boolean) => {
    const video = getVideoBySlot(slot);
    if (!video || !url) return;

    silenceVideoElement(video);
    video.loop = false;
    slotAutoPlayRef.current[slot] = autoPlay;
    slotPeakLumaRef.current[slot] = 0;
    slotSafeEndedRef.current[slot] = false;

    if (slotUrlRef.current[slot] === url && video.readyState >= 2) {
      try {
        video.currentTime = 0;
      } catch {
        // Ignore if seek pending
      }
      if (autoPlay) {
        const p = video.play();
        if (p) p.catch(() => {});
      } else {
        video.pause();
      }
      return;
    }

    slotHasFrameRef.current[slot] = false;
    slotUrlRef.current[slot] = url;
    video.src = url;
    video.load();
  };

  const preloadStandbySlotUrl = (standbyUrl: string) => {
    const standbySlot: 0 | 1 = activeSlotRef.current === 0 ? 1 : 0;
    const standbyVideo = getVideoBySlot(standbySlot);
    if (!standbyVideo || !standbyUrl) return;

    if (slotUrlRef.current[standbySlot] !== standbyUrl) {
      loadVideoIntoSlot(standbySlot, standbyUrl, false);
    } else if (!standbyVideo.paused) {
      standbyVideo.pause();
      try {
        standbyVideo.currentTime = 0;
      } catch {
        // ignore
      }
      slotSafeEndedRef.current[standbySlot] = false;
    }
  };

  const preloadStandbyIdleSlot = (explicitIdleUrl?: string) => {
    const idleUrl =
      explicitIdleUrl ||
      plannedIdleUrlRef.current ||
      pickNextAngelIdleVideo(lastPlayedIdleUrlRef.current);
    plannedIdleUrlRef.current = idleUrl;
    preloadStandbySlotUrl(idleUrl);
  };

  const preloadNextForActiveSpeaking = () => {
    const activeVideo = getVideoBySlot(activeSlotRef.current);
    const activeDur =
      activeVideo && Number.isFinite(activeVideo.duration) && activeVideo.duration > 0
        ? activeVideo.duration
        : 5.0;
    const liveRemaining = opponentSpeech.getRemainingSpeechSeconds();
    const estTotal = clipIdLiveRef.current ? VOICE_CLIP_DURATION_SEC[clipIdLiveRef.current] ?? 0 : 0;
    const expectedRemaining = liveRemaining > 0 ? liveRemaining : isSpeakingLiveRef.current ? estTotal : 0;

    if (
      expectedRemaining > Math.max(1.2, activeDur - PRE_EOS_STOP_SEC) + 0.35 &&
      shouldExtendWithDefaultLipSync(clipIdLiveRef.current)
    ) {
      preloadStandbySlotUrl(resolveDefaultSpeakingLipVideo());
    } else {
      preloadStandbyIdleSlot();
    }
  };

  const ensureRenderLoop = () => {
    if (rafIdRef.current === null) {
      rafIdRef.current = window.requestAnimationFrame(renderFrame);
    }
  };

  const isActiveBaseProtectedFromCut = (): boolean => {
    if (playingPostVideoEscapeRef.current) return true;
    const slot = activeSlotRef.current;
    if (!isCurrentSlotNoCut()) return false;
    if (deferredPostVideoCuesRef.current.length > 0) return true;
    const video = getVideoBySlot(slot);
    if (!video) return false;
    if (video.ended || slotSafeEndedRef.current[slot]) return false;
    return (
      !video.paused ||
      pausedBaseForEscapeRef.current ||
      waitingForIncomingFrameRef.current
    );
  };

  /**
   * Starts a seamless optical morph transition into `targetUrl` with role `'speaking' | 'idle'`.
   * If `keepOutgoingLive` is true, the outgoing video continues moving naturally during the dissolve!
   */
  const startTransitionTo = (
    targetUrl: string,
    role: 'speaking' | 'idle',
    keepOutgoingLive: boolean,
  ) => {
    deferredTransitionRef.current = null;
    clearIdleCycleTimer();
    ensureBuffers();
    const prevSlot = activeSlotRef.current;
    const nextSlot: 0 | 1 = prevSlot === 0 ? 1 : 0;

    // Snapshot the exact currently visible composite as an indestructible fallback base
    if (hasMasterFrameRef.current && masterCanvasRef.current && outgoingFallbackCanvasRef.current) {
      copyCanvasTo(masterCanvasRef.current, outgoingFallbackCanvasRef.current);
    }

    const prevVideo = getVideoBySlot(prevSlot);
    const canKeepOutgoingLive =
      keepOutgoingLive &&
      Boolean(prevVideo && !prevVideo.paused && !prevVideo.ended && !slotSafeEndedRef.current[prevSlot]) &&
      slotHasFrameRef.current[prevSlot];

    if (!canKeepOutgoingLive && prevVideo && !prevVideo.paused) {
      prevVideo.pause();
    }

    outgoingSlotRef.current = prevSlot;
    activeSlotRef.current = nextSlot;
    activeRoleRef.current = role;
    autoMorphTriggeredRef.current = role === 'idle';
    useLiveOutgoingRef.current = canKeepOutgoingLive;

    if (role === 'speaking') {
      activeSlotClipIdRef.current = clipIdLiveRef.current;
      lastRequestedSpeakingUrlRef.current = targetUrl;
      lastSpeakingStartMsRef.current = performance.now();
      plannedIdleUrlRef.current = pickNextAngelIdleVideo(lastPlayedIdleUrlRef.current);
    } else {
      activeSlotClipIdRef.current = null;
      lastPlayedIdleUrlRef.current = targetUrl;
    }

    blendDurationMsRef.current = role === 'idle' ? BLEND_TO_IDLE_MS : BLEND_TO_SPEAK_MS;

    if (hasMasterFrameRef.current) {
      waitingForIncomingFrameRef.current = true;
      isBlendingRef.current = true;
    } else {
      waitingForIncomingFrameRef.current = false;
      isBlendingRef.current = false;
    }

    loadVideoIntoSlot(nextSlot, targetUrl, true);
    ensureRenderLoop();
  };

  function renderFrame(now: number) {
    ensureBuffers();
    const visibleCanvas = canvasRef.current;
    const slotCanvases = slotCanvasesRef.current;
    const fallbackOut = outgoingFallbackCanvasRef.current;
    const masterCanvas = masterCanvasRef.current;

    if (!visibleCanvas || !slotCanvases || !fallbackOut || !masterCanvas) {
      rafIdRef.current = null;
      return;
    }

    const activeSlot = activeSlotRef.current;
    const outSlot = outgoingSlotRef.current;
    const activeVideo = getVideoBySlot(activeSlot);
    const outVideo = getVideoBySlot(outSlot);

    // 1. Sample verified-bright frames from active (and live-outgoing / standby) videos
    const activeReady = sampleSlotVideoFrame(activeSlot);
    if (useLiveOutgoingRef.current || (outVideo && outVideo.readyState >= 2 && !slotHasFrameRef.current[outSlot])) {
      sampleSlotVideoFrame(outSlot);
    }

    // 1b. Word-Triggered Special Escape Overlay Scheduler ("you" finger-point & "push a button" below):
    //     When spoken text hits a scheduled cue, pause & hold the active base video, play the
    //     Special Escape Overlay clip on top, and then resume & continue the base video to its end!
    const liveSpeechElapsed = isSpeakingLiveRef.current
      ? opponentSpeech.getElapsedSpeechSeconds()
      : 0;
    const wallSpeechElapsed =
      utteranceWallStartMsRef.current > 0
        ? (now - utteranceWallStartMsRef.current) / 1000
        : 0;
    const mutedPreviewActive =
      (!soundEnabledLiveRef.current || angelVoiceLiveRef.current === 'off') &&
      wallSpeechElapsed <= utteranceMaxWindowSecRef.current;
    const effectiveSpeechElapsedSec =
      liveSpeechElapsed > 0.02
        ? liveSpeechElapsed
        : mutedPreviewActive
          ? wallSpeechElapsed
          : -1;

    const activeBaseNoCut = isCurrentSlotNoCut();
    const activeNoCutStillPlaying =
      activeBaseNoCut &&
      Boolean(
        activeVideo &&
          !activeVideo.ended &&
          !slotSafeEndedRef.current[activeSlot] &&
          (!activeVideo.paused || waitingForIncomingFrameRef.current),
      );

    // If No Cut is enabled on the active video, move any "button" cue to the post-video queue
    // so it NEVER cuts into the video mid-playback and NEVER gets dropped before the video finishes!
    if (activeNoCutStillPlaying && pendingEscapeCuesRef.current.length > 0) {
      const btnFromPending = pendingEscapeCuesRef.current.filter((c) => c.key === 'push_button');
      for (const b of btnFromPending) {
        if (!deferredPostVideoCuesRef.current.some((d) => d.key === b.key)) {
          deferredPostVideoCuesRef.current.push({ ...b, videoStartSeekSec: 0 });
        }
      }
      pendingEscapeCuesRef.current = [];
      if (deferredPostVideoCuesRef.current.length > 0 && escapePhaseRef.current === 'inactive') {
        loadEscapeVideo(deferredPostVideoCuesRef.current[0].videoUrl, false, 0);
      }
    }

    // Drop any queued mid-video cue whose actual spoken word already passed by > 0.45s
    while (
      pendingEscapeCuesRef.current.length > 0 &&
      effectiveSpeechElapsedSec >= 0 &&
      effectiveSpeechElapsedSec > pendingEscapeCuesRef.current[0].spokenWordSec + 0.45
    ) {
      pendingEscapeCuesRef.current.shift();
    }

    const activeEscFullLength = isVideoUrlPlayToEnd(escapeUrlRef.current);
    const activeApexDelivered =
      effectiveSpeechElapsedSec >= 0 &&
      effectiveSpeechElapsedSec >= activeEscapeSpokenWordSecRef.current + 0.32;
    const canChainIntoNextEscape =
      !activeNoCutStillPlaying &&
      !playingPostVideoEscapeRef.current &&
      (escapePhaseRef.current === 'inactive' ||
        escapePhaseRef.current === 'exiting' ||
        (!activeEscFullLength &&
          (escapePhaseRef.current === 'entering' || escapePhaseRef.current === 'playing') &&
          (activeApexDelivered || now - escapeStartedAtMsRef.current >= 1850)));

    if (
      canChainIntoNextEscape &&
      pendingEscapeCuesRef.current.length > 0 &&
      effectiveSpeechElapsedSec >= 0 &&
      effectiveSpeechElapsedSec >= pendingEscapeCuesRef.current[0].estimatedTriggerSec
    ) {
      const cue = pendingEscapeCuesRef.current.shift()!;
      clearIdleCycleTimer();
      // Pause & hold the underlying video at its exact frame so it continues to the end afterward!
      if (
        activeVideo &&
        !activeVideo.paused &&
        !activeVideo.ended &&
        !slotSafeEndedRef.current[activeSlot]
      ) {
        activeVideo.pause();
        pausedBaseForEscapeRef.current = true;
      }

      if (
        escapePhaseRef.current !== 'inactive' &&
        escapeCurrentAlphaRef.current > 0.15 &&
        escapeCanvasRef.current &&
        escapePrevCanvasRef.current &&
        escapeHasFrameRef.current
      ) {
        copyCanvasTo(escapeCanvasRef.current, escapePrevCanvasRef.current);
        hasEscapePrevRef.current = true;
        escapeStartAlphaRef.current = 0;
        escapeCurrentAlphaRef.current = 0;
      } else {
        hasEscapePrevRef.current = false;
        escapeStartAlphaRef.current = escapeCurrentAlphaRef.current;
      }

      // Frame-exact live lead compensation (unless No-Cut flag is set, in which case start at 0.0s!)
      const cueFullLength = isVideoUrlPlayToEnd(cue.videoUrl);
      const liveLeadSec = Math.max(0.08, cue.spokenWordSec - effectiveSpeechElapsedSec);
      const exactStartSeekSec = cueFullLength ? 0 : Math.max(0, cue.videoApexSec - liveLeadSec);

      activeEscapeCueKeyRef.current = cue.key;
      activeEscapeSpokenWordSecRef.current = cue.spokenWordSec;
      escapeStartedAtMsRef.current = now;
      escapePhaseRef.current = 'entering';
      escapeWaitingFrameRef.current = true;
      loadEscapeVideo(cue.videoUrl, true, exactStartSeekSec);
    }

    // 2. Automatic Pre-End Imperceptible Morph, Post-Video "button" Playback & Deferred No-Cut Flush:
    //    - Any video flagged with `No Cut - Play to End` skips pre-end cuts and runs until its final frame!
    //    - Immediately after a `No Cut` video finishes, any queued "button" part plays first!
    //    - Once the `No Cut` video (and any post-video "button" part) finishes, queued transitions flush.
    if (
      !pausedBaseForEscapeRef.current &&
      escapePhaseRef.current === 'inactive' &&
      activeVideo
    ) {
      const activeFullLength = activeBaseNoCut;
      const dur = activeVideo.duration;
      const cur = activeVideo.currentTime;
      const endedOrTailTrimmed =
        slotSafeEndedRef.current[activeSlot] ||
        activeVideo.ended ||
        (activeVideo.paused && activeReady && cur > 0.25 && !waitingForIncomingFrameRef.current);

      if (endedOrTailTrimmed && deferredPostVideoCuesRef.current.length > 0) {
        const postCue = deferredPostVideoCuesRef.current.shift()!;
        clearIdleCycleTimer();
        autoMorphTriggeredRef.current = true;
        playingPostVideoEscapeRef.current = true;
        hasEscapePrevRef.current = false;
        escapeStartAlphaRef.current = 0;
        escapeCurrentAlphaRef.current = 0;
        activeEscapeCueKeyRef.current = postCue.key;
        activeEscapeSpokenWordSecRef.current = postCue.spokenWordSec;
        escapeStartedAtMsRef.current = now;
        escapePhaseRef.current = 'entering';
        escapeWaitingFrameRef.current = true;
        loadEscapeVideo(postCue.videoUrl, true, 0);
        rafIdRef.current = window.requestAnimationFrame(renderFrame);
        return;
      }

      if (endedOrTailTrimmed && deferredTransitionRef.current) {
        const pending = deferredTransitionRef.current;
        deferredTransitionRef.current = null;
        isInExtendedLipSyncRef.current = Boolean(pending.isExtendedLip);
        if (pending.rearmEscapeCues) {
          armEscapeCuesForUtterance(pending.url, pending.clipId, pending.speechText);
        }
        startTransitionTo(pending.url, pending.role, true);
        rafIdRef.current = window.requestAnimationFrame(renderFrame);
        return;
      }

      if (activeRoleRef.current === 'speaking' && !autoMorphTriggeredRef.current) {
        const reachedPreEndLead =
          !activeFullLength &&
          Number.isFinite(dur) &&
          dur > 1.35 &&
          cur >= Math.max(0.35, dur - PRE_END_MORPH_LEAD_SEC);

        if (reachedPreEndLead || endedOrTailTrimmed) {
          autoMorphTriggeredRef.current = true;
          const remainingTalkSec = isSpeakingLiveRef.current
            ? opponentSpeech.getRemainingSpeechSeconds()
            : 0;
          const videoTailLeftSec =
            Number.isFinite(dur) && dur > cur && !endedOrTailTrimmed
              ? Math.max(0, dur - PRE_EOS_STOP_SEC - cur)
              : 0;
          const talkBeyondThisVideoSec = remainingTalkSec - videoTailLeftSec;

          if (
            talkBeyondThisVideoSec > 0.35 &&
            shouldExtendWithDefaultLipSync(clipIdLiveRef.current)
          ) {
            isInExtendedLipSyncRef.current = true;
            startTransitionTo(resolveDefaultSpeakingLipVideo(), 'speaking', true);
          } else {
            isInExtendedLipSyncRef.current = false;
            const targetIdle =
              plannedIdleUrlRef.current || pickNextAngelIdleVideo(lastPlayedIdleUrlRef.current);
            startTransitionTo(targetIdle, 'idle', true);
          }
          rafIdRef.current = window.requestAnimationFrame(renderFrame);
          return;
        }
      }
    }

    // 3. Start the blend clock on the exact frame the incoming slot produces its first bright portrait frame
    if (waitingForIncomingFrameRef.current && activeReady) {
      waitingForIncomingFrameRef.current = false;
      blendStartAtRef.current = now;
    }

    // 4. Composite base slots onto `masterCanvas`, then layer Special Escape Overlay on top if active!
    const mctx = masterCanvas.getContext('2d');
    if (mctx) {
      if (activeReady && !waitingForIncomingFrameRef.current) {
        let alpha = 1;
        if (isBlendingRef.current && blendDurationMsRef.current > 0) {
          const rawT = (now - blendStartAtRef.current) / blendDurationMsRef.current;
          if (rawT >= 1) {
            alpha = 1;
            isBlendingRef.current = false;
            useLiveOutgoingRef.current = false;
            if (outVideo && !outVideo.paused) {
              outVideo.pause();
            }
            // Pre-decode next standby clip (either Default Speaking Lip if talk continues, or Idle Listening!)
            if (activeRoleRef.current === 'speaking') {
              preloadNextForActiveSpeaking();
            }
          } else {
            alpha = quinticSmooth(rawT);
          }
        }

        if (alpha < 1 && hasMasterFrameRef.current) {
          const outgoingSource =
            useLiveOutgoingRef.current && slotHasFrameRef.current[outSlot]
              ? slotCanvases[outSlot]
              : fallbackOut;

          // Eye-anchored micro alignment + subtle desktop outgoing contour feather so edges melt invisibly
          const outScale = 1 + 0.0032 * alpha;
          const inScale = 1.0032 - 0.0032 * alpha;
          const bell = Math.sin(Math.PI * alpha);

          mctx.globalAlpha = 1;
          mctx.clearRect(0, 0, PORTRAIT_CANVAS_W, PORTRAIT_CANVAS_H);

          if (!IS_MOBILE_DEVICE && bell > 0.04) {
            mctx.save();
            mctx.filter = `blur(${(bell * 1.15).toFixed(2)}px)`;
            drawCoverSource(
              mctx,
              outgoingSource,
              PORTRAIT_CANVAS_W,
              PORTRAIT_CANVAS_H,
              PORTRAIT_CANVAS_W,
              PORTRAIT_CANVAS_H,
              outScale,
            );
            mctx.restore();
          } else {
            drawCoverSource(
              mctx,
              outgoingSource,
              PORTRAIT_CANVAS_W,
              PORTRAIT_CANVAS_H,
              PORTRAIT_CANVAS_W,
              PORTRAIT_CANVAS_H,
              outScale,
            );
          }

          mctx.globalAlpha = alpha;
          drawCoverSource(
            mctx,
            slotCanvases[activeSlot],
            PORTRAIT_CANVAS_W,
            PORTRAIT_CANVAS_H,
            PORTRAIT_CANVAS_W,
            PORTRAIT_CANVAS_H,
            inScale,
          );
          mctx.globalAlpha = 1;
          hasMasterFrameRef.current = true;
        } else {
          mctx.globalAlpha = 1;
          mctx.clearRect(0, 0, PORTRAIT_CANVAS_W, PORTRAIT_CANVAS_H);
          mctx.drawImage(slotCanvases[activeSlot], 0, 0, PORTRAIT_CANVAS_W, PORTRAIT_CANVAS_H);
          hasMasterFrameRef.current = true;
        }
      }

      // 4b. Composite Special Escape Overlay Layer ("you" finger-point / "push a button" below)
      if (escapePhaseRef.current !== 'inactive' && escapeCanvasRef.current) {
        const escVideo = escapeVideoRef.current;
        const escReady = sampleEscapeVideoFrame();

        if (escapeWaitingFrameRef.current && escReady) {
          escapeWaitingFrameRef.current = false;
          escapeBlendStartAtRef.current = now;
        }

        // Keep previous escape frame visible while incoming chained escape decodes its first frame
        if (escapeWaitingFrameRef.current && hasEscapePrevRef.current && escapePrevCanvasRef.current) {
          mctx.save();
          mctx.globalAlpha = 1;
          mctx.drawImage(escapePrevCanvasRef.current, 0, 0, PORTRAIT_CANVAS_W, PORTRAIT_CANVAS_H);
          mctx.restore();
        } else if (escReady && !escapeWaitingFrameRef.current) {
          if (escapePhaseRef.current === 'entering') {
            const rawT = (now - escapeBlendStartAtRef.current) / ESCAPE_BLEND_IN_MS;
            if (rawT >= 1) {
              escapeCurrentAlphaRef.current = 1;
              hasEscapePrevRef.current = false;
              escapePhaseRef.current = 'playing';
            } else {
              const s = quinticSmooth(rawT);
              escapeCurrentAlphaRef.current =
                escapeStartAlphaRef.current + (1 - escapeStartAlphaRef.current) * s;
            }
          }

          if (escapePhaseRef.current === 'entering' || escapePhaseRef.current === 'playing') {
            const escFullLength = isVideoUrlPlayToEnd(escapeUrlRef.current);
            const escDur = escVideo?.duration ?? NaN;
            const escCur = escVideo?.currentTime ?? 0;
            const escNearEnd =
              !escFullLength &&
              Number.isFinite(escDur) &&
              escDur > 0.7 &&
              escCur >= Math.max(0.2, escDur - ESCAPE_PRE_END_LEAD_SEC);
            const escFinished =
              escapeSafeEndedRef.current ||
              Boolean(escVideo?.ended) ||
              Boolean(
                escVideo?.paused &&
                  now - escapeStartedAtMsRef.current > 450 &&
                  escCur >= escapeLaunchSeekSecRef.current + 0.35,
              );

            if (escNearEnd || escFinished) {
              if (playingPostVideoEscapeRef.current) {
                if (deferredPostVideoCuesRef.current.length > 0) {
                  const nextPost = deferredPostVideoCuesRef.current.shift()!;
                  if (escapeCanvasRef.current && escapePrevCanvasRef.current && escapeHasFrameRef.current) {
                    copyCanvasTo(escapeCanvasRef.current, escapePrevCanvasRef.current);
                    hasEscapePrevRef.current = true;
                  } else {
                    hasEscapePrevRef.current = false;
                  }
                  escapeStartAlphaRef.current = 0;
                  escapeCurrentAlphaRef.current = 0;
                  activeEscapeCueKeyRef.current = nextPost.key;
                  activeEscapeSpokenWordSecRef.current = nextPost.spokenWordSec;
                  escapeStartedAtMsRef.current = now;
                  escapePhaseRef.current = 'entering';
                  escapeWaitingFrameRef.current = true;
                  loadEscapeVideo(nextPost.videoUrl, true, 0);
                } else {
                  // Post-video "button" part finished: snapshot its bright end frame onto masterCanvas
                  // and morph seamlessly into any queued utterance, Lip-Sync tail, or Idle Listening!
                  if (escapeHasFrameRef.current && escapeCanvasRef.current) {
                    const escAlphaSnap = Math.max(0, Math.min(1, escapeCurrentAlphaRef.current));
                    if (escAlphaSnap > 0.05) {
                      mctx.save();
                      mctx.globalAlpha = escAlphaSnap;
                      drawCoverSource(
                        mctx,
                        escapeCanvasRef.current,
                        PORTRAIT_CANVAS_W,
                        PORTRAIT_CANVAS_H,
                        PORTRAIT_CANVAS_W,
                        PORTRAIT_CANVAS_H,
                        1,
                      );
                      mctx.restore();
                      hasMasterFrameRef.current = true;
                    }
                  }
                  playingPostVideoEscapeRef.current = false;
                  hasEscapePrevRef.current = false;
                  escapeCurrentAlphaRef.current = 0;
                  escapeStartAlphaRef.current = 0;
                  escapePhaseRef.current = 'inactive';
                  activeEscapeCueKeyRef.current = null;
                  pausedBaseForEscapeRef.current = false;
                  if (escVideo && !escVideo.paused) {
                    escVideo.pause();
                  }

                  if (deferredTransitionRef.current) {
                    const pending = deferredTransitionRef.current;
                    deferredTransitionRef.current = null;
                    isInExtendedLipSyncRef.current = Boolean(pending.isExtendedLip);
                    if (pending.rearmEscapeCues) {
                      armEscapeCuesForUtterance(pending.url, pending.clipId, pending.speechText);
                    }
                    startTransitionTo(pending.url, pending.role, false);
                  } else {
                    const remainingTalkSec = isSpeakingLiveRef.current
                      ? opponentSpeech.getRemainingSpeechSeconds()
                      : 0;
                    if (
                      remainingTalkSec > 0.35 &&
                      shouldExtendWithDefaultLipSync(clipIdLiveRef.current)
                    ) {
                      isInExtendedLipSyncRef.current = true;
                      startTransitionTo(resolveDefaultSpeakingLipVideo(), 'speaking', false);
                    } else {
                      isInExtendedLipSyncRef.current = false;
                      const targetIdle =
                        plannedIdleUrlRef.current ||
                        pickNextAngelIdleVideo(lastPlayedIdleUrlRef.current);
                      startTransitionTo(targetIdle, 'idle', false);
                    }
                  }
                }
              } else {
                hasEscapePrevRef.current = false;
                escapePhaseRef.current = 'exiting';
                escapeStartAlphaRef.current = escapeCurrentAlphaRef.current;
                escapeBlendStartAtRef.current = now;
                const baseProtected = isCurrentSlotNoCut();
                if (
                  !baseProtected &&
                  !isSpeakingLiveRef.current &&
                  !mutedPreviewActive &&
                  isInExtendedLipSyncRef.current
                ) {
                  isInExtendedLipSyncRef.current = false;
                  pausedBaseForEscapeRef.current = false;
                  const targetIdle =
                    plannedIdleUrlRef.current ||
                    pickNextAngelIdleVideo(lastPlayedIdleUrlRef.current);
                  startTransitionTo(targetIdle, 'idle', false);
                } else {
                  resumePausedBaseVideoAfterEscape();
                }
              }
            }
          } else if (escapePhaseRef.current === 'exiting') {
            const rawT = (now - escapeBlendStartAtRef.current) / ESCAPE_BLEND_OUT_MS;
            if (rawT >= 1) {
              escapeCurrentAlphaRef.current = 0;
              hasEscapePrevRef.current = false;
              escapePhaseRef.current = 'inactive';
              activeEscapeCueKeyRef.current = null;
              if (escVideo && !escVideo.paused) {
                escVideo.pause();
              }
              if (pendingEscapeCuesRef.current.length > 0) {
                const nextQueued = pendingEscapeCuesRef.current[0];
                loadEscapeVideo(nextQueued.videoUrl, false, nextQueued.videoStartSeekSec);
              }
            } else {
              escapeCurrentAlphaRef.current =
                escapeStartAlphaRef.current * (1 - quinticSmooth(rawT));
            }
          }

          const escAlpha = Math.max(0, Math.min(1, escapeCurrentAlphaRef.current));
          if (hasEscapePrevRef.current && escapePrevCanvasRef.current && hasMasterFrameRef.current) {
            mctx.save();
            mctx.globalAlpha = 1;
            mctx.drawImage(escapePrevCanvasRef.current, 0, 0, PORTRAIT_CANVAS_W, PORTRAIT_CANVAS_H);
            mctx.restore();
          }
          if (escAlpha > 0.004 && hasMasterFrameRef.current) {
            const escScale = 1.0028 - 0.0028 * escAlpha;
            mctx.save();
            mctx.globalAlpha = escAlpha;
            drawCoverSource(
              mctx,
              escapeCanvasRef.current,
              PORTRAIT_CANVAS_W,
              PORTRAIT_CANVAS_H,
              PORTRAIT_CANVAS_W,
              PORTRAIT_CANVAS_H,
              escScale,
            );
            mctx.restore();
          }
        }
      }
    }

    // 5. Blit verified `masterCanvas` onto visible screen `<canvas>` (mathematically impossible to blank!)
    if (hasMasterFrameRef.current) {
      const vctx = visibleCanvas.getContext('2d');
      if (vctx) {
        vctx.globalAlpha = 1;
        vctx.clearRect(0, 0, PORTRAIT_CANVAS_W, PORTRAIT_CANVAS_H);
        vctx.drawImage(masterCanvas, 0, 0, PORTRAIT_CANVAS_W, PORTRAIT_CANVAS_H);
      }
    }

    const activeStillMoving =
      Boolean(activeVideo && !activeVideo.paused && !activeVideo.ended && !slotSafeEndedRef.current[activeSlot]);
    const outStillMoving =
      useLiveOutgoingRef.current &&
      Boolean(outVideo && !outVideo.paused && !outVideo.ended && !slotSafeEndedRef.current[outSlot]);
    const escapeActiveOrPending =
      escapePhaseRef.current !== 'inactive' ||
      playingPostVideoEscapeRef.current ||
      deferredPostVideoCuesRef.current.length > 0 ||
      (pendingEscapeCuesRef.current.length > 0 &&
        (isSpeakingLiveRef.current || mutedPreviewActive));

    if (
      activeStillMoving ||
      outStillMoving ||
      isBlendingRef.current ||
      waitingForIncomingFrameRef.current ||
      escapeActiveOrPending ||
      Boolean(deferredTransitionRef.current)
    ) {
      rafIdRef.current = window.requestAnimationFrame(renderFrame);
    } else {
      // Settled calmly on verified visible listening frame: 0% idle CPU/GPU during rest!
      rafIdRef.current = null;

      // When 2 or more Idle / Quiet Listening alternatives exist, pre-decode the next alternative
      // and wait a calm 28s–40s stillness interval (with wrist-watch cooldowns) before morphing!
      if (activeRoleRef.current === 'idle' && idleCycleTimerRef.current === null) {
        const pool = getAngelIdleVideoPool();
        if (pool.length >= 2) {
          const nextAlt = pickNextAngelIdleVideo(slotUrlRef.current[activeSlot]);
          preloadStandbyIdleSlot(nextAlt);
          idleCycleTimerRef.current = window.setTimeout(() => {
            idleCycleTimerRef.current = null;
            if (activeRoleRef.current === 'idle') {
              startTransitionTo(nextAlt, 'idle', false);
            }
          }, nextCalmIdlePauseMs());
        }
      }
    }
  }

  // Initial mount & utterance/state trigger handler
  useEffect(() => {
    const targetRole: 'speaking' | 'idle' = useIdleForUtterance ? 'idle' : 'speaking';

    if (lastTriggerRef.current === '') {
      lastTriggerRef.current = triggerKey;
      activeSlotRef.current = 0;
      outgoingSlotRef.current = 1;
      activeRoleRef.current = targetRole;
      autoMorphTriggeredRef.current = targetRole === 'idle';
      if (targetRole === 'speaking') {
        activeSlotClipIdRef.current = clipId;
        isInExtendedLipSyncRef.current = desiredSrc === resolveDefaultSpeakingLipVideo();
        lastRequestedSpeakingUrlRef.current = desiredSrc;
        lastSpeakingStartMsRef.current = performance.now();
        const firstIdle = pickNextAngelIdleVideo();
        plannedIdleUrlRef.current = firstIdle;
        loadVideoIntoSlot(0, desiredSrc, true);
        const estSec = clipId ? VOICE_CLIP_DURATION_SEC[clipId] ?? 0 : 0;
        if (estSec > 5.8 && shouldExtendWithDefaultLipSync(clipId)) {
          loadVideoIntoSlot(1, resolveDefaultSpeakingLipVideo(), false);
        } else {
          loadVideoIntoSlot(1, firstIdle, false);
        }
      } else {
        activeSlotClipIdRef.current = null;
        isInExtendedLipSyncRef.current = false;
        lastPlayedIdleUrlRef.current = desiredSrc;
        loadVideoIntoSlot(0, desiredSrc, true);
      }
      armEscapeCuesForUtterance(desiredSrc, clipId, speechText);
      ensureRenderLoop();
      return;
    }

    if (triggerKey === lastTriggerRef.current) {
      // Refresh pending/post-video escape cues if user just uploaded/toggled an escape video,
      // per-case cue, or No Cut - Play to End in Video Studio!
      if (!isIdleTrigger) {
        const refreshed = resolveActiveEscapeCues(
          speechTextLiveRef.current,
          clipIdLiveRef.current,
          undefined,
          false,
        );
        const nowNoCut = isCurrentSlotNoCut();
        const liveEl = isSpeakingLiveRef.current ? opponentSpeech.getElapsedSpeechSeconds() : 999;

        if (nowNoCut) {
          // Switched to (or remaining in) No Cut: hold "button" cue until AFTER the video ends!
          pendingEscapeCuesRef.current = [];
          if (!playingPostVideoEscapeRef.current) {
            deferredPostVideoCuesRef.current = refreshed
              .filter((c) => c.key === 'push_button')
              .map((c) => ({ ...c, videoStartSeekSec: 0 }));
            if (escapePhaseRef.current !== 'inactive' && escapePhaseRef.current !== 'exiting') {
              // Dissolve any mid-video overlay back immediately if user just enabled No Cut
              hasEscapePrevRef.current = false;
              escapePhaseRef.current = 'exiting';
              escapeStartAlphaRef.current = escapeCurrentAlphaRef.current;
              escapeBlendStartAtRef.current = performance.now();
              resumePausedBaseVideoAfterEscape();
            } else if (
              escapePhaseRef.current === 'inactive' &&
              deferredPostVideoCuesRef.current.length > 0
            ) {
              loadEscapeVideo(deferredPostVideoCuesRef.current[0].videoUrl, false, 0);
            }
            ensureRenderLoop();
          }
        } else {
          deferredPostVideoCuesRef.current = [];
          if (escapePhaseRef.current === 'inactive') {
            pendingEscapeCuesRef.current = refreshed.filter(
              (c) => c.spokenWordSec >= liveEl - 0.15,
            );
            if (pendingEscapeCuesRef.current.length > 0) {
              const first = pendingEscapeCuesRef.current[0];
              loadEscapeVideo(first.videoUrl, false, first.videoStartSeekSec);
              ensureRenderLoop();
            }
          } else {
            pendingEscapeCuesRef.current = refreshed.filter(
              (c) =>
                c.key !== activeEscapeCueKeyRef.current &&
                c.spokenWordSec >=
                  Math.max(liveEl - 0.1, activeEscapeSpokenWordSecRef.current + 0.1),
            );
            // If the user just unselected the currently playing cue in Video Studio, dissolve back immediately!
            const stillAllowed = refreshed.some((c) => c.key === activeEscapeCueKeyRef.current);
            if (!stillAllowed && escapePhaseRef.current !== 'exiting') {
              hasEscapePrevRef.current = false;
              escapePhaseRef.current = 'exiting';
              escapeStartAlphaRef.current = escapeCurrentAlphaRef.current;
              escapeBlendStartAtRef.current = performance.now();
              resumePausedBaseVideoAfterEscape();
              ensureRenderLoop();
            }
          }
        }
      }

      // Hot-swap immediately if the user just uploaded a new .mp4 or toggled Lip-Sync ON/OFF in Video Studio
      if (
        targetRole === 'speaking' &&
        (activeRoleRef.current !== 'speaking' ||
          (!isInExtendedLipSyncRef.current && desiredSrc !== lastRequestedSpeakingUrlRef.current))
      ) {
        isInExtendedLipSyncRef.current = desiredSrc === resolveDefaultSpeakingLipVideo();
        startTransitionTo(desiredSrc, 'speaking', true);
      } else if (targetRole === 'idle' && activeRoleRef.current === 'speaking') {
        isInExtendedLipSyncRef.current = false;
        startTransitionTo(pickNextAngelIdleVideo(lastPlayedIdleUrlRef.current), 'idle', true);
      } else if (activeRoleRef.current === 'idle') {
        const pool = getAngelIdleVideoPool();
        const currentIdle = slotUrlRef.current[activeSlotRef.current];
        if (!pool.includes(currentIdle)) {
          startTransitionTo(pickNextAngelIdleVideo(), 'idle', true);
        } else if (pool.length >= 2 && idleCycleTimerRef.current === null && rafIdRef.current === null) {
          const nextAlt = pickNextAngelIdleVideo(currentIdle);
          preloadStandbyIdleSlot(nextAlt);
          idleCycleTimerRef.current = window.setTimeout(() => {
            idleCycleTimerRef.current = null;
            if (activeRoleRef.current === 'idle') {
              startTransitionTo(nextAlt, 'idle', false);
            }
          }, nextCalmIdlePauseMs());
        }
      } else if (activeRoleRef.current === 'speaking') {
        preloadNextForActiveSpeaking();
      }
      return;
    }

    lastTriggerRef.current = triggerKey;
    const isExplicitStudioTest = triggerKey.startsWith('preview:') || Boolean(forcedIdleUrl);
    const nextUrl =
      targetRole === 'idle' && !forcedIdleUrl
        ? pickNextAngelIdleVideo(lastPlayedIdleUrlRef.current)
        : desiredSrc;
    const nextIsExtendedLip =
      targetRole === 'speaking' && nextUrl === resolveDefaultSpeakingLipVideo();

    if (!isExplicitStudioTest && isActiveBaseProtectedFromCut()) {
      deferredTransitionRef.current = {
        url: nextUrl,
        role: targetRole,
        isExtendedLip: nextIsExtendedLip,
        clipId,
        speechText,
        rearmEscapeCues: true,
      };
      ensureRenderLoop();
      return;
    }

    armEscapeCuesForUtterance(nextUrl, clipId, speechText);

    // If this saying has Lip-Sync turned OFF (Idle Only) and Chess Angel is already in Idle,
    // keep her calm Idle / Quiet Listening portrait undisturbed (while still running any Escape Overlay cues!)
    if (targetRole === 'idle' && !forcedIdleUrl && activeRoleRef.current === 'idle') {
      isInExtendedLipSyncRef.current = false;
      if (
        pendingEscapeCuesRef.current.length > 0 ||
        deferredPostVideoCuesRef.current.length > 0
      ) {
        ensureRenderLoop();
      }
      return;
    }
    isInExtendedLipSyncRef.current = nextIsExtendedLip;
    startTransitionTo(nextUrl, targetRole, true);
  }, [
    triggerKey,
    desiredSrc,
    forcedIdleUrl,
    idlePoolKey,
    useIdleForUtterance,
    isIdleTrigger,
    clipId,
    speechText,
    overrideTick,
  ]);

  // Sync portrait with live voice start / completion:
  // - When Replay Voice starts after idle, re-arm escape cues & morph back into the speaking clip.
  // - When voice finishes, clear any unfired mid-video cues (preserving any post-video "button" cues
  //   on No-Cut videos!) and morph smoothly out of extended lip-sync to Idle.
  useEffect(() => {
    const wasSpeaking = prevSpeakingRef.current;
    prevSpeakingRef.current = isSpeaking;

    if (!wasSpeaking && isSpeaking && soundEnabled && angelVoice !== 'off' && !isIdleTrigger) {
      const elapsedSinceStart = performance.now() - lastSpeakingStartMsRef.current;
      if (elapsedSinceStart > 900) {
        if (
          !triggerKey.startsWith('preview:') &&
          isActiveBaseProtectedFromCut() &&
          slotUrlRef.current[activeSlotRef.current] !== desiredSrc
        ) {
          // Keep current protected sequence intact; rearm when deferred transition flushes
        } else {
          armEscapeCuesForUtterance(desiredSrc, clipIdLiveRef.current, speechTextLiveRef.current);
        }
      }
      if (!useIdleForUtterance && (activeRoleRef.current === 'idle' || elapsedSinceStart > 900)) {
        const nextIsExtended = desiredSrc === resolveDefaultSpeakingLipVideo();
        if (
          !triggerKey.startsWith('preview:') &&
          isActiveBaseProtectedFromCut() &&
          slotUrlRef.current[activeSlotRef.current] !== desiredSrc
        ) {
          deferredTransitionRef.current = {
            url: desiredSrc,
            role: 'speaking',
            isExtendedLip: nextIsExtended,
            clipId: clipIdLiveRef.current,
            speechText: speechTextLiveRef.current,
            rearmEscapeCues: true,
          };
          ensureRenderLoop();
        } else {
          isInExtendedLipSyncRef.current = nextIsExtended;
          startTransitionTo(desiredSrc, 'speaking', true);
        }
      } else if (
        pendingEscapeCuesRef.current.length > 0 ||
        deferredPostVideoCuesRef.current.length > 0
      ) {
        ensureRenderLoop();
      }
      return;
    }

    if (wasSpeaking && !isSpeaking) {
      // Clear mid-video cues, NEVER clear `deferredPostVideoCuesRef` so the "button" part still plays after No-Cut ends!
      pendingEscapeCuesRef.current = [];
      if (
        activeRoleRef.current === 'speaking' &&
        isInExtendedLipSyncRef.current &&
        escapePhaseRef.current === 'inactive'
      ) {
        const targetIdle =
          plannedIdleUrlRef.current || pickNextAngelIdleVideo(lastPlayedIdleUrlRef.current);
        if (isActiveBaseProtectedFromCut()) {
          deferredTransitionRef.current = {
            url: targetIdle,
            role: 'idle',
            isExtendedLip: false,
          };
          ensureRenderLoop();
        } else {
          isInExtendedLipSyncRef.current = false;
          startTransitionTo(targetIdle, 'idle', true);
        }
      }
    }
  }, [
    isSpeaking,
    soundEnabled,
    angelVoice,
    desiredSrc,
    useIdleForUtterance,
    isIdleTrigger,
    triggerKey,
  ]);

  useEffect(() => {
    return () => {
      stopRenderLoop();
      clearIdleCycleTimer();
      resetEscapeOverlayState(false);
    };
  }, []);

  const makeSlotLoadedHandler = (slot: 0 | 1) => (e: SyntheticEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    el.loop = false;
    silenceVideoElement(el);

    if (slotAutoPlayRef.current[slot]) {
      const p = el.play();
      if (p) p.catch(() => {});
    } else {
      el.pause();
      sampleSlotVideoFrame(slot);
    }
    ensureRenderLoop();
  };

  const makeSlotEndedHandler = (slot: 0 | 1) => (e: SyntheticEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    el.loop = false;
    el.pause();
    silenceVideoElement(el);
    slotSafeEndedRef.current[slot] = true;
    ensureRenderLoop();
  };

  const handleForceSilence = (e: SyntheticEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    el.loop = false;
    silenceVideoElement(el);
  };

  return (
    <div
      onClick={onClick}
      title={title}
      className={`relative pointer-events-auto select-none bg-black border-0 ring-0 outline-none shadow-none overflow-hidden shrink-0 transition-[width] duration-200 ${
        compact
          ? 'w-[42px] md:w-[136px] lg:w-[174px] [@media(max-height:540px)]:w-[38px]'
          : 'w-[48px] md:w-[164px] lg:w-[216px] [@media(max-height:540px)]:w-[42px]'
      } aspect-[3/4] ${onClick ? 'cursor-pointer' : ''} ${
        hasCardBelow ? '' : '[mask-image:linear-gradient(to_bottom,black_82%,transparent_100%)]'
      }`}
    >
      {/* Dual hidden silent video decoders for zero-latency live overlap morphing */}
      <video
        ref={(node) => {
          video0Ref.current = node;
          if (node) {
            node.loop = false;
            silenceVideoElement(node);
          }
        }}
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        disableRemotePlayback
        controls={false}
        onLoadStart={handleForceSilence}
        onLoadedMetadata={handleForceSilence}
        onLoadedData={makeSlotLoadedHandler(0)}
        onCanPlay={makeSlotLoadedHandler(0)}
        onPlay={() => {
          if (video0Ref.current) silenceVideoElement(video0Ref.current);
          ensureRenderLoop();
        }}
        onPlaying={handleForceSilence}
        onVolumeChange={handleForceSilence}
        onEnded={makeSlotEndedHandler(0)}
        className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
      />
      <video
        ref={(node) => {
          video1Ref.current = node;
          if (node) {
            node.loop = false;
            silenceVideoElement(node);
          }
        }}
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        disableRemotePlayback
        controls={false}
        onLoadStart={handleForceSilence}
        onLoadedMetadata={handleForceSilence}
        onLoadedData={makeSlotLoadedHandler(1)}
        onCanPlay={makeSlotLoadedHandler(1)}
        onPlay={() => {
          if (video1Ref.current) silenceVideoElement(video1Ref.current);
          ensureRenderLoop();
        }}
        onPlaying={handleForceSilence}
        onVolumeChange={handleForceSilence}
        onEnded={makeSlotEndedHandler(1)}
        className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
      />

      {/* 3rd hidden silent decoder for Special Word-Triggered Escape Overlays ("you" & "push a button") */}
      <video
        ref={(node) => {
          escapeVideoRef.current = node;
          if (node) {
            node.loop = false;
            silenceVideoElement(node);
          }
        }}
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        disableRemotePlayback
        controls={false}
        onLoadStart={handleForceSilence}
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          el.loop = false;
          silenceVideoElement(el);
          if (!escapeSeekAppliedRef.current) {
            applyEscapeTargetSeek(el, true);
          }
        }}
        onLoadedData={(e) => {
          const el = e.currentTarget;
          el.loop = false;
          silenceVideoElement(el);
          if (!escapeSeekAppliedRef.current) {
            applyEscapeTargetSeek(el, true);
          }
          if (escapeAutoPlayRef.current) {
            const p = el.play();
            if (p) p.catch(() => {});
          } else {
            el.pause();
            sampleEscapeVideoFrame();
          }
          ensureRenderLoop();
        }}
        onCanPlay={(e) => {
          const el = e.currentTarget;
          el.loop = false;
          silenceVideoElement(el);
          if (!escapeSeekAppliedRef.current) {
            applyEscapeTargetSeek(el, !escapeAutoPlayRef.current);
          }
          if (escapeAutoPlayRef.current && el.paused) {
            const p = el.play();
            if (p) p.catch(() => {});
          } else if (!escapeAutoPlayRef.current) {
            sampleEscapeVideoFrame();
          }
          ensureRenderLoop();
        }}
        onPlay={() => {
          if (escapeVideoRef.current) silenceVideoElement(escapeVideoRef.current);
          ensureRenderLoop();
        }}
        onPlaying={handleForceSilence}
        onVolumeChange={handleForceSilence}
        onEnded={(e) => {
          const el = e.currentTarget;
          el.loop = false;
          el.pause();
          silenceVideoElement(el);
          escapeSafeEndedRef.current = true;
          ensureRenderLoop();
        }}
        className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
      />

      {/* Visible frameless 3:4 portrait canvas — strictly fed from luminance-verified buffers so Chess Angel never disappears */}
      <canvas
        ref={canvasRef}
        width={PORTRAIT_CANVAS_W}
        height={PORTRAIT_CANVAS_H}
        className="block w-full h-full object-cover bg-black border-0 ring-0 outline-none shadow-none pointer-events-none"
      />
    </div>
  );
}

interface OpponentSpeechBannerProps {
  message: OpponentMessage | null;
  angelVoice: AngelVoiceMode;
  soundEnabled: boolean;
  voiceState: VoicePlaybackState;
  calcPreview: CalcPreviewProgress | null;
  treeBrowser: TreeBrowserState | null;
  idlePreviewNonce?: number;
  forcedIdleUrl?: string | null;
  onSelectTreeSimulation: (index: number | null) => void;
  onStepTreeSimulation: (delta: -1 | 1) => void;
  onToggleTreeOnlyTopThree: () => void;
  onContinueFromTree: () => void;
  onExportTreeJpg: () => void;
  frontalTreeViewOpen?: boolean;
  proposeThreeMoves?: boolean;
  onPlayThreeMoves?: () => void;
  onAnimateTopThreeFromTree?: () => void;
  onReplayVoice: () => void;
  onWatchCalculatedLines: (report: BotSearchReport) => void;
  onConfirmNextBranch: () => void;
  onStopCalculationPreview: () => void;
  onUndoAndShowBetter: (alternatives: { uci: string; san: string }[]) => void;
  onAcceptHint: (uci: string, san: string) => void;
  onDismiss: () => void;
  onOpenVideoStudio?: () => void;
}

const TONE_TAG_COLOR: Record<OpponentMessage['tone'], string> = {
  checkmate: 'text-[#fca5a5]',
  check: 'text-[#fca5a5]',
  warning: 'text-[#f3cf83]',
  threat: 'text-[#fdba74]',
  capture: 'text-[#e8c784]',
  math: 'text-[#f0d192]',
  hint: 'text-[#7dd3fc]',
  opening: 'text-[#bfdbfe]',
  neutral: 'text-[#d9be95]',
};

export function OpponentSpeechBanner({
  message,
  angelVoice,
  soundEnabled,
  voiceState,
  calcPreview,
  treeBrowser,
  idlePreviewNonce = 0,
  forcedIdleUrl = null,
  onSelectTreeSimulation,
  onStepTreeSimulation,
  onToggleTreeOnlyTopThree,
  onContinueFromTree,
  onExportTreeJpg,
  frontalTreeViewOpen = false,
  proposeThreeMoves = true,
  onPlayThreeMoves,
  onAnimateTopThreeFromTree,
  onReplayVoice,
  onWatchCalculatedLines,
  onConfirmNextBranch,
  onStopCalculationPreview,
  onUndoAndShowBetter,
  onAcceptHint,
  onDismiss,
  onOpenVideoStudio,
}: OpponentSpeechBannerProps) {
  const isSpeaking = voiceState === 'speaking';

  const triggerKey = message?.isStudioPreview
    ? `preview:${message.id}`
    : calcPreview
      ? calcPreview.waitingForConfirm && !message
        ? `idle:calc:${calcPreview.branchIndex}`
        : `calc:${calcPreview.branchIndex}:${Boolean(calcPreview.waitingForConfirm)}`
      : treeBrowser
        ? message && angelVoice !== 'off'
          ? `msg:${message.id}`
          : `idle:tree:${idlePreviewNonce}`
        : message && angelVoice !== 'off'
          ? `msg:${message.id}`
          : `idle:${idlePreviewNonce}`;

  const action = message?.action;
  const isUndoProposed = Boolean(message && angelVoice !== 'off' && action?.kind === 'undo-offer');

  const isCompactPortrait = Boolean(calcPreview || treeBrowser);
  const isElevatedZ = Boolean(treeBrowser || isUndoProposed);
  const isWideCard = Boolean(treeBrowser);
  const canClickPortraitToReplay = Boolean(soundEnabled && message && angelVoice !== 'off');

  const renderThinkingAndThreeMoves = (compact = false, forceAllowThreeMoves = false) => {
    const padClass = compact
      ? 'px-1 py-0.5 text-[8px] leading-none md:px-2.5 md:py-1.5 md:text-[11px] md:leading-normal'
      : 'px-1 py-0.5 text-[8px] leading-none md:px-3 md:py-1.5 md:text-xs md:leading-normal';
    const isThreeMovesPlaying = Boolean(calcPreview);
    const handleThreeMovesClick = onPlayThreeMoves || onAnimateTopThreeFromTree;
    const showThreeMovesBtn =
      Boolean(handleThreeMovesClick) &&
      (forceAllowThreeMoves || proposeThreeMoves || isThreeMovesPlaying);

    return (
      <div className="flex flex-wrap items-center gap-1 md:gap-2">
        <button
          type="button"
          onClick={onExportTreeJpg}
          aria-pressed={frontalTreeViewOpen}
          title={
            frontalTreeViewOpen
              ? 'Close thinking lines view and return to 3D board'
              : 'Show frontal top-view thinking lines on pure black'
          }
          className={`inline-flex items-center gap-0.5 md:gap-1.5 ${padClass} rounded md:rounded-md border font-semibold transition-colors whitespace-nowrap cursor-pointer ${
            frontalTreeViewOpen
              ? 'bg-[#241b0c] hover:bg-[#312510] border-[#f3cf83]/85 text-[#fde68a]'
              : 'bg-black hover:bg-[#141a25] border-[#d6ae63]/55 text-[#f3cf83]'
          }`}
        >
          <Maximize2 className="w-2 h-2 md:w-3.5 md:h-3.5 text-[#f3cf83] shrink-0" />
          <span className="md:hidden">Lines</span>
          <span className="hidden md:inline">Thinking Lines</span>
        </button>

        {showThreeMovesBtn && handleThreeMovesClick && (
          <button
            type="button"
            onClick={handleThreeMovesClick}
            aria-pressed={isThreeMovesPlaying}
            title={
              isThreeMovesPlaying
                ? 'Stop 3D three-moves preview'
                : 'Watch Chess Angel play out the three candidate moves slowly on the 3D board'
            }
            className={`inline-flex items-center gap-0.5 md:gap-1.5 ${padClass} rounded md:rounded-md border font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              isThreeMovesPlaying
                ? 'bg-[#122232] hover:bg-[#182d42] border-[#38bdf8]/80 text-[#bae6fd]'
                : 'bg-black hover:bg-[#141a25] border-[#38bdf8]/50 text-[#bae6fd]'
            }`}
          >
            <Eye className="w-2 h-2 md:w-3.5 md:h-3.5 text-[#7dd3fc] shrink-0" />
            <span className="md:hidden">3 Moves</span>
            <span className="hidden md:inline">Three Moves</span>
          </button>
        )}
      </div>
    );
  };

  let modalCardContent: ReactNode;

  // 1. Live 3D Search-Tree Branch Walkthrough Card
  if (calcPreview) {
    const trialAccent =
      calcPreview.branchIndex === 1
        ? 'text-[#f4c45a]'
        : calcPreview.branchIndex === 2
          ? 'text-[#38bdf8]'
          : calcPreview.branchIndex === 3
            ? 'text-[#fb7185]'
            : 'text-[#f0d192]';
    const trialHeading =
      calcPreview.branchIndex > 0
        ? `Branch ${calcPreview.branchIndex}/${calcPreview.totalBranches}`
        : `${calcPreview.totalBranches} Branches`;
    const nextBranchNum = Math.min(calcPreview.totalBranches, calcPreview.branchIndex + 1);

    modalCardContent = (
      <div className="w-full rounded-md md:rounded-xl bg-black border border-[#d6ae63]/60 shadow-2xl px-1.5 py-1 md:px-4 md:py-3.5 pointer-events-auto">
        <div className="flex items-start justify-between gap-1 md:gap-3">
          <div className="min-w-0">
            <div className={`text-[8.5px] md:text-[11px] font-semibold leading-tight truncate ${trialAccent}`}>
              {trialHeading}
              {calcPreview.waitingForConfirm ? ' · Ready' : ' · Playing'}
            </div>
            <div className="font-mono-tabular text-[8.5px] md:text-xs text-[#f3f1ec] truncate mt-0.5">
              {calcPreview.pvSan.join(' → ')}
            </div>
          </div>

          <div className="flex items-center gap-0.5 md:gap-1.5 shrink-0">
            {soundEnabled && calcPreview.waitingForConfirm && (
              <button
                type="button"
                onClick={onReplayVoice}
                title="Replay voice"
                aria-label="Replay voice"
                className={`p-0.5 md:p-1.5 rounded transition-colors cursor-pointer ${
                  isSpeaking
                    ? 'text-[#f3cf83] bg-[#d6ae63]/15'
                    : 'text-[#9aa3b2] hover:text-[#f3f1ec] hover:bg-white/10'
                }`}
              >
                <Volume2 className="w-2.5 h-2.5 md:w-3.5 md:h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onStopCalculationPreview}
              className="inline-flex items-center gap-0.5 px-1 py-0.5 md:px-2.5 md:py-1.5 rounded bg-[#141820] hover:bg-[#1f2633] border border-white/15 text-[8px] md:text-xs font-medium text-[#e2e8f0] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Square className="w-2 h-2 md:w-3 md:h-3" />
              Stop
            </button>
          </div>
        </div>

        {calcPreview.waitingForConfirm && (
          <div className="mt-1 pt-1 md:mt-2.5 md:pt-2.5 border-t border-white/12">
            <p className="text-[8.5px] md:text-xs leading-[1.2] md:leading-relaxed max-h-[22px] md:max-h-none overflow-y-auto thin-scroll text-[#e6e1d6]">
              &ldquo;
              {message?.text ||
                'Have you seen and understood this branch? Click to confirm when you are ready for the next one.'}
              &rdquo;
            </p>
            <div className="mt-1 md:mt-2.5 flex flex-wrap items-center justify-between gap-1 md:gap-2">
              <button
                type="button"
                onClick={onConfirmNextBranch}
                className="inline-flex items-center gap-0.5 md:gap-1.5 px-1.5 py-0.5 md:px-3 md:py-1.5 rounded bg-[#d6ae63] hover:bg-[#e3be78] text-[#111419] text-[8.5px] md:text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
              >
                <Check className="w-2 h-2 md:w-3.5 md:h-3.5" />
                Next #{nextBranchNum}
              </button>
              <span className="hidden md:inline text-[11px] text-[#9aa3b2] whitespace-nowrap">
                or click on the board
              </span>
            </div>
          </div>
        )}

        <div className="mt-1 pt-1 md:mt-2.5 md:pt-2.5 border-t border-white/10">
          {renderThinkingAndThreeMoves(true, true)}
        </div>
      </div>
    );
  } else if (treeBrowser) {
    // 2. Full Search-Tree Calm Simulation Browser Card
    const allSims = treeBrowser.simulations;
    const bestOverall = allSims[0];
    const visibleSims = treeBrowser.onlyTopThree ? allSims.slice(0, 3) : allSims;
    const activeIdx =
      treeBrowser.selectedIndex !== null && treeBrowser.selectedIndex < visibleSims.length
        ? treeBrowser.selectedIndex
        : null;
    const activeSim = activeIdx !== null ? visibleSims[activeIdx] : null;
    const activeColor =
      activeSim && activeIdx !== null
        ? getSimulationColorSpec(activeIdx, activeSim, bestOverall, treeBrowser.moverColor)
        : null;

    const spokenText =
      message?.text ||
      'Browse calmly through all my simulations one by one before we go on, or click below to see only my three best evaluations.';

    modalCardContent = (
      <div className="w-full max-h-[104px] md:max-h-[calc(100dvh-285px)] [@media(max-height:540px)]:max-h-[92px] overflow-y-auto thin-scroll rounded-md md:rounded-xl bg-black border border-[#d6ae63]/70 shadow-2xl p-1.5 md:p-4 pointer-events-auto">
        <div className="flex items-center justify-between gap-1 md:gap-2">
          <div className="flex items-center gap-1 md:gap-2 min-w-0">
            <span className="w-3.5 h-3.5 md:w-6 md:h-6 rounded md:rounded-md bg-black border border-[#38bdf8]/60 inline-flex items-center justify-center shrink-0">
              <GitBranch className="w-2 h-2 md:w-3.5 md:h-3.5 text-[#7dd3fc]" />
            </span>
            <h2
              id="chess-angel-tree-modal-title"
              className="font-semibold text-[9px] md:text-sm text-[#f7f1e5] whitespace-nowrap shrink-0"
            >
              Angel
            </h2>
            <span className="text-white/30 text-[8px] md:text-xs" aria-hidden="true">
              ·
            </span>
            <span className="font-mono-tabular text-[8px] md:text-[11px] font-medium text-[#7dd3fc] truncate">
              {treeBrowser.onlyTopThree
                ? '3 BEST'
                : `ALL ${allSims.length}`}
            </span>
          </div>

          <div className="flex items-center gap-0.5 md:gap-1 shrink-0">
            {soundEnabled && message && (
              <button
                type="button"
                onClick={onReplayVoice}
                title={isSpeaking ? 'Speaking — click to replay' : 'Replay voice'}
                aria-label="Replay voice"
                className={`p-0.5 md:p-1.5 rounded transition-colors cursor-pointer ${
                  isSpeaking
                    ? 'text-[#f3cf83] bg-[#d6ae63]/15'
                    : 'text-[#9aa3b2] hover:text-[#f3f1ec] hover:bg-white/10'
                }`}
              >
                <Volume2 className="w-2.5 h-2.5 md:w-3.5 md:h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onExportTreeJpg}
              title={
                frontalTreeViewOpen
                  ? 'Close frontal top-view thinking tree lines'
                  : 'Extract frontal top-view thinking tree lines on pure black'
              }
              aria-label="Show frontal top-view thinking tree lines on pure black"
              aria-pressed={frontalTreeViewOpen}
              className={`p-0.5 md:p-1.5 rounded transition-colors cursor-pointer ${
                frontalTreeViewOpen
                  ? 'text-[#f3cf83] bg-[#d6ae63]/20 ring-1 ring-[#d6ae63]/50'
                  : 'text-[#9aa3b2] hover:text-[#f3cf83] hover:bg-white/10'
              }`}
            >
              <Maximize2 className="w-2.5 h-2.5 md:w-3.5 md:h-3.5" />
            </button>
          </div>
        </div>

        <p className="hidden md:block mt-2.5 text-xs leading-relaxed text-[#f2ede2]">
          &ldquo;{spokenText}&rdquo;
        </p>

        {allSims.length > 0 && (
          <div className="mt-1 md:mt-3 flex items-center gap-1 md:gap-2">
            <button
              type="button"
              onClick={onToggleTreeOnlyTopThree}
              aria-pressed={treeBrowser.onlyTopThree}
              className={`w-full inline-flex items-center justify-center gap-1 md:gap-1.5 px-1.5 py-0.5 md:px-3 md:py-2 rounded md:rounded-md border text-[8px] md:text-xs font-semibold transition-colors cursor-pointer ${
                treeBrowser.onlyTopThree
                  ? 'bg-[#122232] border-[#38bdf8]/80 text-[#bae6fd]'
                  : 'bg-black hover:bg-[#141923] border-[#d6ae63]/65 text-[#f3cf83]'
              }`}
            >
              <Sparkles className="w-2 h-2 md:w-3.5 md:h-3.5 shrink-0" />
              {treeBrowser.onlyTopThree
                ? `3 Best · All ${allSims.length}`
                : 'Only 3 Best'}
            </button>
          </div>
        )}

        {visibleSims.length > 0 && (
          <div className="mt-1 pt-1 md:mt-3 md:pt-3 border-t border-white/12">
            <div className="flex items-center justify-between gap-1 md:gap-2">
              <button
                type="button"
                onClick={() => onStepTreeSimulation(-1)}
                title="Previous simulation (Left Arrow)"
                className="inline-flex items-center gap-0.5 md:gap-1 px-1 py-0.5 md:px-2.5 md:py-1 rounded bg-black hover:bg-[#151b26] border border-white/18 text-[8px] md:text-xs font-medium text-[#e2e8f0] cursor-pointer whitespace-nowrap"
              >
                <ChevronLeft className="w-2.5 h-2.5 md:w-3.5 md:h-3.5" />
                Prev
              </button>

              <div className="flex items-center gap-1 min-w-0 text-[8px] md:text-[11px] font-mono-tabular text-[#cbd5e1]">
                <span className="truncate">
                  {activeIdx !== null
                    ? `${activeIdx + 1}/${visibleSims.length}`
                    : `${visibleSims.length}`}
                </span>
                {activeIdx !== null && (
                  <button
                    type="button"
                    onClick={() => onSelectTreeSimulation(null)}
                    className="px-1 py-0 rounded border border-white/16 text-[7.5px] md:text-[10px] text-[#9aa3b2] hover:text-white cursor-pointer"
                  >
                    All
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => onStepTreeSimulation(1)}
                title="Next simulation (Right Arrow)"
                className="inline-flex items-center gap-0.5 md:gap-1 px-1 py-0.5 md:px-2.5 md:py-1 rounded bg-black hover:bg-[#151b26] border border-white/18 text-[8px] md:text-xs font-medium text-[#e2e8f0] cursor-pointer whitespace-nowrap"
              >
                Next
                <ChevronRight className="w-2.5 h-2.5 md:w-3.5 md:h-3.5" />
              </button>
            </div>

            {activeSim && activeColor && activeIdx !== null ? (
              <div
                className={`mt-1 md:mt-2.5 rounded md:rounded-lg bg-black border ${activeColor.borderClass} px-1.5 py-1 md:px-3 md:py-2.5`}
              >
                <div className="flex items-center justify-between gap-1 md:gap-2">
                  <div className="flex items-center gap-1 min-w-0">
                    <span
                      className={`w-1.5 h-1.5 md:w-2.5 md:h-2.5 rounded-full shrink-0 ${activeColor.dotBgClass}`}
                    />
                    <span className={`text-[8.5px] md:text-xs font-semibold ${activeColor.textClass}`}>
                      #{activeIdx + 1} {activeSim.pvSan[0] || activeSim.bestMoveUci}
                    </span>
                    <span className="hidden md:inline text-[10px] px-1.5 py-0.5 rounded border border-white/14 text-[#cbd5e1]">
                      {activeColor.badgeLabel}
                    </span>
                  </div>
                  <span
                    className={`font-mono-tabular text-[8.5px] md:text-xs font-semibold ${activeColor.textClass}`}
                  >
                    {formatEvalLabel(activeSim.scoreCp, activeSim.mateIn)}
                  </span>
                </div>
                <div className="mt-0.5 font-mono-tabular text-[8px] md:text-[11px] text-[#d8dee9] truncate">
                  {activeSim.pvSan.slice(0, 5).join(' → ') || activeSim.bestMoveUci}
                </div>
              </div>
            ) : treeBrowser.onlyTopThree ? (
              <div className="mt-1 md:mt-2.5 flex flex-col gap-0.5 md:gap-1.5">
                {visibleSims.map((sim, idx) => {
                  const spec = getSimulationColorSpec(
                    idx,
                    sim,
                    bestOverall,
                    treeBrowser.moverColor,
                  );
                  return (
                    <button
                      key={sim.bestMoveUci + idx}
                      type="button"
                      onClick={() => onSelectTreeSimulation(idx)}
                      className={`w-full flex items-center justify-between gap-1 px-1.5 py-0.5 md:px-2.5 md:py-1.5 rounded bg-black hover:bg-[#121722] border ${spec.borderClass} text-left cursor-pointer transition-colors`}
                    >
                      <div className="flex items-center gap-1 min-w-0">
                        <span className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full shrink-0 ${spec.dotBgClass}`} />
                        <span className={`text-[8.5px] md:text-xs font-semibold shrink-0 ${spec.textClass}`}>
                          #{idx + 1} {sim.pvSan[0] || sim.bestMoveUci}
                        </span>
                        <span className="font-mono-tabular text-[8px] md:text-[11px] text-[#9aa3b2] truncate">
                          {sim.pvSan.slice(1, 4).join(' → ')}
                        </span>
                      </div>
                      <span
                        className={`font-mono-tabular text-[8.5px] md:text-xs font-semibold shrink-0 ${spec.textClass}`}
                      >
                        {formatEvalLabel(sim.scoreCp, sim.mateIn)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="hidden md:block mt-2 px-2.5 py-2 rounded bg-black border border-white/12 text-[11px] text-[#aeb7c6]">
                Use <span className="text-[#f3f1ec] font-medium">Prev / Next</span>, click any
                colored evaluation below, or click a square on the 3D board to inspect each
                simulation calmly.
              </div>
            )}

            <div className="mt-1 md:mt-2.5 max-h-10 md:max-h-20 overflow-y-auto thin-scroll flex flex-wrap gap-0.5 md:gap-1 pr-0.5">
              {visibleSims.map((sim, idx) => {
                const spec = getSimulationColorSpec(
                  idx,
                  sim,
                  bestOverall,
                  treeBrowser.moverColor,
                );
                const isSelected = activeIdx === idx;
                return (
                  <button
                    key={sim.bestMoveUci + idx}
                    type="button"
                    onClick={() => onSelectTreeSimulation(isSelected ? null : idx)}
                    title={`#${idx + 1} ${sim.pvSan.join(' ')} (${formatEvalLabel(sim.scoreCp, sim.mateIn)})`}
                    className={`inline-flex items-center gap-0.5 px-1 py-0 md:px-2 md:py-0.5 rounded text-[8px] md:text-[11px] font-mono-tabular border transition-colors cursor-pointer ${
                      isSelected
                        ? `bg-[#182030] ${spec.borderClass} text-white font-semibold`
                        : 'bg-black hover:bg-[#131824] border-white/14 text-[#cbd5e1]'
                    }`}
                  >
                    <span className={`w-1 h-1 md:w-1.5 md:h-1.5 rounded-full shrink-0 ${spec.dotBgClass}`} />
                    <span>{sim.pvSan[0] || sim.bestMoveUci}</span>
                    <span className={spec.textClass}>
                      {formatEvalLabel(sim.scoreCp, sim.mateIn)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-1 pt-1 md:mt-3.5 md:pt-2.5 border-t border-white/12 flex flex-wrap items-center justify-between gap-1 md:gap-2">
          <button
            type="button"
            onClick={onContinueFromTree}
            className="inline-flex items-center gap-0.5 md:gap-1.5 px-1.5 py-0.5 md:px-4 md:py-2 rounded md:rounded-md bg-[#d6ae63] hover:bg-[#e3be78] text-[#111419] text-[8px] md:text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer shadow-sm"
          >
            <Play className="w-2 h-2 md:w-3.5 md:h-3.5" />
            <span className="md:hidden">
              {treeBrowser.hasPendingBotMove ? 'Play Move' : 'Close'}
            </span>
            <span className="hidden md:inline">
              {treeBrowser.hasPendingBotMove ? 'Continue · Play Move' : 'Done · Close Tree'}
            </span>
          </button>

          {renderThinkingAndThreeMoves(true, true)}
        </div>
      </div>
    );
  } else if (!message || angelVoice === 'off') {
    // 3. Permanent Calm Listening Card (Micro 2-line pill-card on mobile; full card on md+)
    modalCardContent = (
      <div className="w-full rounded-md md:rounded-xl bg-black border border-[#d6ae63]/65 shadow-2xl px-1.5 py-1 md:p-4 pointer-events-auto">
        <div className="flex items-center justify-between gap-1 md:gap-2">
          <div className="flex items-center gap-1 md:gap-2 min-w-0 text-[8.5px] md:text-xs leading-none">
            <span className="font-semibold text-[#f7f1e5] whitespace-nowrap shrink-0">
              <span className="md:hidden">Angel</span>
              <span className="hidden md:inline">Chess Angel</span>
            </span>
            <span className="text-white/30" aria-hidden="true">
              ·
            </span>
            <span className="font-mono-tabular text-[8px] md:text-[11px] font-medium text-[#d9be95] truncate">
              LISTENING
            </span>
          </div>

          <div className="flex items-center gap-0.5 md:gap-1.5 shrink-0">
            {onOpenVideoStudio && (
              <button
                type="button"
                onClick={onOpenVideoStudio}
                title="Assign Chess Angel .mp4 videos per saying or group (auto-silences video sound)"
                className="inline-flex items-center gap-0.5 md:gap-1 px-1 py-0.5 md:px-2 md:py-1 rounded bg-black hover:bg-[#1a160f] border border-[#d6ae63]/45 text-[8px] md:text-[11px] font-medium text-[#f3cf83] whitespace-nowrap cursor-pointer"
              >
                <Film className="w-2.5 h-2.5 md:w-3 md:h-3 text-[#f3cf83]" />
                <span className="hidden md:inline">Videos</span>
              </button>
            )}
          </div>
        </div>

        <p className="hidden md:block mt-2 text-xs leading-relaxed text-[#e6e1d6]">
          &ldquo;Watching the board quietly — take your time on your next move.&rdquo;
        </p>

        <div className="mt-1 pt-1 md:mt-2.5 md:pt-2.5 border-t border-white/10">
          {renderThinkingAndThreeMoves(false)}
        </div>
      </div>
    );
  } else {
    // 4. Permanent Chess Angel Framed Black Modal Card (Micro-compact on mobile; Undo appears ONLY when she proposes Undo)
    const tagColor = TONE_TAG_COLOR[message.tone];
    const needsAudioGesture = voiceState === 'awaiting-gesture' && soundEnabled;
    const summaryText =
      message.mathSummary || (action?.kind === 'undo-offer' ? action.reasonNote : undefined);

    modalCardContent = (
      <div className="w-full rounded-md md:rounded-xl bg-black border border-[#d6ae63]/65 shadow-2xl px-1.5 py-1 md:p-4 pointer-events-auto">
        <div className="flex items-center justify-between gap-1 md:gap-2">
          <div className="flex items-center gap-1 md:gap-2 min-w-0 text-[8.5px] md:text-xs leading-none">
            <span className="font-semibold text-[#f7f1e5] whitespace-nowrap shrink-0">
              <span className="md:hidden">Angel</span>
              <span className="hidden md:inline">{message.speaker}</span>
            </span>
            <span className="text-white/30" aria-hidden="true">
              ·
            </span>
            <span className={`font-mono-tabular text-[8px] md:text-[11px] font-medium truncate ${tagColor}`}>
              {message.tag}
            </span>
          </div>

          <div className="flex items-center gap-0.5 md:gap-1.5 shrink-0">
            {soundEnabled && (
              <button
                type="button"
                onClick={onReplayVoice}
                title={isSpeaking ? 'Speaking — click to replay' : 'Hear Chess Angel'}
                aria-label="Replay voice"
                className={`p-0.5 md:p-1 rounded transition-colors cursor-pointer ${
                  isSpeaking
                    ? 'text-[#f3cf83] bg-[#d6ae63]/15'
                    : 'text-[#9aa3b2] hover:text-[#f3f1ec] hover:bg-white/10'
                }`}
              >
                <Volume2 className="w-2.5 h-2.5 md:w-3.5 md:h-3.5" />
              </button>
            )}
            {onOpenVideoStudio && (
              <button
                type="button"
                onClick={onOpenVideoStudio}
                title="Assign Chess Angel .mp4 videos per saying or group (auto-silences video sound)"
                className="inline-flex items-center gap-0.5 md:gap-1 px-1 py-0.5 md:px-2 md:py-1 rounded bg-black hover:bg-[#1a160f] border border-[#d6ae63]/45 text-[8px] md:text-[11px] font-medium text-[#f3cf83] whitespace-nowrap cursor-pointer"
              >
                <Film className="w-2.5 h-2.5 md:w-3 md:h-3 text-[#f3cf83]" />
                <span className="hidden md:inline">Videos</span>
              </button>
            )}
            {action?.kind === 'undo-offer' && (
              <button
                type="button"
                onClick={() => onUndoAndShowBetter(action.alternatives)}
                title="Undo your last move and see a stronger alternative"
                className="inline-flex items-center gap-0.5 md:gap-1 px-1 py-0.5 md:px-2.5 md:py-1 rounded bg-[#d6ae63] hover:bg-[#e3be78] text-[#111419] text-[8px] md:text-[11px] font-semibold leading-none transition-colors whitespace-nowrap cursor-pointer shadow-sm"
              >
                <RotateCcw className="w-2 h-2 md:w-3 md:h-3" />
                Undo
              </button>
            )}
          </div>
        </div>

        {summaryText && (
          <div className="hidden md:block mt-1.5 text-[11px] font-mono-tabular text-[#aeb7c6] truncate">
            {summaryText}
          </div>
        )}

        <p className="mt-0.5 md:mt-2 text-[8.5px] md:text-xs leading-[1.2] md:leading-relaxed max-h-[21px] md:max-h-none overflow-y-auto thin-scroll text-[#e6e1d6]">
          &ldquo;{message.text}&rdquo;
        </p>

        {needsAudioGesture && !action && (
          <div className="mt-1 md:mt-2.5 flex flex-wrap items-center gap-1 md:gap-2">
            <button
              type="button"
              onClick={onReplayVoice}
              className="inline-flex items-center gap-0.5 md:gap-1.5 px-1.5 py-0.5 md:px-3 md:py-1.5 rounded bg-[#d6ae63] hover:bg-[#e3be78] text-[#111419] text-[8px] md:text-xs font-semibold leading-none transition-colors whitespace-nowrap cursor-pointer"
            >
              <Volume2 className="w-2 h-2 md:w-3.5 md:h-3.5" />
              Play Voice
            </button>
          </div>
        )}

        {proposeThreeMoves && action?.kind === 'calc-preview' && (
          <div className="mt-1 md:mt-2.5 flex flex-wrap items-center gap-1 md:gap-2">
            <button
              type="button"
              onClick={() => onWatchCalculatedLines(action.report)}
              className="inline-flex items-center gap-0.5 md:gap-1.5 px-1.5 py-0.5 md:px-3 md:py-1.5 rounded bg-[#d6ae63] hover:bg-[#e3be78] text-[#111419] text-[8px] md:text-xs font-semibold leading-none transition-colors whitespace-nowrap cursor-pointer"
            >
              <Play className="w-2 h-2 md:w-3.5 md:h-3.5" />
              {Math.min(3, action.report.triedLines.length)} Lines
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="px-1 py-0.5 md:px-2.5 md:py-1.5 rounded bg-black hover:bg-[#151a24] border border-white/14 text-[8px] md:text-xs leading-none text-[#cbd2df] whitespace-nowrap cursor-pointer"
            >
              Skip
            </button>
          </div>
        )}

        {action?.kind === 'hint-offer' && (
          <div className="mt-1 md:mt-2.5 flex flex-wrap items-center gap-1 md:gap-2">
            <button
              type="button"
              onClick={() => onAcceptHint(action.bestMoveUci, action.bestMoveSan)}
              className="inline-flex items-center gap-0.5 md:gap-1.5 px-1.5 py-0.5 md:px-3 md:py-1.5 rounded bg-[#d6ae63] hover:bg-[#e3be78] text-[#111419] text-[8px] md:text-xs font-semibold leading-none transition-colors whitespace-nowrap cursor-pointer"
            >
              <Lightbulb className="w-2 h-2 md:w-3.5 md:h-3.5" />
              Hint ({action.bestMoveSan})
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="px-1 py-0.5 md:px-2.5 md:py-1.5 rounded bg-black hover:bg-[#151a24] border border-white/14 text-[8px] md:text-xs leading-none text-[#cbd2df] whitespace-nowrap cursor-pointer"
            >
              Skip
            </button>
          </div>
        )}

        <div className="mt-1 pt-1 md:mt-2.5 md:pt-2.5 border-t border-white/10">
          {renderThinkingAndThreeMoves(false)}
        </div>
      </div>
    );
  }

  // Single unified persistent `<aside>` so `<ChessAngelPortraitVideo>` NEVER unmounts across any modal state.
  // On mobile devices (< 768px and landscape phones <= 540px tall), the portrait and modal shrink into a micro
  // top-right unit (~164px wide, ~38-60px tall modal) so the 3D chess board is completely clear below.
  return (
    <aside
      aria-live="polite"
      className={`fixed top-5 right-1 md:top-9 md:right-3 lg:top-10 lg:right-4 [@media(max-height:540px)]:top-4 [@media(max-height:540px)]:right-1 ${
        isElevatedZ ? 'z-40' : 'z-30'
      } ${
        isWideCard
          ? 'w-[min(190px,calc(100vw-0.5rem))] md:w-[344px] lg:w-[385px] [@media(max-height:540px)]:w-[178px]'
          : 'w-[min(164px,calc(100vw-0.5rem))] md:w-[310px] lg:w-[365px] [@media(max-height:540px)]:w-[152px]'
      } flex flex-col items-center pointer-events-none transition-[width] duration-200`}
    >
      <ChessAngelPortraitVideo
        clipId={message?.clipId}
        speechText={message?.text}
        forcedIdleUrl={forcedIdleUrl}
        isSpeaking={isSpeaking}
        soundEnabled={soundEnabled}
        angelVoice={angelVoice}
        triggerKey={triggerKey}
        compact={isCompactPortrait}
        hasCardBelow
        onClick={canClickPortraitToReplay ? onReplayVoice : undefined}
        title={canClickPortraitToReplay ? 'Click to replay Chess Angel voice' : 'Chess Angel'}
      />

      {modalCardContent}
    </aside>
  );
}
