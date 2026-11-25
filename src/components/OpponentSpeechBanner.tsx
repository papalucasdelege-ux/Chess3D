import { useEffect, useRef, useState, type MutableRefObject, type ReactNode, type SyntheticEvent } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
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
import { DanceWithStarsAura, type ForcedIdleVideoClock } from './DanceWithStarsAura';
import {
  ANGEL_DEFAULT_SPEAKING_VIDEO_SRC,
  ANGEL_IDLE_LISTENING_VIDEO_SRC,
  VOICE_CLIP_DURATION_SEC,
  getAngelIdleVideoPool,
  isUtterancePlayToEnd,
  isVideoUrlPlayToEnd,
  peekNextAngelIdleVideo,
  pickNextAngelIdleVideo,
  resolveActiveEscapeCues,
  resolveAngelIdleVideo,
  resolveAngelSpeakingVideo,
  resolveDefaultSpeakingLipVideo,
  shouldExtendWithDefaultLipSync,
  subscribeAngelVideoOverrides,
  warmAngelVideoUrlInCache,
  type AngelEscapeCueKey,
  type ResolvedActiveEscapeCue,
} from '../chess/angelPortraitVideos';
import { stripAssetQuery, withAssetBuildVersion } from '../chess/assetVersion';
import {
  computeFallbackUpperRightVoid,
  isTouchTabletHardware,
  selectAngelVoidSizeTier,
  selectMatchedAngelTierIndex,
  type UpperRightVoidSpec,
} from '../utils/deviceLayout';
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
  forcedIdleCueAtSec?: number | null;
  onForcedIdleCueReached?: () => void;
  forcedIdleClockRef?: MutableRefObject<ForcedIdleVideoClock>;
  portraitCanvasRef?: MutableRefObject<HTMLCanvasElement | null>;
  isSpeaking: boolean;
  soundEnabled: boolean;
  angelVoice: AngelVoiceMode;
  triggerKey: string;
  portraitWidthClass: string;
  hasCardBelow: boolean;
  powerSaveMode?: boolean;
  onClick?: () => void;
  title?: string;
}

const IS_MOBILE_DEVICE =
  (typeof navigator !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent)) ||
  isTouchTabletHardware();

// Distinguish compact phones (< 600px shortest side) from Android tablets / iPads so tablets get crisp 560x752 video
const IS_COMPACT_PHONE =
  IS_MOBILE_DEVICE &&
  !isTouchTabletHardware() &&
  typeof window !== 'undefined' &&
  Math.min(window.innerWidth || 800, window.innerHeight || 800) < 600;

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
  if (!video.playsInline) video.playsInline = true;
  if (!video.hasAttribute('muted')) video.setAttribute('muted', '');
  if (!video.hasAttribute('playsinline')) video.setAttribute('playsinline', '');
  if (video.getAttribute('webkit-playsinline') !== 'true') {
    video.setAttribute('webkit-playsinline', 'true');
  }
  if (video.getAttribute('x5-playsinline') !== 'true') {
    video.setAttribute('x5-playsinline', 'true');
  }
  if (video.getAttribute('x5-video-player-type') !== 'h5-page') {
    video.setAttribute('x5-video-player-type', 'h5-page');
  }
  if (video.getAttribute('t7-video-player-type') !== 'inline') {
    video.setAttribute('t7-video-player-type', 'inline');
  }

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

const PORTRAIT_CANVAS_W = IS_COMPACT_PHONE ? 360 : 560;
const PORTRAIT_CANVAS_H = IS_COMPACT_PHONE ? 480 : 752;
const PROBE_SIZE = 32;
const BLEND_TO_IDLE_MS = 1650;
const BLEND_TO_SPEAK_MS = 780;
const ESCAPE_BLEND_IN_MS = 260;
const ESCAPE_BLEND_OUT_MS = 520;
const PRE_END_MORPH_LEAD_SEC = 0.28;
const ESCAPE_PRE_END_LEAD_SEC = 0.52;
const PRE_EOS_STOP_SEC = 0.03;
const POWER_SAVE_PORTRAIT_INTERVAL_MS = 66; // ~15 FPS compositing cap in Power Save Mode

/** Minimum quiet pause after Chess Angel finishes any game speech before showing an idle video */
const POST_SPEECH_MIN_IDLE_WAIT_MS = 7_500;

/** Minimum quiet pause between the end of one idle video and the start of the next idle video */
const MIN_BETWEEN_IDLE_VIDEOS_MS = 11_000;

/** Calm stillness window (11.5s–18s) between idle listening videos */
function nextCalmIdlePauseMs(): number {
  return 11_500 + Math.floor(Math.random() * 6_500);
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

/** Deduplicated & throttled non-throwing HTMLVideoElement.play() helper for Android, Windows Chrome, Safari & Firefox */
const inFlightVideoPlays = new WeakMap<HTMLVideoElement, Promise<void>>();
const lastVideoPlayAttemptMs = new WeakMap<HTMLVideoElement, number>();
function safePlayVideo(video: HTMLVideoElement | null, forceImmediate = false): void {
  if (!video) return;
  silenceVideoElement(video);
  if (!video.paused) return;
  if (video.ended) return;
  if (video.error || video.networkState === 3) return;
  if (inFlightVideoPlays.has(video)) return;
  const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (!forceImmediate) {
    const prevAttempt = lastVideoPlayAttemptMs.get(video) || 0;
    // Never spam play() 60x/sec during Android HAVE_METADATA preroll — doing so aborts MediaCodec startup!
    if (nowMs - prevAttempt < 320) return;
  }
  lastVideoPlayAttemptMs.set(video, nowMs);
  try {
    const p = video.play();
    if (p && typeof p.then === 'function') {
      const tracked = p
        .catch((err: unknown) => {
          silenceVideoElement(video);
          const errName =
            err && typeof err === 'object' && 'name' in err
              ? String((err as { name?: unknown }).name)
              : '';
          // On Windows Chrome & Android Chrome, an overlapping load()/seek can throw AbortError:
          // schedule one clean retry after 140ms so playback never silently dies.
          if (errName === 'AbortError') {
            window.setTimeout(() => {
              if (video.paused && !video.ended && !video.error && video.networkState !== 3) {
                safePlayVideo(video, true);
              }
            }, 140);
          }
        })
        .finally(() => {
          if (inFlightVideoPlays.get(video) === tracked) {
            inFlightVideoPlays.delete(video);
          }
        });
      inFlightVideoPlays.set(video, tracked);
    }
  } catch {
    // Ignore synchronous play() rejections prior to user activation
  }
}

function revokeObjectUrlSafely(url: string | null): void {
  if (!url) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // ignore
  }
}

