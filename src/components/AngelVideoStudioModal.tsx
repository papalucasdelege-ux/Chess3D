import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Crosshair,
  Crown,
  Film,
  Hand,
  Loader2,
  Lock,
  Music,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  Ruler,
  Sparkles,
  Trash2,
  Unlock,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { APP_VERSION } from '../chess/assetVersion';
import {
  ANGEL_CASE_VIDEO_MAP,
  ANGEL_DEFAULT_SPEAKING_VIDEO_SRC,
  ANGEL_GROUP_VIDEO_MAP,
  ANGEL_IDLE_LISTENING_VIDEO_SRC,
  ANGEL_VIDEO_NATIVE_H,
  ANGEL_VIDEO_NATIVE_W,
  ANGEL_VIDEO_STUDIO_GROUPS,
  ALL_ESCAPE_CUE_KEYS,
  DEFAULT_ANGEL_BG_TRANSPARENCY,
  DEFAULT_DOG_RUN_EXIT_X_PX,
  DEFAULT_DOG_RUN_EXIT_Y_PX,
  DEFAULT_OPENING_FLOWCHART_DENSITY,
  DEFAULT_OPENING_FLOWCHART_START_SEC,
  DEFAULT_CALC_PURE_TREE_DENSITY,
  DEFAULT_CALC_PURE_TREE_OFFSET_X,
  DEFAULT_CALC_PURE_TREE_OFFSET_Y,
  caseHasAlternativeSlotUI,
  compressAngelStudioVideos,
  getAngelBgTransparency,
  getAngelDanceStarsVideoUrl,
  getAngelDogRunExitXPx,
  getAngelDogRunExitYPx,
  getAngelDogRunJumpSec,
  getAngelDogRunVideoUrl,
  getAngelIdleVideoPool,
  getAngelVideoOverridesSnapshot,
  getCaseEscapeCueStatus,
  getCaseSlotKeys,
  getCaseVideoPool,
  getEscapeCueEntries,
  getEscapeSlotKey,
  getEscapeVideoApexSec,
  getEscapeVideoPool,
  getOpeningFlowchartDensity,
  getOpeningFlowchartStartSec,
  getCalcPureTreeDensity,
  getCalcPureTreeOffsetX,
  getCalcPureTreeOffsetY,
  getSeductionCaseEntries,
  getSeductionSlotKey,
  getVideoFileDurationSec,
  getVideoFileSizeBytes,
  getVideoOptimizedInfo,
  getVideoSlotMaxPlays,
  LONG_VIDEO_AUTO_NO_CUT_MIN_SEC,
  IS_VIDEO_STUDIO_DEV_ENV,
  isCaseUsingDefaultLipSync,
  isEffectiveCasePlayToEnd,
  isEscapeCueEnabled,
  isGroupUsingDefaultLipSync,
  isSlotLockedInApp,
  isVideoSlotAutoProtectedByLength,
  isVideoSlotPlayToEnd,
  parseEscapeSlotNumber,
  parseIdleSlotNumber,
  parseSeductionSlotNumber,
  primeNextCaseSlotPreview,
  primeNextEscapeSlotPreview,
  refreshAngelVideoOverrides,
  resetAngelPortraitVideo,
  resetUdoBarkAudio,
  subscribeAngelVideoOverrides,
  updateAngelBgTransparency,
  updateAngelCaseEscapeCue,
  updateAngelCompressionPreset,
  updateAngelDogRunExitPx,
  updateAngelDogRunJumpSec,
  updateAngelEscapeEnabled,
  updateAngelLipSyncRule,
  updateAngelSeductionTriggerMode,
  updateAngelVideoMaxPlays,
  updateAngelVideoPlayToEnd,
  updateOpeningFlowchartConfig,
  updateCalcPureTreeConfig,
  uploadAngelPortraitVideo,
  uploadUdoBarkAudio,
  type AngelCompressionPreset,
  type AngelEscapeCueKey,
  type AngelEscapeSlotKey,
  type AngelExpressionGroup,
  type AngelVideoMapPayload,
  type CompressAngelVideosResult,
} from '../chess/angelPortraitVideos';
import { soundEngine } from '../three/sound';
import {
  CLIP_TEXT,
  type CommentaryCaseId,
  type SeductionTriggerMode,
  type VoiceClipId,
} from '../chess/opponentVoice';

interface AngelVideoStudioModalProps {
  onClose: () => void;
  onLockStudio?: () => void;
  onPreviewCase: (clipId: VoiceClipId, text: string, tag: string) => void;
  onPreviewIdle: (specificIdleUrl?: string) => void;
  onTriggerDogEvent?: (options: { playVideo: boolean }) => void;
  onTriggerHamsterChase?: () => void;
  onTriggerDanceStarsEvent?: () => void;
  onSimulateEighthRow?: () => void;
  musicTracks?: readonly { id: string; title: string; url: string }[];
  unavailableMusicIndices?: readonly number[];
  onSelectMusicTrack?: (index: number) => void;
  onUploadMusicTrack?: (trackId: string, file: File) => Promise<boolean>;
}

