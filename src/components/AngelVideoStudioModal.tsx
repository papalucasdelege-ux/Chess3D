import { useEffect, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Film,
  Hand,
  Loader2,
  Lock,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  Sparkles,
  Trash2,
  Unlock,
  Upload,
  X,
} from 'lucide-react';
import {
  ANGEL_CASE_VIDEO_MAP,
  ANGEL_DEFAULT_SPEAKING_VIDEO_SRC,
  ANGEL_GROUP_VIDEO_MAP,
  ANGEL_IDLE_LISTENING_VIDEO_SRC,
  ANGEL_VIDEO_STUDIO_GROUPS,
  caseHasAlternativeSlotUI,
  getAngelIdleVideoPool,
  getAngelVideoOverridesSnapshot,
  getCaseEscapeCueStatus,
  getCaseSlotKeys,
  getCaseVideoPool,
  getEscapeVideoApexSec,
  getEscapeVideoPool,
  getSeductionCaseEntries,
  getSeductionSlotKey,
  getVideoFileDurationSec,
  getVideoSlotMaxPlays,
  isCaseUsingDefaultLipSync,
  isEffectiveCasePlayToEnd,
  isEscapeCueEnabled,
  isGroupUsingDefaultLipSync,
  isVideoSlotPlayToEnd,
  parseIdleSlotNumber,
  parseSeductionSlotNumber,
  primeNextCaseSlotPreview,
  primeNextEscapeSlotPreview,
  refreshAngelVideoOverrides,
  resetAngelPortraitVideo,
  subscribeAngelVideoOverrides,
  updateAngelCaseEscapeCue,
  updateAngelEscapeEnabled,
  updateAngelLipSyncRule,
  updateAngelSeductionTriggerMode,
  updateAngelVideoMaxPlays,
  updateAngelVideoPlayToEnd,
  uploadAngelPortraitVideo,
  type AngelEscapeCueKey,
  type AngelEscapeSlotKey,
  type AngelExpressionGroup,
  type AngelVideoMapPayload,
} from '../chess/angelPortraitVideos';
import {
  CLIP_TEXT,
  type CommentaryCaseId,
  type SeductionTriggerMode,
  type VoiceClipId,
} from '../chess/opponentVoice';

interface AngelVideoStudioModalProps {
  onClose: () => void;
  onPreviewCase: (clipId: VoiceClipId, text: string, tag: string) => void;
  onPreviewIdle: (specificIdleUrl?: string) => void;
}

function formatSec(sec: number): string {
  return `${sec.toFixed(1)}s`;
}