function ChessAngelPortraitVideo({
  clipId,
  speechText,
  forcedIdleUrl,
  forcedIdleCueAtSec = null,
  onForcedIdleCueReached,
  forcedIdleClockRef,
  portraitCanvasRef,
  isSpeaking,
  soundEnabled,
  angelVoice,
  triggerKey,
  portraitWidthClass,
  hasCardBelow,
  powerSaveMode = false,
  onClick,
  title,
}: ChessAngelPortraitVideoProps) {
  const internalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasRef = portraitCanvasRef || internalCanvasRef;
  const video0Ref = useRef<HTMLVideoElement | null>(null);
  const video1Ref = useRef<HTMLVideoElement | null>(null);
  const escapeVideoRef = useRef<HTMLVideoElement | null>(null);

  // Imperative non-reactive video compositor buffers (strict React decoupling)
  const slotCanvasesRef = useRef<[HTMLCanvasElement, HTMLCanvasElement] | null>(null);
  const escapeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const escapePrevCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const probeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const probeCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const outgoingFallbackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const masterCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const activeSlotRef = useRef<0 | 1>(0);
  const outgoingSlotRef = useRef<0 | 1>(1);
  const activeRoleRef = useRef<'speaking' | 'idle'>('speaking');
  const autoMorphTriggeredRef = useRef<boolean>(false);

  const slotUrlRef = useRef<[string, string]>(['', '']);
  const slotBlobUrlRef = useRef<[string | null, string | null]>([null, null]);
  const slotAutoPlayRef = useRef<[boolean, boolean]>([false, false]);
  const slotPrimingStillRef = useRef<[boolean, boolean]>([false, false]);
  const slotRetryKeyRef = useRef<[string, string]>(['', '']);
  const slotHasFrameRef = useRef<[boolean, boolean]>([false, false]);
  const slotPeakLumaRef = useRef<[number, number]>([0, 0]);
  const slotLastLumaRef = useRef<[number, number]>([0, 0]);
  const slotSafeEndedRef = useRef<[boolean, boolean]>([false, false]);
  const slotFallbackUsedRef = useRef<[boolean, boolean]>([false, false]);
  const slotLastTimeRef = useRef<[number, number]>([-1, -1]);
  const slotLastProgressMsRef = useRef<[number, number]>([0, 0]);

  // Dedicated 3rd-layer Special Escape Overlay ("you" finger-point & "push a button" below)
  const escapeUrlRef = useRef<string>('');
  const escapeBlobUrlRef = useRef<string | null>(null);
  const escapeRetryKeyRef = useRef<string>('');
  const escapeAutoPlayRef = useRef<boolean>(false);
  const escapeTargetSeekSecRef = useRef<number>(0);
  const escapeLaunchSeekSecRef = useRef<number>(0);
  const escapeSeekAppliedRef = useRef<boolean>(false);
  const escapeHasFrameRef = useRef<boolean>(false);
  const escapePeakLumaRef = useRef<number>(0);
  const escapeLastLumaRef = useRef<number>(0);
  const escapeSafeEndedRef = useRef<boolean>(false);
  const escapePhaseRef = useRef<'inactive' | 'entering' | 'playing' | 'exiting'>('inactive');
  const activeEscapeCueKeyRef = useRef<AngelEscapeCueKey | null>(null);
  const activeEscapeSpokenWordSecRef = useRef<number>(0);
  const escapeWaitingFrameRef = useRef<boolean>(false);
  const escapeWaitStartMsRef = useRef<number>(0);
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
  const incomingWaitStartMsRef = useRef<number>(0);
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
  const hasDeliveredSpeechRef = useRef<boolean>(false);
  const lastSpeechEndedAtMsRef = useRef<number>(0);
  const lastIdleEndedAtMsRef = useRef<number>(0);
  const idleClipCurrentlyPlayingRef = useRef<boolean>(false);
  const prevSpeakingRef = useRef<boolean>(false);
  const speechObservedForTriggerRef = useRef<boolean>(false);
  const speakingFinishedForTriggerRef = useRef<boolean>(false);
  const isSpeakingLiveRef = useRef<boolean>(isSpeaking);
  const soundEnabledLiveRef = useRef<boolean>(soundEnabled);
  const angelVoiceLiveRef = useRef<AngelVoiceMode>(angelVoice);
  const powerSaveModeLiveRef = useRef<boolean>(powerSaveMode);
  const lastPowerSaveDrawMsRef = useRef<number>(0);
  const clipIdLiveRef = useRef<VoiceClipId | null | undefined>(clipId);
  const activeSlotClipIdRef = useRef<VoiceClipId | null | undefined>(clipId);
  const speechTextLiveRef = useRef<string | null | undefined>(speechText);
  const forcedIdleUrlLiveRef = useRef<string | null | undefined>(forcedIdleUrl);
  const forcedIdleCueAtSecLiveRef = useRef<number | null | undefined>(forcedIdleCueAtSec);
  const onForcedIdleCueReachedLiveRef = useRef<(() => void) | undefined>(onForcedIdleCueReached);
  const forcedIdleCueFiredForTriggerRef = useRef<string>('');
  const forcedIdleObservedNearStartRef = useRef<boolean>(false);
  const isInExtendedLipSyncRef = useRef<boolean>(false);
  powerSaveModeLiveRef.current = powerSaveMode;
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
  forcedIdleUrlLiveRef.current = forcedIdleUrl;
  forcedIdleCueAtSecLiveRef.current = forcedIdleCueAtSec;
  onForcedIdleCueReachedLiveRef.current = onForcedIdleCueReached;

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
   * Lightweight 32x32 luminance probe invoked ONLY during the initial 90ms (uninitialized black-frame guard)
   * and final 90ms (hardware EOF black-flush guard) — zero CPU readback during the middle 98% of playback!
   * Full-frame #000000 backdrop matching is handled on the GPU compositor via CSS contrast/brightness + server LUT.
   */
  const probeBoundaryLuminance = (source: HTMLVideoElement | HTMLCanvasElement): number => {
    try {
      ensureBuffers();
      const pctx = probeCtxRef.current;
      if (!pctx) return 100;

      pctx.clearRect(0, 0, PROBE_SIZE, PROBE_SIZE);
      pctx.drawImage(source, 0, 0, PROBE_SIZE, PROBE_SIZE);
      const fullProbe = pctx.getImageData(0, 0, PROBE_SIZE, PROBE_SIZE).data;

      let lumaSum = 0;
      let lumaCount = 0;
      for (let y = 3; y < 29; y++) {
        for (let x = 7; x < 25; x++) {
          const idx = (y * PROBE_SIZE + x) * 4;
          lumaSum += 0.299 * fullProbe[idx] + 0.587 * fullProbe[idx + 1] + 0.114 * fullProbe[idx + 2];
          lumaCount++;
        }
      }
      return lumaCount > 0 ? lumaSum / lumaCount : 0;
    } catch {
      return 100;
    }
  };

  /**
   * Draws the latest hardware-decoded frame of `slot` directly into `slotCanvasesRef.current[slot]`
   * with zero full-frame CPU readback so mobile GPUs never stall or freeze mid-animation.
   */
  const sampleSlotVideoFrame = (slot: 0 | 1): boolean => {
    ensureBuffers();
    const video = getVideoBySlot(slot);
    const slotCanvases = slotCanvasesRef.current;
    if (!video || !slotCanvases) return false;

    silenceVideoElement(video);
    if (video.loop) video.loop = false;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (video.readyState < 2 || vw <= 0 || vh <= 0 || video.ended || slotSafeEndedRef.current[slot]) {
      return slotHasFrameRef.current[slot];
    }

    const dur = video.duration;
    const cur = video.currentTime;
    const fullLength =
      slot === activeSlotRef.current &&
      activeRoleRef.current === 'speaking' &&
      !isInExtendedLipSyncRef.current
        ? isUtterancePlayToEnd(slotUrlRef.current[slot], activeSlotClipIdRef.current, undefined, dur)
        : isVideoUrlPlayToEnd(slotUrlRef.current[slot], undefined, dur);
    const eosGuardSec = fullLength ? 0.025 : PRE_EOS_STOP_SEC;
    const nearEos = Number.isFinite(dur) && dur > 0.4 && cur >= dur - eosGuardSec;
    const inInitialGuard = !slotHasFrameRef.current[slot] && cur < 0.09;
    const inFinalEofWindow = Number.isFinite(dur) && dur > 0.4 && cur >= dur - 0.09;

    if (!IS_MOBILE_DEVICE && (inInitialGuard || inFinalEofWindow)) {
      const luma = probeBoundaryLuminance(video);
      if (inInitialGuard && slotAutoPlayRef.current[slot] && luma < 2) {
        return false;
      }
      if (inFinalEofWindow && luma < 6 && slotLastLumaRef.current[slot] > 18) {
        video.pause();
        slotAutoPlayRef.current[slot] = false;
        slotSafeEndedRef.current[slot] = true;
        return slotHasFrameRef.current[slot];
      }
      if (luma > slotPeakLumaRef.current[slot]) {
        slotPeakLumaRef.current[slot] = luma;
      }
      slotLastLumaRef.current[slot] = luma;
    } else {
      slotLastLumaRef.current[slot] = Math.max(slotLastLumaRef.current[slot], 42);
    }

    const sctx = slotCanvases[slot].getContext('2d');
    if (sctx) {
      sctx.globalAlpha = 1;
      sctx.fillStyle = '#000000';
      sctx.fillRect(0, 0, PORTRAIT_CANVAS_W, PORTRAIT_CANVAS_H);
      drawCoverSource(sctx, video, vw, vh, PORTRAIT_CANVAS_W, PORTRAIT_CANVAS_H, 1);
      slotHasFrameRef.current[slot] = true;
      if (slotPrimingStillRef.current[slot] && !slotAutoPlayRef.current[slot]) {
        slotPrimingStillRef.current[slot] = false;
        video.pause();
      }
    }

    if (nearEos) {
      video.pause();
      slotAutoPlayRef.current[slot] = false;
      slotSafeEndedRef.current[slot] = true;
    }

    return slotHasFrameRef.current[slot];
  };

  /**
   * Frame sampler for the 3rd-layer Special Escape Overlay video (`point_you` / `point_me` / `push_button`).
   * Zero full-frame CPU readback; probes 32x32 only on initial/final 90ms boundary windows.
   */
  const sampleEscapeVideoFrame = (): boolean => {
    ensureBuffers();
    const video = escapeVideoRef.current;
    const escCanvas = escapeCanvasRef.current;
    if (!video || !escCanvas) return false;

    silenceVideoElement(video);
    if (video.loop) video.loop = false;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (video.readyState < 2 || vw <= 0 || vh <= 0 || video.ended || escapeSafeEndedRef.current) {
      return escapeHasFrameRef.current;
    }

    const dur = video.duration;
    const cur = video.currentTime;
    const fullLength = isVideoUrlPlayToEnd(escapeUrlRef.current, undefined, dur);
    const eosGuardSec = fullLength ? 0.025 : PRE_EOS_STOP_SEC;
    const nearEos = Number.isFinite(dur) && dur > 0.35 && cur >= dur - eosGuardSec;
    const inInitialGuard = !escapeHasFrameRef.current && cur < 0.09;
    const inFinalEofWindow = Number.isFinite(dur) && dur > 0.35 && cur >= dur - 0.09;

    if (!IS_MOBILE_DEVICE && (inInitialGuard || inFinalEofWindow)) {
      const luma = probeBoundaryLuminance(video);
      if (inInitialGuard && luma < 2) {
        return false;
      }
      if (inFinalEofWindow && luma < 6 && escapeLastLumaRef.current > 18) {
        video.pause();
        escapeSafeEndedRef.current = true;
        return escapeHasFrameRef.current;
      }
      if (luma > escapePeakLumaRef.current) {
        escapePeakLumaRef.current = luma;
      }
      escapeLastLumaRef.current = luma;
    } else {
      escapeLastLumaRef.current = Math.max(escapeLastLumaRef.current, 42);
    }

    const ectx = escCanvas.getContext('2d');
    if (ectx) {
      ectx.globalAlpha = 1;
      ectx.fillStyle = '#000000';
      ectx.fillRect(0, 0, PORTRAIT_CANVAS_W, PORTRAIT_CANVAS_H);
      drawCoverSource(ectx, video, vw, vh, PORTRAIT_CANVAS_W, PORTRAIT_CANVAS_H, 1);
      escapeHasFrameRef.current = true;
    }

    if (nearEos) {
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

  /**
   * Registers a Chromium `requestVideoFrameCallback` pump on an active playing `<video>` element.
   * On Android Chrome / WebView, having an active `requestVideoFrameCallback` consumer disables
   * Blink's occluded-video frame-drop heuristics and wakes `renderFrame` on every hardware frame.
   */
  const videoFramePumpIdsRef = useRef<WeakMap<HTMLVideoElement, number>>(new WeakMap());
  const armVideoFramePump = (video: HTMLVideoElement | null) => {
    if (!video) return;
    const withRvfc = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    };
    if (typeof withRvfc.requestVideoFrameCallback !== 'function') return;
    if (videoFramePumpIdsRef.current.has(video)) return;

    const pump = () => {
      videoFramePumpIdsRef.current.delete(video);
      if (video.paused || video.ended) return;
      ensureRenderLoop();
      const nextId = withRvfc.requestVideoFrameCallback!(pump);
      videoFramePumpIdsRef.current.set(video, nextId);
    };
    const id = withRvfc.requestVideoFrameCallback(pump);
    videoFramePumpIdsRef.current.set(video, id);
  };

  /**
   * Releases an unused `<video>` element's hardware `MediaCodec` instance on Android / mobile
   * while keeping already-rendered offscreen `<canvas>` frames intact so 0 flicker occurs.
   */
  const releaseInactiveSlotDecoderOnMobile = (slot: 0 | 1) => {
    if (!IS_MOBILE_DEVICE) return;
    if (slot === activeSlotRef.current) return;
    const video = getVideoBySlot(slot);
    slotAutoPlayRef.current[slot] = false;
    slotPrimingStillRef.current[slot] = false;
    slotUrlRef.current[slot] = '';
    if (!video) return;
    if (!video.paused) {
      video.pause();
    }
    if (video.hasAttribute('src') || video.currentSrc) {
      video.preload = 'none';
      video.removeAttribute('src');
      try {
        video.load();
      } catch {
        // ignore
      }
    }
  };

  const releaseEscapeDecoderOnMobile = () => {
    if (!IS_MOBILE_DEVICE) return;
    if (escapePhaseRef.current !== 'inactive') return;
    const escVid = escapeVideoRef.current;
    escapeAutoPlayRef.current = false;
    escapeUrlRef.current = '';
    escapeSeekAppliedRef.current = false;
    if (!escVid) return;
    if (!escVid.paused) {
      escVid.pause();
    }
    if (escVid.hasAttribute('src') || escVid.currentSrc) {
      escVid.preload = 'none';
      escVid.removeAttribute('src');
      try {
        escVid.load();
      } catch {
        // ignore
      }
    }
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
    escapeLastLumaRef.current = 0;
    escapeSafeEndedRef.current = false;

    if (!autoPlay && IS_MOBILE_DEVICE) {
      // Never allocate a 2nd/3rd mobile hardware H.264 MediaCodec ahead of time; load on trigger!
      return;
    }

    if (escapeUrlRef.current === url && video.readyState >= 1 && !video.error) {
      video.preload = 'auto';
      applyEscapeTargetSeek(video, !autoPlay);
      if (autoPlay) {
        safePlayVideo(video, true);
        armVideoFramePump(video);
      } else {
        video.pause();
        if (video.readyState >= 2) {
          sampleEscapeVideoFrame();
        }
      }
      return;
    }

    if (autoPlay && IS_MOBILE_DEVICE) {
      // Free standby slot decoder before opening the escape overlay decoder on Android
      const standbySlot: 0 | 1 = activeSlotRef.current === 0 ? 1 : 0;
      if (!useLiveOutgoingRef.current) {
        releaseInactiveSlotDecoderOnMobile(standbySlot);
      }
    }

    escapeSeekAppliedRef.current = false;
    escapeHasFrameRef.current = false;
    escapeUrlRef.current = url;
    revokeObjectUrlSafely(escapeBlobUrlRef.current);
    escapeBlobUrlRef.current = null;
    video.preload = autoPlay || !IS_MOBILE_DEVICE ? 'auto' : 'metadata';
    video.src = url;
    video.load();
    if (autoPlay) {
      safePlayVideo(video, true);
      armVideoFramePump(video);
    }
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
      slotLastProgressMsRef.current[activeSlotRef.current] = performance.now();
      safePlayVideo(baseVid, true);
      armVideoFramePump(baseVid);
    }
  };

  const isCurrentSlotNoCut = (): boolean => {
    const slot = activeSlotRef.current;
    const url = slotUrlRef.current[slot];
    const liveDur = getVideoBySlot(slot)?.duration;
    if (activeRoleRef.current === 'speaking' && !isInExtendedLipSyncRef.current) {
      return isUtterancePlayToEnd(url, activeSlotClipIdRef.current, undefined, liveDur);
    }
    return isVideoUrlPlayToEnd(url, undefined, liveDur);
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
    if (clearPostVideo) {
      releaseEscapeDecoderOnMobile();
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
    if (powerSaveModeLiveRef.current || triggerKey.startsWith('idle')) {
      utteranceWallStartMsRef.current = 0;
      utteranceMaxWindowSecRef.current = 0;
      return;
    }
    const cues = resolveActiveEscapeCues(forSpeechText, forClipId);
    // Pre-warm escape overlay bytes into HTTP / Service Worker cache via fetch() (zero MediaCodec allocation)
    for (const c of cues) {
      warmAngelVideoUrlInCache(c.videoUrl);
    }
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
    slotPrimingStillRef.current[slot] = false;
    slotPeakLumaRef.current[slot] = 0;
    slotLastLumaRef.current[slot] = 0;
    slotSafeEndedRef.current[slot] = false;
    slotLastTimeRef.current[slot] = -1;
    slotLastProgressMsRef.current[slot] = performance.now();

    const needsImmediateDecode = autoPlay || slot === activeSlotRef.current;

    if (slotUrlRef.current[slot] === url && video.readyState >= 2 && !video.error) {
      video.preload = needsImmediateDecode || !IS_MOBILE_DEVICE ? 'auto' : 'metadata';
      const needsRewind = video.currentTime > 0.04;
      if (autoPlay && needsRewind) {
        slotHasFrameRef.current[slot] = false;
      }
      if (needsRewind) {
        try {
          video.currentTime = 0;
        } catch {
          // Ignore if seek pending
        }
      }
      if (autoPlay) {
        safePlayVideo(video, true);
        armVideoFramePump(video);
      } else {
        video.pause();
        sampleSlotVideoFrame(slot);
      }
      return;
    }

    slotHasFrameRef.current[slot] = false;
    slotUrlRef.current[slot] = url;
    revokeObjectUrlSafely(slotBlobUrlRef.current[slot]);
    slotBlobUrlRef.current[slot] = null;
    // CRITICAL FOR ANDROID CHROME / WEBVIEW:
    // Active slots MUST use `preload="auto"` AND invoke `safePlayVideo` synchronously after `load()`
    // when `autoPlay` is true; otherwise Android stops buffering at `HAVE_METADATA` (`readyState === 1`)
    // and never fires `loadeddata` or `canplay`.
    video.preload = needsImmediateDecode || !IS_MOBILE_DEVICE ? 'auto' : 'none';
    video.src = url;
    video.load();
    if (autoPlay) {
      safePlayVideo(video, true);
      armVideoFramePump(video);
    }
  };

  const preloadStandbySlotUrl = (standbyUrl: string) => {
    if (IS_MOBILE_DEVICE) {
      // Never pre-open a second Android hardware H.264 MediaCodec for standby slots;
      // keeping mobile strictly single-decoder until transition prevents MediaCodec exhaustion.
      return;
    }

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
      peekNextAngelIdleVideo(lastPlayedIdleUrlRef.current);
    plannedIdleUrlRef.current = idleUrl;
    preloadStandbySlotUrl(idleUrl);
  };

  const preloadNextForActiveSpeaking = () => {
    if (IS_MOBILE_DEVICE) return;
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
    const nowMs = performance.now();
    if (playingPostVideoEscapeRef.current) {
      const escStuck =
        escapeWaitingFrameRef.current && nowMs - escapeWaitStartMsRef.current > 4500;
      return !escStuck;
    }
    if (activeRoleRef.current === 'idle') return false;
    const slot = activeSlotRef.current;
    if (!isCurrentSlotNoCut()) return false;
    const video = getVideoBySlot(slot);
    if (!video || video.error) {
      deferredPostVideoCuesRef.current = [];
      return false;
    }
    if (deferredPostVideoCuesRef.current.length > 0) {
      if (waitingForIncomingFrameRef.current && nowMs - incomingWaitStartMsRef.current > 6500) {
        deferredPostVideoCuesRef.current = [];
        return false;
      }
      return true;
    }
    if (video.ended || slotSafeEndedRef.current[slot]) return false;
    if (waitingForIncomingFrameRef.current) {
      return nowMs - incomingWaitStartMsRef.current <= 6500;
    }
    if (pausedBaseForEscapeRef.current) return true;
    if (video.paused) return false;
    return nowMs - slotLastProgressMsRef.current[slot] <= 3200;
  };

  /**
   * Starts a seamless optical morph transition into `targetUrl` with role `'speaking' | 'idle'`.
   * - If `keepOutgoingLive` is true, the outgoing video continues moving naturally during the dissolve.
   * - If `autoPlayTarget` is false (`role === 'idle'`), Chess Angel dissolves smoothly onto a still,
   *   closed-mouth resting portrait frame without playing an idle video animation yet!
   */
  const startTransitionTo = (
    targetUrl: string,
    role: 'speaking' | 'idle',
    keepOutgoingLive: boolean,
    autoPlayTarget = true,
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
      !powerSaveModeLiveRef.current &&
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
    slotFallbackUsedRef.current[nextSlot] = false;

    if (!canKeepOutgoingLive && IS_MOBILE_DEVICE) {
      // `outgoingFallbackCanvasRef` already holds the exact composite snapshot, so free the
      // outgoing Android MediaCodec instance BEFORE opening `nextSlot`'s hardware decoder!
      releaseInactiveSlotDecoderOnMobile(prevSlot);
    }

    if (role === 'speaking') {
      hasDeliveredSpeechRef.current = true;
      idleClipCurrentlyPlayingRef.current = false;
      activeSlotClipIdRef.current = clipIdLiveRef.current;
      lastRequestedSpeakingUrlRef.current = targetUrl;
      lastSpeakingStartMsRef.current = performance.now();
      plannedIdleUrlRef.current = peekNextAngelIdleVideo(lastPlayedIdleUrlRef.current);
    } else {
      activeSlotClipIdRef.current = null;
      idleClipCurrentlyPlayingRef.current = autoPlayTarget;
      if (autoPlayTarget) {
        lastPlayedIdleUrlRef.current = targetUrl;
      }
    }

    blendDurationMsRef.current = powerSaveModeLiveRef.current
      ? 0
      : role === 'idle'
        ? forcedIdleUrlLiveRef.current
          ? 320
          : BLEND_TO_IDLE_MS
        : BLEND_TO_SPEAK_MS;

    if (hasMasterFrameRef.current) {
      waitingForIncomingFrameRef.current = true;
      incomingWaitStartMsRef.current = performance.now();
      isBlendingRef.current = true;
    } else {
      waitingForIncomingFrameRef.current = autoPlayTarget;
      incomingWaitStartMsRef.current = autoPlayTarget ? performance.now() : 0;
      isBlendingRef.current = false;
    }

    loadVideoIntoSlot(nextSlot, targetUrl, autoPlayTarget);
    ensureRenderLoop();
  };

  /**
   * Transitions Chess Angel out of a finished game speech onto a calm, still resting portrait frame
   * (no idle gesture animation yet!) and stamps `lastSpeechEndedAtMsRef` so the >=10s post-speech
   * quiet timer runs before any idle video can play.
   */
  const settleIntoPostSpeechRest = (keepOutgoingLive: boolean) => {
    hasDeliveredSpeechRef.current = true;
    speakingFinishedForTriggerRef.current = true;
    lastSpeechEndedAtMsRef.current = performance.now();
    isInExtendedLipSyncRef.current = false;
    startTransitionTo(resolveAngelIdleVideo(), 'idle', keepOutgoingLive, false);
  };

  /**
   * Arms `idleCycleTimerRef` to play the next Idle video ONLY after:
   *   1. At least 10 seconds (`POST_SPEECH_MIN_IDLE_WAIT_MS`) have elapsed since Chess Angel
   *      finished her last game speech (both voice audio and speaking video), AND
   *   2. At least 15 seconds (`MIN_BETWEEN_IDLE_VIDEOS_MS`) have elapsed since the end of the
   *      previous idle video.
   */
  const scheduleNextIdlePlayback = (preferRandomCalmGap: boolean) => {
    clearIdleCycleTimer();
    if (powerSaveModeLiveRef.current) return;
    if (activeRoleRef.current !== 'idle') return;
    if (isSpeakingLiveRef.current || idleClipCurrentlyPlayingRef.current) return;

    const now = performance.now();
    const waitAfterSpeechMs = hasDeliveredSpeechRef.current
      ? Math.max(0, POST_SPEECH_MIN_IDLE_WAIT_MS - (now - lastSpeechEndedAtMsRef.current))
      : 0;
    const baseInterIdleTargetMs = preferRandomCalmGap
      ? nextCalmIdlePauseMs()
      : MIN_BETWEEN_IDLE_VIDEOS_MS;
    const waitBetweenIdlesMs =
      lastIdleEndedAtMsRef.current > 0
        ? Math.max(0, baseInterIdleTargetMs - (now - lastIdleEndedAtMsRef.current))
        : preferRandomCalmGap && !hasDeliveredSpeechRef.current
          ? MIN_BETWEEN_IDLE_VIDEOS_MS
          : 0;

    const delayMs = Math.max(
      waitAfterSpeechMs,
      waitBetweenIdlesMs,
      hasDeliveredSpeechRef.current ? 0 : MIN_BETWEEN_IDLE_VIDEOS_MS,
    );

    const nextAlt = peekNextAngelIdleVideo(lastPlayedIdleUrlRef.current);
    preloadStandbyIdleSlot(nextAlt);

    idleCycleTimerRef.current = window.setTimeout(() => {
      idleCycleTimerRef.current = null;
      if (activeRoleRef.current !== 'idle' || idleClipCurrentlyPlayingRef.current) {
        return;
      }
      if (forcedIdleUrlLiveRef.current) {
        return;
      }
      if (isSpeakingLiveRef.current) {
        lastSpeechEndedAtMsRef.current = performance.now();
        return;
      }
      const firedNow = performance.now();
      const remSpeech = hasDeliveredSpeechRef.current
        ? POST_SPEECH_MIN_IDLE_WAIT_MS - (firedNow - lastSpeechEndedAtMsRef.current)
        : 0;
      const remIdle =
        lastIdleEndedAtMsRef.current > 0
          ? MIN_BETWEEN_IDLE_VIDEOS_MS - (firedNow - lastIdleEndedAtMsRef.current)
          : 0;
      if (Math.max(remSpeech, remIdle) > 40) {
        scheduleNextIdlePlayback(false);
        return;
      }
      // Commit cooldowns & rotation cursor ONLY at actual playback start (never during preload!)
      const chosenIdle = pickNextAngelIdleVideo(lastPlayedIdleUrlRef.current, true);
      plannedIdleUrlRef.current = '';
      startTransitionTo(chosenIdle, 'idle', false, true);
    }, Math.max(100, Math.ceil(delayMs)));
  };

  function renderFrame(now: number) {
    if (
      powerSaveModeLiveRef.current &&
      hasMasterFrameRef.current &&
      !waitingForIncomingFrameRef.current &&
      now - lastPowerSaveDrawMsRef.current < POWER_SAVE_PORTRAIT_INTERVAL_MS
    ) {
      rafIdRef.current = window.requestAnimationFrame(renderFrame);
      return;
    }
    lastPowerSaveDrawMsRef.current = now;

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

    if (activeVideo) {
      const curTime = activeVideo.currentTime;
      if (curTime !== slotLastTimeRef.current[activeSlot]) {
        slotLastTimeRef.current[activeSlot] = curTime;
        slotLastProgressMsRef.current[activeSlot] = now;
      }
    }

    // 1. Sample verified-bright frames from active (and live-outgoing / standby) videos
    const activeReady = sampleSlotVideoFrame(activeSlot);
    if (useLiveOutgoingRef.current || (outVideo && outVideo.readyState >= 2 && !slotHasFrameRef.current[outSlot])) {
      sampleSlotVideoFrame(outSlot);
    }

    // 1.0 Live forced-idle video clock & frame-exact cue sync (e.g. launching 3D puppy at exact 4.2s, diminishing stars to 0)
    const activeCueSec = forcedIdleCueAtSecLiveRef.current;
    const activeForcedUrl = forcedIdleUrlLiveRef.current;
    const isPlayingForcedIdleNow = Boolean(
      activeForcedUrl &&
        activeRoleRef.current === 'idle' &&
        activeVideo &&
        slotUrlRef.current[activeSlot].split('?')[0] === activeForcedUrl.split('?')[0] &&
        activeReady &&
        !waitingForIncomingFrameRef.current &&
        !activeVideo.seeking &&
        activeVideo.readyState >= 2,
    );
    if (forcedIdleClockRef) {
      if (isPlayingForcedIdleNow && activeVideo) {
        const liveDur = Number.isFinite(activeVideo.duration) ? activeVideo.duration : 0;
        forcedIdleClockRef.current.currentTime =
          activeVideo.ended || slotSafeEndedRef.current[activeSlot]
            ? liveDur || activeVideo.currentTime
            : activeVideo.currentTime;
        forcedIdleClockRef.current.duration = liveDur;
        forcedIdleClockRef.current.active = true;
      } else if (!activeForcedUrl) {
        forcedIdleClockRef.current.active = false;
        forcedIdleClockRef.current.currentTime = 0;
        forcedIdleClockRef.current.duration = 0;
      }
    }
    if (
      activeCueSec !== null &&
      activeCueSec !== undefined &&
      isPlayingForcedIdleNow &&
      activeVideo &&
      forcedIdleCueFiredForTriggerRef.current !== lastTriggerRef.current
    ) {
      const curSec = activeVideo.currentTime;
      const durSec = activeVideo.duration;
      const targetSec = Math.max(0, activeCueSec);
      const nearStartThreshold = targetSec <= 0.1 ? 0.6 : Math.max(1.8, targetSec - 0.5);
      if (curSec < nearStartThreshold) {
        forcedIdleObservedNearStartRef.current = true;
      }
      const reachedExactTimestamp =
        (targetSec <= 0.05 || forcedIdleObservedNearStartRef.current) && curSec >= targetSec;
      const videoEndedBeforeTarget =
        forcedIdleObservedNearStartRef.current &&
        (activeVideo.ended ||
          slotSafeEndedRef.current[activeSlot] ||
          (Number.isFinite(durSec) && durSec > 0.3 && curSec >= durSec - 0.08));
      if (reachedExactTimestamp || videoEndedBeforeTarget) {
        forcedIdleCueFiredForTriggerRef.current = lastTriggerRef.current;
        onForcedIdleCueReachedLiveRef.current?.();
      }
    }

    // 1a. Incoming Frame Watchdog: give Blob/network retry a fair window on media errors,
    //     and NEVER overwrite a forced special-event video (e.g. fluffy puppy / dance with stars)
    //     with the static idle portrait while its Blob-URL recovery is loading!
    if (waitingForIncomingFrameRef.current && !activeReady && incomingWaitStartMsRef.current > 0) {
      const waitedMs = now - incomingWaitStartMsRef.current;
      const hasMediaError = Boolean(activeVideo?.error);
      const isForcedEventVideo = Boolean(forcedIdleUrlLiveRef.current);
      const fallbackThresholdMs = isForcedEventVideo ? 9_500 : hasMediaError ? 1800 : 7500;
      const hardUnlockThresholdMs = isForcedEventVideo ? 11_000 : hasMediaError ? 3200 : 9500;
      if (!isForcedEventVideo && waitedMs > fallbackThresholdMs && !slotFallbackUsedRef.current[activeSlot]) {
        slotFallbackUsedRef.current[activeSlot] = true;
        const fallbackUrl = withAssetBuildVersion(
          activeRoleRef.current === 'speaking'
            ? ANGEL_DEFAULT_SPEAKING_VIDEO_SRC
            : ANGEL_IDLE_LISTENING_VIDEO_SRC,
        );
        if (stripAssetQuery(slotUrlRef.current[activeSlot]) !== stripAssetQuery(fallbackUrl)) {
          incomingWaitStartMsRef.current = now;
          loadVideoIntoSlot(activeSlot, fallbackUrl, slotAutoPlayRef.current[activeSlot]);
        }
      } else if (waitedMs > hardUnlockThresholdMs) {
        waitingForIncomingFrameRef.current = false;
        isBlendingRef.current = false;
        slotSafeEndedRef.current[activeSlot] = true;
      }
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
      escapeWaitStartMsRef.current = now;
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
      const pausedAtActualEnd =
        activeVideo.paused &&
        activeReady &&
        !waitingForIncomingFrameRef.current &&
        Number.isFinite(dur) &&
        dur > 0.4 &&
        cur >= dur - 0.22;

      // If mobile browser briefly paused an active auto-playing clip mid-stream (or stopped at
      // HAVE_METADATA on Android before play() resolved), gently resume playback instead of freezing!
      if (
        activeVideo.paused &&
        !activeVideo.ended &&
        !activeVideo.error &&
        !slotSafeEndedRef.current[activeSlot] &&
        slotAutoPlayRef.current[activeSlot] &&
        !pausedAtActualEnd &&
        activeVideo.readyState >= 1
      ) {
        safePlayVideo(activeVideo);
        armVideoFramePump(activeVideo);
      }

      const endedOrTailTrimmed =
        slotSafeEndedRef.current[activeSlot] ||
        activeVideo.ended ||
        pausedAtActualEnd;

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
        escapeWaitStartMsRef.current = now;
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
        if (pending.role === 'idle') {
          settleIntoPostSpeechRest(true);
        } else {
          startTransitionTo(pending.url, pending.role, true, true);
        }
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
            startTransitionTo(resolveDefaultSpeakingLipVideo(), 'speaking', true, true);
          } else {
            settleIntoPostSpeechRest(true);
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
            releaseInactiveSlotDecoderOnMobile(outSlot);
            // Pre-decode next standby clip on desktop (mobile stays strictly single-decoder)
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
        } else if (
          escapeWaitingFrameRef.current &&
          !escReady &&
          ((escapeWaitStartMsRef.current > 0 && now - escapeWaitStartMsRef.current > 4500) ||
            Boolean(escVideo?.error))
        ) {
          // Escape overlay failed or timed out on mobile: release cleanly and resume base video!
          escapeWaitingFrameRef.current = false;
          playingPostVideoEscapeRef.current = false;
          hasEscapePrevRef.current = false;
          escapeCurrentAlphaRef.current = 0;
          escapeStartAlphaRef.current = 0;
          escapePhaseRef.current = 'inactive';
          activeEscapeCueKeyRef.current = null;
          if (escVideo && !escVideo.paused) {
            escVideo.pause();
          }
          releaseEscapeDecoderOnMobile();
          resumePausedBaseVideoAfterEscape();
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
            const escSpeechContinuesAfterGesture =
              !escFullLength &&
              !playingPostVideoEscapeRef.current &&
              isSpeakingLiveRef.current &&
              opponentSpeech.getRemainingSpeechSeconds() > 0.65 &&
              effectiveSpeechElapsedSec >= activeEscapeSpokenWordSecRef.current + 0.85 &&
              now - escapeStartedAtMsRef.current >= 1350;
            const escPausedAtEnd =
              Boolean(
                escVideo?.paused &&
                  Number.isFinite(escDur) &&
                  escDur > 0.4 &&
                  escCur >= escDur - 0.22,
              );
            if (
              escVideo &&
              escVideo.paused &&
              !escVideo.ended &&
              !escVideo.error &&
              !escapeSafeEndedRef.current &&
              escapeAutoPlayRef.current &&
              !escPausedAtEnd &&
              escVideo.readyState >= 1
            ) {
              safePlayVideo(escVideo);
              armVideoFramePump(escVideo);
            }
            const escFinished =
              escapeSafeEndedRef.current ||
              Boolean(escVideo?.ended) ||
              escPausedAtEnd;

            if (escNearEnd || escFinished || escSpeechContinuesAfterGesture) {
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
                  escapeWaitStartMsRef.current = now;
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
                  releaseEscapeDecoderOnMobile();

                  if (deferredTransitionRef.current) {
                    const pending = deferredTransitionRef.current;
                    deferredTransitionRef.current = null;
                    isInExtendedLipSyncRef.current = Boolean(pending.isExtendedLip);
                    if (pending.rearmEscapeCues) {
                      armEscapeCuesForUtterance(pending.url, pending.clipId, pending.speechText);
                    }
                    if (pending.role === 'idle') {
                      settleIntoPostSpeechRest(false);
                    } else {
                      startTransitionTo(pending.url, pending.role, false, true);
                    }
                  } else {
                    const remainingTalkSec = isSpeakingLiveRef.current
                      ? opponentSpeech.getRemainingSpeechSeconds()
                      : 0;
                    if (
                      remainingTalkSec > 0.35 &&
                      shouldExtendWithDefaultLipSync(clipIdLiveRef.current)
                    ) {
                      isInExtendedLipSyncRef.current = true;
                      startTransitionTo(resolveDefaultSpeakingLipVideo(), 'speaking', false, true);
                    } else {
                      settleIntoPostSpeechRest(false);
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
                  pausedBaseForEscapeRef.current = false;
                  settleIntoPostSpeechRest(false);
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
              } else if (deferredPostVideoCuesRef.current.length === 0) {
                releaseEscapeDecoderOnMobile();
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

    // 5. Blit verified `masterCanvas` onto visible screen `<canvas>` backed by pure #000000 game black
    if (hasMasterFrameRef.current) {
      const vctx = visibleCanvas.getContext('2d');
      if (vctx) {
        vctx.globalAlpha = 1;
        vctx.fillStyle = '#000000';
        vctx.fillRect(0, 0, PORTRAIT_CANVAS_W, PORTRAIT_CANVAS_H);
        vctx.drawImage(masterCanvas, 0, 0, PORTRAIT_CANVAS_W, PORTRAIT_CANVAS_H);
      }
    }

    const activeStillMoving =
      Boolean(activeVideo && !activeVideo.paused && !activeVideo.ended && !slotSafeEndedRef.current[activeSlot]);
    // Keep the compositor alive while an async play() promise or preloaded-slot seek is starting up
    // so Windows Chrome & Android Chrome never abort frame 1 before playback resolves!
    const activeWantsPlayback = Boolean(
      activeVideo &&
        slotAutoPlayRef.current[activeSlot] &&
        !activeVideo.ended &&
        !slotSafeEndedRef.current[activeSlot] &&
        !activeVideo.error &&
        !pausedBaseForEscapeRef.current &&
        now - slotLastProgressMsRef.current[activeSlot] < 9500,
    );
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
      activeWantsPlayback ||
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

      if (activeRoleRef.current === 'idle') {
        if (idleClipCurrentlyPlayingRef.current) {
          idleClipCurrentlyPlayingRef.current = false;
          lastIdleEndedAtMsRef.current = now;
        }
        if (
          idleCycleTimerRef.current === null &&
          !isSpeakingLiveRef.current &&
          !forcedIdleUrlLiveRef.current
        ) {
          scheduleNextIdlePlayback(true);
        }
      }
    }
  }

  // Initial mount & utterance/state trigger handler
  useEffect(() => {
    const targetRole: 'speaking' | 'idle' = useIdleForUtterance ? 'idle' : 'speaking';

    if (lastTriggerRef.current === '') {
      lastTriggerRef.current = triggerKey;
      forcedIdleCueFiredForTriggerRef.current = '';
      forcedIdleObservedNearStartRef.current = false;
      speechObservedForTriggerRef.current = false;
      speakingFinishedForTriggerRef.current = false;
      activeSlotRef.current = 0;
      outgoingSlotRef.current = 1;
      activeRoleRef.current = targetRole;
      autoMorphTriggeredRef.current = targetRole === 'idle';
      if (targetRole === 'speaking') {
        hasDeliveredSpeechRef.current = true;
        idleClipCurrentlyPlayingRef.current = false;
        activeSlotClipIdRef.current = clipId;
        isInExtendedLipSyncRef.current = desiredSrc === resolveDefaultSpeakingLipVideo();
        lastRequestedSpeakingUrlRef.current = desiredSrc;
        lastSpeakingStartMsRef.current = performance.now();
        const firstIdle = peekNextAngelIdleVideo();
        plannedIdleUrlRef.current = firstIdle;
        slotFallbackUsedRef.current[0] = false;
        waitingForIncomingFrameRef.current = true;
        incomingWaitStartMsRef.current = performance.now();
        loadVideoIntoSlot(0, desiredSrc, true);
        if (!IS_MOBILE_DEVICE) {
          const estSec = clipId ? VOICE_CLIP_DURATION_SEC[clipId] ?? 0 : 0;
          if (estSec > 5.8 && shouldExtendWithDefaultLipSync(clipId)) {
            loadVideoIntoSlot(1, resolveDefaultSpeakingLipVideo(), false);
          } else {
            loadVideoIntoSlot(1, firstIdle, false);
          }
        }
      } else {
        activeSlotClipIdRef.current = null;
        isInExtendedLipSyncRef.current = false;
        const shouldPlayImmediateIdle = Boolean(forcedIdleUrl);
        idleClipCurrentlyPlayingRef.current = shouldPlayImmediateIdle;
        slotFallbackUsedRef.current[0] = false;
        waitingForIncomingFrameRef.current = shouldPlayImmediateIdle;
        incomingWaitStartMsRef.current = shouldPlayImmediateIdle ? performance.now() : 0;
        if (!isIdleTrigger) {
          // Utterance configured as Idle Only (e.g. Lip-Sync OFF): hold calm stillness & enforce >=10s post-speech guard!
          hasDeliveredSpeechRef.current = true;
          const estSec = clipId ? VOICE_CLIP_DURATION_SEC[clipId] ?? 5.0 : 5.0;
          lastSpeechEndedAtMsRef.current =
            performance.now() + (!soundEnabled || angelVoice === 'off' ? estSec * 1000 : 0);
        }
        if (shouldPlayImmediateIdle) {
          lastPlayedIdleUrlRef.current = desiredSrc;
        }
        loadVideoIntoSlot(0, desiredSrc, shouldPlayImmediateIdle);
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
      // (Never restart a video that already finished for this triggerKey or merely gained a ?v= hydration query.)
      const prevBaseUrl = lastRequestedSpeakingUrlRef.current.split('?')[0];
      const nextBaseUrl = desiredSrc.split('?')[0];
      const isSameFileQueryOnlyHydration =
        Boolean(prevBaseUrl) &&
        prevBaseUrl === nextBaseUrl &&
        !lastRequestedSpeakingUrlRef.current.includes('?v=');
      if (
        targetRole === 'speaking' &&
        !isSameFileQueryOnlyHydration &&
        ((activeRoleRef.current !== 'speaking' &&
          !speakingFinishedForTriggerRef.current &&
          (isSpeakingLiveRef.current || desiredSrc !== lastRequestedSpeakingUrlRef.current)) ||
          (!isInExtendedLipSyncRef.current && desiredSrc !== lastRequestedSpeakingUrlRef.current))
      ) {
        speakingFinishedForTriggerRef.current = false;
        isInExtendedLipSyncRef.current = desiredSrc === resolveDefaultSpeakingLipVideo();
        startTransitionTo(desiredSrc, 'speaking', true, true);
      } else if (targetRole === 'idle' && activeRoleRef.current === 'speaking') {
        settleIntoPostSpeechRest(true);
      } else if (activeRoleRef.current === 'idle') {
        const pool = getAngelIdleVideoPool();
        const currentIdle = slotUrlRef.current[activeSlotRef.current];
        const currentIdleBase = stripAssetQuery(currentIdle);
        const currentInPool = pool.some((u) => stripAssetQuery(u) === currentIdleBase);
        if (!forcedIdleUrl && currentIdle && !currentInPool) {
          startTransitionTo(resolveAngelIdleVideo(), 'idle', true, false);
        } else if (
          !forcedIdleUrl &&
          idleCycleTimerRef.current === null &&
          rafIdRef.current === null &&
          !isSpeakingLiveRef.current &&
          !idleClipCurrentlyPlayingRef.current
        ) {
          scheduleNextIdlePlayback(true);
        }
      } else if (activeRoleRef.current === 'speaking') {
        preloadNextForActiveSpeaking();
      }
      return;
    }

    lastTriggerRef.current = triggerKey;
    forcedIdleCueFiredForTriggerRef.current = '';
    forcedIdleObservedNearStartRef.current = false;
    speechObservedForTriggerRef.current = false;
    speakingFinishedForTriggerRef.current = false;
    const isExplicitStudioTest = triggerKey.startsWith('preview:') || Boolean(forcedIdleUrl);
    const isExplicitStudioIdleTest = Boolean(forcedIdleUrl);
    const isExplicitBranchSilentPlay = triggerKey.startsWith('idle:calc:');
    const nextUrl =
      targetRole === 'idle' && !forcedIdleUrl
        ? resolveAngelIdleVideo()
        : desiredSrc;
    const nextIsExtendedLip =
      targetRole === 'speaking' && nextUrl === resolveDefaultSpeakingLipVideo();

    if (!isIdleTrigger) {
      hasDeliveredSpeechRef.current = true;
      clearIdleCycleTimer();
      if (targetRole === 'idle') {
        const estSec = clipId ? VOICE_CLIP_DURATION_SEC[clipId] ?? 5.0 : 5.0;
        lastSpeechEndedAtMsRef.current =
          performance.now() + (!soundEnabled || angelVoice === 'off' ? estSec * 1000 : 0);
      }
    } else if (isExplicitBranchSilentPlay) {
      // While a 3D calculation branch is silently playing on the board, keep Chess Angel
      // in calm closed-mouth stillness with zero lip movement!
      hasDeliveredSpeechRef.current = true;
      lastSpeechEndedAtMsRef.current = performance.now();
      clearIdleCycleTimer();
      deferredTransitionRef.current = null;
    }

    if (!isExplicitStudioTest && !isExplicitBranchSilentPlay && isActiveBaseProtectedFromCut()) {
      // Never queue a duplicate back-to-back playback of the exact same No-Cut video that is already playing!
      const activeBaseUrl = slotUrlRef.current[activeSlotRef.current].split('?')[0];
      const nextBaseUrl = nextUrl.split('?')[0];
      if (
        targetRole === 'speaking' &&
        activeRoleRef.current === 'speaking' &&
        Boolean(activeBaseUrl) &&
        activeBaseUrl === nextBaseUrl
      ) {
        ensureRenderLoop();
        return;
      }
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

    // If this saying has Lip-Sync turned OFF (Idle Only) or an idle trigger occurs while already in Idle:
    // - Do NOT play an idle video immediately (unless clicking Test on an Idle slot in Video Studio!).
    // - If an idle gesture video was mid-motion when a game speech or silent branch started, settle calmly to rest.
    if (targetRole === 'idle' && !isExplicitStudioIdleTest && activeRoleRef.current === 'idle') {
      isInExtendedLipSyncRef.current = false;
      if ((!isIdleTrigger || isExplicitBranchSilentPlay) && idleClipCurrentlyPlayingRef.current) {
        startTransitionTo(resolveAngelIdleVideo(), 'idle', !isExplicitBranchSilentPlay, false);
        return;
      }
      if (
        pendingEscapeCuesRef.current.length > 0 ||
        deferredPostVideoCuesRef.current.length > 0
      ) {
        ensureRenderLoop();
      } else if (
        isIdleTrigger &&
        !isExplicitBranchSilentPlay &&
        !idleClipCurrentlyPlayingRef.current &&
        !isSpeakingLiveRef.current
      ) {
        scheduleNextIdlePlayback(false);
      }
      return;
    }
    isInExtendedLipSyncRef.current = nextIsExtendedLip;
    startTransitionTo(
      nextUrl,
      targetRole,
      !isExplicitBranchSilentPlay,
      targetRole === 'speaking' || isExplicitStudioIdleTest,
    );
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

    if (!wasSpeaking && isSpeaking) {
      hasDeliveredSpeechRef.current = true;
      clearIdleCycleTimer();
    }

    if (!wasSpeaking && isSpeaking && soundEnabled && angelVoice !== 'off' && !isIdleTrigger) {
      const isInitialSpeechArrival = !speechObservedForTriggerRef.current;
      speechObservedForTriggerRef.current = true;
      const elapsedSinceStart = performance.now() - lastSpeakingStartMsRef.current;

      // If this is the initial audio start for the current triggerKey (even if MP3 fetch/decode
      // took > 900ms), NEVER restart the speaking video that is already playing (or just finished)!
      if (
        isInitialSpeechArrival &&
        (activeRoleRef.current === 'speaking' || speakingFinishedForTriggerRef.current)
      ) {
        if (
          pendingEscapeCuesRef.current.length > 0 ||
          deferredPostVideoCuesRef.current.length > 0
        ) {
          ensureRenderLoop();
        }
        return;
      }

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
          speakingFinishedForTriggerRef.current = false;
          isInExtendedLipSyncRef.current = nextIsExtended;
          startTransitionTo(desiredSrc, 'speaking', true, true);
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
      hasDeliveredSpeechRef.current = true;
      lastSpeechEndedAtMsRef.current = performance.now();
      clearIdleCycleTimer();
      // Clear mid-video cues, NEVER clear `deferredPostVideoCuesRef` so the "button" part still plays after No-Cut ends!
      pendingEscapeCuesRef.current = [];
      if (
        activeRoleRef.current === 'speaking' &&
        isInExtendedLipSyncRef.current &&
        escapePhaseRef.current === 'inactive'
      ) {
        if (isActiveBaseProtectedFromCut()) {
          deferredTransitionRef.current = {
            url: resolveAngelIdleVideo(),
            role: 'idle',
            isExtendedLip: false,
          };
          ensureRenderLoop();
        } else {
          settleIntoPostSpeechRest(true);
        }
      } else if (
        activeRoleRef.current === 'idle' &&
        !idleClipCurrentlyPlayingRef.current &&
        rafIdRef.current === null
      ) {
        scheduleNextIdlePlayback(true);
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
    // Mobile gesture, focus & visibility unlock: resume any active portrait <video> paused or
    // reclaimed by Android Chrome / WebView / iOS Low Power Mode / lockscreen suspension.
    const tryResumeActiveVideos = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const slot = activeSlotRef.current;
      const activeVid = getVideoBySlot(slot);
      let resumedAny = false;

      if (
        escapePhaseRef.current !== 'inactive' &&
        escapePhaseRef.current !== 'exiting' &&
        escapeAutoPlayRef.current &&
        escapeVideoRef.current &&
        !escapeSafeEndedRef.current
      ) {
        const escVid = escapeVideoRef.current;
        if ((escVid.error || escVid.readyState === 0) && escapeUrlRef.current) {
          escVid.preload = 'auto';
          escVid.src = escapeUrlRef.current;
          escVid.load();
          safePlayVideo(escVid, true);
          armVideoFramePump(escVid);
          resumedAny = true;
        } else if (escVid.paused && !escVid.ended) {
          safePlayVideo(escVid, true);
          armVideoFramePump(escVid);
          resumedAny = true;
        }
      } else if (
        !pausedBaseForEscapeRef.current &&
        activeVid &&
        !slotSafeEndedRef.current[slot]
      ) {
        const activeUrl = slotUrlRef.current[slot];
        if ((activeVid.error || activeVid.readyState === 0) && activeUrl) {
          loadVideoIntoSlot(slot, activeUrl, slotAutoPlayRef.current[slot]);
          resumedAny = true;
        } else if (slotAutoPlayRef.current[slot] && activeVid.paused && !activeVid.ended) {
          safePlayVideo(activeVid, true);
          armVideoFramePump(activeVid);
          resumedAny = true;
        } else if (
          !slotAutoPlayRef.current[slot] &&
          !slotHasFrameRef.current[slot] &&
          activeVid.readyState >= 1
        ) {
          try {
            activeVid.currentTime = 0.001;
          } catch {
            // ignore
          }
          resumedAny = true;
        }
      }

      if (resumedAny) {
        ensureRenderLoop();
      }
    };

    const gestureEvents = ['pointerdown', 'touchstart', 'click', 'keydown'] as const;
    for (const evt of gestureEvents) {
      window.addEventListener(evt, tryResumeActiveVideos, { capture: true, passive: true });
    }
    window.addEventListener('focus', tryResumeActiveVideos);
    window.addEventListener('pageshow', tryResumeActiveVideos);
    document.addEventListener('visibilitychange', tryResumeActiveVideos);

    return () => {
      for (const evt of gestureEvents) {
        window.removeEventListener(evt, tryResumeActiveVideos, { capture: true });
      }
      window.removeEventListener('focus', tryResumeActiveVideos);
      window.removeEventListener('pageshow', tryResumeActiveVideos);
      document.removeEventListener('visibilitychange', tryResumeActiveVideos);
      stopRenderLoop();
      clearIdleCycleTimer();
      resetEscapeOverlayState(false);
      revokeObjectUrlSafely(slotBlobUrlRef.current[0]);
      revokeObjectUrlSafely(slotBlobUrlRef.current[1]);
      revokeObjectUrlSafely(escapeBlobUrlRef.current);
      slotBlobUrlRef.current = [null, null];
      escapeBlobUrlRef.current = null;
    };
  }, []);

  // Immediately stop/resume non-essential idle & escape animations when Power Save Mode toggles
  useEffect(() => {
    if (powerSaveMode) {
      clearIdleCycleTimer();
      resetEscapeOverlayState(true, true);
      if (
        activeRoleRef.current === 'idle' &&
        idleClipCurrentlyPlayingRef.current &&
        !forcedIdleUrlLiveRef.current
      ) {
        idleClipCurrentlyPlayingRef.current = false;
        const activeVid = getVideoBySlot(activeSlotRef.current);
        if (activeVid && !activeVid.paused) {
          activeVid.pause();
        }
      }
    } else if (
      activeRoleRef.current === 'idle' &&
      !isSpeakingLiveRef.current &&
      !idleClipCurrentlyPlayingRef.current &&
      idleCycleTimerRef.current === null
    ) {
      scheduleNextIdlePlayback(true);
    }
  }, [powerSaveMode]);

  const makeSlotMetadataHandler = (slot: 0 | 1) => (e: SyntheticEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    el.loop = false;
    silenceVideoElement(el);

    if (slotAutoPlayRef.current[slot] && !slotSafeEndedRef.current[slot] && !el.ended) {
      safePlayVideo(el, true);
      armVideoFramePump(el);
      ensureRenderLoop();
      return;
    }

    // Still-frame portrait target (e.g. initial calm rest or post-speech rest):
    // Nudge Android hardware MediaCodec to decode frame 0 so `loadeddata`/`seeked` fires reliably.
    if (slot === activeSlotRef.current && !slotHasFrameRef.current[slot]) {
      try {
        if (el.currentTime === 0) {
          el.currentTime = 0.001;
        }
      } catch {
        // ignore
      }
      if (IS_MOBILE_DEVICE && el.readyState < 2 && !slotPrimingStillRef.current[slot]) {
        slotPrimingStillRef.current[slot] = true;
        safePlayVideo(el, true);
      }
      ensureRenderLoop();
    }
  };

  const makeSlotLoadedHandler = (slot: 0 | 1) => (e: SyntheticEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    el.loop = false;
    silenceVideoElement(el);
    slotRetryKeyRef.current[slot] = '';

    if (slotSafeEndedRef.current[slot] || el.ended) {
      slotAutoPlayRef.current[slot] = false;
      el.pause();
      ensureRenderLoop();
      return;
    }

    if (slotAutoPlayRef.current[slot]) {
      slotPrimingStillRef.current[slot] = false;
      safePlayVideo(el, true);
      armVideoFramePump(el);
    } else {
      slotPrimingStillRef.current[slot] = false;
      el.pause();
      sampleSlotVideoFrame(slot);
    }
    ensureRenderLoop();
  };

  const makeSlotTimeUpdateHandler = (slot: 0 | 1) => (e: SyntheticEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    if (slotPrimingStillRef.current[slot] && !slotAutoPlayRef.current[slot]) {
      slotPrimingStillRef.current[slot] = false;
      el.pause();
      sampleSlotVideoFrame(slot);
      ensureRenderLoop();
    }
  };

  const makeSlotSeekedHandler = (slot: 0 | 1) => (e: SyntheticEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    if (slotAutoPlayRef.current[slot] && !slotSafeEndedRef.current[slot] && !el.ended) {
      safePlayVideo(el, true);
      armVideoFramePump(el);
      ensureRenderLoop();
      return;
    }
    if (!slotAutoPlayRef.current[slot]) {
      slotPrimingStillRef.current[slot] = false;
      sampleSlotVideoFrame(slot);
      ensureRenderLoop();
    }
  };

  const makeSlotStallHandler = (slot: 0 | 1) => (e: SyntheticEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    if (
      slot === activeSlotRef.current &&
      slotAutoPlayRef.current[slot] &&
      !slotSafeEndedRef.current[slot] &&
      !el.ended &&
      !el.error
    ) {
      slotLastProgressMsRef.current[slot] = performance.now();
      safePlayVideo(el);
      armVideoFramePump(el);
      ensureRenderLoop();
    }
  };

  const makeSlotEndedHandler = (slot: 0 | 1) => (e: SyntheticEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    el.loop = false;
    el.pause();
    silenceVideoElement(el);
    slotAutoPlayRef.current[slot] = false;
    slotPrimingStillRef.current[slot] = false;
    slotSafeEndedRef.current[slot] = true;
    ensureRenderLoop();
  };

  const makeSlotErrorHandler = (slot: 0 | 1) => () => {
    const url = slotUrlRef.current[slot];
    if (!url || slot !== activeSlotRef.current) return;

    // Free any competing mobile decoders first
    const otherSlot: 0 | 1 = slot === 0 ? 1 : 0;
    releaseInactiveSlotDecoderOnMobile(otherSlot);
    if (escapePhaseRef.current === 'inactive') {
      releaseEscapeDecoderOnMobile();
    }

    if (slotRetryKeyRef.current[slot] === url) {
      // Retry already failed (e.g. 404 or unsupported stream): switch to built-in fallback or release lock!
      const fallbackUrl = withAssetBuildVersion(
        activeRoleRef.current === 'speaking'
          ? ANGEL_DEFAULT_SPEAKING_VIDEO_SRC
          : ANGEL_IDLE_LISTENING_VIDEO_SRC,
      );
      if (
        !forcedIdleUrlLiveRef.current &&
        !slotFallbackUsedRef.current[slot] &&
        stripAssetQuery(url) !== stripAssetQuery(fallbackUrl)
      ) {
        slotFallbackUsedRef.current[slot] = true;
        incomingWaitStartMsRef.current = performance.now();
        loadVideoIntoSlot(slot, fallbackUrl, slotAutoPlayRef.current[slot]);
      } else {
        waitingForIncomingFrameRef.current = false;
        isBlendingRef.current = false;
        slotSafeEndedRef.current[slot] = true;
      }
      ensureRenderLoop();
      return;
    }

    slotRetryKeyRef.current[slot] = url;
    // Recover from Service Worker / OS Range-request glitches by fetching the full MP4 into a Blob URL
    // (Blob URLs bypass HTTP 206 Range requests completely and decode reliably on Android, Windows, macOS & iOS).
    window.setTimeout(() => {
      if (slot !== activeSlotRef.current || slotUrlRef.current[slot] !== url) return;
      const vid = getVideoBySlot(slot);
      if (!vid) return;
      const cleanRetryUrl = `${url}${url.includes('?') ? '&' : '?'}retry=1`;
      void fetch(cleanRetryUrl, { credentials: 'same-origin' })
        .then(async (res) => {
          if (!res.ok) return null;
          const ct = (res.headers.get('content-type') || '').toLowerCase();
          if (ct.includes('text/html')) return null;
          const buf = await res.arrayBuffer();
          if (buf.byteLength < 4096) return null;
          return URL.createObjectURL(new Blob([buf], { type: 'video/mp4' }));
        })
        .catch(() => null)
        .then((blobUrl) => {
          if (slot !== activeSlotRef.current || slotUrlRef.current[slot] !== url) {
            revokeObjectUrlSafely(blobUrl);
            return;
          }
          const currentVid = getVideoBySlot(slot);
          if (!currentVid) {
            revokeObjectUrlSafely(blobUrl);
            return;
          }
          revokeObjectUrlSafely(slotBlobUrlRef.current[slot]);
          slotBlobUrlRef.current[slot] = blobUrl;
          currentVid.preload = 'auto';
          currentVid.src = blobUrl || cleanRetryUrl;
          currentVid.load();
          if (slotAutoPlayRef.current[slot]) {
            safePlayVideo(currentVid, true);
            armVideoFramePump(currentVid);
          }
          ensureRenderLoop();
        });
    }, 100);
  };

  const handleEscapeStall = (e: SyntheticEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    if (
      escapePhaseRef.current !== 'inactive' &&
      escapeAutoPlayRef.current &&
      !escapeSafeEndedRef.current &&
      !el.ended &&
      !el.error
    ) {
      safePlayVideo(el);
      armVideoFramePump(el);
      ensureRenderLoop();
    }
  };

  const handleEscapeVideoError = () => {
    const url = escapeUrlRef.current;
    if (!url || escapePhaseRef.current === 'inactive') return;

    const standbySlot: 0 | 1 = activeSlotRef.current === 0 ? 1 : 0;
    releaseInactiveSlotDecoderOnMobile(standbySlot);

    if (escapeRetryKeyRef.current === url) {
      // Retry already failed: abort overlay cleanly and resume base video so it never freezes!
      escapeWaitingFrameRef.current = false;
      playingPostVideoEscapeRef.current = false;
      hasEscapePrevRef.current = false;
      escapeCurrentAlphaRef.current = 0;
      escapeStartAlphaRef.current = 0;
      escapePhaseRef.current = 'inactive';
      activeEscapeCueKeyRef.current = null;
      releaseEscapeDecoderOnMobile();
      resumePausedBaseVideoAfterEscape();
      ensureRenderLoop();
      return;
    }

    escapeRetryKeyRef.current = url;
    window.setTimeout(() => {
      if (escapePhaseRef.current === 'inactive' || escapeUrlRef.current !== url) return;
      const escVid = escapeVideoRef.current;
      if (!escVid) return;
      const cleanRetryUrl = `${url}${url.includes('?') ? '&' : '?'}retry=1`;
      void fetch(cleanRetryUrl, { credentials: 'same-origin' })
        .then(async (res) => {
          if (!res.ok) return null;
          const ct = (res.headers.get('content-type') || '').toLowerCase();
          if (ct.includes('text/html')) return null;
          const buf = await res.arrayBuffer();
          if (buf.byteLength < 4096) return null;
          return URL.createObjectURL(new Blob([buf], { type: 'video/mp4' }));
        })
        .catch(() => null)
        .then((blobUrl) => {
          if (escapePhaseRef.current === 'inactive' || escapeUrlRef.current !== url) {
            revokeObjectUrlSafely(blobUrl);
            return;
          }
          const currentEsc = escapeVideoRef.current;
          if (!currentEsc) {
            revokeObjectUrlSafely(blobUrl);
            return;
          }
          revokeObjectUrlSafely(escapeBlobUrlRef.current);
          escapeBlobUrlRef.current = blobUrl;
          escapeSeekAppliedRef.current = false;
          currentEsc.preload = 'auto';
          currentEsc.src = blobUrl || cleanRetryUrl;
          currentEsc.load();
          if (escapeAutoPlayRef.current) {
            safePlayVideo(currentEsc, true);
            armVideoFramePump(currentEsc);
          }
          ensureRenderLoop();
        });
    }, 100);
  };

  const handleForceSilence = (e: SyntheticEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    el.loop = false;
    silenceVideoElement(el);
  };

  return (
    <div
      onClick={onClick}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      title={title}
      className={`relative pointer-events-auto select-none bg-black border-0 ring-0 outline-none shadow-none overflow-hidden shrink-0 ${portraitWidthClass} aspect-[560/752] ${onClick ? 'cursor-pointer' : ''} ${
        hasCardBelow ? '' : '[mask-image:linear-gradient(to_bottom,black_82%,transparent_100%)]'
      }`}
    >
      {/* Dual silent video decoders kept at non-zero paint opacity (0.01) behind opaque z-10 canvas
          so Android Chrome / WebView compositor never suspends hardware MediaCodec frame delivery */}
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
        controlsList="nodownload noplaybackrate"
        controls={false}
        onLoadStart={handleForceSilence}
        onLoadedMetadata={makeSlotMetadataHandler(0)}
        onLoadedData={makeSlotLoadedHandler(0)}
        onCanPlay={makeSlotLoadedHandler(0)}
        onTimeUpdate={makeSlotTimeUpdateHandler(0)}
        onSeeked={makeSlotSeekedHandler(0)}
        onPlay={() => {
          if (video0Ref.current) {
            silenceVideoElement(video0Ref.current);
            armVideoFramePump(video0Ref.current);
          }
          ensureRenderLoop();
        }}
        onPlaying={handleForceSilence}
        onStalled={makeSlotStallHandler(0)}
        onWaiting={makeSlotStallHandler(0)}
        onVolumeChange={handleForceSilence}
        onEnded={makeSlotEndedHandler(0)}
        onError={makeSlotErrorHandler(0)}
        className="absolute inset-0 z-0 w-full h-full opacity-[0.02] pointer-events-none"
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
        preload={IS_MOBILE_DEVICE ? 'none' : 'auto'}
        disablePictureInPicture
        disableRemotePlayback
        controlsList="nodownload noplaybackrate"
        controls={false}
        onLoadStart={handleForceSilence}
        onLoadedMetadata={makeSlotMetadataHandler(1)}
        onLoadedData={makeSlotLoadedHandler(1)}
        onCanPlay={makeSlotLoadedHandler(1)}
        onTimeUpdate={makeSlotTimeUpdateHandler(1)}
        onSeeked={makeSlotSeekedHandler(1)}
        onPlay={() => {
          if (video1Ref.current) {
            silenceVideoElement(video1Ref.current);
            armVideoFramePump(video1Ref.current);
          }
          ensureRenderLoop();
        }}
        onPlaying={handleForceSilence}
        onStalled={makeSlotStallHandler(1)}
        onWaiting={makeSlotStallHandler(1)}
        onVolumeChange={handleForceSilence}
        onEnded={makeSlotEndedHandler(1)}
        onError={makeSlotErrorHandler(1)}
        className="absolute inset-0 z-0 w-full h-full opacity-[0.02] pointer-events-none"
      />

      {/* 3rd silent decoder for Special Word-Triggered Escape Overlays ("you" & "push a button") */}
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
        preload={IS_MOBILE_DEVICE ? 'none' : 'auto'}
        disablePictureInPicture
        disableRemotePlayback
        controlsList="nodownload noplaybackrate"
        controls={false}
        onLoadStart={handleForceSilence}
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          el.loop = false;
          silenceVideoElement(el);
          if (!escapeSeekAppliedRef.current) {
            applyEscapeTargetSeek(el, true);
          }
          if (escapeAutoPlayRef.current) {
            safePlayVideo(el);
            armVideoFramePump(el);
            ensureRenderLoop();
          }
        }}
        onLoadedData={(e) => {
          const el = e.currentTarget;
          el.loop = false;
          silenceVideoElement(el);
          escapeRetryKeyRef.current = '';
          if (!escapeSeekAppliedRef.current) {
            applyEscapeTargetSeek(el, true);
          }
          if (escapeAutoPlayRef.current) {
            safePlayVideo(el);
            armVideoFramePump(el);
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
          escapeRetryKeyRef.current = '';
          if (!escapeSeekAppliedRef.current) {
            applyEscapeTargetSeek(el, !escapeAutoPlayRef.current);
          }
          if (escapeAutoPlayRef.current && el.paused) {
            safePlayVideo(el);
            armVideoFramePump(el);
          } else if (!escapeAutoPlayRef.current) {
            sampleEscapeVideoFrame();
          }
          ensureRenderLoop();
        }}
        onPlay={() => {
          if (escapeVideoRef.current) {
            silenceVideoElement(escapeVideoRef.current);
            armVideoFramePump(escapeVideoRef.current);
          }
          ensureRenderLoop();
        }}
        onPlaying={handleForceSilence}
        onStalled={handleEscapeStall}
        onWaiting={handleEscapeStall}
        onVolumeChange={handleForceSilence}
        onEnded={(e) => {
          const el = e.currentTarget;
          el.loop = false;
          el.pause();
          silenceVideoElement(el);
          escapeSafeEndedRef.current = true;
          ensureRenderLoop();
        }}
        onError={handleEscapeVideoError}
        className="absolute inset-0 z-0 w-full h-full opacity-[0.02] pointer-events-none"
      />

      {/* Visible frameless 3:4 portrait canvas — opacity 0.999 defeats Blink/WebKit occluded-video throttling while staying visually solid over bg-black */}
      <canvas
        ref={canvasRef}
        width={PORTRAIT_CANVAS_W}
        height={PORTRAIT_CANVAS_H}
        className="relative z-10 block w-full h-full object-cover opacity-[0.999] border-0 ring-0 outline-none shadow-none pointer-events-none [filter:contrast(1.032)_brightness(0.986)]"
      />
    </div>
  );
}

interface OpponentSpeechBannerProps {
  visible?: boolean;
  upperRightVoid?: UpperRightVoidSpec;
  message: OpponentMessage | null;
  angelVoice: AngelVoiceMode;
  soundEnabled: boolean;
  voiceState: VoicePlaybackState;
  calcPreview: CalcPreviewProgress | null;
  treeBrowser: TreeBrowserState | null;
  idlePreviewNonce?: number;
  forcedIdleUrl?: string | null;
  forcedIdleCueAtSec?: number | null;
  onForcedIdleCueReached?: () => void;
  danceWithStarsActive?: boolean;
  onSelectTreeSimulation: (index: number | null) => void;
  onStepTreeSimulation: (delta: -1 | 1) => void;
  onToggleTreeOnlyTopThree: () => void;
  onContinueFromTree: () => void;
  onOpenTreeBrowser?: (onlyTopThree?: boolean) => void;
  onExportTreeJpg: () => void;
  frontalTreeViewOpen?: boolean;
  thinkingLinesProjected?: boolean;
  onSwitchOffThinkingLines?: () => void;
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
  onTurnOffAngel?: () => void;
  onOpenVideoStudio?: () => void;
  powerSaveMode?: boolean;
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
  visible = true,
  upperRightVoid,
  message,
  angelVoice,
  soundEnabled,
  voiceState,
  calcPreview,
  treeBrowser,
  idlePreviewNonce = 0,
  forcedIdleUrl = null,
  forcedIdleCueAtSec = null,
  onForcedIdleCueReached,
  danceWithStarsActive = false,
  onSelectTreeSimulation,
  onStepTreeSimulation,
  onToggleTreeOnlyTopThree,
  onContinueFromTree,
  onOpenTreeBrowser,
  onExportTreeJpg,
  frontalTreeViewOpen = false,
  thinkingLinesProjected = false,
  onSwitchOffThinkingLines,
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
  onTurnOffAngel,
  onOpenVideoStudio,
  powerSaveMode = false,
}: OpponentSpeechBannerProps) {
  const asideRef = useRef<HTMLElement | null>(null);
  const portraitCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const forcedIdleClockRef = useRef<ForcedIdleVideoClock>({
    currentTime: 0,
    duration: 0,
    active: false,
  });
  const lastSteppedTierKeyRef = useRef<string>('');
  const [tierDowngrade, setTierDowngrade] = useState(0);

  const voidSpec =
    upperRightVoid ??
    computeFallbackUpperRightVoid(
      typeof window !== 'undefined' ? window.innerWidth : 1280,
      typeof window !== 'undefined' ? window.innerHeight : 800,
    );

  const isSpeaking = voiceState === 'speaking';
  const isSilentBranchPlaying = Boolean(calcPreview && !calcPreview.waitingForConfirm);
  const activeBannerMessage = isSilentBranchPlaying ? null : message;
  const action = activeBannerMessage?.action;
  const isUndoProposed = Boolean(
    activeBannerMessage && angelVoice !== 'off' && action?.kind === 'undo-offer',
  );
  const isCompactPortrait = Boolean(calcPreview || treeBrowser);
  const isElevatedZ = Boolean(treeBrowser || isUndoProposed);
  const isWideCard = Boolean(treeBrowser);
  const canClickPortraitToReplay = Boolean(
    soundEnabled && activeBannerMessage && angelVoice !== 'off',
  );

  const hasCalcPreview = Boolean(calcPreview);
  const hasTreeBrowser = Boolean(treeBrowser);
  const msgId = activeBannerMessage?.id ?? 0;

  useEffect(() => {
    lastSteppedTierKeyRef.current = '';
    setTierDowngrade(0);
  }, [
    voidSpec.targetWidthPx,
    voidSpec.targetHeightPx,
    voidSpec.hasVoidSpace,
    hasCalcPreview,
    hasTreeBrowser,
    msgId,
    visible,
  ]);

  const matchedBaseIdx = selectMatchedAngelTierIndex(voidSpec, isWideCard);
  const tier = selectAngelVoidSizeTier(voidSpec, isWideCard, tierDowngrade);

  // Post-layout height fit: whenever unclipped multi-line modal content + portrait video
  // exceed available vertical budget, step down unified tiers cleanly so 100% of both the
  // portrait video and the entire modal content always stay visible on screen.
  useEffect(() => {
    if (!visible || !voidSpec.hasVoidSpace || matchedBaseIdx < 1 || tierDowngrade >= matchedBaseIdx) {
      return undefined;
    }
    const el = asideRef.current;
    if (!el) return undefined;

    let rafId = 0;
    const scheduleCheck = () => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        const node = asideRef.current;
        if (!node) return;
        const passKey = `${voidSpec.targetWidthPx}:${voidSpec.targetHeightPx}:${msgId}:${tier.index}:${tierDowngrade}`;
        if (lastSteppedTierKeyRef.current === passKey) return;
        const viewportBudgetPx =
          typeof window !== 'undefined'
            ? Math.max(220, window.innerHeight - 16)
            : voidSpec.targetHeightPx;
        const maxAllowedHeight = Math.min(voidSpec.targetHeightPx + 10, viewportBudgetPx);
        if (node.offsetHeight > maxAllowedHeight) {
          lastSteppedTierKeyRef.current = passKey;
          setTierDowngrade((prev) => Math.min(matchedBaseIdx, prev + 1));
        }
      });
    };

    scheduleCheck();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => scheduleCheck());
      ro.observe(el);
      return () => {
        window.cancelAnimationFrame(rafId);
        ro.disconnect();
      };
    }
    return () => window.cancelAnimationFrame(rafId);
  }, [
    visible,
    voidSpec.hasVoidSpace,
    voidSpec.targetWidthPx,
    voidSpec.targetHeightPx,
    matchedBaseIdx,
    tier.index,
    tierDowngrade,
    msgId,
  ]);

  if (!visible) {
    return null;
  }

  const triggerKey = activeBannerMessage?.isStudioPreview
    ? `preview:${activeBannerMessage.id}`
    : forcedIdleUrl
      ? `idle:forced:${idlePreviewNonce}:${stripAssetQuery(forcedIdleUrl)}`
      : calcPreview
        ? calcPreview.waitingForConfirm && activeBannerMessage && angelVoice !== 'off'
          ? `msg:${activeBannerMessage.id}`
          : `idle:calc:${calcPreview.branchIndex}`
        : treeBrowser
          ? activeBannerMessage && angelVoice !== 'off'
            ? `msg:${activeBannerMessage.id}`
            : `idle:tree:${idlePreviewNonce}`
          : activeBannerMessage && angelVoice !== 'off'
            ? `msg:${activeBannerMessage.id}`
            : `idle:${idlePreviewNonce}`;

  const activeColumnWidthPx = isCompactPortrait
    ? tier.compactPortraitWidthPx
    : tier.portraitWidthPx;
  const isRoomy = tier.showVerboseCopy && activeColumnWidthPx >= 268;
  const isMediumPlus = tier.index >= 3;

  const {
    cardShellClass,
    titleTextClass,
    tagTextClass,
    bodyQuoteClass,
    sectionDividerClass,
    treeMaxHeightClass,
    simChipListClass,
    iconSmClass,
    iconBtnPadClass,
    primaryActionBtnClass,
    secondaryActionBtnClass,
    footerBtnPadClass,
    footerBtnCompactPadClass,
    footerBtnIconClass,
  } = tier;

  const renderThinkingAndThreeMoves = (compact = false, forceAllowThreeMoves = false) => {
    const padClass = compact ? footerBtnCompactPadClass : footerBtnPadClass;
    const isThreeMovesPlaying = Boolean(calcPreview);
    const handleThreeMovesClick = onPlayThreeMoves || onAnimateTopThreeFromTree;
    const showThreeMovesBtn =
      Boolean(handleThreeMovesClick) &&
      (forceAllowThreeMoves || proposeThreeMoves || isThreeMovesPlaying);

    return (
      <div className={`flex flex-wrap items-center ${isRoomy ? 'gap-2' : 'gap-1'}`}>
        <button
          type="button"
          onClick={onExportTreeJpg}
          aria-pressed={frontalTreeViewOpen}
          title={
            frontalTreeViewOpen
              ? 'Close thinking lines view and return to 3D board'
              : 'Show frontal top-view thinking lines on pure black'
          }
          className={`inline-flex items-center ${padClass} border font-semibold transition-colors cursor-pointer text-left leading-tight ${
            frontalTreeViewOpen
              ? 'bg-[#241b0c] hover:bg-[#312510] border-[#f3cf83]/85 text-[#fde68a]'
              : 'bg-black hover:bg-[#141a25] border-[#d6ae63]/55 text-[#f3cf83]'
          }`}
        >
          <Maximize2 className={`${footerBtnIconClass} text-[#f3cf83] shrink-0`} />
          <span>Thinking Lines</span>
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
            className={`inline-flex items-center ${padClass} border font-semibold transition-colors cursor-pointer text-left leading-tight ${
              isThreeMovesPlaying
                ? 'bg-[#122232] hover:bg-[#182d42] border-[#38bdf8]/80 text-[#bae6fd]'
                : 'bg-black hover:bg-[#141a25] border-[#38bdf8]/50 text-[#bae6fd]'
            }`}
          >
            <Eye className={`${footerBtnIconClass} text-[#7dd3fc] shrink-0`} />
            <span>Three Moves</span>
          </button>
        )}

        {thinkingLinesProjected && onSwitchOffThinkingLines && (
          <button
            type="button"
            onClick={onSwitchOffThinkingLines}
            title="Switch off all thinking lines and arrows projected onto the board"
            className={`inline-flex items-center ${padClass} bg-[#241016] hover:bg-[#341620] border border-[#fb7185]/75 font-semibold text-[#fecdd3] transition-colors cursor-pointer text-left leading-tight`}
          >
            <EyeOff className={`${footerBtnIconClass} text-[#fda4af] shrink-0`} />
            <span>Lines Off</span>
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
      <div className={`w-full bg-black border border-[#d6ae63]/60 shadow-2xl pointer-events-auto ${cardShellClass}`}>
        <div className={`flex flex-wrap items-start justify-between ${isRoomy ? 'gap-2' : 'gap-1'}`}>
          <div className="min-w-0 flex-1">
            <div className={`${titleTextClass} font-semibold break-words whitespace-normal ${trialAccent}`}>
              {trialHeading}
              {calcPreview.waitingForConfirm ? ' · Ready' : ' · Playing'}
            </div>
            <div className={`font-mono-tabular ${titleTextClass} text-[#f3f1ec] break-words whitespace-normal mt-0.5`}>
              {calcPreview.pvSan.join(' → ')}
            </div>
          </div>

          <div className={`flex items-center ${isRoomy ? 'gap-1.5' : 'gap-0.5'} shrink-0`}>
            {soundEnabled && calcPreview.waitingForConfirm && (
              <button
                type="button"
                onClick={onReplayVoice}
                title="Replay voice"
                aria-label="Replay voice"
                className={`${iconBtnPadClass} rounded transition-colors cursor-pointer ${
                  isSpeaking
                    ? 'text-[#f3cf83] bg-[#d6ae63]/15'
                    : 'text-[#9aa3b2] hover:text-[#f3f1ec] hover:bg-white/10'
                }`}
              >
                <Volume2 className={iconSmClass} />
              </button>
            )}
            <button
              type="button"
              onClick={onStopCalculationPreview}
              className={`inline-flex items-center gap-0.5 ${footerBtnCompactPadClass} bg-[#141820] hover:bg-[#1f2633] border border-white/15 font-medium text-[#e2e8f0] shrink-0 cursor-pointer`}
            >
              <Square className={footerBtnIconClass} />
              <span>Stop</span>
            </button>
          </div>
        </div>

        {calcPreview.waitingForConfirm && (
          <div className={sectionDividerClass}>
            <p className={bodyQuoteClass}>
              &ldquo;
              {message?.text ||
                'Have you seen and understood this branch? Click to confirm when you are ready for the next one.'}
              &rdquo;
            </p>
            <div className={`${isRoomy ? 'mt-2 gap-1.5' : 'mt-1 gap-1'} flex flex-wrap items-center justify-between`}>
              <button
                type="button"
                onClick={onConfirmNextBranch}
                className={primaryActionBtnClass}
              >
                <Check className={iconSmClass} />
                <span>
                  {calcPreview.branchIndex >= calcPreview.totalBranches
                    ? 'Done'
                    : `Next #${nextBranchNum}`}
                </span>
              </button>
              <span className={`${tagTextClass} text-[#9aa3b2] break-words whitespace-normal`}>
                or click on the board
              </span>
            </div>
          </div>
        )}

        <div className={sectionDividerClass}>
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
      <div className={`w-full max-h-[56dvh] overflow-y-auto bg-black border border-[#d6ae63]/70 shadow-2xl pointer-events-auto ${treeMaxHeightClass}`}>
        <div className={`flex flex-wrap items-center justify-between ${isRoomy ? 'gap-1.5' : 'gap-1'}`}>
          <div className={`flex flex-wrap items-center ${isRoomy ? 'gap-1.5' : 'gap-1'} min-w-0`}>
            <span className={`${isRoomy ? 'w-6 h-6 rounded-md' : isMediumPlus ? 'w-4 h-4 rounded' : 'w-3.5 h-3.5 rounded'} bg-black border border-[#38bdf8]/60 inline-flex items-center justify-center shrink-0`}>
              <GitBranch className={`${iconSmClass} text-[#7dd3fc]`} />
            </span>
            <h2
              id="chess-angel-tree-modal-title"
              className={`font-semibold ${titleTextClass} text-[#f7f1e5]`}
            >
              Chess Angel
            </h2>
            <span className={`text-white/30 ${tagTextClass}`} aria-hidden="true">
              ·
            </span>
            <span className={`font-mono-tabular ${tagTextClass} font-medium text-[#7dd3fc] break-words whitespace-normal`}>
              {treeBrowser.onlyTopThree
                ? '3 BEST'
                : `ALL ${allSims.length}`}
            </span>
          </div>

          <div className={`flex items-center ${isRoomy ? 'gap-1' : 'gap-0.5'} shrink-0`}>
            {soundEnabled && message && (
              <button
                type="button"
                onClick={onReplayVoice}
                title={isSpeaking ? 'Speaking — click to replay' : 'Replay voice'}
                aria-label="Replay voice"
                className={`${iconBtnPadClass} rounded transition-colors cursor-pointer ${
                  isSpeaking
                    ? 'text-[#f3cf83] bg-[#d6ae63]/15'
                    : 'text-[#9aa3b2] hover:text-[#f3f1ec] hover:bg-white/10'
                }`}
              >
                <Volume2 className={iconSmClass} />
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
              className={`${iconBtnPadClass} rounded transition-colors cursor-pointer ${
                frontalTreeViewOpen
                  ? 'text-[#f3cf83] bg-[#d6ae63]/20 ring-1 ring-[#d6ae63]/50'
                  : 'text-[#9aa3b2] hover:text-[#f3cf83] hover:bg-white/10'
              }`}
            >
              <Maximize2 className={iconSmClass} />
            </button>
          </div>
        </div>

        <p className={bodyQuoteClass}>
          &ldquo;{spokenText}&rdquo;
        </p>

        {allSims.length > 0 && (
          <div className={`${isRoomy ? 'mt-2 gap-1.5' : 'mt-1 gap-1'} flex items-center`}>
            <button
              type="button"
              onClick={onToggleTreeOnlyTopThree}
              aria-pressed={treeBrowser.onlyTopThree}
              className={`w-full inline-flex flex-wrap items-center justify-center text-center leading-tight ${footerBtnPadClass} border font-semibold transition-colors cursor-pointer ${
                treeBrowser.onlyTopThree
                  ? 'bg-[#122232] border-[#38bdf8]/80 text-[#bae6fd]'
                  : 'bg-black hover:bg-[#141923] border-[#d6ae63]/65 text-[#f3cf83]'
              }`}
            >
              <Sparkles className={`${footerBtnIconClass} shrink-0`} />
              <span>
                {treeBrowser.onlyTopThree
                  ? `Showing 3 Best · Show All ${allSims.length}`
                  : isRoomy
                    ? 'Only 3 Best Evaluations'
                    : 'Only 3 Best'}
              </span>
            </button>
          </div>
        )}

        {visibleSims.length > 0 && (
          <div className={sectionDividerClass}>
            <div className={`flex flex-wrap items-center justify-between ${isRoomy ? 'gap-1.5' : 'gap-1'}`}>
              <button
                type="button"
                onClick={() => onStepTreeSimulation(-1)}
                title="Previous simulation (Left Arrow)"
                className={`inline-flex items-center ${footerBtnCompactPadClass} bg-black hover:bg-[#151b26] border border-white/18 font-medium text-[#e2e8f0] cursor-pointer`}
              >
                <ChevronLeft className={iconSmClass} />
                <span>Prev</span>
              </button>

              <div className={`flex flex-wrap items-center gap-1 min-w-0 ${tagTextClass} font-mono-tabular text-[#cbd5e1]`}>
                <span>
                  {activeIdx !== null
                    ? `${activeIdx + 1}/${visibleSims.length}`
                    : `${visibleSims.length}`}
                </span>
                {activeIdx !== null && (
                  <button
                    type="button"
                    onClick={() => onSelectTreeSimulation(null)}
                    className={`px-1 py-0 rounded border border-white/16 ${tagTextClass} text-[#9aa3b2] hover:text-white cursor-pointer`}
                  >
                    All
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => onStepTreeSimulation(1)}
                title="Next simulation (Right Arrow)"
                className={`inline-flex items-center ${footerBtnCompactPadClass} bg-black hover:bg-[#151b26] border border-white/18 font-medium text-[#e2e8f0] cursor-pointer`}
              >
                <span>Next</span>
                <ChevronRight className={iconSmClass} />
              </button>
            </div>

            {activeSim && activeColor && activeIdx !== null ? (
              <div
                className={`${isRoomy ? 'mt-2 rounded-lg px-2.5 py-1.5' : 'mt-1 rounded px-1.5 py-1'} bg-black border ${activeColor.borderClass}`}
              >
                <div className={`flex flex-wrap items-center justify-between ${isRoomy ? 'gap-1.5' : 'gap-1'}`}>
                  <div className="flex flex-wrap items-center gap-1 min-w-0">
                    <span
                      className={`${isRoomy ? 'w-2.5 h-2.5' : 'w-1.5 h-1.5'} rounded-full shrink-0 ${activeColor.dotBgClass}`}
                    />
                    <span className={`${titleTextClass} font-semibold ${activeColor.textClass}`}>
                      #{activeIdx + 1} {activeSim.pvSan[0] || activeSim.bestMoveUci}
                    </span>
                    <span className={`${tagTextClass} px-1 py-0 rounded border border-white/14 text-[#cbd5e1]`}>
                      {activeColor.badgeLabel}
                    </span>
                  </div>
                  <span
                    className={`font-mono-tabular ${titleTextClass} font-semibold ${activeColor.textClass}`}
                  >
                    {formatEvalLabel(activeSim.scoreCp, activeSim.mateIn)}
                  </span>
                </div>
                <div className={`mt-0.5 font-mono-tabular ${tagTextClass} text-[#d8dee9] break-words whitespace-normal`}>
                  {activeSim.pvSan.slice(0, 5).join(' → ') || activeSim.bestMoveUci}
                </div>
              </div>
            ) : treeBrowser.onlyTopThree ? (
              <div className={`${isRoomy ? 'mt-2 gap-1.5' : 'mt-1 gap-0.5'} flex flex-col`}>
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
                      className={`w-full flex flex-wrap items-center justify-between gap-1 ${isRoomy ? 'px-2 py-1' : 'px-1.5 py-0.5'} rounded bg-black hover:bg-[#121722] border ${spec.borderClass} text-left cursor-pointer transition-colors`}
                    >
                      <div className="flex flex-wrap items-center gap-1 min-w-0">
                        <span className={`${isRoomy ? 'w-2 h-2' : 'w-1.5 h-1.5'} rounded-full shrink-0 ${spec.dotBgClass}`} />
                        <span className={`${titleTextClass} font-semibold ${spec.textClass}`}>
                          #{idx + 1} {sim.pvSan[0] || sim.bestMoveUci}
                        </span>
                        <span className={`font-mono-tabular ${tagTextClass} text-[#9aa3b2] break-words whitespace-normal`}>
                          {sim.pvSan.slice(1, 4).join(' → ')}
                        </span>
                      </div>
                      <span
                        className={`font-mono-tabular ${titleTextClass} font-semibold shrink-0 ${spec.textClass}`}
                      >
                        {formatEvalLabel(sim.scoreCp, sim.mateIn)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className={`${isRoomy ? 'mt-2 px-2 py-1.5' : 'mt-1 px-1.5 py-1'} rounded bg-black border border-white/12 ${tagTextClass} text-[#aeb7c6] break-words whitespace-normal leading-snug`}>
                Use <span className="text-[#f3f1ec] font-medium">Prev / Next</span>, click any
                colored evaluation below, or click a square on the 3D board to inspect each
                simulation calmly.
              </div>
            )}

            <div className={`${simChipListClass} ${isRoomy ? 'max-h-[112px]' : 'max-h-[82px]'} overflow-y-auto pr-0.5 flex flex-wrap`}>
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
                    className={`inline-flex items-center gap-0.5 ${isRoomy ? 'px-2 py-0.5 text-[11px]' : isMediumPlus ? 'px-1.5 py-0.5 text-[9px]' : 'px-1 py-0 text-[8px]'} rounded font-mono-tabular border transition-colors cursor-pointer ${
                      isSelected
                        ? `bg-[#182030] ${spec.borderClass} text-white font-semibold`
                        : 'bg-black hover:bg-[#131824] border-white/14 text-[#cbd5e1]'
                    }`}
                  >
                    <span className={`${isRoomy ? 'w-1.5 h-1.5' : 'w-1 h-1'} rounded-full shrink-0 ${spec.dotBgClass}`} />
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

        <div className={`${sectionDividerClass} flex flex-col ${isRoomy ? 'gap-2' : 'gap-1.5'}`}>
          <button
            type="button"
            onClick={onContinueFromTree}
            className={`${primaryActionBtnClass} w-full justify-center`}
          >
            <Play className={iconSmClass} />
            <span>
              {treeBrowser.hasPendingBotMove ? 'Continue · Play Move' : 'Done · Close Tree'}
            </span>
          </button>

          {renderThinkingAndThreeMoves(true, true)}
        </div>
      </div>
    );
  } else if (!message || angelVoice === 'off') {
    // 3. Permanent Calm Listening Card (always matching portrait video width and showing full content)
    modalCardContent = (
      <div className={`w-full bg-black border border-[#d6ae63]/65 shadow-2xl pointer-events-auto ${cardShellClass}`}>
        <div className={`flex flex-wrap items-center justify-between ${isRoomy ? 'gap-1.5' : 'gap-1'}`}>
          <div className={`flex flex-wrap items-center ${isRoomy ? 'gap-1.5' : 'gap-1'} min-w-0 ${titleTextClass}`}>
            <span className="font-semibold text-[#f7f1e5]">
              Chess Angel
            </span>
            <span className="text-white/30" aria-hidden="true">
              ·
            </span>
            <span className={`font-mono-tabular ${tagTextClass} font-medium text-[#d9be95] break-words whitespace-normal`}>
              LISTENING
            </span>
          </div>

          <div className={`flex items-center ${isRoomy ? 'gap-1.5' : 'gap-0.5'} shrink-0`}>
            {onOpenVideoStudio && (
              <button
                type="button"
                onClick={onOpenVideoStudio}
                title="Assign Chess Angel .mp4 videos per saying or group (auto-silences video sound)"
                className={`inline-flex items-center ${footerBtnCompactPadClass} bg-black hover:bg-[#1a160f] border border-[#d6ae63]/45 font-medium text-[#f3cf83] cursor-pointer`}
              >
                <Film className={`${footerBtnIconClass} text-[#f3cf83] shrink-0`} />
                <span>Videos</span>
              </button>
            )}
          </div>
        </div>

        <p className={bodyQuoteClass}>
          &ldquo;Watching the board quietly — take your time on your next move.&rdquo;
        </p>

        <div className={sectionDividerClass}>
          {renderThinkingAndThreeMoves(false)}
        </div>
      </div>
    );
  } else {
    // 4. Permanent Chess Angel Framed Black Modal Card (always matching portrait video width and showing full content)
    const tagColor = TONE_TAG_COLOR[message.tone];
    const needsAudioGesture = voiceState === 'awaiting-gesture' && soundEnabled;
    const summaryText =
      message.mathSummary || (action?.kind === 'undo-offer' ? action.reasonNote : undefined);

    modalCardContent = (
      <div className={`w-full bg-black border border-[#d6ae63]/65 shadow-2xl pointer-events-auto ${cardShellClass}`}>
        <div className={`flex flex-wrap items-center justify-between ${isRoomy ? 'gap-1.5' : 'gap-1'}`}>
          <div className={`flex flex-wrap items-center ${isRoomy ? 'gap-1.5' : 'gap-1'} min-w-0 ${titleTextClass}`}>
            <span className="font-semibold text-[#f7f1e5]">
              {message.speaker}
            </span>
            <span className="text-white/30" aria-hidden="true">
              ·
            </span>
            <span className={`font-mono-tabular ${tagTextClass} font-medium break-words whitespace-normal ${tagColor}`}>
              {message.tag}
            </span>
          </div>

          <div className={`flex flex-wrap items-center ${isRoomy ? 'gap-1.5' : 'gap-0.5'} shrink-0`}>
            {soundEnabled && (
              <button
                type="button"
                onClick={onReplayVoice}
                title={isSpeaking ? 'Speaking — click to replay' : 'Hear Chess Angel'}
                aria-label="Replay voice"
                className={`${iconBtnPadClass} rounded transition-colors cursor-pointer ${
                  isSpeaking
                    ? 'text-[#f3cf83] bg-[#d6ae63]/15'
                    : 'text-[#9aa3b2] hover:text-[#f3f1ec] hover:bg-white/10'
                }`}
              >
                <Volume2 className={iconSmClass} />
              </button>
            )}
            {onOpenVideoStudio && (
              <button
                type="button"
                onClick={onOpenVideoStudio}
                title="Assign Chess Angel .mp4 videos per saying or group (auto-silences video sound)"
                className={`inline-flex items-center ${footerBtnCompactPadClass} bg-black hover:bg-[#1a160f] border border-[#d6ae63]/45 font-medium text-[#f3cf83] cursor-pointer`}
              >
                <Film className={`${footerBtnIconClass} text-[#f3cf83] shrink-0`} />
                <span>Videos</span>
              </button>
            )}
            {action?.kind === 'undo-offer' && (
              <button
                type="button"
                onClick={() => onUndoAndShowBetter(action.alternatives)}
                title="Undo your last move and see a stronger alternative"
                className={primaryActionBtnClass}
              >
                <RotateCcw className={footerBtnIconClass} />
                <span>Undo</span>
              </button>
            )}
          </div>
        </div>

        {summaryText && (
          <div className={`mt-1 font-mono-tabular ${tagTextClass} text-[#aeb7c6] break-words whitespace-normal`}>
            {summaryText}
          </div>
        )}

        <p className={bodyQuoteClass}>
          &ldquo;{message.text}&rdquo;
        </p>

        {needsAudioGesture && !action && (
          <div className={`${isRoomy ? 'mt-2 gap-1.5' : 'mt-1 gap-1'} flex flex-wrap items-center`}>
            <button
              type="button"
              onClick={onReplayVoice}
              className={primaryActionBtnClass}
            >
              <Volume2 className={iconSmClass} />
              <span>Play Voice</span>
            </button>
          </div>
        )}

        {proposeThreeMoves && action?.kind === 'calc-preview' && (
          <div className={`${isRoomy ? 'mt-2 gap-1.5' : 'mt-1 gap-1'} flex flex-wrap items-center`}>
            <button
              type="button"
              onClick={() => onWatchCalculatedLines(action.report)}
              className={primaryActionBtnClass}
            >
              <Play className={iconSmClass} />
              <span>{Math.min(3, action.report.triedLines.length)} Lines</span>
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className={secondaryActionBtnClass}
            >
              Skip
            </button>
          </div>
        )}

        {action?.kind === 'hint-offer' && (
          <div className={`${isRoomy ? 'mt-2 gap-1.5' : 'mt-1 gap-1'} flex flex-wrap items-center`}>
            <button
              type="button"
              onClick={() => onAcceptHint(action.bestMoveUci, action.bestMoveSan)}
              className={primaryActionBtnClass}
            >
              <Lightbulb className={iconSmClass} />
              <span>Hint ({action.bestMoveSan})</span>
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className={secondaryActionBtnClass}
            >
              Skip
            </button>
          </div>
        )}

        {message.clipId.startsWith('tree_browse_') && onOpenTreeBrowser && (
          <div className={`${isRoomy ? 'mt-2 gap-1.5' : 'mt-1 gap-1'} flex flex-wrap items-center`}>
            <button
              type="button"
              onClick={() => onOpenTreeBrowser(false)}
              className={primaryActionBtnClass}
            >
              <GitBranch className={iconSmClass} />
              <span>Browse Simulations</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenTreeBrowser(true)}
              className={`inline-flex items-center ${footerBtnCompactPadClass} bg-black hover:bg-[#141923] border border-[#d6ae63]/65 font-semibold text-[#f3cf83] cursor-pointer`}
            >
              <Sparkles className={footerBtnIconClass} />
              <span>Only 3 Best</span>
            </button>
          </div>
        )}

        <div className={sectionDividerClass}>
          {renderThinkingAndThreeMoves(false)}
        </div>
      </div>
    );
  }

  // Unified column width: both Chess Angel's portrait video above and her black modal below
  // are `w-full` children of `<aside>`, guaranteeing 100% identical width across all states and tiers.
  const unifiedColumnWidthClass = isCompactPortrait
    ? tier.compactPortraitWidthClass
    : tier.portraitWidthClass;

  // When Chess Angel is playing her angel_modal_off farewell (from clicking her or toggling Off),
  // hide the modal box underneath immediately so only her farewell portrait animation plays out cleanly.
  const isTurningOffAngel = Boolean(
    activeBannerMessage?.clipId.startsWith('angel_modal_off_'),
  );
  const showModalBelow = !isTurningOffAngel && Boolean(modalCardContent);

  const isDanceStarsAuraVisible = Boolean(
    danceWithStarsActive || (forcedIdleUrl && /dance_stars/i.test(forcedIdleUrl)),
  );

  return (
    <aside
      ref={asideRef}
      data-angel-portrait-modal="true"
      aria-live="polite"
      className={`fixed ${tier.asidePositionClass} ${
        isElevatedZ ? 'z-40' : 'z-30'
      } ${unifiedColumnWidthClass} flex flex-col items-stretch pointer-events-none overflow-visible`}
    >
      <div className="relative w-full overflow-visible">
        <DanceWithStarsAura
          active={isDanceStarsAuraVisible}
          powerSaveMode={powerSaveMode}
          videoClockRef={forcedIdleClockRef}
          portraitCanvasRef={portraitCanvasRef}
        />
        <ChessAngelPortraitVideo
          clipId={activeBannerMessage?.clipId}
          speechText={activeBannerMessage?.text}
          forcedIdleUrl={forcedIdleUrl}
          forcedIdleCueAtSec={forcedIdleCueAtSec}
          onForcedIdleCueReached={onForcedIdleCueReached}
          forcedIdleClockRef={forcedIdleClockRef}
          portraitCanvasRef={portraitCanvasRef}
          isSpeaking={isSpeaking}
          soundEnabled={soundEnabled}
          angelVoice={angelVoice}
          triggerKey={triggerKey}
          portraitWidthClass="w-full"
          hasCardBelow={showModalBelow}
          powerSaveMode={powerSaveMode}
          onClick={onTurnOffAngel ?? (canClickPortraitToReplay ? onReplayVoice : undefined)}
          title={
            onTurnOffAngel
              ? isTurningOffAngel
                ? 'Click again to hide Chess Angel immediately'
                : 'Click Chess Angel to turn Angel & Modal off'
              : canClickPortraitToReplay
                ? 'Click to replay Chess Angel voice'
                : 'Chess Angel'
          }
        />
      </div>

      {showModalBelow ? modalCardContent : null}
    </aside>
  );
}