function formatSec(sec: number): string {
  return `${sec.toFixed(1)}s`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getTargetCrfForPreset(preset: AngelCompressionPreset): number {
  if (preset === 'balanced_24') return 24;
  if (preset === 'mobile_27') return 27;
  return 21;
}

interface UdoPortraitPixelRulerProps {
  exitYPx: number;
  exitXPx: number;
  onChangeExitY: (yPx: number, immediate?: boolean) => void;
  onTestJump?: () => void;
  onHide: () => void;
}

/**
 * Dev-only on-screen pixel scale glued flush to the left border of the live Chess Angel portrait video.
 * Lets the developer read exact pixels (0..752 native video px + live rendered CSS px) and click/drag
 * the horizontal laser crosshair to define Udo's exact jump-out height by the pixel.
 */
function UdoPortraitPixelRuler({
  exitYPx,
  exitXPx,
  onChangeExitY,
  onTestJump,
  onHide,
}: UdoPortraitPixelRulerProps) {
  const [rect, setRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [hoverY, setHoverY] = useState<{ nativePx: number; screenPx: number } | null>(null);
  const draggingRef = useRef<boolean>(false);
  const rulerElRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const measure = () => {
      const el =
        document.querySelector('[data-angel-portrait-canvas="true"]') ??
        document.querySelector('[data-angel-portrait-modal="true"]');
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.width < 20 || r.height < 20) {
        setRect(null);
        return;
      }
      const portraitH = Math.min(r.height, r.width * (ANGEL_VIDEO_NATIVE_H / ANGEL_VIDEO_NATIVE_W));
      setRect((prev) => {
        if (
          prev &&
          Math.abs(prev.left - r.left) < 0.5 &&
          Math.abs(prev.top - r.top) < 0.5 &&
          Math.abs(prev.width - r.width) < 0.5 &&
          Math.abs(prev.height - portraitH) < 0.5
        ) {
          return prev;
        }
        return { left: r.left, top: r.top, width: r.width, height: portraitH };
      });
    };

    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const intervalId = window.setInterval(measure, 240);
    let ro: ResizeObserver | null = null;
    const target = document.querySelector('[data-angel-portrait-canvas="true"]');
    if (target && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(target);
    }
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      window.clearInterval(intervalId);
      ro?.disconnect();
    };
  }, []);

  if (!rect || typeof document === 'undefined') return null;

  const rulerWidth = 54;
  const rulerLeft = Math.max(4, rect.left - rulerWidth - 2);
  const yFrac = Math.max(0, Math.min(1, exitYPx / ANGEL_VIDEO_NATIVE_H));
  const xFrac = Math.max(-0.15, Math.min(1, exitXPx / ANGEL_VIDEO_NATIVE_W));
  const markerScreenY = yFrac * rect.height;
  const markerScreenX = xFrac * rect.width;

  const clientYToPixels = (clientY: number) => {
    const rel = Math.max(0, Math.min(rect.height, clientY - rect.top));
    const nativePx = Math.max(
      0,
      Math.min(ANGEL_VIDEO_NATIVE_H, Math.round((rel / rect.height) * ANGEL_VIDEO_NATIVE_H)),
    );
    return { nativePx, screenPx: Math.round(rel) };
  };

  const ticks: number[] = [];
  for (let px = 0; px <= ANGEL_VIDEO_NATIVE_H; px += 10) {
    ticks.push(px);
  }
  if (ticks[ticks.length - 1] !== ANGEL_VIDEO_NATIVE_H) {
    ticks.push(ANGEL_VIDEO_NATIVE_H);
  }

  return createPortal(
    <div className="fixed inset-0 z-[65] pointer-events-none select-none">
      {/* Compact top control pill right above the pixel ruler */}
      <div
        style={{
          left: Math.max(6, Math.min(window.innerWidth - 230, rulerLeft - 2)),
          top: Math.max(6, rect.top - 30),
        }}
        className="fixed pointer-events-auto inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-rose-400/70 bg-[#1a0b12]/95 shadow-xl text-[10px] font-mono-tabular text-rose-100 whitespace-nowrap"
      >
        <Ruler className="w-3 h-3 text-rose-300 shrink-0" />
        <span className="font-semibold text-rose-200">
          Udo Y:{exitYPx}px
        </span>
        <span className="text-[#a9989f]">
          (scr {Math.round(markerScreenY)}/{Math.round(rect.height)})
        </span>
        {onTestJump && (
          <button
            type="button"
            onClick={onTestJump}
            title="Test Udo jumping out from this exact pixel"
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-500/25 hover:bg-rose-500/45 border border-rose-400/60 text-[9.5px] font-semibold text-rose-100 cursor-pointer"
          >
            <Play className="w-2.5 h-2.5 text-rose-200" />
            Test
          </button>
        )}
        <button
          type="button"
          onClick={onHide}
          title="Hide pixel scale"
          className="p-0.5 rounded text-rose-300/80 hover:text-white hover:bg-white/10 cursor-pointer"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Interactive graduated pixel ruler flush to the left border of Chess Angel's video */}
      <div
        ref={rulerElRef}
        style={{
          left: rulerLeft,
          top: rect.top,
          width: rulerWidth,
          height: rect.height,
        }}
        onPointerDown={(e) => {
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          const { nativePx, screenPx } = clientYToPixels(e.clientY);
          setHoverY({ nativePx, screenPx });
          onChangeExitY(nativePx, false);
        }}
        onPointerMove={(e) => {
          const { nativePx, screenPx } = clientYToPixels(e.clientY);
          setHoverY({ nativePx, screenPx });
          if (draggingRef.current) {
            onChangeExitY(nativePx, false);
          }
        }}
        onPointerUp={(e) => {
          if (draggingRef.current) {
            draggingRef.current = false;
            const { nativePx } = clientYToPixels(e.clientY);
            onChangeExitY(nativePx, true);
          }
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
        onPointerLeave={() => {
          if (!draggingRef.current) setHoverY(null);
        }}
        title="Click or drag along this pixel scale to set Udo's exact jump-out Y pixel (0–752 px)"
        className="fixed pointer-events-auto cursor-ns-resize rounded-l-md border border-r-rose-400/75 border-white/25 bg-[#080a10]/90 shadow-2xl overflow-visible"
      >
        {/* Graduated tick marks (0..752 native video px) */}
        {ticks.map((px) => {
          const topPct = (px / ANGEL_VIDEO_NATIVE_H) * 100;
          const isMajor = px % 50 === 0 || px === ANGEL_VIDEO_NATIVE_H;
          const isMedium = !isMajor && px % 25 === 0;
          return (
            <div
              key={px}
              style={{ top: `${topPct}%` }}
              className="absolute left-0 right-0 pointer-events-none"
            >
              <div
                className={`absolute right-0 h-px ${
                  isMajor
                    ? 'w-3.5 bg-amber-300/90'
                    : isMedium
                      ? 'w-2 bg-white/55'
                      : 'w-1 bg-white/25'
                }`}
              />
              {isMajor && (
                <span
                  style={{ transform: 'translateY(-50%)' }}
                  className="absolute right-4 font-mono-tabular text-[9px] leading-none text-amber-100/90 [text-shadow:0_1px_2px_#000]"
                >
                  {px}
                </span>
              )}
            </div>
          );
        })}

        {/* Hover preview crosshair tick */}
        {hoverY && (
          <div
            style={{ top: `${(hoverY.nativePx / ANGEL_VIDEO_NATIVE_H) * 100}%` }}
            className="absolute left-0 right-0 pointer-events-none z-10"
          >
            <div className="h-px w-full bg-cyan-300/90" />
            <span
              style={{ transform: 'translate(-100%, -50%)' }}
              className="absolute -left-1.5 px-1.5 py-0.5 rounded bg-[#091822]/95 border border-cyan-400/70 font-mono-tabular text-[9.5px] font-semibold text-cyan-200 whitespace-nowrap shadow-lg"
            >
              {hoverY.nativePx}px · scr {hoverY.screenPx}px
            </span>
          </div>
        )}

        {/* Active Udo jump-out Y handle on the ruler */}
        <div
          style={{ top: `${yFrac * 100}%` }}
          className="absolute left-0 right-0 pointer-events-none z-20"
        >
          <div className="h-[2px] w-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.95)]" />
          <div
            style={{ transform: 'translate(-100%, -50%)' }}
            className="absolute -left-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-600/95 border border-rose-200/80 font-mono-tabular text-[10px] font-bold text-white whitespace-nowrap shadow-[0_0_12px_rgba(244,63,94,0.75)]"
          >
            <span>🐾 {exitYPx}px</span>
          </div>
        </div>
      </div>

      {/* Horizontal laser guide & exact (X, Y) crosshair overlaid directly over the portrait video */}
      <div
        style={{
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        }}
        className="fixed pointer-events-none overflow-visible"
      >
        {/* Subtle portrait frame outline */}
        <div className="absolute inset-0 border border-rose-400/45" />
        {/* Hover horizontal preview line across video */}
        {hoverY && (
          <div
            style={{ top: `${(hoverY.nativePx / ANGEL_VIDEO_NATIVE_H) * 100}%` }}
            className="absolute left-0 right-0 h-px border-t border-dashed border-cyan-300/70"
          />
        )}
        {/* Active Udo jump-out horizontal line across video */}
        <div
          style={{ top: markerScreenY }}
          className="absolute left-0 right-0 h-[1.5px] bg-rose-400/85 shadow-[0_0_8px_rgba(251,113,133,0.9)]"
        />
        {/* Exact (X, Y) launch target crosshair */}
        <div
          style={{
            left: markerScreenX,
            top: markerScreenY,
            transform: 'translate(-50%, -50%)',
          }}
          className="absolute w-5 h-5 rounded-full border-2 border-rose-300 bg-rose-500/30 shadow-[0_0_12px_rgba(244,63,94,0.95)] flex items-center justify-center"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-white" />
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function AngelVideoStudioModal({
  onClose,
  onLockStudio,
  onPreviewCase,
  onPreviewIdle,
  onTriggerDogEvent,
  onTriggerHamsterChase,
  onTriggerDanceStarsEvent,
  onSimulateEighthRow,
  musicTracks = [],
  unavailableMusicIndices = [],
  onSelectMusicTrack,
  onUploadMusicTrack,
}: AngelVideoStudioModalProps) {
  const [overrides, setOverrides] = useState<AngelVideoMapPayload>(() =>
    getAngelVideoOverridesSnapshot(),
  );
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    welcome: true,
    explaining: true,
    helpful: true,
    warning: true,
    ending: true,
    controls: true,
  });
  const [visibleIdleCount, setVisibleIdleCount] = useState<number>(2);
  const [visibleSeductionCount, setVisibleSeductionCount] = useState<number>(3);
  const [visibleEscapeCounts, setVisibleEscapeCounts] = useState<
    Record<AngelEscapeCueKey, number>
  >({
    point_you: 4,
    point_me: 3,
    push_button: 4,
  });
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [compressingAll, setCompressingAll] = useState<boolean>(false);
  const [compressingUrl, setCompressingUrl] = useState<string | null>(null);
  const [lastCompressRun, setLastCompressRun] = useState<CompressAngelVideosResult | null>(null);
  const [showPixelScale, setShowPixelScale] = useState<boolean>(true);

  useEffect(() => {
    void refreshAngelVideoOverrides();
    return subscribeAngelVideoOverrides(() => {
      setOverrides({ ...getAngelVideoOverridesSnapshot() });
    });
  }, []);

  const currentCompressionPreset: AngelCompressionPreset =
    overrides.compressionPreset || 'lossless_21';
  const effectiveBatchPreset: Exclude<AngelCompressionPreset, 'mute_only'> =
    currentCompressionPreset === 'mute_only' ? 'lossless_21' : currentCompressionPreset;
  const effectiveTargetCrf = getTargetCrfForPreset(effectiveBatchPreset);

  const handleUpload = async (
    kind: 'idle' | 'default' | 'group' | 'case' | 'escape' | 'special',
    key: string,
    file: File | null | undefined,
    autoPreview?: (uploadedUrl: string) => void,
  ) => {
    if (!file) return;
    const slotId = `${kind}:${key}`;
    setBusySlot(slotId);
    setStatusNote(null);
    try {
      const {
        url: uploadedUrl,
        extractedAudio,
        inBytes,
        outBytes,
        compressed,
        crf,
      } = await uploadAngelPortraitVideo(kind, key, file);
      const sizeDetail =
        inBytes && outBytes
          ? compressed
            ? `compressed ${formatBytes(inBytes)} → ${formatBytes(outBytes)} (-${Math.max(1, Math.round((1 - outBytes / inBytes) * 100))}%, 560×752 CRF ${crf || effectiveTargetCrf})`
            : `${formatBytes(outBytes)} (560×752 Android-safe)`
          : 'silent + faststart';
      setStatusNote(
        extractedAudio
          ? `ACTIVE IMMEDIATELY: "${file.name}" live for "${key}" — #000000 background matched, ${sizeDetail}, embedded sound synced. Tip: send a quick message in AI Studio chat before closing so the workspace snapshots it permanently!`
          : `ACTIVE IMMEDIATELY: "${file.name}" live for "${key}" — #000000 background matched, ${sizeDetail}, sound stripped. Tip: send a quick message in AI Studio chat before closing so the workspace snapshots it permanently!`,
      );
      if (autoPreview) {
        autoPreview(uploadedUrl);
      }
    } catch {
      setStatusNote(
        IS_VIDEO_STUDIO_DEV_ENV
          ? `Could not upload "${file.name}". Please check that it is an MP4/WebM video.`
          : `Cannot upload "${file.name}" on a published/static URL (Netlify or Cloud Run). Open ChessAngel 3D inside the AI Studio Build editor to upload new .mp4 files permanently.`,
      );
    } finally {
      setBusySlot(null);
    }
  };

  const handleCompressLibrary = async (force = false) => {
    if (compressingAll) return;
    setCompressingAll(true);
    setStatusNote(
      `Running 560×752 Mod-16 H.264 (Main@3.1 · bf=0 · CRF ${effectiveTargetCrf}) compression across Studio videos…`,
    );
    try {
      const res = await compressAngelStudioVideos({
        preset: effectiveBatchPreset,
        force,
      });
      setLastCompressRun(res);
      if (res.compressedCount > 0 && res.beforeBytes > 0) {
        const pct = Math.max(1, Math.round((1 - res.afterBytes / res.beforeBytes) * 100));
        setStatusNote(
          `Compression complete (CRF ${res.crf}): optimized ${res.compressedCount}/${res.totalFiles} videos · ${formatBytes(res.beforeBytes)} → ${formatBytes(res.afterBytes)} (-${pct}% saved).`,
        );
      } else {
        setStatusNote(
          `All ${res.totalFiles} Studio videos are already optimal at 560×752 CRF ${res.crf} (${formatBytes(res.afterBytes)} total).`,
        );
      }
    } catch {
      setStatusNote('Could not run Studio MP4 compression routine.');
    } finally {
      setCompressingAll(false);
    }
  };

  const handleCompressSingleVideo = async (url: string, labelName: string) => {
    if (!url || compressingAll || compressingUrl) return;
    const clean = url.split('?')[0];
    setCompressingUrl(clean);
    try {
      const res = await compressAngelStudioVideos({
        preset: effectiveBatchPreset,
        targetUrl: clean,
        force: true,
      });
      if (res.compressedCount > 0 && res.beforeBytes > res.afterBytes) {
        const pct = Math.max(1, Math.round((1 - res.afterBytes / res.beforeBytes) * 100));
        setStatusNote(
          `Compressed "${labelName}" (CRF ${res.crf}): ${formatBytes(res.beforeBytes)} → ${formatBytes(res.afterBytes)} (-${pct}%).`,
        );
      } else {
        setStatusNote(
          `"${labelName}" is already optimal at ${formatBytes(res.afterBytes)} (560×752 CRF ${res.crf}).`,
        );
      }
    } catch {
      setStatusNote(`Could not compress "${labelName}".`);
    } finally {
      setCompressingUrl(null);
    }
  };

  const handleReset = async (
    kind: 'idle' | 'default' | 'group' | 'case' | 'escape' | 'special',
    key: string,
  ) => {
    const slotId = `${kind}:${key}`;
    setBusySlot(slotId);
    try {
      await resetAngelPortraitVideo(kind, key);
      setStatusNote(`Cleared custom video on "${key}".`);
    } catch {
      setStatusNote(`Could not reset "${key}".`);
    } finally {
      setBusySlot(null);
    }
  };

  const makeDropHandlers = (
    kind: 'idle' | 'default' | 'group' | 'case' | 'escape' | 'special',
    key: string,
    autoPreview?: (uploadedUrl: string) => void,
  ) => {
    const slotId = `${kind}:${key}`;
    return {
      onDragOver: (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (dragOverSlot !== slotId) setDragOverSlot(slotId);
      },
      onDragLeave: (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (dragOverSlot === slotId) setDragOverSlot(null);
      },
      onDrop: (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverSlot(null);
        const file = e.dataTransfer?.files?.[0];
        if (file) {
          void handleUpload(kind, key, file, autoPreview);
        }
      },
    };
  };

  const renderUploadButton = (
    kind: 'idle' | 'default' | 'group' | 'case' | 'escape' | 'special',
    key: string,
    hasCustom: boolean,
    autoPreview?: (uploadedUrl: string) => void,
  ) => {
    const slotId = `${kind}:${key}`;
    const isBusy = busySlot === slotId;
    const isLocked = isSlotLockedInApp(slotId, overrides);
    const isAttached = hasCustom || isLocked;
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        <label
          title={
            isLocked
              ? 'Video is permanently locked into the app bundle (click to replace with a newer .mp4)'
              : undefined
          }
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            isLocked
              ? 'bg-[#12241c] hover:bg-[#193327] border-emerald-400/55 text-emerald-200'
              : isAttached
                ? 'bg-[#13261d] hover:bg-[#193327] border-emerald-500/50 text-emerald-200'
                : 'bg-[#171c26] hover:bg-[#202736] border-[#d6ae63]/55 text-[#f3cf83]'
          }`}
        >
          {isBusy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : isLocked ? (
            <Lock className="w-3 h-3 text-emerald-400" />
          ) : isAttached ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Upload className="w-3.5 h-3.5" />
          )}
          <span>
            {isBusy
              ? currentCompressionPreset === 'mute_only'
                ? 'Muting & Saving…'
                : 'Compressing…'
              : isLocked
                ? 'Locked · Replace'
                : isAttached
                  ? 'Active · Replace'
                  : 'Attach .mp4'}
          </span>
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
            disabled={isBusy}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              void handleUpload(kind, key, f, autoPreview);
            }}
            className="hidden"
          />
        </label>

        {hasCustom && !isLocked && !isBusy && (
          <button
            type="button"
            onClick={() => void handleReset(kind, key)}
            title="Remove custom video"
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-rose-500/30 bg-black hover:bg-rose-950/40 text-[10px] text-rose-300 cursor-pointer"
          >
            <Trash2 className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>
    );
  };

  // Compute all Idle / Quiet Listening slots (always at least Idle #1 and Idle #2, plus any higher attached/added slots)
  const idleVariants = overrides.idleVariants || {};
  const highestConfiguredIdle = Object.keys(idleVariants).reduce((max, k) => {
    const n = parseIdleSlotNumber(k);
    return Number.isFinite(n) && n < 900 ? Math.max(max, n) : max;
  }, 0);
  const totalIdleSlots = Math.max(2, visibleIdleCount, highestConfiguredIdle);
  const idleSlotNumbers = Array.from({ length: totalIdleSlots }, (_, i) => i + 1);
  const activeIdlePool = getAngelIdleVideoPool(overrides);

  const getNextAvailableIdleKey = (): { key: string; num: number } => {
    for (let n = 1; n <= totalIdleSlots + 1; n++) {
      const k = `idle_${n}`;
      if (n >= 2 && !idleVariants[k]) {
        return { key: k, num: n };
      }
    }
    const nextNum = totalIdleSlots + 1;
    return { key: `idle_${nextNum}`, num: nextNum };
  };

  const defaultSpeakUrl = overrides.defaultSpeaking || ANGEL_DEFAULT_SPEAKING_VIDEO_SRC;
  const defaultSpeakClipSec = getVideoFileDurationSec(defaultSpeakUrl, overrides);
  const lipSyncCfg = overrides.lipSync || { defaultEnabled: true, groups: {}, cases: {} };
  const globalLipSyncOn = lipSyncCfg.defaultEnabled !== false;

  const handleToggleLipSync = async (
    scope: 'global' | 'group' | 'case',
    key: string,
    nextRule: 'on' | 'off' | 'inherit',
    label: string,
  ) => {
    try {
      await updateAngelLipSyncRule(scope, key, nextRule);
      setStatusNote(label);
    } catch {
      setStatusNote('Could not save Lip-Sync preference.');
    }
  };

  const handleToggleEscapeOverlay = async (
    key: AngelEscapeCueKey,
    enabled: boolean,
    label: string,
  ) => {
    try {
      await updateAngelEscapeEnabled(key, enabled);
      setStatusNote(label);
    } catch {
      setStatusNote('Could not save Special Escape Overlay toggle.');
    }
  };

  const handleToggleCaseCue = async (
    caseId: CommentaryCaseId,
    cueKey: AngelEscapeCueKey,
    nextRule: 'on' | 'off' | 'inherit',
    label: string,
  ) => {
    try {
      await updateAngelCaseEscapeCue(caseId, cueKey, nextRule);
      setStatusNote(label);
    } catch {
      setStatusNote('Could not save per-video cue selection.');
    }
  };

  const handleSetMaxPlays = async (slotId: string, labelName: string, rawVal: string) => {
    const parsed = rawVal === 'inf' ? null : Math.max(0, parseInt(rawVal, 10) || 0);
    try {
      await updateAngelVideoMaxPlays(slotId, parsed);
      setStatusNote(
        parsed === null
          ? `"${labelName}": set to Unlimited plays per chess game (∞).`
          : parsed === 0
            ? `"${labelName}": muted to 0 plays per chess game.`
            : `"${labelName}": limited to max ${parsed}× per chess game.`,
      );
    } catch {
      setStatusNote(`Could not save play limit for "${labelName}".`);
    }
  };

  const handleTogglePlayToEnd = async (slotId: string, labelName: string, nextVal: boolean) => {
    try {
      await updateAngelVideoPlayToEnd(slotId, nextVal);
      setStatusNote(
        nextVal
          ? `"${labelName}": No Cut LOCKED — video cannot be cut short and will always play until its very end.`
          : `"${labelName}": Developer consent granted to allow cuts / pre-end morph transitions.`,
      );
    } catch {
      setStatusNote(`Could not save No-Cut flag for "${labelName}".`);
    }
  };

  const MAX_PLAYS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
    { value: 'inf', label: '∞ / game' },
    { value: '1', label: '1× / game' },
    { value: '2', label: '2× / game' },
    { value: '3', label: '3× / game' },
    { value: '4', label: '4× / game' },
    { value: '5', label: '5× / game' },
    { value: '6', label: '6× / game' },
    { value: '8', label: '8× / game' },
    { value: '10', label: '10× / game' },
    { value: '15', label: '15× / game' },
    { value: '0', label: '0× Off' },
  ];

  const renderMaxPlaysControl = (slotId: string, labelName: string) => {
    const maxPlays = getVideoSlotMaxPlays(slotId, overrides);
    const selectVal = maxPlays === null ? 'inf' : String(maxPlays);
    const isCapped = maxPlays !== null;

    return (
      <label
        onClick={(e) => e.stopPropagation()}
        title={`Max times "${labelName}" can play during a single chess game (resets on New Game)`}
        className={`inline-flex items-center gap-1 font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer whitespace-nowrap ${
          maxPlays === 0
            ? 'border-rose-500/55 bg-rose-950/40 text-rose-200 font-semibold'
            : isCapped
              ? 'border-cyan-400/60 bg-[#0d2230] text-cyan-200 font-semibold'
              : 'border-white/16 bg-[#12161f] hover:bg-[#191f2c] text-[#b4bece]'
        }`}
      >
        <Repeat className="w-2.5 h-2.5 shrink-0 opacity-85" />
        <select
          aria-label={`Max plays per game for ${labelName}`}
          value={selectVal}
          onChange={(e) => {
            e.stopPropagation();
            void handleSetMaxPlays(slotId, labelName, e.target.value);
          }}
          className="bg-transparent text-inherit font-mono-tabular text-[10px] focus:outline-none cursor-pointer pr-0.5"
        >
          {MAX_PLAYS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-[#0d1118] text-[#f3f1ec]">
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    );
  };

  const renderPlayToEndFlagButton = (slotId: string, labelName: string) => {
    const locked = isVideoSlotPlayToEnd(slotId, overrides);
    const autoByLength = isVideoSlotAutoProtectedByLength(slotId, overrides);
    const explicitOverride = overrides.videoPlayToEnd?.[slotId];
    return (
      <button
        type="button"
        aria-pressed={locked}
        onClick={(e) => {
          e.stopPropagation();
          void handleTogglePlayToEnd(slotId, labelName, !locked);
        }}
        title={
          locked
            ? autoByLength
              ? `AUTO-PROTECTED (>${LONG_VIDEO_AUTO_NO_CUT_MIN_SEC}s) — "${labelName}" plays to its very end unless you click here to explicitly allow cuts.`
              : `LOCKED — No Cut - Play to End: "${labelName}" cannot be cut short and must play until its very end. Click to give developer consent to allow cuts.`
            : explicitOverride === false
              ? `Developer consented to allow cuts on "${labelName}". Click to re-lock "No Cut - Play to End".`
              : `Click to enable "No Cut - Play to End" on "${labelName}" so it cannot be cut short.`
        }
        className={`inline-flex items-center gap-1 font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer whitespace-nowrap ${
          locked
            ? 'border-[#f59e0b]/80 bg-[#2b1d07] hover:bg-[#382609] text-[#fde68a] font-semibold shadow-sm'
            : explicitOverride === false
              ? 'border-rose-400/45 bg-rose-950/30 hover:bg-rose-950/50 text-rose-200'
              : 'border-white/16 bg-[#12161f] hover:bg-[#1b2230] text-[#9aa3b2] hover:text-[#e2e8f0]'
        }`}
      >
        {locked ? (
          <Lock className="w-2.5 h-2.5 text-[#fbbf24] shrink-0" />
        ) : (
          <Unlock className="w-2.5 h-2.5 opacity-75 shrink-0" />
        )}
        <span>{explicitOverride === false && !locked ? 'Cut Allowed' : 'No Cut - Play to End'}</span>
        {locked && <Check className="w-2.5 h-2.5 text-[#fbbf24] shrink-0" />}
      </button>
    );
  };

  const renderVideoSizeBadge = (url: string | undefined, labelName: string) => {
    if (!url) return null;
    const sizeBytes = getVideoFileSizeBytes(url, overrides);
    if (sizeBytes === null) return null;
    const optInfo = getVideoOptimizedInfo(url, overrides);
    const clean = url.split('?')[0];
    const isSingleBusy = compressingUrl === clean;
    const isOptimizedAtTarget = Boolean(
      optInfo &&
        optInfo.width === 560 &&
        optInfo.height === 752 &&
        optInfo.crf >= effectiveTargetCrf,
    );

    return (
      <button
        type="button"
        disabled={isSingleBusy || compressingAll}
        onClick={(e) => {
          e.stopPropagation();
          void handleCompressSingleVideo(clean, labelName);
        }}
        title={
          isOptimizedAtTarget
            ? `Optimized 560×752 Mod-16 H.264 Main@3.1 (CRF ${optInfo?.crf || 21}) · ${formatBytes(sizeBytes)}. Click to re-run compression on "${labelName}" at CRF ${effectiveTargetCrf}.`
            : `Click to compress "${labelName}" (${formatBytes(sizeBytes)}${optInfo?.width ? `, ${optInfo.width}×${optInfo.height}` : ''}) to 560×752 Mod-16 H.264 CRF ${effectiveTargetCrf}.`
        }
        className={`inline-flex items-center gap-1 font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer whitespace-nowrap ${
          isOptimizedAtTarget
            ? 'border-emerald-500/40 bg-emerald-950/35 hover:bg-emerald-900/45 text-emerald-200'
            : 'border-amber-400/60 bg-amber-950/45 hover:bg-amber-900/50 text-amber-200 font-semibold'
        }`}
      >
        {isSingleBusy ? (
          <Loader2 className="w-2.5 h-2.5 animate-spin shrink-0" />
        ) : (
          <Zap className="w-2.5 h-2.5 shrink-0 opacity-90" />
        )}
        <span>{isSingleBusy ? 'Compressing…' : formatBytes(sizeBytes)}</span>
        {!isOptimizedAtTarget && !isSingleBusy && <span>· Compress</span>}
      </button>
    );
  };

  const sizeEntries = Object.entries(overrides.videoSizes || {});
  const totalStudioVideos = sizeEntries.length;
  const totalStudioBytes = sizeEntries.reduce((acc, [, sz]) => acc + (sz || 0), 0);
  const optimizedStudioCount = sizeEntries.filter(([cleanPath, sz]) => {
    const info = overrides.videoOptimized?.[cleanPath];
    return Boolean(
      info &&
        info.size === sz &&
        info.width === 560 &&
        info.height === 752 &&
        info.crf >= effectiveTargetCrf,
    );
  }).length;
  const pendingCompressCount = Math.max(0, totalStudioVideos - optimizedStudioCount);

  const COMPRESSION_PRESET_OPTIONS: ReadonlyArray<{
    value: AngelCompressionPreset;
    label: string;
  }> = [
    {
      value: 'lossless_21',
      label: 'Visually Lossless · CRF 21 (560×752 Mod-16 · Default)',
    },
    {
      value: 'balanced_24',
      label: 'Compact · CRF 24 (560×752 Mod-16 · ~35% smaller)',
    },
    {
      value: 'mobile_27',
      label: 'Ultra-Light Mobile · CRF 27 (560×752 Mod-16 · ~55% smaller)',
    },
    {
      value: 'mute_only',
      label: 'Original Stream · Mute Audio Only (No Re-encode on Upload)',
    },
  ];

  const escapeSpecs: Array<{
    key: AngelEscapeCueKey;
    shortWord: string;
    title: string;
    triggerBadge: string;
    description: string;
    previewClipId: VoiceClipId;
    previewTag: string;
    minDefaultSlots: number;
  }> = [
    {
      key: 'point_you',
      shortWord: '"you"',
      title: 'Word "you" — Point Finger Right at Player',
      triggerBadge: 'Trigger: "you"',
      description:
        'Whenever "you" appears in any spoken text, pauses the active video, morphs into her pointing at the player (rotating across #1, #2, #3, #4… alternatives when attached), then resumes the active video to the end.',
      previewClipId: 'check_knight_v1',
      previewTag: 'ESCAPE: "YOU"',
      minDefaultSlots: 4,
    },
    {
      key: 'point_me',
      shortWord: '"me" / "I"',
      title: 'Words "me" & "I" — Gesture Toward Herself',
      triggerBadge: 'Trigger: "me" · "I"',
      description:
        'Whenever "me" or "I" appears in any spoken text (e.g. "I am your Chess Angel", "I am a computer", "let me answer that", "I tested three sharp variations"), pauses the active video, plays her self-gesture overlay (rotating across attached alternatives), then resumes the active video to the end.',
      previewClipId: 'player_check_v1',
      previewTag: 'ESCAPE: "ME" / "I"',
      minDefaultSlots: 3,
    },
    {
      key: 'push_button',
      shortWord: '"button"',
      title: '"push a button" Below — Point Down at Modal Button',
      triggerBadge:
        'Trigger: "push a button" · "clicking on a button" · "touch show hint" · "touch Undo" · "Click to confirm"',
      description:
        'Whenever she mentions pushing/clicking a button below ("push a button", "clicking on a button", "touch show hint", "touch Undo", "Click to confirm"), plays this short overlay video (rotating across #1, #2, #3, #4… alternatives when attached) and continues the active video to the end.',
      previewClipId: 'hesitate_hint_v3',
      previewTag: 'ESCAPE: TOUCH SHOW HINT',
      minDefaultSlots: 4,
    },
  ];

  return (
    <div className="fixed inset-y-6 left-4 z-50 w-[min(585px,calc(100vw-2rem))] flex flex-col rounded-2xl bg-[#07090d]/98 border border-[#d6ae63]/70 shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-white/12 bg-black">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-7 h-7 rounded-lg bg-[#d6ae63]/15 border border-[#d6ae63]/50 inline-flex items-center justify-center shrink-0">
            <Film className="w-4 h-4 text-[#f3cf83]" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-[#f7f1e5] truncate">
                ChessAngel 3D Video Studio
              </h2>
              <span className="font-mono-tabular text-xs font-bold px-1.5 py-0.5 rounded border border-[#d6ae63]/65 bg-[#261d0e] text-[#fde68a] whitespace-nowrap">
                v{APP_VERSION}
              </span>
              <span
                title="Opened via 5 clicks on the game title; hidden from regular players. All attached .mp4 files, Play-per-Game quotas, and No-Cut flags are bundled into the deployed app."
                className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/45 bg-emerald-950/40 text-emerald-300 font-medium whitespace-nowrap"
              >
                {IS_VIDEO_STUDIO_DEV_ENV
                  ? 'Studio Unlocked · Bundled on Deploy'
                  : 'Read-Only Deployed Build'}
              </span>
            </div>
            <p className="text-[11px] text-[#9aa3b2] truncate">
              Set <span className="text-cyan-200">× / game</span> play limits &amp;{' '}
              <span className="text-[#fde68a]">No Cut · Play to End</span> flags per video
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowPixelScale((v) => !v)}
            aria-pressed={showPixelScale}
            title="Show or hide the on-screen pixel ruler next to Chess Angel's video for calibrating Udo's exact jump-out pixel"
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium transition-colors cursor-pointer ${
              showPixelScale
                ? 'border-rose-400/65 bg-rose-950/55 text-rose-100'
                : 'border-white/15 bg-white/5 hover:bg-white/10 text-[#cbd5e1]'
            }`}
          >
            <Ruler className="w-3 h-3 text-rose-300" />
            <span>Px Scale</span>
          </button>
          {onLockStudio && (
            <button
              type="button"
              onClick={onLockStudio}
              title="Hide Videos button again until next 5-click on game title"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-400/40 bg-amber-950/35 hover:bg-amber-900/45 text-[11px] font-medium text-amber-200 transition-colors cursor-pointer"
            >
              <Lock className="w-3 h-3" />
              <span>Hide</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            title="Close Video Studio"
            className="p-1.5 rounded-md text-[#9aa3b2] hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showPixelScale && (
        <UdoPortraitPixelRuler
          exitYPx={getAngelDogRunExitYPx(overrides)}
          exitXPx={getAngelDogRunExitXPx(overrides)}
          onChangeExitY={(yPx, immediate) =>
            void updateAngelDogRunExitPx({ yPx }, { immediate })
          }
          onTestJump={
            onTriggerDogEvent ? () => onTriggerDogEvent({ playVideo: true }) : undefined
          }
          onHide={() => setShowPixelScale(false)}
        />
      )}

      {!IS_VIDEO_STUDIO_DEV_ENV ? (
        <div className="px-4 py-2.5 bg-[#29170a] border-b border-amber-500/55 text-[11px] text-amber-200 leading-snug">
          <strong>Deployed Static / Cloud Run Mode:</strong> Uploading new <code className="text-amber-100">.mp4</code> files here cannot be saved permanently because Netlify &amp; published containers are read-only/ephemeral. Always upload new <code className="text-amber-100">.mp4</code> files inside the <strong>AI Studio Build preview</strong>, then send one chat message (e.g. <em>&quot;save my new videos&quot;</em>) before closing or publishing!
        </div>
      ) : (
        <div className="px-4 py-2 bg-[#131b26] border-b border-sky-500/35 text-[11px] text-sky-200 leading-snug">
          <strong>Permanent Save Tip:</strong> After uploading any new <code className="text-sky-100">.mp4</code> here, send a quick message in AI Studio chat (e.g. <em>&quot;lock in my uploaded videos&quot;</em>) before ending your session so AI Studio commits the files into permanent workspace storage!
        </div>
      )}

      {statusNote && (
        <div className="px-4 py-2 bg-[#101c16] border-b border-emerald-500/30 text-xs text-emerald-200">
          {statusNote}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto thin-scroll p-4 space-y-3">
        {/* Studio Portrait .mp4 Compression Engine */}
        <div className="rounded-xl border border-emerald-500/45 bg-gradient-to-b from-[#0a1512] to-[#070a0d] p-3">
          <div className="flex flex-wrap items-start justify-between gap-2.5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-xs font-semibold text-[#f3f7f5]">
                  Portrait .mp4 Compression Routine
                </span>
                <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-sky-500/40 bg-sky-950/40 text-sky-200 whitespace-nowrap">
                  {totalStudioVideos} .mp4s · {formatBytes(totalStudioBytes)}
                </span>
                <span
                  className={`font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${
                    pendingCompressCount === 0 && totalStudioVideos > 0
                      ? 'border-emerald-500/50 bg-emerald-950/45 text-emerald-300 font-medium'
                      : 'border-amber-400/55 bg-amber-950/45 text-amber-200 font-semibold'
                  }`}
                >
                  {pendingCompressCount === 0 && totalStudioVideos > 0
                    ? `✓ All ${totalStudioVideos} Android-Safe (560×752 · Main@3.1 · bf=0)`
                    : `${pendingCompressCount} Can Compress to CRF ${effectiveTargetCrf}`}
                </span>
                {lastCompressRun && lastCompressRun.compressedCount > 0 && (
                  <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-emerald-400/45 bg-emerald-950/50 text-emerald-200 whitespace-nowrap">
                    Saved {formatBytes(Math.max(0, lastCompressRun.beforeBytes - lastCompressRun.afterBytes))}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#9fb0a9] mt-1 leading-snug">
                Every attached <span className="text-emerald-200 font-medium">.mp4</span> is
                automatically scaled to <span className="font-mono-tabular text-[#e2e8f0]">560×752</span>{' '}
                (Mod-16 Lanczos), H.264 <span className="font-mono-tabular text-[#e2e8f0]">Main@3.1 · bf=0</span>{' '}
                for instant Android playback, audio-stripped, and{' '}
                <span className="font-mono-tabular text-[#e2e8f0]">+faststart</span> indexed.
              </p>
            </div>
          </div>

          <div className="mt-2.5 pt-2.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
            <label
              title="Compression profile applied automatically on new .mp4 uploads and batch Studio compression"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-emerald-500/40 bg-[#0d1915] text-[11px] font-medium text-emerald-100 cursor-pointer max-w-full"
            >
              <span className="text-[10px] uppercase tracking-wider text-emerald-300/90 font-semibold shrink-0">
                Profile:
              </span>
              <select
                aria-label="Portrait MP4 compression profile"
                value={currentCompressionPreset}
                disabled={compressingAll}
                onChange={(e) => {
                  const nextPreset = e.target.value as AngelCompressionPreset;
                  void updateAngelCompressionPreset(nextPreset);
                  setStatusNote(
                    nextPreset === 'mute_only'
                      ? 'Upload profile set to Mute Audio Only (no video re-encoding on upload).'
                      : `Compression profile set to CRF ${getTargetCrfForPreset(nextPreset)} (560×752 Mod-16 Main@3.1 + faststart) for uploads & batch runs.`,
                  );
                }}
                className="bg-transparent text-emerald-100 text-[11px] focus:outline-none cursor-pointer truncate"
              >
                {COMPRESSION_PRESET_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-[#09110e] text-[#f3f7f5]">
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={compressingAll || totalStudioVideos === 0}
                onClick={() => void handleCompressLibrary(false)}
                title={`Compress all Studio .mp4 files not yet at 560×752 CRF ${effectiveTargetCrf}`}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 ${
                  pendingCompressCount > 0
                    ? 'bg-[#133224] hover:bg-[#194230] border-emerald-400/70 text-emerald-100 shadow-sm'
                    : 'bg-[#111923] hover:bg-[#182331] border-white/20 text-[#cbd5e1]'
                }`}
              >
                {compressingAll ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-300" />
                ) : (
                  <Zap className="w-3.5 h-3.5 text-emerald-300" />
                )}
                <span>
                  {compressingAll
                    ? `Compressing (CRF ${effectiveTargetCrf})…`
                    : pendingCompressCount > 0
                      ? `Compress All (${pendingCompressCount}) · CRF ${effectiveTargetCrf}`
                      : `Verify / Compress All (CRF ${effectiveTargetCrf})`}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Soundtrack / Background Music Buttons (.mp3) */}
        {musicTracks.length > 0 && onUploadMusicTrack && (
          <div className="rounded-xl border border-[#d6ae63]/45 bg-gradient-to-b from-[#15120b] to-[#080a0f] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <Music className="w-3.5 h-3.5 text-[#e3be78] shrink-0" />
                <span className="text-xs font-semibold text-[#f7eedb]">
                  Background Music Buttons (.mp3)
                </span>
              </div>
              <span className="text-[10px] text-[#b4bdcc]">
                Attach or replace .mp3 files for the {musicTracks.length} unfold-menu music buttons
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {musicTracks.map((track, idx) => {
                const slotKey = `music:${track.id}`;
                const isBusy = busySlot === slotKey;
                const isMissing = unavailableMusicIndices.includes(idx);
                return (
                  <div
                    key={track.id}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverSlot(slotKey);
                    }}
                    onDragLeave={() => {
                      setDragOverSlot((prev) => (prev === slotKey ? null : prev));
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverSlot(null);
                      const f = e.dataTransfer.files?.[0];
                      if (!f) return;
                      setBusySlot(slotKey);
                      void onUploadMusicTrack(track.id, f).then((ok) => {
                        setBusySlot(null);
                        setStatusNote(
                          ok
                            ? `Attached "${f.name}" to "${track.title}" and started playback.`
                            : `Could not attach "${f.name}" to "${track.title}".`,
                        );
                      });
                    }}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                      dragOverSlot === slotKey
                        ? 'border-[#e3be78] bg-[#241c0e]'
                        : 'border-white/12 bg-[#0d1118]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[#f3efe4] truncate">
                        {track.title}
                      </div>
                      <div
                        className={`text-[10px] font-mono-tabular truncate ${
                          isMissing ? 'text-amber-300' : 'text-emerald-300'
                        }`}
                      >
                        {isMissing ? 'Awaiting .mp3 file' : '✓ Ready'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {onSelectMusicTrack && !isMissing && (
                        <button
                          type="button"
                          onClick={() => onSelectMusicTrack(idx)}
                          title={`Play ${track.title}`}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-white/15 bg-[#171d28] hover:bg-[#222a3a] text-[11px] text-[#e2e8f0] cursor-pointer"
                        >
                          <Play className="w-3 h-3 text-[#e3be78]" />
                          Play
                        </button>
                      )}
                      <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[#d6ae63]/55 bg-[#261e10] hover:bg-[#342915] text-[11px] font-medium text-[#f7e7c2] cursor-pointer whitespace-nowrap">
                        {isBusy ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Upload className="w-3 h-3 text-[#e3be78]" />
                        )}
                        <span>{isMissing ? 'Attach .mp3' : 'Replace'}</span>
                        <input
                          type="file"
                          accept=".mp3,audio/mpeg,audio/*"
                          className="hidden"
                          disabled={isBusy}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (!f) return;
                            setBusySlot(slotKey);
                            void onUploadMusicTrack(track.id, f).then((ok) => {
                              setBusySlot(null);
                              setStatusNote(
                                ok
                                  ? `Attached "${f.name}" to "${track.title}" and started playback.`
                                  : `Could not attach "${f.name}" to "${track.title}".`,
                              );
                            });
                          }}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 0. Multi-Video Idle / Quiet Listening Pool */}
        <div className="rounded-xl border border-[#d6ae63]/40 bg-black overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-[#0c1017] border-b border-white/10">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#f7f1e5]">
                  0. Idle / Quiet Listening Videos
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/45 bg-emerald-950/40 text-emerald-300 font-medium whitespace-nowrap">
                  {activeIdlePool.length >= 2
                    ? `${activeIdlePool.length} Alternating`
                    : '1 Active'}
                </span>
              </div>
              <p className="text-[11px] text-[#8e98a8] truncate mt-0.5">
                Waits ≥10s after each game speech &amp; ≥15s between idle videos · Secondary gestures never repeat back-to-back
              </p>
            </div>

            <button
              type="button"
              onClick={() => setVisibleIdleCount((c) => Math.max(c, totalIdleSlots) + 1)}
              title="Add another Idle / Quiet Listening video slot"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#141b26] hover:bg-[#1c2636] border border-[#38bdf8]/45 text-[11px] font-semibold text-[#bae6fd] cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5 text-[#38bdf8]" />
              Add Slot
            </button>
          </div>

          <div className="divide-y divide-white/10">
            {idleSlotNumbers.map((num) => {
              const key = `idle_${num}`;
              const customUrl = idleVariants[key] || (num === 1 ? overrides.idle : undefined);
              const isSlot1BuiltIn = num === 1 && !customUrl;
              const effectiveUrl = customUrl || (num === 1 ? ANGEL_IDLE_LISTENING_VIDEO_SRC : '');
              const isActive = Boolean(customUrl || isSlot1BuiltIn);
              const clipSec = getVideoFileDurationSec(effectiveUrl, overrides);

              return (
                <div
                  key={key}
                  {...makeDropHandlers('idle', key, (uploadedUrl) => onPreviewIdle(uploadedUrl))}
                  className={`px-3.5 py-2.5 transition-colors ${
                    dragOverSlot === `idle:${key}` ? 'bg-[#172334]' : 'bg-black hover:bg-[#0b0e14]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono-tabular text-xs font-semibold text-[#f3cf83]">
                          Idle #{num}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded border truncate ${
                            isActive
                              ? 'border-emerald-500/45 bg-emerald-950/40 text-emerald-300 font-medium'
                              : 'border-white/12 text-[#9aa3b2]'
                          }`}
                        >
                          {customUrl
                            ? '✓ Active (Custom .mp4)'
                            : isSlot1BuiltIn
                              ? '✓ Active (Built-in default)'
                              : 'Empty — attach or drop .mp4'}
                        </span>
                        {clipSec !== null && (
                          <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-sky-500/35 bg-sky-950/35 text-sky-200 whitespace-nowrap">
                            Video: {formatSec(clipSec)}
                          </span>
                        )}
                        {isActive && renderVideoSizeBadge(effectiveUrl, `Idle #${num}`)}
                        {num >= 2 && renderMaxPlaysControl(`idle:${key}`, `Idle #${num}`)}
                        {renderPlayToEndFlagButton(`idle:${key}`, `Idle #${num}`)}
                      </div>
                      <div className="text-[11px] text-[#8e98a8] truncate mt-0.5">
                        {effectiveUrl
                          ? effectiveUrl.split('?')[0]
                          : `Alternative quiet listening video #${num}`}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isActive && (
                        <button
                          type="button"
                          onClick={() => onPreviewIdle(effectiveUrl)}
                          title={`Preview Idle #${num} on Chess Angel`}
                          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-black hover:bg-[#151c28] border border-white/16 text-[11px] text-[#cbd5e1] cursor-pointer"
                        >
                          <Play className="w-3 h-3 text-[#7dd3fc]" />
                          Test
                        </button>
                      )}
                      {renderUploadButton('idle', key, Boolean(customUrl), (uploadedUrl) =>
                        onPreviewIdle(uploadedUrl),
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Quick 1-click "+ Attach Another Idle .mp4" */}
            <div className="px-3.5 py-2 bg-[#080b10] flex items-center justify-between gap-2">
              <span className="text-[11px] text-[#9aa3b2]">
                Attach 2, 3, or as many quiet listening variations as you like:
              </span>
              <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#38bdf8]/45 bg-[#101926] hover:bg-[#162336] text-[11px] font-semibold text-[#bae6fd] cursor-pointer whitespace-nowrap">
                <Plus className="w-3.5 h-3.5 text-[#38bdf8]" />
                <span>Attach Another Idle .mp4</span>
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    const next = getNextAvailableIdleKey();
                    setVisibleIdleCount((c) => Math.max(c, next.num));
                    void handleUpload('idle', next.key, f, (uploadedUrl) =>
                      onPreviewIdle(uploadedUrl),
                    );
                  }}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Default Speaking Lip-Movement Fallback */}
        <div
          {...makeDropHandlers('default', 'speaking_default', () =>
            onPreviewCase(
              'opening_v1',
              'Ooh, a classic opening! Let us build something beautiful on the board.',
              'OPENING',
            ),
          )}
          className={`rounded-xl border p-3 transition-colors ${
            dragOverSlot === 'default:speaking_default'
              ? 'bg-[#172334] border-[#38bdf8]'
              : 'bg-black border-white/15'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-[#f7f1e5]">
                  Default Speaking Lip-Movement Fallback
                </span>
                <span className="inline-flex items-center gap-1 font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-[#d6ae63]/45 bg-[#231b0e] text-[#f3cf83] whitespace-nowrap">
                  <Clock className="w-2.5 h-2.5" />
                  Talks: 3.0s–8.8s
                </span>
                {defaultSpeakClipSec !== null && (
                  <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-sky-500/35 bg-sky-950/35 text-sky-200 whitespace-nowrap">
                    Video: {formatSec(defaultSpeakClipSec)}
                  </span>
                )}
                {renderVideoSizeBadge(defaultSpeakUrl, 'Default Speaking Lip Fallback')}
                {renderPlayToEndFlagButton(
                  'default:speaking_default',
                  'Default Speaking Lip Fallback',
                )}
              </div>
              <div className="text-[11px] text-[#9aa3b2] truncate mt-0.5">
                {defaultSpeakUrl.split('?')[0]}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() =>
                  void handleToggleLipSync(
                    'global',
                    'default',
                    globalLipSyncOn ? 'off' : 'on',
                    globalLipSyncOn
                      ? 'Unassigned sayings now stay in Idle Only — click "Lip-Sync ON" on only the groups/sayings you want!'
                      : 'Global Default Lip-Sync enabled for all unassigned sayings (click any group/saying to set Idle Only).',
                  )
                }
                title="Choose whether unassigned sayings use Default Lip-Sync by default or stay in Idle Only unless enabled"
                className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-md border text-[10px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  globalLipSyncOn
                    ? 'bg-[#1a2216] hover:bg-[#22301c] border-emerald-500/45 text-emerald-200'
                    : 'bg-[#161a22] hover:bg-[#1e2430] border-amber-500/45 text-amber-200'
                }`}
              >
                {globalLipSyncOn ? 'Fallback: Lip-Sync ON' : 'Fallback: Idle Only'}
              </button>
              <button
                type="button"
                onClick={() =>
                  onPreviewCase(
                    'opening_v1',
                    'Ooh, a classic opening! Let us build something beautiful on the board.',
                    'OPENING',
                  )
                }
                title="Preview Default Speaking Video on Chess Angel"
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-black hover:bg-[#151c28] border border-white/16 text-[11px] text-[#cbd5e1] cursor-pointer"
              >
                <Play className="w-3 h-3 text-[#7dd3fc]" />
                Test
              </button>
              {renderUploadButton(
                'default',
                'speaking_default',
                Boolean(overrides.defaultSpeaking),
                () =>
                  onPreviewCase(
                    'opening_v1',
                    'Ooh, a classic opening! Let us build something beautiful on the board.',
                    'OPENING',
                  ),
              )}
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-white/10 text-[11px] text-[#9aa3b2]">
            Tip: Toggle <span className="text-[#f3cf83] font-medium">Lip-Sync ON</span> /{' '}
            <span className="text-[#cbd5e1] font-medium">Idle Only</span> on any Group or individual
            Saying below to activate Default Lip-Sync on some and keep calm Idle Listening on others.
          </div>
        </div>

        {/* Angel & Modal — On / Off Dedicated Studio Points (Pinned Near Top) */}
        {(() => {
          const modalToggleSlots: ReadonlyArray<{
            caseId: 'angel_modal_on' | 'angel_modal_off';
            title: string;
            subtitle: string;
            sampleClipId: VoiceClipId;
            badgeColorClass: string;
          }> = [
            {
              caseId: 'angel_modal_on',
              title: 'Angel & Modal — Turned ON',
              subtitle:
                'Played when the player switches "Angel & Modal" ON in the HUD dock.',
              sampleClipId: 'angel_modal_on_v1',
              badgeColorClass: 'border-emerald-400/50 bg-emerald-950/40 text-emerald-200',
            },
            {
              caseId: 'angel_modal_off',
              title: 'Angel & Modal — Turned OFF',
              subtitle:
                'Played as Chess Angel’s farewell right before her portrait & modal hide when switched OFF.',
              sampleClipId: 'angel_modal_off_v1',
              badgeColorClass: 'border-amber-400/50 bg-amber-950/40 text-amber-200',
            },
          ];

          return (
            <div className="rounded-xl border border-[#38bdf8]/55 bg-[#0a111a] overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 bg-[#0e1724] border-b border-[#38bdf8]/25">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Film className="w-3.5 h-3.5 text-[#7dd3fc] shrink-0" />
                    <span className="text-xs font-semibold text-[#e0f2fe]">
                      Angel &amp; Modal — On / Off Videos (angel_modal_on · angel_modal_off)
                    </span>
                    <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/45 bg-emerald-950/40 text-emerald-300 font-medium">
                      2 Active (.mp4)
                    </span>
                  </div>
                  <p className="text-[11px] text-[#94a3b8] mt-0.5">
                    Custom .mp4 videos permanently bundled for turning Chess Angel &amp; her modal ON or OFF.
                  </p>
                </div>
              </div>

              <div className="divide-y divide-white/10">
                {modalToggleSlots.map((slot) => {
                  const customUrl = overrides.cases[slot.caseId];
                  const builtInUrl = ANGEL_CASE_VIDEO_MAP[slot.caseId];
                  const activeUrl = customUrl || builtInUrl;
                  const clipSec = getVideoFileDurationSec(activeUrl, overrides);
                  const sampleText = CLIP_TEXT[slot.sampleClipId];
                  const previewSlot = () =>
                    onPreviewCase(slot.sampleClipId, sampleText, slot.caseId.toUpperCase());

                  return (
                    <div
                      key={slot.caseId}
                      {...makeDropHandlers('case', slot.caseId, previewSlot)}
                      className={`px-3 py-2.5 transition-colors ${
                        dragOverSlot === `case:${slot.caseId}` ? 'bg-[#162538]' : 'bg-black'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-semibold text-[#f7f1e5]">
                              {slot.title}
                            </span>
                            <span
                              className={`font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border ${slot.badgeColorClass}`}
                            >
                              {slot.caseId}
                            </span>
                            <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/45 bg-emerald-950/40 text-emerald-300 font-medium">
                              {customUrl ? '✓ Active (Custom .mp4)' : '✓ Active (.mp4)'}
                            </span>
                            {clipSec !== null && (
                              <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-sky-500/35 bg-sky-950/35 text-sky-200">
                                Video: {formatSec(clipSec)}
                              </span>
                            )}
                            {renderVideoSizeBadge(activeUrl, slot.title)}
                          </div>
                          {activeUrl && (
                            <div className="font-mono-tabular text-[10px] text-emerald-300/90 truncate mt-0.5">
                              {activeUrl.split('?')[0]}
                            </div>
                          )}
                          <div className="text-[11px] text-[#8e98a8] mt-0.5">
                            {slot.subtitle}
                          </div>
                          <div className="text-[11px] text-[#cbd5e1] italic mt-0.5">
                            &ldquo;{sampleText}&rdquo;
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          {renderMaxPlaysControl(`case:${slot.caseId}`, slot.title)}
                          {renderPlayToEndFlagButton(`case:${slot.caseId}`, slot.title)}
                          <button
                            type="button"
                            onClick={previewSlot}
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-black hover:bg-[#151c28] border border-white/16 text-[11px] text-[#cbd5e1] cursor-pointer"
                          >
                            <Play className="w-3 h-3 text-[#7dd3fc]" />
                            Test
                          </button>
                          {renderUploadButton('case', slot.caseId, Boolean(customUrl), previewSlot)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Special Title / Version Click Video — Thank You, Jan (Pinned Near Top) */}
        {(() => {
          const customUrl = overrides.cases.thank_jan;
          const activeUrl = customUrl || ANGEL_CASE_VIDEO_MAP.thank_jan;
          const clipSec = getVideoFileDurationSec(activeUrl, overrides);
          const audioSec = overrides.thankJanAudioDuration;
          const hasExtractedAudio = Boolean(overrides.thankJanAudioUrl);
          const sampleText = CLIP_TEXT.thank_jan_v1;
          const previewSlot = () =>
            onPreviewCase('thank_jan_v1', sampleText, 'FOR JAN · CHESS ANGEL');

          return (
            <div className="rounded-xl border border-[#d6ae63]/60 bg-[#120e07] overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 bg-[#1b1409] border-b border-[#d6ae63]/30">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#f3d38b] shrink-0" />
                    <span className="text-xs font-semibold text-[#fbf3df]">
                      Special Tribute Video — Thank You, Jan (thank_jan)
                    </span>
                    <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/50 bg-emerald-950/40 text-emerald-300 font-medium">
                      {activeUrl ? '✓ Locked in App (.mp4)' : 'Awaiting .mp4 Upload'}
                    </span>
                    {hasExtractedAudio && (
                      <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/45 bg-emerald-950/40 text-emerald-300 font-medium">
                        ✓ Voice Track{audioSec ? ` (${formatSec(audioSec)})` : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#cbbd9f] mt-0.5">
                    Plays on Chess Angel whenever anyone clicks the{' '}
                    <span className="text-[#f3d38b] font-medium">ChessAngel 3D</span> title or{' '}
                    <span className="text-[#f3d38b] font-medium">v{APP_VERSION}</span> version number. Video
                    sound is stripped automatically so Chess Angel&rsquo;s own voice speaks her
                    thank-you message cleanly.
                  </p>
                </div>
              </div>

              <div
                {...makeDropHandlers('case', 'thank_jan', previewSlot)}
                className={`px-3 py-2.5 transition-colors ${
                  dragOverSlot === 'case:thank_jan' ? 'bg-[#261c0c]' : 'bg-black'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold text-[#f7f1e5]">
                        Title / Version Click — Chess Angel to Jan
                      </span>
                      <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-[#d6ae63]/50 bg-[#241b0c] text-[#f3d38b]">
                        thank_jan
                      </span>
                      {clipSec !== null && (
                        <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-sky-500/35 bg-sky-950/35 text-sky-200">
                          Video: {formatSec(clipSec)}
                        </span>
                      )}
                      {renderVideoSizeBadge(activeUrl, 'Special Tribute — Thank You, Jan')}
                    </div>
                    {activeUrl && (
                      <div className="font-mono-tabular text-[10px] text-emerald-300/90 truncate mt-0.5">
                        {activeUrl.split('?')[0]}
                      </div>
                    )}
                    <div className="text-[11px] text-[#e8dcc2] italic mt-1">
                      &ldquo;{sampleText}&rdquo;
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {renderPlayToEndFlagButton('case:thank_jan', 'Thank You, Jan')}
                    <button
                      type="button"
                      onClick={previewSlot}
                      className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-black hover:bg-[#1c160b] border border-[#d6ae63]/40 text-[11px] text-[#f3d38b] cursor-pointer"
                    >
                      <Play className="w-3 h-3 text-[#f3d38b]" />
                      Test
                    </button>
                    {renderUploadButton('case', 'thank_jan', Boolean(customUrl), previewSlot)}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Special Event Video — White Fluffy Puppy Rampage (special:dog_run) */}
        {(() => {
          const dogVideoUrl = getAngelDogRunVideoUrl(overrides);
          const dogClipSec = getVideoFileDurationSec(dogVideoUrl || undefined, overrides);
          const jumpSec = getAngelDogRunJumpSec(overrides);
          const sliderMax = dogClipSec && dogClipSec > 2 ? Math.min(30, Math.ceil(dogClipSec)) : 15;
          const previewFullEvent = () => onTriggerDogEvent?.({ playVideo: true });
          const preview3DPuppyOnly = () => onTriggerDogEvent?.({ playVideo: false });

          return (
            <div className="rounded-xl border border-rose-400/55 bg-[#140c10] overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 bg-[#201018] border-b border-rose-400/30">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-rose-300 shrink-0" />
                    <span className="text-xs font-semibold text-[#fdf2f6]">
                      Special Event Video — Fluffy White Puppy Rampage (dog_run)
                    </span>
                    <span
                      className={`font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                        dogVideoUrl
                          ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300'
                          : 'border-amber-500/45 bg-amber-950/40 text-amber-200'
                      }`}
                    >
                      {isSlotLockedInApp('special:dog_run', overrides)
                        ? '✓ Locked in App (.mp4)'
                        : dogVideoUrl
                          ? '✓ Ready (.mp4)'
                          : 'Awaiting .mp4 Upload'}
                    </span>
                    <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-rose-400/40 bg-rose-950/40 text-rose-200 font-medium">
                      Idle Event · 3D Fluffy Puppy · Tips Pieces · Wild Barking
                    </span>
                  </div>
                  <p className="text-[11px] text-[#d6bac4] mt-0.5 leading-snug">
                    Plays automatically as a playful idle event when waiting for a match (~32s) or waiting long during a match (~75s). At the configured jump-out second, the 3D small white fluffy puppy leaps out of the side of Chess Angel&rsquo;s modal, barks wildly, runs across the chessboard tipping every piece it touches, and disappears off the left edge before the pieces spring back upright.
                  </p>
                </div>
              </div>

              <div
                {...makeDropHandlers('special', 'dog_run', () => previewFullEvent())}
                className={`px-3 py-2.5 transition-colors space-y-2.5 ${
                  dragOverSlot === 'special:dog_run' ? 'bg-[#2a1520]' : 'bg-black'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold text-[#f7f1e5]">
                        Angel Modal Puppy Video &amp; 3D Board Rampage
                      </span>
                      <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-rose-400/45 bg-[#26121b] text-rose-200">
                        special:dog_run
                      </span>
                      {dogClipSec !== null && (
                        <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-sky-500/35 bg-sky-950/35 text-sky-200">
                          Video: {formatSec(dogClipSec)}
                        </span>
                      )}
                      {renderVideoSizeBadge(dogVideoUrl || undefined, 'Special Event — Puppy Rampage')}
                    </div>
                    {dogVideoUrl && (
                      <div className="font-mono-tabular text-[10px] text-emerald-300/90 truncate mt-0.5">
                        {dogVideoUrl.split('?')[0]}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {renderPlayToEndFlagButton('special:dog_run', 'Fluffy Puppy Rampage')}
                    <button
                      type="button"
                      onClick={previewFullEvent}
                      disabled={!onTriggerDogEvent}
                      title={
                        dogVideoUrl
                          ? `Play Chess Angel's puppy video and launch the 3D fluffy puppy at ${jumpSec.toFixed(1)}s`
                          : 'Test the 3D fluffy white puppy leaping out of Chess Angel modal now'
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#26121b] hover:bg-[#381928] border border-rose-400/55 text-[11px] font-semibold text-rose-100 cursor-pointer disabled:opacity-45"
                    >
                      <Play className="w-3 h-3 text-rose-300" />
                      {dogVideoUrl ? 'Test Full Event' : 'Test Event'}
                    </button>
                    <button
                      type="button"
                      onClick={preview3DPuppyOnly}
                      disabled={!onTriggerDogEvent}
                      title="Immediately launch the 3D small white fluffy puppy across the chessboard"
                      className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-black hover:bg-[#1c1619] border border-white/20 text-[11px] text-[#f3e6ec] cursor-pointer disabled:opacity-45"
                    >
                      <Zap className="w-3 h-3 text-amber-300" />
                      3D Puppy Now
                    </button>
                    {renderUploadButton('special', 'dog_run', Boolean(dogVideoUrl), () =>
                      previewFullEvent(),
                    )}
                  </div>
                </div>

                {/* Jump-out timing sync control */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/10">
                  <div className="flex items-center gap-1.5 text-[11px] text-[#e6cbd5]">
                    <Clock className="w-3.5 h-3.5 text-rose-300 shrink-0" />
                    <span className="font-medium">3D Puppy jumps out of modal at:</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={sliderMax}
                    step={0.1}
                    value={Math.min(sliderMax, jumpSec)}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      if (Number.isFinite(next)) {
                        void updateAngelDogRunJumpSec(next);
                      }
                    }}
                    onPointerUp={(e) => {
                      const next = Number((e.target as HTMLInputElement).value);
                      if (Number.isFinite(next)) {
                        void updateAngelDogRunJumpSec(next, { immediate: true });
                      }
                    }}
                    className="w-32 sm:w-44 accent-rose-400 cursor-pointer"
                    aria-label="Puppy jump-out timing in seconds"
                  />
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        void updateAngelDogRunJumpSec(Math.max(0, jumpSec - 0.1), {
                          immediate: true,
                        })
                      }
                      title="Decrease by 0.1s"
                      className="px-1.5 py-0.5 rounded border border-rose-400/40 bg-[#221018] hover:bg-[#351825] text-rose-200 font-mono-tabular text-xs font-semibold cursor-pointer"
                    >
                      −0.1
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={sliderMax}
                      step={0.1}
                      value={Number(jumpSec.toFixed(1))}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        if (Number.isFinite(next)) {
                          void updateAngelDogRunJumpSec(next, { immediate: true });
                        }
                      }}
                      aria-label="Exact puppy jump-out second"
                      className="w-16 font-mono-tabular text-xs font-semibold text-center px-1.5 py-0.5 rounded border border-rose-400/50 bg-[#221018] text-rose-100 focus:outline-none focus:border-rose-300"
                    />
                    <span className="font-mono-tabular text-xs font-semibold text-rose-200">s</span>
                    <button
                      type="button"
                      onClick={() =>
                        void updateAngelDogRunJumpSec(Math.min(sliderMax, jumpSec + 0.1), {
                          immediate: true,
                        })
                      }
                      title="Increase by 0.1s"
                      className="px-1.5 py-0.5 rounded border border-rose-400/40 bg-[#221018] hover:bg-[#351825] text-rose-200 font-mono-tabular text-xs font-semibold cursor-pointer"
                    >
                      +0.1
                    </button>
                  </div>
                  <span className="text-[10px] text-[#a9989f]">
                    Locked directly to the video&rsquo;s playback clock — the 3D puppy waits until the video reaches exactly {jumpSec.toFixed(1)}s.
                  </span>
                </div>

                {/* Exact-pixel jump-out calibration (0..752px vertical Y, -80..560px horizontal X) */}
                {(() => {
                  const exitYPx = getAngelDogRunExitYPx(overrides);
                  const exitXPx = getAngelDogRunExitXPx(overrides);
                  return (
                    <div className="space-y-2 pt-2 border-t border-white/10">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-[11px] text-[#e6cbd5]">
                          <Crosshair className="w-3.5 h-3.5 text-rose-300 shrink-0" />
                          <span className="font-medium">
                            Exact Udo Jump-Out Pixel (560×752 video):
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setShowPixelScale((v) => !v)}
                            aria-pressed={showPixelScale}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10.5px] font-semibold cursor-pointer ${
                              showPixelScale
                                ? 'border-rose-400/65 bg-rose-950/55 text-rose-100'
                                : 'border-white/20 bg-white/5 hover:bg-white/10 text-[#cbd5e1]'
                            }`}
                          >
                            <Ruler className="w-3 h-3 text-rose-300" />
                            On-Screen Scale: {showPixelScale ? 'ON' : 'OFF'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void updateAngelDogRunExitPx(
                                {
                                  xPx: DEFAULT_DOG_RUN_EXIT_X_PX,
                                  yPx: DEFAULT_DOG_RUN_EXIT_Y_PX,
                                },
                                { immediate: true },
                              )
                            }
                            title={`Reset to default (${DEFAULT_DOG_RUN_EXIT_X_PX}px, ${DEFAULT_DOG_RUN_EXIT_Y_PX}px)`}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-white/15 bg-white/5 hover:bg-white/10 text-[10px] text-[#d6bac4] cursor-pointer"
                          >
                            <RotateCcw className="w-2.5 h-2.5" />
                            Reset
                          </button>
                        </div>
                      </div>

                      {/* Vertical Y Pixel (0 = top, 752 = bottom) */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono-tabular text-[11px] font-semibold text-rose-200 w-16 shrink-0">
                          Y Height:
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={ANGEL_VIDEO_NATIVE_H}
                          step={1}
                          value={exitYPx}
                          onChange={(e) => {
                            const next = Number(e.target.value);
                            if (Number.isFinite(next)) {
                              void updateAngelDogRunExitPx({ yPx: next });
                            }
                          }}
                          onPointerUp={(e) => {
                            const next = Number((e.target as HTMLInputElement).value);
                            if (Number.isFinite(next)) {
                              void updateAngelDogRunExitPx({ yPx: next }, { immediate: true });
                            }
                          }}
                          className="w-36 sm:w-44 accent-rose-400 cursor-pointer"
                          aria-label="Udo jump-out vertical Y pixel"
                        />
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              void updateAngelDogRunExitPx(
                                { yPx: Math.max(0, exitYPx - 10) },
                                { immediate: true },
                              )
                            }
                            className="px-1.5 py-0.5 rounded border border-rose-400/35 bg-[#221018] hover:bg-[#351825] text-rose-200 font-mono-tabular text-[11px] cursor-pointer"
                          >
                            −10
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void updateAngelDogRunExitPx(
                                { yPx: Math.max(0, exitYPx - 1) },
                                { immediate: true },
                              )
                            }
                            className="px-1.5 py-0.5 rounded border border-rose-400/35 bg-[#221018] hover:bg-[#351825] text-rose-200 font-mono-tabular text-[11px] cursor-pointer"
                          >
                            −1
                          </button>
                          <input
                            type="number"
                            min={0}
                            max={ANGEL_VIDEO_NATIVE_H}
                            step={1}
                            value={exitYPx}
                            onChange={(e) => {
                              const next = Number(e.target.value);
                              if (Number.isFinite(next)) {
                                void updateAngelDogRunExitPx({ yPx: next }, { immediate: true });
                              }
                            }}
                            aria-label="Exact Udo jump-out Y pixel"
                            className="w-16 font-mono-tabular text-xs font-semibold text-center px-1 py-0.5 rounded border border-rose-400/50 bg-[#221018] text-rose-100 focus:outline-none focus:border-rose-300"
                          />
                          <span className="font-mono-tabular text-[11px] text-rose-200">
                            / {ANGEL_VIDEO_NATIVE_H}px
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              void updateAngelDogRunExitPx(
                                { yPx: Math.min(ANGEL_VIDEO_NATIVE_H, exitYPx + 1) },
                                { immediate: true },
                              )
                            }
                            className="px-1.5 py-0.5 rounded border border-rose-400/35 bg-[#221018] hover:bg-[#351825] text-rose-200 font-mono-tabular text-[11px] cursor-pointer"
                          >
                            +1
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void updateAngelDogRunExitPx(
                                { yPx: Math.min(ANGEL_VIDEO_NATIVE_H, exitYPx + 10) },
                                { immediate: true },
                              )
                            }
                            className="px-1.5 py-0.5 rounded border border-rose-400/35 bg-[#221018] hover:bg-[#351825] text-rose-200 font-mono-tabular text-[11px] cursor-pointer"
                          >
                            +10
                          </button>
                        </div>
                      </div>

                      {/* Horizontal X Pixel (-80 = left outside edge, 0 = left edge, 560 = right edge) */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono-tabular text-[11px] font-semibold text-amber-200 w-16 shrink-0">
                          X Edge:
                        </span>
                        <input
                          type="range"
                          min={-80}
                          max={ANGEL_VIDEO_NATIVE_W}
                          step={1}
                          value={exitXPx}
                          onChange={(e) => {
                            const next = Number(e.target.value);
                            if (Number.isFinite(next)) {
                              void updateAngelDogRunExitPx({ xPx: next });
                            }
                          }}
                          onPointerUp={(e) => {
                            const next = Number((e.target as HTMLInputElement).value);
                            if (Number.isFinite(next)) {
                              void updateAngelDogRunExitPx({ xPx: next }, { immediate: true });
                            }
                          }}
                          className="w-36 sm:w-44 accent-amber-400 cursor-pointer"
                          aria-label="Udo jump-out horizontal X pixel"
                        />
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              void updateAngelDogRunExitPx(
                                { xPx: Math.max(-80, exitXPx - 10) },
                                { immediate: true },
                              )
                            }
                            className="px-1.5 py-0.5 rounded border border-amber-400/35 bg-[#20190c] hover:bg-[#302410] text-amber-200 font-mono-tabular text-[11px] cursor-pointer"
                          >
                            −10
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void updateAngelDogRunExitPx(
                                { xPx: Math.max(-80, exitXPx - 1) },
                                { immediate: true },
                              )
                            }
                            className="px-1.5 py-0.5 rounded border border-amber-400/35 bg-[#20190c] hover:bg-[#302410] text-amber-200 font-mono-tabular text-[11px] cursor-pointer"
                          >
                            −1
                          </button>
                          <input
                            type="number"
                            min={-80}
                            max={ANGEL_VIDEO_NATIVE_W}
                            step={1}
                            value={exitXPx}
                            onChange={(e) => {
                              const next = Number(e.target.value);
                              if (Number.isFinite(next)) {
                                void updateAngelDogRunExitPx({ xPx: next }, { immediate: true });
                              }
                            }}
                            aria-label="Exact Udo jump-out X pixel"
                            className="w-16 font-mono-tabular text-xs font-semibold text-center px-1 py-0.5 rounded border border-amber-400/50 bg-[#20190c] text-amber-100 focus:outline-none focus:border-amber-300"
                          />
                          <span className="font-mono-tabular text-[11px] text-amber-200">
                            / {ANGEL_VIDEO_NATIVE_W}px
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              void updateAngelDogRunExitPx(
                                { xPx: Math.min(ANGEL_VIDEO_NATIVE_W, exitXPx + 1) },
                                { immediate: true },
                              )
                            }
                            className="px-1.5 py-0.5 rounded border border-amber-400/35 bg-[#20190c] hover:bg-[#302410] text-amber-200 font-mono-tabular text-[11px] cursor-pointer"
                          >
                            +1
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void updateAngelDogRunExitPx(
                                { xPx: Math.min(ANGEL_VIDEO_NATIVE_W, exitXPx + 10) },
                                { immediate: true },
                              )
                            }
                            className="px-1.5 py-0.5 rounded border border-amber-400/35 bg-[#20190c] hover:bg-[#302410] text-amber-200 font-mono-tabular text-[11px] cursor-pointer"
                          >
                            +10
                          </button>
                        </div>
                      </div>
                      <p className="text-[10px] text-[#a9989f]">
                        Click or drag directly on the live pixel scale next to Chess Angel&rsquo;s video to position Udo&rsquo;s launch height by the exact pixel.
                      </p>
                    </div>
                  );
                })()}

                {/* Custom Looping Barking Audio for Udo's 3D Animation */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#e6cbd5]">
                      <Music className="w-3.5 h-3.5 text-rose-300 shrink-0" />
                      <span className="font-medium">Udo 3D Barking Sound (Loops while running):</span>
                      <span
                        className={`font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border ${
                          overrides.udoBarkAudioUrl
                            ? 'border-emerald-500/45 bg-emerald-950/40 text-emerald-200'
                            : 'border-white/15 bg-white/5 text-[#b7a7ae]'
                        }`}
                      >
                        {overrides.udoBarkAudioUrl ? '✓ Custom Bark Loop Active' : 'Default SFX'}
                      </span>
                    </div>
                    {overrides.udoBarkAudioUrl && (
                      <div className="font-mono-tabular text-[10px] text-emerald-300/85 truncate mt-0.5">
                        {overrides.udoBarkAudioUrl.split('?')[0]}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => soundEngine.previewUdoBarkAudio(2600)}
                      title="Preview Udo's looping barking audio"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-black hover:bg-[#221018] border border-rose-400/40 text-[11px] text-rose-200 cursor-pointer"
                    >
                      <Play className="w-3 h-3 text-rose-300" />
                      Test Bark
                    </button>
                    <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#26121b] hover:bg-[#381928] border border-rose-400/55 text-[11px] font-semibold text-rose-100 cursor-pointer">
                      <Upload className="w-3 h-3 text-rose-300" />
                      <span>{overrides.udoBarkAudioUrl ? 'Replace Bark Audio' : 'Upload Bark Audio'}</span>
                      <input
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file) return;
                          setBusySlot('udo_bark_audio');
                          setStatusNote(`Uploading Udo barking sound (${file.name})...`);
                          void uploadUdoBarkAudio(file)
                            .then(() => {
                              setStatusNote(
                                'Saved Udo barking sound! It will loop with stereo panning during Udo’s 3D run.',
                              );
                              soundEngine.previewUdoBarkAudio(2400);
                            })
                            .catch((err) => {
                              setStatusNote(
                                err instanceof Error
                                  ? err.message
                                  : 'Failed to upload Udo barking audio.',
                              );
                            })
                            .finally(() => setBusySlot(null));
                        }}
                      />
                    </label>
                    {overrides.udoBarkAudioUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setBusySlot('udo_bark_audio');
                          void resetUdoBarkAudio()
                            .then(() => {
                              setStatusNote(
                                'Cleared custom Udo barking audio (reverted to default).',
                              );
                            })
                            .catch((err) => {
                              setStatusNote(
                                err instanceof Error
                                  ? err.message
                                  : 'Failed to clear Udo barking audio.',
                              );
                            })
                            .finally(() => setBusySlot(null));
                        }}
                        title="Remove custom barking audio"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-black hover:bg-rose-950/50 border border-white/15 text-[11px] text-[#c7b7be] hover:text-rose-200 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Special 3D Board Idle Event — Mini Hamsters Wild Chase */}
        <div className="rounded-xl border border-sky-400/45 bg-[#0c1118] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 bg-[#101824]">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                <span className="text-xs font-semibold text-[#eef6ff]">
                  Special 3D Idle Animation — Mini Hamsters Wild Chase
                </span>
                <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-sky-400/45 bg-sky-950/45 text-sky-200 font-medium">
                  Russian Grey (Black Stripe) &amp; White (Pink Nose &amp; Claws)
                </span>
              </div>
              <p className="text-[11px] text-[#b4c4d8] mt-0.5 leading-snug">
                A dark grey Russian mini hamster with a black dorsal line and a white mini hamster with a pink nose and pink claws chase each other wildly across the 3D chessboard, alternating with the Fluffy White Puppy during idle waiting states.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onTriggerHamsterChase?.()}
              disabled={!onTriggerHamsterChase}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#132236] hover:bg-[#1a304d] border border-sky-400/55 text-[11px] font-semibold text-sky-100 cursor-pointer shrink-0 disabled:opacity-45"
            >
              <Play className="w-3 h-3 text-sky-300" />
              Test 3D Hamsters Chase
            </button>
          </div>
        </div>

        {/* Special Event Video — Dance with Stars (special:dance_stars) */}
        {(() => {
          const danceStarsUrl = getAngelDanceStarsVideoUrl(overrides);
          const danceClipSec = getVideoFileDurationSec(danceStarsUrl || undefined, overrides);
          const previewDanceStars = () => onTriggerDanceStarsEvent?.();

          return (
            <div className="rounded-xl border border-amber-400/55 bg-[#151109] overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 bg-[#221a0c] border-b border-amber-400/30">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                    <span className="text-xs font-semibold text-[#fff7e0]">
                      Special Event Video — Dance with Stars (dance_stars)
                    </span>
                    <span
                      className={`font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                        danceStarsUrl
                          ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300'
                          : 'border-amber-500/45 bg-amber-950/40 text-amber-200'
                      }`}
                    >
                      {isSlotLockedInApp('special:dance_stars', overrides)
                        ? '✓ Locked in App (.mp4)'
                        : danceStarsUrl
                          ? '✓ Ready (.mp4)'
                          : 'Awaiting .mp4 Upload'}
                    </span>
                    <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-amber-400/45 bg-amber-950/45 text-amber-200 font-medium">
                      Fine Gold Stars · Leftward Drift · Fades to 0 at End
                    </span>
                  </div>
                  <p className="text-[11px] text-[#ded0b4] mt-0.5 leading-snug">
                    When this video plays, fine sparkling gold stars drift around her portrait and spread across the left side of the screen, gently diminishing to 0 as the video finishes. Also joins the playful idle rotation once uploaded.
                  </p>
                </div>
              </div>

              <div
                {...makeDropHandlers('special', 'dance_stars', () => previewDanceStars())}
                className={`px-3 py-2.5 transition-colors ${
                  dragOverSlot === 'special:dance_stars' ? 'bg-[#2c210e]' : 'bg-black'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold text-[#fdf5e0]">
                        Dance with Stars Portrait Video &amp; Gold Star Drift
                      </span>
                      <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-amber-400/45 bg-[#251c0c] text-amber-200">
                        special:dance_stars
                      </span>
                      {danceClipSec !== null && (
                        <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-sky-500/35 bg-sky-950/35 text-sky-200">
                          Video: {formatSec(danceClipSec)}
                        </span>
                      )}
                      {renderVideoSizeBadge(danceStarsUrl || undefined, 'Special Event — Dance with Stars')}
                    </div>
                    {danceStarsUrl ? (
                      <div className="font-mono-tabular text-[10px] text-emerald-300/90 truncate mt-0.5">
                        {danceStarsUrl.split('?')[0]}
                      </div>
                    ) : (
                      <div className="text-[10px] text-amber-200/75 mt-0.5">
                        Upload or drop your Dance with Stars .mp4 here (or click Preview Gold Stars now).
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {renderPlayToEndFlagButton('special:dance_stars', 'Dance with Stars')}
                    <button
                      type="button"
                      onClick={previewDanceStars}
                      disabled={!onTriggerDanceStarsEvent}
                      title="Play Dance with Stars with fine sparkling gold stars spreading left and fading to 0 at video end"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#2a1f0b] hover:bg-[#3d2d10] border border-amber-400/55 text-[11px] font-semibold text-amber-100 cursor-pointer disabled:opacity-45"
                    >
                      <Play className="w-3 h-3 text-amber-300" />
                      {danceStarsUrl ? 'Test Dance with Stars' : 'Preview Gold Stars'}
                    </button>
                    {renderUploadButton('special', 'dance_stars', Boolean(danceStarsUrl), () =>
                      previewDanceStars(),
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Transparent Black Background — All Chess Angel Videos (GPU Exterior Flood Keyer) */}
        {(() => {
          const bgTrans = getAngelBgTransparency(overrides);
          const bgTransPct = Math.round(bgTrans * 100);
          const isBgTransparent = bgTrans > 0.001;

          return (
            <div className="rounded-xl border border-violet-400/50 bg-[#0d0a16] overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 bg-[#150f24] border-b border-violet-400/30">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-violet-300 shrink-0" />
                    <span className="text-xs font-semibold text-[#f3ecff]">
                      Transparent Black Background — All Angel Videos
                    </span>
                    <span
                      className={`font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                        isBgTransparent
                          ? 'border-emerald-400/50 bg-emerald-950/45 text-emerald-200'
                          : 'border-white/15 bg-white/5 text-[#b7b0c4]'
                      }`}
                    >
                      {isBgTransparent ? `✓ Transparent (${bgTransPct}%)` : 'Off (Solid Black)'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#c7bddb] mt-0.5 leading-snug">
                    Real-time GPU exterior flood-mask removes studio black backgrounds from every Angel video over the 3D chessboard while protecting her eyes, dark hair, and outfit.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      void updateAngelBgTransparency(
                        isBgTransparent ? 0 : DEFAULT_ANGEL_BG_TRANSPARENCY,
                        { immediate: true },
                      )
                    }
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-[11px] font-semibold cursor-pointer ${
                      isBgTransparent
                        ? 'bg-emerald-950/60 hover:bg-emerald-900/60 border-emerald-400/55 text-emerald-100'
                        : 'bg-[#1f1833] hover:bg-[#2b2147] border-violet-400/55 text-violet-100'
                    }`}
                  >
                    {isBgTransparent ? 'Transparent: ON' : 'Transparent: OFF'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void updateAngelBgTransparency(DEFAULT_ANGEL_BG_TRANSPARENCY, {
                        immediate: true,
                      })
                    }
                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-violet-400/35 bg-[#120d20] hover:bg-[#1e1635] text-[10px] text-violet-200 cursor-pointer"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    Reset ({Math.round(DEFAULT_ANGEL_BG_TRANSPARENCY * 100)}%)
                  </button>
                </div>
              </div>

              <div className="px-3 py-2.5 bg-black">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-medium text-[#d4c9ea] shrink-0">
                    Keying Cutoff:
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={bgTransPct}
                    onChange={(e) => {
                      const pct = Number(e.target.value);
                      if (Number.isFinite(pct)) {
                        void updateAngelBgTransparency(pct / 100);
                      }
                    }}
                    aria-label="Angel video black background transparency cutoff percentage"
                    className="flex-1 min-w-[140px] accent-violet-400 cursor-pointer"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        void updateAngelBgTransparency(Math.max(0, (bgTransPct - 5) / 100), {
                          immediate: true,
                        })
                      }
                      className="px-1.5 py-0.5 rounded border border-violet-400/35 bg-[#120d20] hover:bg-[#1e1635] text-violet-200 font-mono-tabular text-[11px] cursor-pointer"
                    >
                      −5%
                    </button>
                    <span className="w-11 text-center font-mono-tabular text-xs font-semibold text-violet-100">
                      {bgTransPct}%
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        void updateAngelBgTransparency(Math.min(1, (bgTransPct + 5) / 100), {
                          immediate: true,
                        })
                      }
                      className="px-1.5 py-0.5 rounded border border-violet-400/35 bg-[#120d20] hover:bg-[#1e1635] text-violet-200 font-mono-tabular text-[11px] cursor-pointer"
                    >
                      +5%
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Special 3D Extension — Opening Flowchart (Timer & Density Scaler) */}
        {(() => {
          const startSec = getOpeningFlowchartStartSec(overrides);
          const density = getOpeningFlowchartDensity(overrides);
          const openingUrl =
            overrides.cases?.opening || ANGEL_CASE_VIDEO_MAP.opening || undefined;
          const openingClipSec = getVideoFileDurationSec(openingUrl, overrides) ?? 10.1;
          const maxStartSec = Math.min(15, Math.max(10, Math.ceil(openingClipSec)));
          const densityPct = Math.round(density * 100);

          const previewOpeningFlowchart = () => {
            primeNextCaseSlotPreview('opening', openingUrl);
            onPreviewCase('opening_v1', CLIP_TEXT.opening_v1, 'OPENING');
          };

          return (
            <div className="rounded-xl border border-emerald-400/50 bg-[#081312] overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 bg-[#0c1e1c] border-b border-emerald-400/30">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                    <span className="text-xs font-semibold text-[#e8fff7]">
                      Opening 3D Flowchart Extension — Timer &amp; Density Scaler
                    </span>
                    <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-emerald-400/45 bg-emerald-950/45 text-emerald-200 font-medium">
                      Start: {startSec.toFixed(2)}s
                    </span>
                    <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-cyan-400/45 bg-cyan-950/45 text-cyan-200 font-medium">
                      Density: {density.toFixed(2)}× ({densityPct}%)
                    </span>
                  </div>
                  <p className="text-[11px] text-[#b4d6ce] mt-0.5 leading-snug">
                    Tune the exact playback second when the 3D neon PCB flowchart emerges from the Opening video border and scale its branch/comb density live to match the video flowchart.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={previewOpeningFlowchart}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#0f2924] hover:bg-[#163c35] border border-emerald-400/55 text-[11px] font-semibold text-emerald-100 cursor-pointer shrink-0"
                >
                  <Play className="w-3 h-3 text-emerald-300" />
                  Test Opening + 3D Flowchart
                </button>
              </div>

              <div className="px-3 py-2.5 bg-black space-y-2.5">
                {/* 1. Start Timer Control */}
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[11px] text-[#c7ece2]">
                      <Clock className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                      <span className="font-medium">3D Flowchart Start Timer:</span>
                      <span className="font-mono-tabular text-[10px] text-emerald-300/80">
                        (Video: {formatSec(openingClipSec)})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void updateOpeningFlowchartConfig(
                          { startSec: DEFAULT_OPENING_FLOWCHART_START_SEC },
                          { immediate: true },
                        )
                      }
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-emerald-400/35 bg-[#0b1f1c] hover:bg-[#12332e] text-[10px] text-emerald-200 cursor-pointer"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      Reset ({DEFAULT_OPENING_FLOWCHART_START_SEC.toFixed(2)}s)
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={maxStartSec}
                      step={0.05}
                      value={Math.min(maxStartSec, startSec)}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        if (Number.isFinite(next)) {
                          void updateOpeningFlowchartConfig({ startSec: next });
                        }
                      }}
                      aria-label="Opening 3D flowchart start second"
                      className="flex-1 min-w-[140px] accent-emerald-400 cursor-pointer"
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          void updateOpeningFlowchartConfig(
                            { startSec: Math.max(0, Math.round((startSec - 0.5) * 100) / 100) },
                            { immediate: true },
                          )
                        }
                        className="px-1.5 py-0.5 rounded border border-emerald-400/35 bg-[#0b1f1c] hover:bg-[#12332e] text-emerald-200 font-mono-tabular text-[11px] cursor-pointer"
                      >
                        −0.5
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void updateOpeningFlowchartConfig(
                            { startSec: Math.max(0, Math.round((startSec - 0.1) * 100) / 100) },
                            { immediate: true },
                          )
                        }
                        className="px-1.5 py-0.5 rounded border border-emerald-400/35 bg-[#0b1f1c] hover:bg-[#12332e] text-emerald-200 font-mono-tabular text-[11px] cursor-pointer"
                      >
                        −0.1
                      </button>
                      <input
                        type="number"
                        min={0}
                        max={15}
                        step={0.05}
                        value={startSec}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          if (Number.isFinite(next)) {
                            void updateOpeningFlowchartConfig({ startSec: next }, { immediate: true });
                          }
                        }}
                        aria-label="Exact opening 3D flowchart start second"
                        className="w-16 font-mono-tabular text-xs font-semibold text-center px-1 py-0.5 rounded border border-emerald-400/50 bg-[#0b1f1c] text-emerald-100 focus:outline-none focus:border-emerald-300"
                      />
                      <span className="font-mono-tabular text-[11px] text-emerald-200">s</span>
                      <button
                        type="button"
                        onClick={() =>
                          void updateOpeningFlowchartConfig(
                            { startSec: Math.min(15, Math.round((startSec + 0.1) * 100) / 100) },
                            { immediate: true },
                          )
                        }
                        className="px-1.5 py-0.5 rounded border border-emerald-400/35 bg-[#0b1f1c] hover:bg-[#12332e] text-emerald-200 font-mono-tabular text-[11px] cursor-pointer"
                      >
                        +0.1
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void updateOpeningFlowchartConfig(
                            { startSec: Math.min(15, Math.round((startSec + 0.5) * 100) / 100) },
                            { immediate: true },
                          )
                        }
                        className="px-1.5 py-0.5 rounded border border-emerald-400/35 bg-[#0b1f1c] hover:bg-[#12332e] text-emerald-200 font-mono-tabular text-[11px] cursor-pointer"
                      >
                        +0.5
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. Density Scaler Control */}
                <div className="space-y-1 pt-2 border-t border-white/10">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[11px] text-[#c7ece2]">
                      <Zap className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                      <span className="font-medium">Flowchart Density Scaler:</span>
                      <span className="font-mono-tabular text-[10px] text-cyan-200/85">
                        ({densityPct}% · highways, lanes, comb prongs &amp; pulses)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void updateOpeningFlowchartConfig(
                          { density: DEFAULT_OPENING_FLOWCHART_DENSITY },
                          { immediate: true },
                        )
                      }
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-cyan-400/35 bg-[#0a1d24] hover:bg-[#102d38] text-[10px] text-cyan-200 cursor-pointer"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      Reset ({DEFAULT_OPENING_FLOWCHART_DENSITY.toFixed(2)}×)
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="range"
                      min={0.25}
                      max={2.5}
                      step={0.05}
                      value={density}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        if (Number.isFinite(next)) {
                          void updateOpeningFlowchartConfig({ density: next });
                        }
                      }}
                      aria-label="Opening 3D flowchart density scale"
                      className="flex-1 min-w-[140px] accent-cyan-400 cursor-pointer"
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          void updateOpeningFlowchartConfig(
                            { density: Math.max(0.25, Math.round((density - 0.25) * 100) / 100) },
                            { immediate: true },
                          )
                        }
                        className="px-1.5 py-0.5 rounded border border-cyan-400/35 bg-[#0a1d24] hover:bg-[#102d38] text-cyan-200 font-mono-tabular text-[11px] cursor-pointer"
                      >
                        −0.25
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void updateOpeningFlowchartConfig(
                            { density: Math.max(0.25, Math.round((density - 0.05) * 100) / 100) },
                            { immediate: true },
                          )
                        }
                        className="px-1.5 py-0.5 rounded border border-cyan-400/35 bg-[#0a1d24] hover:bg-[#102d38] text-cyan-200 font-mono-tabular text-[11px] cursor-pointer"
                      >
                        −0.05
                      </button>
                      <input
                        type="number"
                        min={0.25}
                        max={2.5}
                        step={0.05}
                        value={density}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          if (Number.isFinite(next)) {
                            void updateOpeningFlowchartConfig({ density: next }, { immediate: true });
                          }
                        }}
                        aria-label="Exact opening 3D flowchart density scale"
                        className="w-16 font-mono-tabular text-xs font-semibold text-center px-1 py-0.5 rounded border border-cyan-400/50 bg-[#0a1d24] text-cyan-100 focus:outline-none focus:border-cyan-300"
                      />
                      <span className="font-mono-tabular text-[11px] text-cyan-200">×</span>
                      <button
                        type="button"
                        onClick={() =>
                          void updateOpeningFlowchartConfig(
                            { density: Math.min(2.5, Math.round((density + 0.05) * 100) / 100) },
                            { immediate: true },
                          )
                        }
                        className="px-1.5 py-0.5 rounded border border-cyan-400/35 bg-[#0a1d24] hover:bg-[#102d38] text-cyan-200 font-mono-tabular text-[11px] cursor-pointer"
                      >
                        +0.05
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void updateOpeningFlowchartConfig(
                            { density: Math.min(2.5, Math.round((density + 0.25) * 100) / 100) },
                            { immediate: true },
                          )
                        }
                        className="px-1.5 py-0.5 rounded border border-cyan-400/35 bg-[#0a1d24] hover:bg-[#102d38] text-cyan-200 font-mono-tabular text-[11px] cursor-pointer"
                      >
                        +0.25
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-[#8daea6]">
                    Tip: Click &ldquo;Test Opening + 3D Flowchart&rdquo; and drag the Density slider live while the opening video plays to match the 3D PCB density directly to the video.
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Special 3D Extension — Calculation Deep-Branch 3D Tree Positioning & Density (case:calc_pure) */}
        {(() => {
          const calcTreeOffsetX = getCalcPureTreeOffsetX(overrides);
          const calcTreeOffsetY = getCalcPureTreeOffsetY(overrides);
          const calcTreeDensity = getCalcPureTreeDensity(overrides);
          const calcPureUrl = overrides.cases?.calc_pure || ANGEL_CASE_VIDEO_MAP.calc_pure;
          const calcPureDurationSec = getVideoFileDurationSec(calcPureUrl, overrides) ?? 8.1;

          const previewCalcPureWithTree = () => {
            primeNextCaseSlotPreview('calc_pure', calcPureUrl);
            onPreviewCase(
              'calc_pure_v2',
              CLIP_TEXT.calc_pure_v2,
              'DEEP CALCULATION · 3D TREE',
            );
          };

          return (
            <div className="mb-5 rounded-xl border border-emerald-400/45 bg-[#091812] overflow-hidden shadow-lg">
              <div className="px-4 py-3 bg-[#0d241b] border-b border-emerald-400/25 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-400/20 text-emerald-200 border border-emerald-400/45">
                      DEEP-BRANCH 3D TREE · CALCULATION
                    </span>
                    <h3 className="font-display text-sm font-semibold text-[#f3efe6]">
                      Calculation Deep-Branch 3D Tree — Positioning &amp; Density
                    </h3>
                  </div>
                  <p className="text-xs text-[#b7d8c5] mt-1">
                    Adjust horizontal &amp; vertical positioning and deep-branch / foliage density across every 4-border limb, sub-branch fork, and root veil of <code className="text-emerald-200">case:calc_pure</code> ({calcPureDurationSec.toFixed(1)}s).
                  </p>
                </div>

                <button
                  type="button"
                  onClick={previewCalcPureWithTree}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#04180d] transition-colors cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  Test Calculation + 3D Tree
                </button>
              </div>

              <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-3.5">
                {/* 1. Horizontal Position (X Offset px) */}
                <div className="rounded-lg border border-emerald-400/25 bg-[#06110c] p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-200">
                      <Crosshair className="w-3.5 h-3.5" />
                      Horizontal Position (X)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono-tabular text-xs font-bold px-2 py-0.5 rounded bg-emerald-400/20 text-emerald-100 border border-emerald-400/40">
                        {calcTreeOffsetX > 0 ? `+${calcTreeOffsetX}` : calcTreeOffsetX}px
                      </span>
                      {calcTreeOffsetX !== DEFAULT_CALC_PURE_TREE_OFFSET_X && (
                        <button
                          type="button"
                          onClick={() =>
                            void updateCalcPureTreeConfig(
                              { offsetX: DEFAULT_CALC_PURE_TREE_OFFSET_X },
                              { immediate: true },
                            )
                          }
                          title="Reset X position to 0px"
                          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-white/15 text-[#b5d2c3] hover:text-white hover:border-white/35 cursor-pointer"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={-240}
                      max={240}
                      step={2}
                      value={calcTreeOffsetX}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        if (Number.isFinite(next)) {
                          void updateCalcPureTreeConfig({ offsetX: next });
                        }
                      }}
                      aria-label="Calculation 3D tree horizontal X position offset in pixels"
                      className="flex-1 accent-emerald-400 cursor-pointer"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-1 text-[10px] text-[#8ab39d]">
                    <span>−240px (Left)</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          void updateCalcPureTreeConfig(
                            { offsetX: Math.max(-240, calcTreeOffsetX - 10) },
                            { immediate: true },
                          )
                        }
                        className="px-1.5 py-0.5 rounded border border-emerald-400/35 bg-[#0a2117] hover:bg-[#113324] text-emerald-200 font-mono-tabular text-[11px] cursor-pointer"
                      >
                        −10
                      </button>
                      <input
                        type="number"
                        min={-240}
                        max={240}
                        step={1}
                        value={calcTreeOffsetX}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          if (Number.isFinite(next)) {
                            void updateCalcPureTreeConfig({ offsetX: next }, { immediate: true });
                          }
                        }}
                        aria-label="Exact calculation 3D tree X offset in pixels"
                        className="w-16 font-mono-tabular text-xs font-semibold text-center px-1 py-0.5 rounded border border-emerald-400/50 bg-[#0a2117] text-emerald-100 focus:outline-none focus:border-emerald-300"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          void updateCalcPureTreeConfig(
                            { offsetX: Math.min(240, calcTreeOffsetX + 10) },
                            { immediate: true },
                          )
                        }
                        className="px-1.5 py-0.5 rounded border border-emerald-400/35 bg-[#0a2117] hover:bg-[#113324] text-emerald-200 font-mono-tabular text-[11px] cursor-pointer"
                      >
                        +10
                      </button>
                    </div>
                    <span>+240px (Right)</span>
                  </div>
                </div>

                {/* 2. Vertical Position (Y Offset px) */}
                <div className="rounded-lg border border-emerald-400/25 bg-[#06110c] p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-200">
                      <Ruler className="w-3.5 h-3.5" />
                      Vertical Position (Y)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono-tabular text-xs font-bold px-2 py-0.5 rounded bg-emerald-400/20 text-emerald-100 border border-emerald-400/40">
                        {calcTreeOffsetY > 0 ? `+${calcTreeOffsetY}` : calcTreeOffsetY}px
                      </span>
                      {calcTreeOffsetY !== DEFAULT_CALC_PURE_TREE_OFFSET_Y && (
                        <button
                          type="button"
                          onClick={() =>
                            void updateCalcPureTreeConfig(
                              { offsetY: DEFAULT_CALC_PURE_TREE_OFFSET_Y },
                              { immediate: true },
                            )
                          }
                          title="Reset Y position to 0px"
                          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-white/15 text-[#b5d2c3] hover:text-white hover:border-white/35 cursor-pointer"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={-240}
                      max={240}
                      step={2}
                      value={calcTreeOffsetY}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        if (Number.isFinite(next)) {
                          void updateCalcPureTreeConfig({ offsetY: next });
                        }
                      }}
                      aria-label="Calculation 3D tree vertical Y position offset in pixels"
                      className="flex-1 accent-emerald-400 cursor-pointer"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-1 text-[10px] text-[#8ab39d]">
                    <span>−240px (Up)</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          void updateCalcPureTreeConfig(
                            { offsetY: Math.max(-240, calcTreeOffsetY - 10) },
                            { immediate: true },
                          )
                        }
                        className="px-1.5 py-0.5 rounded border border-emerald-400/35 bg-[#0a2117] hover:bg-[#113324] text-emerald-200 font-mono-tabular text-[11px] cursor-pointer"
                      >
                        −10
                      </button>
                      <input
                        type="number"
                        min={-240}
                        max={240}
                        step={1}
                        value={calcTreeOffsetY}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          if (Number.isFinite(next)) {
                            void updateCalcPureTreeConfig({ offsetY: next }, { immediate: true });
                          }
                        }}
                        aria-label="Exact calculation 3D tree Y offset in pixels"
                        className="w-16 font-mono-tabular text-xs font-semibold text-center px-1 py-0.5 rounded border border-emerald-400/50 bg-[#0a2117] text-emerald-100 focus:outline-none focus:border-emerald-300"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          void updateCalcPureTreeConfig(
                            { offsetY: Math.min(240, calcTreeOffsetY + 10) },
                            { immediate: true },
                          )
                        }
                        className="px-1.5 py-0.5 rounded border border-emerald-400/35 bg-[#0a2117] hover:bg-[#113324] text-emerald-200 font-mono-tabular text-[11px] cursor-pointer"
                      >
                        +10
                      </button>
                    </div>
                    <span>+240px (Down)</span>
                  </div>
                </div>

                {/* 3. Deep-Branch & Foliage Density (0.25x .. 2.50x) */}
                <div className="rounded-lg border border-emerald-400/25 bg-[#06110c] p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-200">
                      <Sparkles className="w-3.5 h-3.5" />
                      Deep-Branch &amp; Leaf Density
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono-tabular text-xs font-bold px-2 py-0.5 rounded bg-emerald-400/20 text-emerald-100 border border-emerald-400/40">
                        {calcTreeDensity.toFixed(2)}× ({Math.round(calcTreeDensity * 100)}%)
                      </span>
                      {Math.abs(calcTreeDensity - DEFAULT_CALC_PURE_TREE_DENSITY) > 0.005 && (
                        <button
                          type="button"
                          onClick={() =>
                            void updateCalcPureTreeConfig(
                              { density: DEFAULT_CALC_PURE_TREE_DENSITY },
                              { immediate: true },
                            )
                          }
                          title="Reset deep-branch density to 1.00×"
                          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-white/15 text-[#b5d2c3] hover:text-white hover:border-white/35 cursor-pointer"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0.25}
                      max={2.5}
                      step={0.05}
                      value={calcTreeDensity}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        if (Number.isFinite(next)) {
                          void updateCalcPureTreeConfig({ density: next });
                        }
                      }}
                      aria-label="Calculation 3D tree deep-branch and leaf density scale"
                      className="flex-1 accent-emerald-400 cursor-pointer"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-1 text-[10px] text-[#8ab39d]">
                    <span>0.25× (Sparse)</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          void updateCalcPureTreeConfig(
                            { density: Math.max(0.25, Math.round((calcTreeDensity - 0.1) * 100) / 100) },
                            { immediate: true },
                          )
                        }
                        className="px-1.5 py-0.5 rounded border border-emerald-400/35 bg-[#0a2117] hover:bg-[#113324] text-emerald-200 font-mono-tabular text-[11px] cursor-pointer"
                      >
                        −0.10
                      </button>
                      <input
                        type="number"
                        min={0.25}
                        max={2.5}
                        step={0.05}
                        value={calcTreeDensity}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          if (Number.isFinite(next)) {
                            void updateCalcPureTreeConfig({ density: next }, { immediate: true });
                          }
                        }}
                        aria-label="Exact calculation 3D tree deep-branch density"
                        className="w-16 font-mono-tabular text-xs font-semibold text-center px-1 py-0.5 rounded border border-emerald-400/50 bg-[#0a2117] text-emerald-100 focus:outline-none focus:border-emerald-300"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          void updateCalcPureTreeConfig(
                            { density: Math.min(2.5, Math.round((calcTreeDensity + 0.1) * 100) / 100) },
                            { immediate: true },
                          )
                        }
                        className="px-1.5 py-0.5 rounded border border-emerald-400/35 bg-[#0a2117] hover:bg-[#113324] text-emerald-200 font-mono-tabular text-[11px] cursor-pointer"
                      >
                        +0.10
                      </button>
                    </div>
                    <span>2.50× (Lush)</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Special Board Event Video — Pawn Reaches 8th Row / Promotion Choice (case:ask_promotion) */}
        {(() => {
          const [promoSlot1Key, promoSlot2Key] = getCaseSlotKeys('ask_promotion');
          const promoUrl1 = overrides.cases?.[promoSlot1Key];
          const promoUrl2 = overrides.cases?.[promoSlot2Key];
          const promoFallbackUrl = ANGEL_CASE_VIDEO_MAP.ask_promotion;
          const promoPool = getCaseVideoPool('ask_promotion', overrides);
          const promoTalkSec =
            ANGEL_VIDEO_STUDIO_GROUPS.flatMap((g) => g.cases).find(
              (c) => c.caseId === 'ask_promotion',
            )?.talkSec ?? 8.9;

          const previewEighthRowSlot = (preferredUrl?: string) => {
            primeNextCaseSlotPreview('ask_promotion', preferredUrl);
            onPreviewCase(
              'ask_promotion_v1',
              CLIP_TEXT.ask_promotion_v1,
              'PAWN REACHES 8TH ROW',
            );
          };

          const promoSlots = [
            {
              slotKey: promoSlot1Key,
              quotaSlotId: 'case:ask_promotion_primary',
              slotLabel: '8th-Row Arrival #1 (Primary)',
              slotUrl: promoUrl1,
              emptyHint: promoFallbackUrl
                ? 'Insert custom .mp4 (currently using promotion fallback)'
                : 'Insert primary 8th-row arrival .mp4',
              subCaption: promoFallbackUrl
                ? `Fallback active (${promoFallbackUrl.split('?')[0]}) — insert or drop your dedicated 8th-row .mp4 here`
                : 'Primary video played when a player pawn reaches the 8th row',
            },
            {
              slotKey: promoSlot2Key,
              quotaSlotId: `case:${promoSlot2Key}`,
              slotLabel: '8th-Row Arrival #2 (Optional Alt)',
              slotUrl: promoUrl2,
              emptyHint: 'Optional — insert 2nd alternating 8th-row .mp4',
              subCaption: 'Alternates automatically with #1 whenever another pawn reaches the 8th row',
            },
          ] as const;

          return (
            <div className="rounded-xl border border-[#e3be78]/65 bg-[#141008] overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 bg-[#241b0b] border-b border-[#e3be78]/35">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Crown className="w-3.5 h-3.5 text-[#f7d78a] shrink-0" />
                    <span className="text-xs font-semibold text-[#fff7e0]">
                      Pawn Reaches 8th Row — Promotion Choice Video (ask_promotion)
                    </span>
                    <span
                      className={`font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                        promoPool.length > 0
                          ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300'
                          : 'border-amber-400/50 bg-amber-950/40 text-amber-200'
                      }`}
                    >
                      {promoPool.length >= 2
                        ? '✓ 2 Custom .mp4s Alternating'
                        : promoPool.length === 1
                          ? '✓ Custom 8th-Row .mp4 Active'
                          : 'Ready for .mp4 Insert'}
                    </span>
                    <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-[#d6ae63]/55 bg-[#2a1f0d] text-[#fde68a]">
                      Talk: {formatSec(promoTalkSec)}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#ded0b4] mt-0.5 leading-snug">
                    Insert or drag-and-drop the portrait <code className="text-[#fde68a]">.mp4</code>{' '}
                    that Chess Angel plays the instant a pawn reaches the eighth row and she asks
                    whether to crown a Queen, Rook, Bishop, or Knight.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => previewEighthRowSlot(undefined)}
                    title="Preview Chess Angel's 8th-row voice prompt, promotion buttons, and inserted video"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#2c200b] hover:bg-[#3f2e10] border border-[#e3be78]/60 text-[11px] font-semibold text-[#fff3cf] cursor-pointer"
                  >
                    <Play className="w-3 h-3 text-[#f7d78a]" />
                    Test 8th-Row Video
                  </button>
                  {onSimulateEighthRow && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onSimulateEighthRow();
                      }}
                      title="Close Studio and run the live 3D match simulation where a pawn reaches the 8th row"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-black hover:bg-[#1e180d] border border-[#d6ae63]/45 text-[11px] font-medium text-[#f3cf83] cursor-pointer"
                    >
                      <Crown className="w-3 h-3 text-[#e3be78]" />
                      Simulate 8th Row
                    </button>
                  )}
                </div>
              </div>

              <div className="divide-y divide-white/10">
                {promoSlots.map((slot) => {
                  const slotClipSec = getVideoFileDurationSec(
                    slot.slotUrl || (slot.slotKey === 'ask_promotion' ? promoFallbackUrl : undefined),
                    overrides,
                  );
                  return (
                    <div
                      key={slot.slotKey}
                      {...makeDropHandlers('case', slot.slotKey, (uploadedUrl) =>
                        previewEighthRowSlot(uploadedUrl),
                      )}
                      className={`px-3 py-2.5 transition-colors ${
                        dragOverSlot === `case:${slot.slotKey}`
                          ? 'bg-[#2c210e]'
                          : 'bg-black hover:bg-[#110d06]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono-tabular text-xs font-semibold text-[#f7d78a]">
                              {slot.slotLabel}
                            </span>
                            <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-[#d6ae63]/40 bg-[#22190a] text-[#f3cf83]">
                              case:{slot.slotKey}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded border truncate ${
                                slot.slotUrl
                                  ? 'border-emerald-500/45 bg-emerald-950/40 text-emerald-300 font-medium'
                                  : 'border-amber-400/40 bg-amber-950/30 text-amber-200'
                              }`}
                            >
                              {slot.slotUrl ? '✓ Custom .mp4 Inserted' : slot.emptyHint}
                            </span>
                            {slotClipSec !== null && (
                              <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-sky-500/35 bg-sky-950/35 text-sky-200 whitespace-nowrap">
                                Video: {formatSec(slotClipSec)}
                              </span>
                            )}
                            {renderVideoSizeBadge(slot.slotUrl, slot.slotLabel)}
                            {renderMaxPlaysControl(slot.quotaSlotId, slot.slotLabel)}
                            {renderPlayToEndFlagButton(`case:${slot.slotKey}`, slot.slotLabel)}
                          </div>
                          <div className="font-mono-tabular text-[10px] text-[#9aa3b2] truncate mt-0.5">
                            {slot.slotUrl ? slot.slotUrl.split('?')[0] : slot.subCaption}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => previewEighthRowSlot(slot.slotUrl)}
                            title={`Preview ${slot.slotLabel} on Chess Angel`}
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-black hover:bg-[#151c28] border border-white/16 text-[11px] text-[#cbd5e1] cursor-pointer"
                          >
                            <Play className="w-3 h-3 text-[#7dd3fc]" />
                            Test
                          </button>
                          {renderUploadButton(
                            'case',
                            slot.slotKey,
                            Boolean(slot.slotUrl),
                            (uploadedUrl) => previewEighthRowSlot(uploadedUrl),
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Special Word-Triggered Escape Overlay Videos ("you", "me", & "push a button") */}
        <div className="rounded-xl border border-[#c084fc]/45 bg-black overflow-hidden">
          <div className="px-3.5 py-2.5 bg-[#120d1d] border-b border-white/10">
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-[#d8b4fe] shrink-0" />
              <span className="text-xs font-semibold text-[#f7f1e5]">
                Special Word-Triggered Escape Overlay Videos
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#c084fc]/45 bg-[#241338] text-[#e9d5ff] font-medium whitespace-nowrap">
                3rd-Layer Overlay · Multi-Alternative Pool · Resumes Base Video to End
              </span>
            </div>
            <p className="text-[11px] text-[#a9b1c2] mt-0.5 leading-snug">
              Attach multiple alternative short overlay clips for{' '}
              <span className="text-[#f3cf83] font-medium">&ldquo;you&rdquo;</span>,{' '}
              <span className="text-[#f3cf83] font-medium">&ldquo;me&rdquo; / &ldquo;I&rdquo;</span>, and{' '}
              <span className="text-[#f3cf83] font-medium">&ldquo;button&rdquo;</span> — gesture
              apexes synchronize to the exact spoken word in the voice recording, and you can select
              or unselect{' '}
              <span className="text-[#e9d5ff] font-medium">Cue &ldquo;you&rdquo;</span> /{' '}
              <span className="text-[#e9d5ff] font-medium">Cue &ldquo;me/I&rdquo;</span> /{' '}
              <span className="text-[#e9d5ff] font-medium">Cue &ldquo;button&rdquo;</span> on each
              individual video below.
            </p>
          </div>

          <div className="divide-y divide-white/15">
            {escapeSpecs.map((esc) => {
              const isEnabled = isEscapeCueEnabled(esc.key, overrides);
              const activePool = getEscapeVideoPool(esc.key, overrides);
              const configuredEntries = getEscapeCueEntries(esc.key, overrides);
              const highestConfiguredNum = Object.keys(overrides.escapes || {}).reduce((max, k) => {
                const n = parseEscapeSlotNumber(esc.key, k);
                return n > 0 && overrides.escapes?.[k as AngelEscapeSlotKey]
                  ? Math.max(max, n)
                  : max;
              }, 0);
              const totalEscSlots = Math.max(
                esc.minDefaultSlots,
                visibleEscapeCounts[esc.key] || esc.minDefaultSlots,
                highestConfiguredNum,
              );
              const escSlotNumbers = Array.from({ length: totalEscSlots }, (_, i) => i + 1);

              const previewEscapeSlot = (specificUrl?: string) => {
                primeNextEscapeSlotPreview(esc.key, specificUrl);
                onPreviewCase(
                  esc.previewClipId,
                  CLIP_TEXT[esc.previewClipId],
                  esc.previewTag,
                );
              };

              return (
                <div key={esc.key} className="bg-black">
                  {/* Escape Cue Header ("you", "me", or "button") */}
                  <div className="px-3.5 py-2.5 bg-[#0d0a15] border-b border-white/10 flex items-start justify-between gap-2.5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Hand className="w-3.5 h-3.5 text-[#f3cf83] shrink-0" />
                        <span className="text-xs font-semibold text-[#f7f1e5]">{esc.title}</span>
                        <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-[#c084fc]/45 bg-[#231436] text-[#e9d5ff] whitespace-nowrap">
                          {esc.triggerBadge}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${
                            activePool.length > 0
                              ? isEnabled
                                ? 'border-emerald-500/45 bg-emerald-950/40 text-emerald-300 font-medium'
                                : 'border-amber-500/40 bg-amber-950/35 text-amber-200'
                              : 'border-white/12 text-[#9aa3b2]'
                          }`}
                        >
                          {activePool.length >= 2
                            ? isEnabled
                              ? `${activePool.length} Alternating`
                              : `${activePool.length} Attached (OFF)`
                            : activePool.length === 1
                              ? isEnabled
                                ? '1 Active'
                                : '1 Attached (OFF)'
                              : '0 Attached'}
                        </span>
                        {configuredEntries.length > 0 && (
                          <span className="font-mono-tabular text-[10px] text-[#9aa3b2] whitespace-nowrap">
                            ({totalEscSlots} slots)
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] leading-snug text-[#9aa3b2]">
                        {esc.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setVisibleEscapeCounts((prev) => ({
                            ...prev,
                            [esc.key]: Math.max(prev[esc.key] || esc.minDefaultSlots, totalEscSlots) + 1,
                          }))
                        }
                        title={`Add another alternative video slot for ${esc.shortWord}`}
                        className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-[#181126] hover:bg-[#231838] border border-[#c084fc]/45 text-[10px] font-semibold text-[#e9d5ff] cursor-pointer whitespace-nowrap"
                      >
                        <Plus className="w-3 h-3 text-[#d8b4fe]" />
                        Add Alt
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          void handleToggleEscapeOverlay(
                            esc.key,
                            !isEnabled,
                            !isEnabled
                              ? `Special Escape Overlay ${esc.shortWord} enabled.`
                              : `Special Escape Overlay ${esc.shortWord} paused (base video plays uninterrupted).`,
                          )
                        }
                        title={
                          isEnabled
                            ? `Click to temporarily disable the ${esc.shortWord} Escape Overlay`
                            : `Click to enable the ${esc.shortWord} Escape Overlay`
                        }
                        className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-md border text-[10px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                          isEnabled
                            ? 'bg-[#1f1630] hover:bg-[#2a1d42] border-[#c084fc]/50 text-[#e9d5ff]'
                            : 'bg-[#151821] hover:bg-[#1d2230] border-white/18 text-[#9aa3b2]'
                        }`}
                      >
                        {isEnabled ? 'Overlay ON' : 'Overlay OFF'}
                      </button>
                    </div>
                  </div>

                  {/* Multi-Alternative Video Slots (#1, #2, #3, #4...) */}
                  <div className="divide-y divide-white/10">
                    {escSlotNumbers.map((slotNum, idx) => {
                      const slotKey = getEscapeSlotKey(esc.key, slotNum);
                      const slotLabel =
                        slotNum === 1 ? `${esc.shortWord} #1` : `${esc.shortWord} #${slotNum} (Alt)`;
                      const customUrl = overrides.escapes?.[slotKey];
                      const clipSec = getVideoFileDurationSec(customUrl, overrides);
                      const apexSec = customUrl
                        ? getEscapeVideoApexSec(customUrl, esc.key, overrides)
                        : null;

                      return (
                        <div
                          key={slotKey}
                          {...makeDropHandlers('escape', slotKey, (uploadedUrl) =>
                            previewEscapeSlot(uploadedUrl),
                          )}
                          className={`px-3.5 py-2.5 transition-colors ${
                            dragOverSlot === `escape:${slotKey}`
                              ? 'bg-[#201533]'
                              : 'bg-black hover:bg-[#0c0a12]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-mono-tabular text-xs font-semibold text-[#f3cf83]">
                                  {slotLabel}
                                </span>
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded border truncate ${
                                    customUrl
                                      ? isEnabled
                                        ? 'border-emerald-500/45 bg-emerald-950/40 text-emerald-300 font-medium'
                                        : 'border-amber-500/40 bg-amber-950/35 text-amber-200'
                                      : 'border-white/12 text-[#9aa3b2]'
                                  }`}
                                >
                                  {customUrl
                                    ? isEnabled
                                      ? '✓ Active (.mp4)'
                                      : 'Attached (Overlay OFF)'
                                    : idx === 0
                                      ? `Empty — attach or drop primary ${esc.shortWord} .mp4`
                                      : `Empty — attach or drop alternative #${slotNum} .mp4`}
                                </span>
                                {clipSec !== null && (
                                  <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-sky-500/35 bg-sky-950/35 text-sky-200 whitespace-nowrap">
                                    Video: {formatSec(clipSec)}
                                  </span>
                                )}
                                {renderVideoSizeBadge(customUrl, slotLabel)}
                                {apexSec !== null && (
                                  <span
                                    title="Calibrated gesture apex inside this video — aligned automatically with the spoken word in the voice recording"
                                    className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-[#c084fc]/45 bg-[#231436] text-[#e9d5ff] whitespace-nowrap"
                                  >
                                    Point Apex: {formatSec(apexSec)}
                                  </span>
                                )}
                                {renderMaxPlaysControl(`escape:${slotKey}`, slotLabel)}
                                {renderPlayToEndFlagButton(`escape:${slotKey}`, slotLabel)}
                              </div>
                              <div className="text-[11px] text-[#8e98a8] truncate mt-0.5">
                                {customUrl
                                  ? customUrl.split('?')[0]
                                  : `Alternative #${slotNum} overlay video for ${esc.shortWord} (rotates automatically across all attached slots)`}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => previewEscapeSlot(customUrl)}
                                title={`Preview ${slotLabel} escape overlay & base-video resume on Chess Angel`}
                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-black hover:bg-[#151c28] border border-white/16 text-[11px] text-[#cbd5e1] cursor-pointer"
                              >
                                <Play className="w-3 h-3 text-[#7dd3fc]" />
                                Test
                              </button>

                              {renderUploadButton(
                                'escape',
                                slotKey,
                                Boolean(customUrl),
                                (uploadedUrl) => previewEscapeSlot(uploadedUrl),
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Special Seduction Distraction Videos (Multi-Option Pool + Trigger Mode Options) */}
        {(() => {
          const seductionEntries = getSeductionCaseEntries(overrides);
          const highestConfiguredSeduction = Object.keys(overrides.cases || {}).reduce((max, k) => {
            const n = parseSeductionSlotNumber(k);
            return n > 0 && overrides.cases?.[k as keyof typeof overrides.cases]
              ? Math.max(max, n)
              : max;
          }, 0);
          const totalSeductionSlots = Math.max(
            3,
            visibleSeductionCount,
            highestConfiguredSeduction,
          );
          const seductionSlotNumbers = Array.from({ length: totalSeductionSlots }, (_, i) => i + 1);
          const currentTriggerMode: SeductionTriggerMode =
            overrides.seductionTriggerMode || 'balanced';

          const SEDUCTION_TRIGGER_OPTIONS: ReadonlyArray<{
            value: SeductionTriggerMode;
            label: string;
          }> = [
            { value: 'balanced', label: 'Trigger: Balanced (3 Good Moves / +1.45)' },
            { value: 'frequent', label: 'Trigger: Frequent (2 Good Moves / +0.90)' },
            { value: 'dominant', label: 'Trigger: Dominant Lead (4 Good Moves / +2.30)' },
            { value: 'tactical', label: 'Trigger: Sharp Tactical Captures' },
          ];

          const previewSeductionSlot = (preferredUrl?: string, idx = 0) => {
            primeNextCaseSlotPreview('seduction', preferredUrl);
            const clipVariants: readonly VoiceClipId[] = [
              'seduction_v1',
              'seduction_v2',
              'seduction_v3',
            ];
            const chosenClip = clipVariants[idx % clipVariants.length];
            onPreviewCase(chosenClip, CLIP_TEXT[chosenClip], 'PLAYING TOO WELL · DISTRACTION');
          };

          return (
            <div className="rounded-xl border border-pink-500/45 bg-black overflow-hidden">
              <div className="px-3.5 py-2.5 bg-[#180d16] border-b border-pink-500/25 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-pink-300 shrink-0" />
                    <span className="text-xs font-semibold text-[#fdf2f8]">
                      Special Seduction Distraction Options (Player Plays Too Well)
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-pink-400/45 bg-pink-950/45 text-pink-200 font-medium whitespace-nowrap">
                      {seductionEntries.length >= 2
                        ? `${seductionEntries.length} Options Alternating`
                        : seductionEntries.length === 1
                          ? '1 Option Active'
                          : '0 Attached'}
                    </span>
                    {renderMaxPlaysControl('case:seduction', 'Special Seduction Overall')}
                    {(() => {
                      const sedBtnStatus = getCaseEscapeCueStatus(
                        'seduction',
                        'push_button',
                        overrides,
                      );
                      const sedNoCut = isEffectiveCasePlayToEnd('seduction', overrides);
                      const cuePool = getEscapeVideoPool('push_button', overrides);
                      const globalCueOn = isEscapeCueEnabled('push_button', overrides);
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            if (sedBtnStatus.selected) {
                              void handleToggleCaseCue(
                                'seduction',
                                'push_button',
                                'off',
                                'Special Seduction: unselected Cue "button".',
                              );
                            } else {
                              void handleToggleCaseCue(
                                'seduction',
                                'push_button',
                                'on',
                                sedNoCut
                                  ? 'Special Seduction: selected Cue "button" (plays afterwards once No-Cut video finishes).'
                                  : 'Special Seduction: selected Cue "button".',
                              );
                            }
                          }}
                          title={
                            sedBtnStatus.selected
                              ? sedNoCut
                                ? 'Selected: Because No Cut is enabled, the "button" video part plays right afterwards once Seduction finishes.'
                                : `Selected: Cue "button" @${formatSec(sedBtnStatus.spokenWordSec)}.`
                              : 'Click to attach the "button" pointing video part (plays right afterwards when No Cut is enabled).'
                          }
                          className={`inline-flex items-center gap-1 font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer whitespace-nowrap ${
                            sedBtnStatus.selected
                              ? cuePool.length > 0 && globalCueOn
                                ? 'border-[#c084fc]/60 bg-[#26143c] hover:bg-[#331b50] text-[#f3e8ff] font-medium'
                                : 'border-amber-500/45 bg-amber-950/35 text-amber-200 font-medium'
                              : 'border-white/14 bg-[#120b16] hover:bg-[#1e1226] text-[#bda6cc]'
                          }`}
                        >
                          {sedBtnStatus.selected ? (
                            <Check className="w-2.5 h-2.5 text-[#d8b4fe] shrink-0" />
                          ) : (
                            <span className="w-2.5 h-2.5 rounded-[2px] border border-white/30 inline-block shrink-0" />
                          )}
                          <span>
                            {sedBtnStatus.selected
                              ? sedNoCut
                                ? 'Cue "button" · After Video'
                                : `Cue "button" @${formatSec(sedBtnStatus.spokenWordSec)}`
                              : 'Cue "button"'}
                          </span>
                        </button>
                      );
                    })()}
                  </div>
                  <p className="text-[11px] text-[#d8bfd0] mt-0.5 leading-snug">
                    Attach several Special Seduction <span className="text-pink-200 font-medium">.mp4</span>{' '}
                    options to alternate automatically when the player plays too well, and choose how
                    eagerly she triggers the distraction.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <label
                    title="Choose when Special Seduction triggers during gameplay"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-pink-400/45 bg-[#23101e] text-[10px] font-medium text-pink-100 cursor-pointer whitespace-nowrap"
                  >
                    <select
                      aria-label="Special Seduction trigger option"
                      value={currentTriggerMode}
                      onChange={(e) => {
                        const mode = e.target.value as SeductionTriggerMode;
                        void updateAngelSeductionTriggerMode(mode);
                        setStatusNote(`Special Seduction trigger mode updated to "${mode}".`);
                      }}
                      className="bg-transparent text-pink-100 text-[10px] focus:outline-none cursor-pointer"
                    >
                      {SEDUCTION_TRIGGER_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value} className="bg-[#120910] text-[#fdf2f8]">
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={() =>
                      setVisibleSeductionCount((c) => Math.max(c, totalSeductionSlots) + 1)
                    }
                    title="Add another Special Seduction video option"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#261121] hover:bg-[#34172d] border border-pink-400/50 text-[11px] font-semibold text-pink-100 cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5 text-pink-300" />
                    Add Option
                  </button>
                </div>
              </div>

              <div className="divide-y divide-white/10">
                {seductionSlotNumbers.map((num, idx) => {
                  const slotKey = getSeductionSlotKey(num);
                  const customUrl = overrides.cases?.[slotKey];
                  const clipSec = getVideoFileDurationSec(customUrl, overrides);
                  const slotId = `case:${slotKey}`;
                  const slotLabel = `Seduction Option #${num}`;
                  const quotaSlotId = num === 1 ? 'case:seduction_primary' : slotId;

                  return (
                    <div
                      key={slotKey}
                      {...makeDropHandlers('case', slotKey, (uploadedUrl) =>
                        previewSeductionSlot(uploadedUrl, idx),
                      )}
                      className={`px-3.5 py-2.5 transition-colors ${
                        dragOverSlot === slotId ? 'bg-[#261120]' : 'bg-black hover:bg-[#10080e]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono-tabular text-xs font-semibold text-pink-200">
                              {slotLabel}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded border truncate ${
                                customUrl
                                  ? 'border-emerald-500/45 bg-emerald-950/40 text-emerald-300 font-medium'
                                  : 'border-white/12 text-[#9aa3b2]'
                              }`}
                            >
                              {customUrl
                                ? '✓ Active (.mp4)'
                                : `Empty — attach or drop Seduction #${num} .mp4`}
                            </span>
                            {clipSec !== null && (
                              <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-sky-500/35 bg-sky-950/35 text-sky-200 whitespace-nowrap">
                                Video: {formatSec(clipSec)}
                              </span>
                            )}
                            {renderVideoSizeBadge(customUrl, slotLabel)}
                            {renderMaxPlaysControl(quotaSlotId, slotLabel)}
                            {renderPlayToEndFlagButton(slotId, slotLabel)}
                          </div>
                          <div className="text-[11px] text-[#8e98a8] truncate mt-0.5">
                            {customUrl
                              ? customUrl.split('?')[0]
                              : `Special Seduction distraction video option #${num} (alternates automatically when multiple options are attached)`}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => previewSeductionSlot(customUrl, idx)}
                            title={`Preview ${slotLabel} on Chess Angel`}
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-black hover:bg-[#231420] border border-pink-400/35 text-[11px] text-pink-100 cursor-pointer"
                          >
                            <Play className="w-3 h-3 text-pink-300" />
                            Test
                          </button>
                          {renderUploadButton('case', slotKey, Boolean(customUrl), (uploadedUrl) =>
                            previewSeductionSlot(uploadedUrl, idx),
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Groups 1–9 & Individual Sayings */}
        {ANGEL_VIDEO_STUDIO_GROUPS.map((grp) => {
          const isOpen = Boolean(expandedGroups[grp.id]);
          const groupOverride =
            overrides.groups[grp.id as AngelExpressionGroup] || ANGEL_GROUP_VIDEO_MAP[grp.id];
          const groupClipSec = getVideoFileDurationSec(groupOverride, overrides);
          const explicitGroupLipRule = lipSyncCfg.groups[grp.id as AngelExpressionGroup];
          const groupLipSyncEffective = isGroupUsingDefaultLipSync(grp.id, overrides);
          const firstCase = grp.cases[0];
          const talkRangeLabel =
            grp.minTalkSec === grp.maxTalkSec
              ? `Talk: ${formatSec(grp.minTalkSec)}`
              : `Talks: ${formatSec(grp.minTalkSec)}–${formatSec(grp.maxTalkSec)}`;

          return (
            <div
              key={grp.id}
              className="rounded-xl border border-white/15 bg-black overflow-hidden"
            >
              <div
                {...makeDropHandlers('group', grp.id, () =>
                  onPreviewCase(firstCase.sampleClipId, firstCase.sampleText, grp.id.toUpperCase()),
                )}
                className={`flex items-center justify-between gap-2 px-3 py-2.5 transition-colors ${
                  dragOverSlot === `group:${grp.id}` ? 'bg-[#172334]' : 'bg-[#0c1017]'
                }`}
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedGroups((prev) => ({ ...prev, [grp.id]: !prev[grp.id] }))
                  }
                  className="flex items-center gap-2 min-w-0 text-left cursor-pointer"
                >
                  {isOpen ? (
                    <ChevronDown className="w-3.5 h-3.5 text-[#f3cf83] shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-[#9aa3b2] shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold text-[#f7f1e5] truncate">
                        {grp.number}. {grp.title}
                      </span>
                      <span className="inline-flex items-center gap-1 font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-[#d6ae63]/40 bg-[#231b0e] text-[#f3cf83] whitespace-nowrap">
                        <Clock className="w-2.5 h-2.5" />
                        {talkRangeLabel}
                      </span>
                      {groupClipSec !== null && (
                        <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-sky-500/35 bg-sky-950/35 text-sky-200 whitespace-nowrap">
                          Video: {formatSec(groupClipSec)}
                        </span>
                      )}
                      {renderVideoSizeBadge(groupOverride, `Group ${grp.title}`)}
                    </div>
                    <div className="text-[11px] text-[#8e98a8] truncate mt-0.5">
                      Group ({grp.id})
                      {groupOverride
                        ? ' · Custom group .mp4 active'
                        : groupLipSyncEffective
                          ? ' · Default Lip-Sync ON'
                          : ' · Idle Only (No Lip-Sync)'}
                    </div>
                  </div>
                </button>

                <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                  {renderMaxPlaysControl(`group:${grp.id}`, `Group ${grp.title}`)}
                  {renderPlayToEndFlagButton(`group:${grp.id}`, `Group ${grp.title}`)}
                  {!groupOverride && (
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const next = groupLipSyncEffective ? 'off' : 'on';
                          void handleToggleLipSync(
                            'group',
                            grp.id,
                            next,
                            next === 'on'
                              ? `Group "${grp.title}" set to Default Lip-Sync ON.`
                              : `Group "${grp.title}" set to Idle Only (no lip-sync).`,
                          );
                        }}
                        title={
                          groupLipSyncEffective
                            ? `Click to disable Default Lip-Sync on Group ${grp.number} (stay in Idle Listening)`
                            : `Click to enable Default Lip-Sync on Group ${grp.number}`
                        }
                        className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-md border text-[10px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                          groupLipSyncEffective
                            ? 'bg-[#172318] hover:bg-[#1e2f20] border-emerald-500/40 text-emerald-200'
                            : 'bg-[#151821] hover:bg-[#1d2230] border-white/18 text-[#9aa3b2]'
                        }`}
                      >
                        {groupLipSyncEffective ? 'Lip-Sync ON' : 'Idle Only'}
                      </button>
                      {explicitGroupLipRule && (
                        <button
                          type="button"
                          onClick={() =>
                            void handleToggleLipSync(
                              'group',
                              grp.id,
                              'inherit',
                              `Group "${grp.title}" reset to inherit Global Fallback.`,
                            )
                          }
                          title="Reset group to inherit Global Fallback"
                          className="p-1.5 rounded-md border border-white/15 bg-black hover:bg-white/10 text-[#9aa3b2] cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}

                  {renderUploadButton(
                    'group',
                    grp.id,
                    Boolean(overrides.groups[grp.id as AngelExpressionGroup]),
                    () =>
                      onPreviewCase(
                        firstCase.sampleClipId,
                        firstCase.sampleText,
                        grp.id.toUpperCase(),
                      ),
                  )}
                </div>
              </div>

              {isOpen && (
                <div className="divide-y divide-white/10 border-t border-white/10">
                  {grp.cases.map((item) => {
                    const hasAltSlots = caseHasAlternativeSlotUI(item.caseId, overrides);
                    const [slot1Key, slot2Key] = getCaseSlotKeys(item.caseId);
                    const customCaseUrl1 = overrides.cases[slot1Key];
                    const customCaseUrl2 = overrides.cases[slot2Key];
                    const casePool = getCaseVideoPool(item.caseId, overrides);
                    const customCaseUrl = customCaseUrl1 || customCaseUrl2;
                    const explicitCaseLipRule = lipSyncCfg.cases[item.caseId as CommentaryCaseId];
                    const builtInCaseUrl = !customCaseUrl
                      ? ANGEL_CASE_VIDEO_MAP[item.caseId as CommentaryCaseId]
                      : undefined;
                    const activeCaseUrl = customCaseUrl || builtInCaseUrl;
                    const activeCaseClipSec = !hasAltSlots
                      ? getVideoFileDurationSec(activeCaseUrl, overrides)
                      : null;
                    const isDirectAssigned = Boolean(activeCaseUrl);
                    const caseLipSyncEffective = isCaseUsingDefaultLipSync(
                      item.caseId,
                      overrides,
                    );

                    const effectiveLabel =
                      casePool.length >= 2
                        ? caseLipSyncEffective
                          ? '✓ 2 Alternating .mp4s + Lip-Sync tail'
                          : '✓ 2 Alternating .mp4s (Idle after)'
                        : customCaseUrl
                          ? caseLipSyncEffective
                            ? '✓ Custom .mp4 + Lip-Sync tail'
                            : '✓ Custom .mp4 (Idle after)'
                          : builtInCaseUrl
                            ? caseLipSyncEffective
                              ? `✓ Built-in + Lip-Sync tail`
                              : `✓ Built-in (Idle after)`
                            : explicitCaseLipRule === 'off'
                              ? 'Idle Only (No lip-sync)'
                              : explicitCaseLipRule === 'on'
                                ? '✓ Lip-Sync ON (Forced)'
                                : groupOverride
                                  ? caseLipSyncEffective
                                    ? `Group (${grp.id}) + Lip-Sync tail`
                                    : `Group (${grp.id}) · Idle after`
                                  : caseLipSyncEffective
                                    ? 'Default lip-sync'
                                    : 'Idle Only (No lip-sync)';

                    const previewThis = () =>
                      onPreviewCase(
                        item.sampleClipId,
                        item.sampleText,
                        item.caseId.toUpperCase(),
                      );

                    const previewCaseSlot = (preferredUrl?: string) => {
                      primeNextCaseSlotPreview(item.caseId, preferredUrl);
                      previewThis();
                    };

                    return (
                      <div
                        key={item.caseId}
                        {...(!hasAltSlots
                          ? makeDropHandlers('case', item.caseId, previewThis)
                          : {})}
                        className={`px-3.5 py-2.5 transition-colors ${
                          !hasAltSlots && dragOverSlot === `case:${item.caseId}`
                            ? 'bg-[#162334]'
                            : 'bg-black hover:bg-[#0b0e14]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-mono-tabular text-xs font-semibold text-[#f3cf83]">
                                {item.caseId}
                              </span>

                              {/* Exact Voice Talk Duration Badge */}
                              <span
                                title={`Primary talk (v1): ${formatSec(item.talkSec)} · Repeat variants — v2: ${formatSec(item.v2Sec)}, v3: ${formatSec(item.v3Sec)}`}
                                className="inline-flex items-center gap-1 font-mono-tabular text-[10px] font-semibold px-1.5 py-0.5 rounded border border-[#d6ae63]/55 bg-[#241b0c] text-[#fde68a] whitespace-nowrap"
                              >
                                <Clock className="w-2.5 h-2.5 text-[#f3cf83]" />
                                Talk: {formatSec(item.talkSec)}
                              </span>

                              <span
                                title="Shorter spoken durations on 2nd and 3rd repeat occurrences"
                                className="font-mono-tabular text-[10px] text-[#8e98a8] whitespace-nowrap"
                              >
                                (v2: {formatSec(item.v2Sec)} · v3: {formatSec(item.v3Sec)})
                              </span>

                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded border truncate ${
                                  isDirectAssigned
                                    ? 'border-emerald-500/45 bg-emerald-950/40 text-emerald-300 font-medium'
                                    : !groupOverride && !caseLipSyncEffective
                                      ? 'border-amber-500/35 bg-amber-950/30 text-amber-200'
                                      : 'border-white/12 text-[#9aa3b2]'
                                }`}
                              >
                                {effectiveLabel}
                              </span>

                              {activeCaseClipSec !== null && (
                                <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-sky-500/35 bg-sky-950/35 text-sky-200 whitespace-nowrap">
                                  Video: {formatSec(activeCaseClipSec)}
                                </span>
                              )}
                              {!hasAltSlots && renderVideoSizeBadge(activeCaseUrl, item.caseId)}

                              {renderMaxPlaysControl(`case:${item.caseId}`, item.caseId)}
                              {renderPlayToEndFlagButton(`case:${item.caseId}`, item.caseId)}

                              {ALL_ESCAPE_CUE_KEYS.map((cueKey) => {
                                const cueStatus = getCaseEscapeCueStatus(
                                  item.caseId,
                                  cueKey,
                                  overrides,
                                );
                                const caseNoCutEffective = isEffectiveCasePlayToEnd(
                                  item.caseId,
                                  overrides,
                                );
                                const cuePool = getEscapeVideoPool(cueKey, overrides);
                                const hasEscapeClip = cuePool.length > 0;
                                const globalCueOn = isEscapeCueEnabled(cueKey, overrides);
                                const shortTitle =
                                  cueKey === 'point_you'
                                    ? '"you"'
                                    : cueKey === 'point_me'
                                      ? cueStatus.natural.cue
                                        ? `"${cueStatus.natural.cue.focalWord}"`
                                        : '"me/I"'
                                      : '"button"';
                                const isButtonAfterNoCut =
                                  cueKey === 'push_button' && caseNoCutEffective;
                                const variantSuffix =
                                  cueStatus.selected &&
                                  !isButtonAfterNoCut &&
                                  cueStatus.natural.hasAny &&
                                  !cueStatus.natural.inV1 &&
                                  cueStatus.explicitRule !== 'on'
                                    ? ` (${cueStatus.natural.variantLabel})`
                                    : '';

                                return (
                                  <button
                                    key={cueKey}
                                    type="button"
                                    onClick={() => {
                                      if (cueStatus.selected) {
                                        void handleToggleCaseCue(
                                          item.caseId,
                                          cueKey,
                                          'off',
                                          `"${item.caseId}": unselected Cue ${shortTitle} (escape overlay disabled for this video).`,
                                        );
                                      } else {
                                        const nextRule = cueStatus.natural.inV1
                                          ? 'inherit'
                                          : 'on';
                                        void handleToggleCaseCue(
                                          item.caseId,
                                          cueKey,
                                          nextRule,
                                          isButtonAfterNoCut
                                            ? `"${item.caseId}": selected Cue ${shortTitle} (plays right afterwards once No-Cut video finishes).`
                                            : `"${item.caseId}": selected Cue ${shortTitle} (synced @${formatSec(cueStatus.spokenWordSec)}).`,
                                        );
                                      }
                                    }}
                                    title={
                                      cueStatus.selected
                                        ? isButtonAfterNoCut
                                          ? `Selected: Because No Cut - Play to End is enabled, the "button" video part plays right afterwards once "${item.caseId}" finishes. Click to unselect.`
                                          : caseNoCutEffective &&
                                              (cueKey === 'point_you' || cueKey === 'point_me')
                                            ? `No Cut - Play to End is enabled on "${item.caseId}" so mid-video cuts are suppressed.`
                                            : `Selected: Cue ${shortTitle} triggers synced to ${cueStatus.wordLabel} @${formatSec(cueStatus.spokenWordSec)}${!hasEscapeClip ? ' (attach an .mp4 above to activate)' : ''}. Click to unselect for "${item.caseId}".`
                                        : cueStatus.natural.hasAny
                                          ? `Unselected (disabled on "${item.caseId}"). Click to re-enable Cue ${shortTitle}${isButtonAfterNoCut ? ' (plays after No-Cut video)' : ` @${formatSec(cueStatus.spokenWordSec)}`}.`
                                          : `Click to select & trigger Cue ${shortTitle} on "${item.caseId}"${isButtonAfterNoCut ? ' (plays right after No-Cut video finishes)' : ` (@${formatSec(cueStatus.spokenWordSec)})`}.`
                                    }
                                    className={`inline-flex items-center gap-1 font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer whitespace-nowrap ${
                                      cueStatus.selected
                                        ? hasEscapeClip && globalCueOn
                                          ? 'border-[#c084fc]/60 bg-[#26143c] hover:bg-[#331b50] text-[#f3e8ff] font-medium'
                                          : 'border-amber-500/45 bg-amber-950/35 hover:bg-amber-950/50 text-amber-200 font-medium'
                                        : cueStatus.natural.hasAny
                                          ? 'border-white/18 bg-[#141720] hover:bg-[#1d2230] text-[#9aa3b2]'
                                          : 'border-white/12 bg-[#0d1017] hover:bg-[#171d2a] text-[#7c8698]'
                                    }`}
                                  >
                                    {cueStatus.selected ? (
                                      <Check className="w-2.5 h-2.5 text-[#d8b4fe] shrink-0" />
                                    ) : (
                                      <span className="w-2.5 h-2.5 rounded-[2px] border border-white/30 inline-block shrink-0" />
                                    )}
                                    <span>
                                      {cueStatus.selected
                                        ? isButtonAfterNoCut
                                          ? `Cue ${shortTitle} · After Video`
                                          : `Cue ${shortTitle} @${formatSec(cueStatus.spokenWordSec)}${variantSuffix}`
                                        : cueStatus.natural.hasAny
                                          ? `Cue ${shortTitle} OFF`
                                          : `Cue ${shortTitle}`}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                            {!hasAltSlots && activeCaseUrl && (
                              <div className="font-mono-tabular text-[10px] text-[#8e98a8] truncate mt-0.5">
                                {activeCaseUrl.split('?')[0]}
                              </div>
                            )}
                            <div className="mt-1 space-y-0.5 text-[11px] leading-snug">
                              <p className="text-[#d9d4c7]">
                                <span className="font-mono-tabular text-[10px] text-[#f3cf83] mr-1">1st:</span>
                                &ldquo;{item.sampleText}&rdquo;
                              </p>
                              <p className="text-[#aeb7c6]">
                                <button
                                  type="button"
                                  onClick={() =>
                                    onPreviewCase(
                                      item.v2ClipId,
                                      item.v2Text,
                                      `${item.caseId.toUpperCase()} · 2ND`,
                                    )
                                  }
                                  title={`Preview 2nd alternative (${item.v2ClipId})`}
                                  className="font-mono-tabular text-[10px] text-[#93c5fd] hover:underline mr-1 cursor-pointer"
                                >
                                  2nd:
                                </button>
                                &ldquo;{item.v2Text}&rdquo;
                              </p>
                              <p className="text-[#8e98a8]">
                                <button
                                  type="button"
                                  onClick={() =>
                                    onPreviewCase(
                                      item.v3ClipId,
                                      item.v3Text,
                                      `${item.caseId.toUpperCase()} · 3RD`,
                                    )
                                  }
                                  title={`Preview 3rd alternative (${item.v3ClipId})`}
                                  className="font-mono-tabular text-[10px] text-[#c4b5fd] hover:underline mr-1 cursor-pointer"
                                >
                                  3rd:
                                </button>
                                &ldquo;{item.v3Text}&rdquo;
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  const next = caseLipSyncEffective ? 'off' : 'on';
                                  void handleToggleLipSync(
                                    'case',
                                    item.caseId,
                                    next,
                                    isDirectAssigned
                                      ? next === 'on'
                                        ? `"${item.caseId}": Lip-Sync continuation ON — morphs into Default Speaking Lip whenever speech (${formatSec(item.talkSec)}) outlasts the attached video.`
                                        : `"${item.caseId}": Lip-Sync continuation OFF — morphs directly into Idle after the attached video.`
                                      : next === 'on'
                                        ? `"${item.caseId}" set to Default Lip-Sync ON.`
                                        : `"${item.caseId}" set to Idle Only (no lip-sync).`,
                                  );
                                }}
                                title={
                                  isDirectAssigned
                                    ? caseLipSyncEffective
                                      ? `Lip-Sync Tail ON: after this ${activeCaseClipSec ? formatSec(activeCaseClipSec) : ''} video ends, morphs into Default Speaking Lip if "${item.caseId}" (${formatSec(item.talkSec)}) is still talking. Click to switch to Idle After.`
                                      : `Lip-Sync Tail OFF: morphs straight to Idle after this video ends. Click to enable Lip-Sync continuation while talking.`
                                    : caseLipSyncEffective
                                      ? `Click to turn OFF Default Lip-Sync on "${item.caseId}" (stay in Idle Listening)`
                                      : `Click to turn ON Default Lip-Sync on "${item.caseId}"`
                                }
                                className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-md border text-[10px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                                  caseLipSyncEffective
                                    ? 'bg-[#172318] hover:bg-[#1e2f20] border-emerald-500/40 text-emerald-200'
                                    : 'bg-[#151821] hover:bg-[#1d2230] border-white/18 text-[#9aa3b2]'
                                }`}
                              >
                                {isDirectAssigned
                                  ? caseLipSyncEffective
                                    ? '+ Lip-Sync ON'
                                    : 'No Lip Tail'
                                  : caseLipSyncEffective
                                    ? 'Lip-Sync ON'
                                    : 'Idle Only'}
                              </button>
                              {explicitCaseLipRule && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleToggleLipSync(
                                      'case',
                                      item.caseId,
                                      'inherit',
                                      `"${item.caseId}" reset to inherit Group (${grp.id}).`,
                                    )
                                  }
                                  title={`Reset "${item.caseId}" to inherit Group (${grp.id})`}
                                  className="p-1.5 rounded-md border border-white/15 bg-black hover:bg-white/10 text-[#9aa3b2] cursor-pointer"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                </button>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                if (hasAltSlots) {
                                  primeNextCaseSlotPreview(item.caseId, undefined);
                                }
                                previewThis();
                              }}
                              title={
                                hasAltSlots && casePool.length >= 2
                                  ? `Play ${item.caseId} voice (${formatSec(item.talkSec)}) — alternates between #1 and #2`
                                  : `Play ${item.caseId} voice (${formatSec(item.talkSec)}) & video on Chess Angel`
                              }
                              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-black hover:bg-[#151c28] border border-white/16 text-[11px] text-[#cbd5e1] cursor-pointer"
                            >
                              <Play className="w-3 h-3 text-[#7dd3fc]" />
                              Test
                            </button>
                            {!hasAltSlots &&
                              renderUploadButton(
                                'case',
                                item.caseId,
                                Boolean(customCaseUrl1),
                                previewThis,
                              )}
                          </div>
                        </div>

                        {hasAltSlots && (() => {
                          const slotKindNoun =
                            item.caseId === 'warn_fork_2step' || item.caseId === 'warn_double'
                              ? 'fork warning'
                              : item.caseId === 'undo_done'
                                ? 'undo movie'
                                : item.caseId === 'ask_promotion'
                                  ? '8th-row pawn arrival'
                                  : item.caseId === 'capture_minor'
                                    ? 'minor capture'
                                    : item.caseId;
                          return (
                          <div className="mt-2.5 rounded-lg border border-white/12 bg-[#07090e] divide-y divide-white/10 overflow-hidden">
                            {(
                              [
                                {
                                  slotKey: slot1Key,
                                  quotaSlotId: `case:${item.caseId}_primary`,
                                  slotLabel: `${item.caseId} #1`,
                                  slotUrl: customCaseUrl1,
                                  emptyHint: `Empty — attach or drop primary ${slotKindNoun} .mp4`,
                                  subCaption: `Primary ${slotKindNoun} video (#1)`,
                                },
                                {
                                  slotKey: slot2Key,
                                  quotaSlotId: `case:${slot2Key}`,
                                  slotLabel: `${item.caseId} #2`,
                                  slotUrl: customCaseUrl2,
                                  emptyHint: `Empty — attach or drop 2nd alternative ${slotKindNoun} .mp4`,
                                  subCaption: `2nd alternative ${slotKindNoun} video (#2 · alternates automatically with #1)`,
                                },
                              ] as const
                            ).map((slot) => {
                              const slotClipSec = getVideoFileDurationSec(slot.slotUrl, overrides);
                              return (
                                <div
                                  key={slot.slotKey}
                                  {...makeDropHandlers('case', slot.slotKey, (uploadedUrl) =>
                                    previewCaseSlot(uploadedUrl),
                                  )}
                                  className={`px-3 py-2 transition-colors ${
                                    dragOverSlot === `case:${slot.slotKey}`
                                      ? 'bg-[#162334]'
                                      : 'bg-[#07090e] hover:bg-[#0d111a]'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="font-mono-tabular text-[11px] font-semibold text-[#f3cf83]">
                                          {slot.slotLabel}
                                        </span>
                                        <span
                                          className={`text-[10px] px-1.5 py-0.5 rounded border truncate ${
                                            slot.slotUrl
                                              ? 'border-emerald-500/45 bg-emerald-950/40 text-emerald-300 font-medium'
                                              : 'border-white/12 text-[#9aa3b2]'
                                          }`}
                                        >
                                          {slot.slotUrl ? '✓ Active (.mp4)' : slot.emptyHint}
                                        </span>
                                        {slotClipSec !== null && (
                                          <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-sky-500/35 bg-sky-950/35 text-sky-200 whitespace-nowrap">
                                            Video: {formatSec(slotClipSec)}
                                          </span>
                                        )}
                                        {renderVideoSizeBadge(slot.slotUrl, slot.slotLabel)}
                                        {renderMaxPlaysControl(
                                          slot.quotaSlotId,
                                          slot.slotLabel,
                                        )}
                                        {renderPlayToEndFlagButton(
                                          `case:${slot.slotKey}`,
                                          slot.slotLabel,
                                        )}
                                      </div>
                                      <div className="text-[10px] text-[#8e98a8] truncate mt-0.5">
                                        {slot.slotUrl
                                          ? slot.slotUrl.split('?')[0]
                                          : slot.subCaption}
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => previewCaseSlot(slot.slotUrl)}
                                        title={`Preview ${slot.slotLabel} on Chess Angel`}
                                        className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-black hover:bg-[#151c28] border border-white/16 text-[11px] text-[#cbd5e1] cursor-pointer"
                                      >
                                        <Play className="w-3 h-3 text-[#7dd3fc]" />
                                        Test
                                      </button>
                                      {renderUploadButton(
                                        'case',
                                        slot.slotKey,
                                        Boolean(slot.slotUrl),
                                        (uploadedUrl) => previewCaseSlot(uploadedUrl),
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