export function AngelVideoStudioModal({
  onClose,
  onPreviewCase,
  onPreviewIdle,
}: AngelVideoStudioModalProps) {
  const [overrides, setOverrides] = useState<AngelVideoMapPayload>(() =>
    getAngelVideoOverridesSnapshot(),
  );
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    welcome: true,
    explaining: true,
    helpful: true,
    warning: true,
  });
  const [visibleIdleCount, setVisibleIdleCount] = useState<number>(2);
  const [visibleSeductionCount, setVisibleSeductionCount] = useState<number>(3);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  useEffect(() => {
    void refreshAngelVideoOverrides();
    return subscribeAngelVideoOverrides(() => {
      setOverrides({ ...getAngelVideoOverridesSnapshot() });
    });
  }, []);

  const handleUpload = async (
    kind: 'idle' | 'default' | 'group' | 'case' | 'escape',
    key: string,
    file: File | null | undefined,
    autoPreview?: (uploadedUrl: string) => void,
  ) => {
    if (!file) return;
    const slotId = `${kind}:${key}`;
    setBusySlot(slotId);
    setStatusNote(null);
    try {
      const { url: uploadedUrl, extractedAudio } = await uploadAngelPortraitVideo(kind, key, file);
      setStatusNote(
        extractedAudio
          ? `ACTIVE IMMEDIATELY: "${file.name}" is now live for "${key}" (embedded video sound preserved automatically).`
          : `ACTIVE IMMEDIATELY: "${file.name}" is now live for "${key}" (video sound & trailing black frames stripped).`,
      );
      if (autoPreview) {
        autoPreview(uploadedUrl);
      }
    } catch {
      setStatusNote(`Could not upload "${file.name}". Please check that it is an MP4/WebM video.`);
    } finally {
      setBusySlot(null);
    }
  };

  const handleReset = async (
    kind: 'idle' | 'default' | 'group' | 'case' | 'escape',
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
    kind: 'idle' | 'default' | 'group' | 'case' | 'escape',
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
    kind: 'idle' | 'default' | 'group' | 'case' | 'escape',
    key: string,
    hasCustom: boolean,
    autoPreview?: (uploadedUrl: string) => void,
  ) => {
    const slotId = `${kind}:${key}`;
    const isBusy = busySlot === slotId;
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        <label
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            hasCustom
              ? 'bg-[#13261d] hover:bg-[#193327] border-emerald-500/50 text-emerald-200'
              : 'bg-[#171c26] hover:bg-[#202736] border-[#d6ae63]/55 text-[#f3cf83]'
          }`}
        >
          {isBusy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : hasCustom ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Upload className="w-3.5 h-3.5" />
          )}
          <span>{isBusy ? 'Muting & Saving…' : hasCustom ? 'Active · Replace' : 'Attach .mp4'}</span>
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

        {hasCustom && !isBusy && (
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
          ? `"${labelName}": No Cut ON — video cannot be cut in length and will always play until its very end.`
          : `"${labelName}": No Cut OFF — normal pre-end optical morph transitions restored.`,
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
            ? `LOCKED — No Cut - Play to End: "${labelName}" cannot be cut in length and must play until its very end. Click to allow cuts.`
            : `Click to enable "No Cut - Play to End" on "${labelName}" so it cannot be cut short and must play until its very end.`
        }
        className={`inline-flex items-center gap-1 font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer whitespace-nowrap ${
          locked
            ? 'border-[#f59e0b]/80 bg-[#2b1d07] hover:bg-[#382609] text-[#fde68a] font-semibold shadow-sm'
            : 'border-white/16 bg-[#12161f] hover:bg-[#1b2230] text-[#9aa3b2] hover:text-[#e2e8f0]'
        }`}
      >
        {locked ? (
          <Lock className="w-2.5 h-2.5 text-[#fbbf24] shrink-0" />
        ) : (
          <Unlock className="w-2.5 h-2.5 opacity-75 shrink-0" />
        )}
        <span>No Cut - Play to End</span>
        {locked && <Check className="w-2.5 h-2.5 text-[#fbbf24] shrink-0" />}
      </button>
    );
  };

  const escapeSpecs: Array<{
    key: AngelEscapeCueKey;
    shortWord: string;
    title: string;
    triggerBadge: string;
    description: string;
    previewClipId: VoiceClipId;
    previewTag: string;
    slots: ReadonlyArray<{ slotKey: AngelEscapeSlotKey; slotLabel: string }>;
  }> = [
    {
      key: 'point_you',
      shortWord: '"you"',
      title: 'Word "you" — Point Finger Right at Player',
      triggerBadge: 'Trigger: "you"',
      description:
        'Whenever "you" appears in any spoken text, pauses the active video, morphs into her pointing at the player (alternating #1 & #2 when both are attached), then resumes the active video to the end.',
      previewClipId: 'check_knight_v1',
      previewTag: 'ESCAPE: "YOU"',
      slots: [
        { slotKey: 'point_you', slotLabel: '"you" #1' },
        { slotKey: 'point_you_2', slotLabel: '"you" #2 (Alt)' },
      ],
    },
    {
      key: 'push_button',
      shortWord: '"button"',
      title: '"push a button" Below — Point Down at Modal Button',
      triggerBadge:
        'Trigger: "push a button" · "clicking on a button" · "touch show hint" · "touch hint"',
      description:
        'Whenever she mentions pushing/clicking a button below ("push a button", "clicking on a button", "clicking on the button", "touch show hint", "touch hint", "touch Undo", "Click to confirm"), plays this short overlay video (alternating #1 & #2 when both are attached) and continues the active video to the end.',
      previewClipId: 'hesitate_hint_v3',
      previewTag: 'ESCAPE: TOUCH SHOW HINT',
      slots: [
        { slotKey: 'push_button', slotLabel: '"button" #1' },
        { slotKey: 'push_button_2', slotLabel: '"button" #2 (Alt)' },
      ],
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
                Chess Angel Video Studio
              </h2>
              <span
                title="This Studio editor is only visible in the Dev environment; all attached .mp4 files, Play-per-Game quotas, and No-Cut flags are bundled into the deployed app."
                className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/45 bg-emerald-950/40 text-emerald-300 font-medium whitespace-nowrap"
              >
                Dev-Only UI · Bundled on Deploy
              </span>
            </div>
            <p className="text-[11px] text-[#9aa3b2] truncate">
              Set <span className="text-cyan-200">× / game</span> play limits &amp;{' '}
              <span className="text-[#fde68a]">No Cut · Play to End</span> flags per video
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          title="Close Video Studio"
          className="p-1.5 rounded-md text-[#9aa3b2] hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {statusNote && (
        <div className="px-4 py-2 bg-[#101c16] border-b border-emerald-500/30 text-xs text-emerald-200">
          {statusNote}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto thin-scroll p-4 space-y-3">
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
                Calm 28s–40s stillness &amp; wrist-watch cooldowns so secondary gestures never repeat back-to-back
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

        {/* Special Word-Triggered Escape Overlay Videos ("you" & "push a button") */}
        <div className="rounded-xl border border-[#c084fc]/45 bg-black overflow-hidden">
          <div className="px-3.5 py-2.5 bg-[#120d1d] border-b border-white/10">
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-[#d8b4fe] shrink-0" />
              <span className="text-xs font-semibold text-[#f7f1e5]">
                Special Word-Triggered Escape Overlay Videos
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#c084fc]/45 bg-[#241338] text-[#e9d5ff] font-medium whitespace-nowrap">
                3rd-Layer Overlay · Resumes Base Video to End
              </span>
            </div>
            <p className="text-[11px] text-[#a9b1c2] mt-0.5 leading-snug">
              Attach 1 or 2 alternative short overlay clips for{' '}
              <span className="text-[#f3cf83] font-medium">&ldquo;you&rdquo;</span> and for{' '}
              <span className="text-[#f3cf83] font-medium">&ldquo;button&rdquo;</span> — gesture
              apexes are synchronized to the exact spoken word in the voice recording, and you can
              select or unselect{' '}
              <span className="text-[#e9d5ff] font-medium">Cue &ldquo;you&rdquo;</span> /{' '}
              <span className="text-[#e9d5ff] font-medium">Cue &ldquo;button&rdquo;</span> on each
              individual video below.
            </p>
          </div>

          <div className="divide-y divide-white/15">
            {escapeSpecs.map((esc) => {
              const isEnabled = isEscapeCueEnabled(esc.key, overrides);
              const activePool = getEscapeVideoPool(esc.key, overrides);
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
                  {/* Escape Cue Header ("you" or "button") */}
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
                              ? '2 Alternating'
                              : '2 Attached (OFF)'
                            : activePool.length === 1
                              ? isEnabled
                                ? '1 Active'
                                : '1 Attached (OFF)'
                              : '0 Attached'}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] leading-snug text-[#9aa3b2]">
                        {esc.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
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

                  {/* Two Alternative Video Slots (#1 and #2) */}
                  <div className="divide-y divide-white/10">
                    {esc.slots.map((slot, idx) => {
                      const customUrl = overrides.escapes?.[slot.slotKey];
                      const clipSec = getVideoFileDurationSec(customUrl, overrides);
                      const apexSec = customUrl
                        ? getEscapeVideoApexSec(customUrl, esc.key, overrides)
                        : null;

                      return (
                        <div
                          key={slot.slotKey}
                          {...makeDropHandlers('escape', slot.slotKey, (uploadedUrl) =>
                            previewEscapeSlot(uploadedUrl),
                          )}
                          className={`px-3.5 py-2.5 transition-colors ${
                            dragOverSlot === `escape:${slot.slotKey}`
                              ? 'bg-[#201533]'
                              : 'bg-black hover:bg-[#0c0a12]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-mono-tabular text-xs font-semibold text-[#f3cf83]">
                                  {slot.slotLabel}
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
                                      ? 'Empty — attach or drop primary .mp4'
                                      : 'Empty — attach or drop 2nd alternative .mp4'}
                                </span>
                                {clipSec !== null && (
                                  <span className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-sky-500/35 bg-sky-950/35 text-sky-200 whitespace-nowrap">
                                    Video: {formatSec(clipSec)}
                                  </span>
                                )}
                                {apexSec !== null && (
                                  <span
                                    title="Calibrated pointing gesture apex inside this video — aligned automatically with the spoken word in the voice recording"
                                    className="font-mono-tabular text-[10px] px-1.5 py-0.5 rounded border border-[#c084fc]/45 bg-[#231436] text-[#e9d5ff] whitespace-nowrap"
                                  >
                                    Point Apex: {formatSec(apexSec)}
                                  </span>
                                )}
                                {renderMaxPlaysControl(`escape:${slot.slotKey}`, slot.slotLabel)}
                                {renderPlayToEndFlagButton(
                                  `escape:${slot.slotKey}`,
                                  slot.slotLabel,
                                )}
                              </div>
                              <div className="text-[11px] text-[#8e98a8] truncate mt-0.5">
                                {customUrl
                                  ? customUrl.split('?')[0]
                                  : `Alternative #${idx + 1} overlay video for ${esc.shortWord}`}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => previewEscapeSlot(customUrl)}
                                title={`Preview ${slot.slotLabel} escape overlay & base-video resume on Chess Angel`}
                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-black hover:bg-[#151c28] border border-white/16 text-[11px] text-[#cbd5e1] cursor-pointer"
                              >
                                <Play className="w-3 h-3 text-[#7dd3fc]" />
                                Test
                              </button>

                              {renderUploadButton(
                                'escape',
                                slot.slotKey,
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

        {/* Groups 1–8 & Individual Sayings */}
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
                    const builtInCaseUrl =
                      !customCaseUrl && !explicitCaseLipRule
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

                              {renderMaxPlaysControl(`case:${item.caseId}`, item.caseId)}
                              {renderPlayToEndFlagButton(`case:${item.caseId}`, item.caseId)}

                              {(['point_you', 'push_button'] as const).map((cueKey) => {
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
                                  cueKey === 'point_you' ? '"you"' : '"button"';
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
                                          : caseNoCutEffective && cueKey === 'point_you'
                                            ? `No Cut - Play to End is enabled on "${item.caseId}" so mid-video cuts are suppressed.`
                                            : `Selected: Cue ${shortTitle} triggers synced to ${cueStatus.wordLabel} @${formatSec(cueStatus.spokenWordSec)}. Click to unselect for "${item.caseId}".`
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
                            <p className="mt-1 text-[11px] leading-snug text-[#d9d4c7]">
                              &ldquo;{item.sampleText}&rdquo;
                            </p>
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

                        {hasAltSlots && (
                          <div className="mt-2.5 rounded-lg border border-white/12 bg-[#07090e] divide-y divide-white/10 overflow-hidden">
                            {(
                              [
                                {
                                  slotKey: slot1Key,
                                  slotLabel: `${item.caseId} #1`,
                                  slotUrl: customCaseUrl1,
                                  emptyHint: 'Empty — attach or drop primary fork warning .mp4',
                                  subCaption: 'Primary fork warning video (#1)',
                                },
                                {
                                  slotKey: slot2Key,
                                  slotLabel: `${item.caseId} #2`,
                                  slotUrl: customCaseUrl2,
                                  emptyHint:
                                    'Empty — attach or drop 2nd alternative fork warning .mp4',
                                  subCaption:
                                    '2nd alternative fork warning video (#2 · alternates automatically with #1)',
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
                                        {renderMaxPlaysControl(
                                          `case:${slot.slotKey}`,
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
                        )}
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
