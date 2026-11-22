import {
  CLIP_TEXT,
  registerCaseMaxPlaysProvider,
  setNextSeductionPlaybackAudio,
  setSeductionAudioUrlOverride,
  type CommentaryCaseId,
  type SeductionTriggerMode,
  type VoiceClipId,
} from './opponentVoice';

/**
 * True ONLY inside the AI Studio / local Vite development environment (`import.meta.env.DEV`)
 * and NOT on the shared preview (`ais-pre-*`) or deployed production build (`npm run build`).
 * Ensures the Chess Angel Video Studio UI is developer-only while all saved videos & rules
 * in `/public/assets/aistudio/angel_video_map.json` run automatically in the deployed app.
 */
export const IS_VIDEO_STUDIO_DEV_ENV =
  Boolean(import.meta.env.DEV) &&
  (typeof window === 'undefined' || !window.location.hostname.startsWith('ais-pre-'));

/**
 * Built-in frameless 3:4 portrait video played (silently, once, holding last frame)
 * whenever Chess Angel is idle / listening between spoken lines.
 */
export const ANGEL_IDLE_LISTENING_VIDEO_SRC =
  '/assets/aistudio/just_shaking_head_no_words_591ed115.mp4';

/**
 * Built-in default frameless 3:4 portrait speaking video (lip movements, silent video track).
 */
export const ANGEL_DEFAULT_SPEAKING_VIDEO_SRC =
  '/assets/aistudio/just_lip_movements_e2adb314.mp4';

export type AngelExpressionGroup =
  | 'welcome'
  | 'explaining'
  | 'distracted'
  | 'helpful'
  | 'warning'
  | 'attack'
  | 'impressed'
  | 'ending';

export type LipSyncRule = 'on' | 'off';

export type AngelEscapeCueKey = 'point_you' | 'push_button';

export type CaseEscapeCueRule = 'on' | 'off';

export type AngelEscapeSlotKey =
  | 'point_you'
  | 'point_you_2'
  | 'push_button'
  | 'push_button_2';

export const ESCAPE_CUE_SLOT_KEYS: Record<
  AngelEscapeCueKey,
  readonly [AngelEscapeSlotKey, AngelEscapeSlotKey]
> = {
  point_you: ['point_you', 'point_you_2'],
  push_button: ['push_button', 'push_button_2'],
};

export interface DetectedTextEscapeCue {
  key: AngelEscapeCueKey;
  matchedPhrase: string;
  focalWord: string;
  charIndex: number;
  progressRatio: number;
  spokenWordSec: number;
  estimatedTriggerSec: number;
  forcedByOverride?: boolean;
}

export interface ResolvedActiveEscapeCue extends DetectedTextEscapeCue {
  videoUrl: string;
  videoApexSec: number;
  videoStartSeekSec: number;
}

export interface AngelLipSyncConfig {
  defaultEnabled: boolean;
  groups: Partial<Record<AngelExpressionGroup, LipSyncRule>>;
  cases: Partial<Record<CommentaryCaseId, LipSyncRule>>;
}

export type AngelCaseEscapeCuesMap = Partial<
  Record<CommentaryCaseId, Partial<Record<AngelEscapeCueKey, CaseEscapeCueRule>>>
>;

export type CaseAlternativeSlotKey = `${CommentaryCaseId}_${number}`;
export type AnyCaseSlotKey = CommentaryCaseId | CaseAlternativeSlotKey;

/**
 * Sayings that expose a Primary (#1) + 2nd Alternative (#2) .mp4 slot in Video Studio,
 * alternating automatically each time the warning triggers during gameplay.
 */
export const MULTI_SLOT_CASE_IDS: ReadonlySet<CommentaryCaseId> = new Set<CommentaryCaseId>([
  'warn_fork_2step',
  'warn_double',
]);

export const DEFAULT_VIDEO_MAX_PLAYS: Readonly<Record<string, number>> = {
  'case:tree_browse': 2,
  'case:seduction': 1,
};

export const DEFAULT_VIDEO_PLAY_TO_END: Readonly<Record<string, boolean>> = {
  'case:seduction': true,
};

export function parseSeductionSlotNumber(key: string): number {
  if (key === 'seduction') return 1;
  const m = /^seduction_(\d+)$/i.exec(key);
  if (m) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n >= 2) return n;
  }
  return 0;
}

export function getSeductionSlotKey(slotNum: number): AnyCaseSlotKey {
  return slotNum <= 1 ? 'seduction' : (`seduction_${slotNum}` as AnyCaseSlotKey);
}

export interface AngelVideoMapPayload {
  idle?: string;
  idleVariants: Record<string, string>;
  defaultSpeaking?: string;
  groups: Partial<Record<AngelExpressionGroup, string>>;
  cases: Partial<Record<AnyCaseSlotKey, string>>;
  escapes: Partial<Record<AngelEscapeSlotKey, string>>;
  escapeEnabled?: Partial<Record<AngelEscapeCueKey, boolean>>;
  caseEscapeCues?: AngelCaseEscapeCuesMap;
  videoMaxPlays?: Record<string, number>;
  videoPlayToEnd?: Record<string, boolean>;
  lipSync?: AngelLipSyncConfig;
  videoDurations?: Record<string, number>;
  escapeApexes?: Record<string, number>;
  seductionAudioUrl?: string;
  seductionAudioDuration?: number;
  seductionAudioVariants?: Record<string, string>;
  seductionAudioDurations?: Record<string, number>;
  seductionTriggerMode?: SeductionTriggerMode;
}

/**
 * Exact measured duration in seconds (ffprobe) for every bundled Chess Angel MP3 voice clip (v1, v2, v3).
 */
export const VOICE_CLIP_DURATION_SEC: Record<VoiceClipId, number> = {
  alt_shown_v1: 6.0,
  alt_shown_v2: 4.4,
  alt_shown_v3: 4.2,
  calc_offer_v1: 8.7,
  calc_offer_v2: 6.5,
  calc_offer_v3: 4.8,
  calc_pure_v1: 5.9,
  calc_pure_v2: 5.3,
  calc_pure_v3: 4.4,
  calc_showing_v1: 6.1,
  calc_showing_v2: 4.7,
  calc_showing_v3: 4.7,
  capture_minor_v1: 3.0,
  capture_minor_v2: 3.3,
  capture_minor_v3: 1.9,
  capture_queen_v1: 4.3,
  capture_queen_v2: 3.7,
  capture_queen_v3: 3.9,
  capture_rook_v1: 5.0,
  capture_rook_v2: 4.1,
  capture_rook_v3: 3.2,
  castled_v1: 5.0,
  castled_v2: 2.7,
  castled_v3: 3.8,
  check_general_v1: 3.2,
  check_general_v2: 4.8,
  check_general_v3: 3.0,
  check_knight_v1: 4.4,
  check_knight_v2: 3.9,
  check_knight_v3: 3.8,
  check_queen_v1: 3.9,
  check_queen_v2: 4.6,
  check_queen_v3: 4.4,
  checkmate_lose_v1: 4.8,
  checkmate_lose_v2: 5.5,
  checkmate_lose_v3: 4.7,
  checkmate_win_v1: 5.0,
  checkmate_win_v2: 4.5,
  checkmate_win_v3: 4.0,
  draw_v1: 4.7,
  draw_v2: 4.1,
  draw_v3: 3.9,
  hesitate_hint_v1: 8.1,
  hesitate_hint_v2: 5.8,
  hesitate_hint_v3: 5.4,
  hint_shown_v1: 4.9,
  hint_shown_v2: 4.5,
  hint_shown_v3: 4.4,
  intro_v1: 8.3,
  intro_v2: 5.7,
  intro_v3: 3.6,
  lost_queen_v1: 6.9,
  lost_queen_v2: 5.9,
  lost_queen_v3: 3.3,
  opening_v1: 6.7,
  opening_v2: 4.1,
  opening_v3: 4.5,
  player_check_v1: 3.9,
  player_check_v2: 3.9,
  player_check_v3: 4.8,
  promotion_v1: 5.4,
  promotion_v2: 3.3,
  promotion_v3: 3.9,
  seduction_v1: 4.5,
  seduction_v2: 4.5,
  seduction_v3: 4.5,
  stalemate_v1: 5.3,
  stalemate_v2: 4.9,
  stalemate_v3: 3.9,
  tree_browse_v1: 11.7,
  tree_browse_v2: 11.4,
  tree_browse_v3: 8.6,
  trial_confirm_1_v1: 7.2,
  trial_confirm_1_v2: 6.3,
  trial_confirm_1_v3: 4.6,
  trial_confirm_2_v1: 7.0,
  trial_confirm_2_v2: 5.8,
  trial_confirm_2_v3: 4.7,
  undo_done_v1: 7.7,
  undo_done_v2: 4.0,
  undo_done_v3: 3.7,
  warn_double_v1: 4.5,
  warn_double_v2: 4.2,
  warn_double_v3: 4.1,
  warn_fork_2step_v1: 5.5,
  warn_fork_2step_v2: 3.7,
  warn_fork_2step_v3: 2.9,
  warn_king_file_v1: 5.0,
  warn_king_file_v2: 3.5,
  warn_king_file_v3: 3.8,
  warn_mate_v1: 5.3,
  warn_mate_v2: 4.8,
  warn_mate_v3: 3.7,
  warn_pawn_promo_v1: 5.7,
  warn_pawn_promo_v2: 4.9,
  warn_pawn_promo_v3: 3.9,
  watch_bishop_v1: 3.9,
  watch_bishop_v2: 3.7,
  watch_bishop_v3: 3.5,
  watch_knight_v1: 3.9,
  watch_knight_v2: 4.2,
  watch_knight_v3: 3.3,
  watch_queen_v1: 4.1,
  watch_queen_v2: 4.0,
  watch_queen_v3: 3.9,
  watch_rook_v1: 4.1,
  watch_rook_v2: 3.7,
  watch_rook_v3: 3.2,
  wrong_better_alt_v1: 8.2,
  wrong_better_alt_v2: 6.0,
  wrong_better_alt_v3: 4.8,
  wrong_distracted_v1: 8.4,
  wrong_distracted_v2: 7.8,
  wrong_distracted_v3: 7.6,
  wrong_hang_minor_v1: 8.0,
  wrong_hang_minor_v2: 5.4,
  wrong_hang_minor_v3: 5.5,
  wrong_hang_queen_v1: 8.2,
  wrong_hang_queen_v2: 5.5,
  wrong_hang_queen_v3: 6.3,
  wrong_hang_rook_v1: 8.4,
  wrong_hang_rook_v2: 6.0,
  wrong_hang_rook_v3: 5.2,
  wrong_missed_tactic_v1: 8.8,
  wrong_missed_tactic_v2: 5.5,
  wrong_missed_tactic_v3: 5.1,
  wrong_positional_v1: 8.5,
  wrong_positional_v2: 5.5,
  wrong_positional_v3: 5.1,
  wrong_walk_mate_v1: 7.6,
  wrong_walk_mate_v2: 5.9,
  wrong_walk_mate_v3: 6.1,
};

/**
 * Exact acoustic timestamps (in seconds) measured directly from `/public/voices/female/*.mp3`
 * (using silence-interval segmentation + syllable alignment) for every spoken `"you"` and
 * `"button"` / `"Show Hint"` / `"Undo"` / `"confirm"` focal word across all bundled voice clips.
 */
export const ACOUSTIC_CLIP_CUE_WORDS: Partial<
  Record<VoiceClipId, Partial<Record<AngelEscapeCueKey, number>>>
> = {
  intro_v1: { point_you: 4.93 },
  intro_v2: { point_you: 3.9 },
  intro_v3: { point_you: 2.59 },
  checkmate_lose_v1: { point_you: 1.63 },
  checkmate_lose_v2: { point_you: 2.34 },
  checkmate_lose_v3: { point_you: 1.95 },
  check_knight_v1: { point_you: 2.29 },
  check_knight_v2: { point_you: 0.87 },
  player_check_v2: { point_you: 2.13 },
  calc_offer_v1: { point_you: 6.08 },
  calc_offer_v3: { point_you: 3.31 },
  wrong_hang_queen_v1: { point_you: 1.23 },
  wrong_hang_queen_v3: { point_you: 4.72 },
  wrong_hang_rook_v1: { point_you: 6.14 },
  wrong_hang_rook_v3: { push_button: 3.19, point_you: 3.78 },
  wrong_hang_minor_v1: { point_you: 1.57 },
  wrong_hang_minor_v2: { point_you: 0.66 },
  wrong_hang_minor_v3: { point_you: 4.78 },
  wrong_walk_mate_v1: { point_you: 1.08 },
  wrong_walk_mate_v3: { point_you: 5.36 },
  wrong_missed_tactic_v1: { point_you: 3.81 },
  wrong_missed_tactic_v2: { point_you: 2.8 },
  wrong_missed_tactic_v3: { point_you: 0.22 },
  wrong_positional_v1: { point_you: 4.17 },
  wrong_positional_v3: { point_you: 3.76 },
  wrong_better_alt_v1: { point_you: 3.99 },
  wrong_better_alt_v3: { push_button: 2.93, point_you: 3.48 },
  undo_done_v1: { point_you: 6.27 },
  alt_shown_v1: { point_you: 5.51 },
  hesitate_hint_v1: { point_you: 1.97, push_button: 5.86 },
  hesitate_hint_v2: { push_button: 3.19, point_you: 4.22 },
  hesitate_hint_v3: { push_button: 2.0, point_you: 2.66 },
  hint_shown_v3: { point_you: 3.84 },
  watch_rook_v3: { point_you: 2.26 },
  capture_minor_v2: { point_you: 2.72 },
  lost_queen_v1: { point_you: 0.44 },
  lost_queen_v3: { point_you: 0.22 },
  trial_confirm_1_v1: { point_you: 0.42, push_button: 3.14 },
  trial_confirm_1_v2: { push_button: 1.49, point_you: 2.07 },
  trial_confirm_1_v3: { push_button: 1.92, point_you: 2.51 },
  trial_confirm_2_v1: { point_you: 0.42, push_button: 3.57 },
  trial_confirm_2_v2: { push_button: 1.11, point_you: 1.66 },
  trial_confirm_2_v3: { push_button: 2.53 },
  wrong_distracted_v1: { point_you: 0.41, push_button: 7.38 },
  wrong_distracted_v2: { point_you: 0.61, push_button: 6.78 },
  wrong_distracted_v3: { point_you: 1.51, push_button: 4.62 },
  tree_browse_v1: { point_you: 2.62, push_button: 11.02 },
  tree_browse_v2: { push_button: 8.58 },
  tree_browse_v3: { push_button: 5.57 },
};

/**
 * Built-in static group-level video overrides (Groups 1–8).
 */
export const ANGEL_GROUP_VIDEO_MAP: Partial<Record<AngelExpressionGroup, string>> = {};

/**
 * Built-in static per-saying video overrides (exact CommentaryCaseId).
 */
export const ANGEL_CASE_VIDEO_MAP: Partial<Record<CommentaryCaseId, string>> = {
  intro: '/assets/aistudio/waving_hello_abc4f35b.mp4',
};

const CASE_TO_GROUP: Record<CommentaryCaseId, AngelExpressionGroup> = {
  // 1. Warm Welcome, Opening & Calm Play
  intro: 'welcome',
  opening: 'welcome',
  castled: 'welcome',

  // 2. Search-Tree Explanation & Calm Simulation Browsing
  tree_browse: 'explaining',
  calc_offer: 'explaining',
  calc_showing: 'explaining',
  trial_confirm_1: 'explaining',
  trial_confirm_2: 'explaining',
  calc_pure: 'explaining',

  // 3. Distraction / Gentle Scolding & Offering Undo
  wrong_distracted: 'distracted',
  wrong_walk_mate: 'distracted',
  wrong_hang_queen: 'distracted',
  wrong_hang_rook: 'distracted',
  wrong_hang_minor: 'distracted',
  wrong_missed_tactic: 'distracted',
  wrong_positional: 'distracted',
  wrong_better_alt: 'distracted',

  // 4. Encouraging Hints & Rewind Guidance
  hesitate_hint: 'helpful',
  hint_shown: 'helpful',
  undo_done: 'helpful',
  alt_shown: 'helpful',

  // 5. Tactical Warnings & Direct Threats
  warn_mate: 'warning',
  warn_double: 'warning',
  warn_fork_2step: 'warning',
  warn_pawn_promo: 'warning',
  warn_king_file: 'warning',
  watch_queen: 'warning',
  watch_rook: 'warning',
  watch_bishop: 'warning',
  watch_knight: 'warning',

  // 6. Confident Attack, Captures & Checks
  check_queen: 'attack',
  check_knight: 'attack',
  check_general: 'attack',
  capture_queen: 'attack',
  capture_rook: 'attack',
  capture_minor: 'attack',
  promotion: 'attack',

  // 7. Impressed / Surprised by Player's Move
  seduction: 'impressed',
  player_check: 'impressed',
  lost_queen: 'impressed',
  checkmate_lose: 'impressed',

  // 8. Game Over — Victory or Peaceful Draw
  checkmate_win: 'ending',
  stalemate: 'ending',
  draw: 'ending',
};

export interface AngelStudioCaseSpec {
  caseId: CommentaryCaseId;
  sampleClipId: VoiceClipId;
  sampleText: string;
  talkSec: number;
  v2Sec: number;
  v3Sec: number;
}

export interface AngelStudioGroupSpec {
  id: AngelExpressionGroup;
  number: number;
  title: string;
  minTalkSec: number;
  maxTalkSec: number;
  cases: AngelStudioCaseSpec[];
}

function makeCaseItem(caseId: CommentaryCaseId): AngelStudioCaseSpec {
  const v1Id = `${caseId}_v1` as VoiceClipId;
  const v2Id = `${caseId}_v2` as VoiceClipId;
  const v3Id = `${caseId}_v3` as VoiceClipId;
  return {
    caseId,
    sampleClipId: v1Id,
    sampleText: CLIP_TEXT[v1Id] || caseId,
    talkSec: VOICE_CLIP_DURATION_SEC[v1Id] ?? 5.0,
    v2Sec: VOICE_CLIP_DURATION_SEC[v2Id] ?? 4.0,
    v3Sec: VOICE_CLIP_DURATION_SEC[v3Id] ?? 3.5,
  };
}

function makeGroupSpec(
  id: AngelExpressionGroup,
  number: number,
  title: string,
  caseIds: CommentaryCaseId[],
): AngelStudioGroupSpec {
  const cases = caseIds.map(makeCaseItem);
  const v1Secs = cases.map((c) => c.talkSec);
  return {
    id,
    number,
    title,
    minTalkSec: Math.min(...v1Secs),
    maxTalkSec: Math.max(...v1Secs),
    cases,
  };
}

export const ANGEL_VIDEO_STUDIO_GROUPS: AngelStudioGroupSpec[] = [
  makeGroupSpec('welcome', 1, 'Warm Welcome, Opening & Calm Play', [
    'intro',
    'opening',
    'castled',
  ]),
  makeGroupSpec('explaining', 2, 'Search-Tree Explanation & Calm Simulation Browsing', [
    'tree_browse',
    'calc_offer',
    'calc_showing',
    'trial_confirm_1',
    'trial_confirm_2',
    'calc_pure',
  ]),
  makeGroupSpec('distracted', 3, 'Distraction / Gentle Warning & Undo Offer', [
    'wrong_distracted',
    'wrong_walk_mate',
    'wrong_hang_queen',
    'wrong_hang_rook',
    'wrong_hang_minor',
    'wrong_missed_tactic',
    'wrong_positional',
    'wrong_better_alt',
  ]),
  makeGroupSpec('helpful', 4, 'Encouraging Hints & Rewind Guidance', [
    'hesitate_hint',
    'hint_shown',
    'undo_done',
    'alt_shown',
  ]),
  makeGroupSpec('warning', 5, 'Tactical Warnings & Direct Piece Threats', [
    'warn_mate',
    'warn_double',
    'warn_fork_2step',
    'warn_pawn_promo',
    'warn_king_file',
    'watch_queen',
    'watch_rook',
    'watch_bishop',
    'watch_knight',
  ]),
  makeGroupSpec('attack', 6, 'Confident Attack, Captures & Checks', [
    'check_queen',
    'check_knight',
    'check_general',
    'capture_queen',
    'capture_rook',
    'capture_minor',
    'promotion',
  ]),
  makeGroupSpec('impressed', 7, "Impressed / Surprised by Player's Move", [
    'seduction',
    'player_check',
    'lost_queen',
    'checkmate_lose',
  ]),
  makeGroupSpec('ending', 8, 'Game Over — Victory or Peaceful Draw', [
    'checkmate_win',
    'stalemate',
    'draw',
  ]),
];

const LIP_SYNC_STORAGE_KEY = 'chess_angel_lipsync_rules_v1';
const CASE_CUE_STORAGE_KEY = 'chess_angel_case_cues_v1';
const VIDEO_MAX_PLAYS_STORAGE_KEY = 'chess_angel_video_max_plays_v1';
const VIDEO_PLAY_TO_END_STORAGE_KEY = 'chess_angel_video_play_to_end_v1';

function readStoredLipSyncFallback(): AngelLipSyncConfig {
  if (typeof window === 'undefined' || !IS_VIDEO_STUDIO_DEV_ENV) {
    return { defaultEnabled: true, groups: {}, cases: {} };
  }
  try {
    const raw = window.localStorage.getItem(LIP_SYNC_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AngelLipSyncConfig>;
      return {
        defaultEnabled: parsed.defaultEnabled !== false,
        groups: parsed.groups || {},
        cases: parsed.cases || {},
      };
    }
  } catch {
    // ignore storage errors
  }
  return { defaultEnabled: true, groups: {}, cases: {} };
}

function saveStoredLipSyncFallback(cfg: AngelLipSyncConfig): void {
  if (typeof window === 'undefined' || !IS_VIDEO_STUDIO_DEV_ENV) return;
  try {
    window.localStorage.setItem(LIP_SYNC_STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore storage errors
  }
}

function readStoredCaseCuesFallback(): AngelCaseEscapeCuesMap {
  if (typeof window === 'undefined' || !IS_VIDEO_STUDIO_DEV_ENV) return {};
  try {
    const raw = window.localStorage.getItem(CASE_CUE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AngelCaseEscapeCuesMap;
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return {};
}

function saveStoredCaseCuesFallback(cues: AngelCaseEscapeCuesMap): void {
  if (typeof window === 'undefined' || !IS_VIDEO_STUDIO_DEV_ENV) return;
  try {
    window.localStorage.setItem(CASE_CUE_STORAGE_KEY, JSON.stringify(cues));
  } catch {
    // ignore storage errors
  }
}

function readStoredVideoMaxPlaysFallback(): Record<string, number> {
  const base: Record<string, number> = { ...DEFAULT_VIDEO_MAX_PLAYS };
  if (typeof window === 'undefined' || !IS_VIDEO_STUDIO_DEV_ENV) return base;
  try {
    const raw = window.localStorage.getItem(VIDEO_MAX_PLAYS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'number' && Number.isFinite(v) && (v === -1 || v >= 0)) {
            base[k] = Math.floor(v);
          }
        }
      }
    }
  } catch {
    // ignore storage errors
  }
  return base;
}

function saveStoredVideoMaxPlaysFallback(maxPlays: Record<string, number>): void {
  if (typeof window === 'undefined' || !IS_VIDEO_STUDIO_DEV_ENV) return;
  try {
    window.localStorage.setItem(VIDEO_MAX_PLAYS_STORAGE_KEY, JSON.stringify(maxPlays));
  } catch {
    // ignore storage errors
  }
}

function readStoredVideoPlayToEndFallback(): Record<string, boolean> {
  const base: Record<string, boolean> = { ...DEFAULT_VIDEO_PLAY_TO_END };
  if (typeof window === 'undefined' || !IS_VIDEO_STUDIO_DEV_ENV) return base;
  try {
    const raw = window.localStorage.getItem(VIDEO_PLAY_TO_END_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'boolean') {
            base[k] = v;
          }
        }
      }
    }
  } catch {
    // ignore storage errors
  }
  return base;
}

function saveStoredVideoPlayToEndFallback(playToEndMap: Record<string, boolean>): void {
  if (typeof window === 'undefined' || !IS_VIDEO_STUDIO_DEV_ENV) return;
  try {
    window.localStorage.setItem(VIDEO_PLAY_TO_END_STORAGE_KEY, JSON.stringify(playToEndMap));
  } catch {
    // ignore storage errors
  }
}

// Pre-bundled video registry & calibrated metadata (overridden dynamically by /api/angel-videos or static /assets/aistudio/angel_video_map.json)
let runtimeOverrides: AngelVideoMapPayload = {
  idleVariants: {
    idle_2: '/assets/aistudio/angel_idle_idle_2.mp4',
    idle_3: '/assets/aistudio/angel_idle_idle_3.mp4',
    idle_4: '/assets/aistudio/angel_idle_idle_4.mp4',
    idle_5: '/assets/aistudio/angel_idle_idle_5.mp4',
    idle_6: '/assets/aistudio/angel_idle_idle_6.mp4',
    idle_7: '/assets/aistudio/angel_idle_idle_7.mp4',
  },
  defaultSpeaking: '/assets/aistudio/angel_default_speaking_default.mp4',
  groups: {},
  cases: {
    intro: '/assets/aistudio/angel_case_intro.mp4',
    tree_browse: '/assets/aistudio/angel_case_tree_browse.mp4',
    castled: '/assets/aistudio/angel_case_castled.mp4',
    calc_showing: '/assets/aistudio/angel_case_calc_showing.mp4',
    calc_pure: '/assets/aistudio/angel_case_calc_pure.mp4',
    lost_queen: '/assets/aistudio/angel_case_lost_queen.mp4',
    trial_confirm_1: '/assets/aistudio/angel_case_trial_confirm_1.mp4',
    trial_confirm_2: '/assets/aistudio/angel_case_trial_confirm_2.mp4',
    undo_done: '/assets/aistudio/angel_case_undo_done.mp4',
    warn_double: '/assets/aistudio/angel_case_warn_double.mp4',
    warn_fork_2step: '/assets/aistudio/angel_case_warn_fork_2step.mp4',
    warn_fork_2step_2: '/assets/aistudio/angel_case_warn_fork_2step_2.mp4',
    warn_king_file: '/assets/aistudio/angel_case_warn_king_file.mp4',
    warn_pawn_promo: '/assets/aistudio/angel_case_warn_pawn_promo.mp4',
    watch_bishop: '/assets/aistudio/angel_case_watch_bishop.mp4',
  },
  escapes: {
    point_you: '/assets/aistudio/angel_escape_point_you.mp4',
    point_you_2: '/assets/aistudio/angel_escape_point_you_2.mp4',
    push_button: '/assets/aistudio/angel_escape_push_button.mp4',
    push_button_2: '/assets/aistudio/angel_escape_push_button_2.mp4',
  },
  escapeEnabled: { point_you: true, push_button: true },
  caseEscapeCues: {
    lost_queen: { point_you: 'off' },
    seduction: { point_you: 'off', push_button: 'off' },
    ...readStoredCaseCuesFallback(),
  },
  videoMaxPlays: readStoredVideoMaxPlaysFallback(),
  videoPlayToEnd: readStoredVideoPlayToEndFallback(),
  lipSync: {
    defaultEnabled: true,
    groups: {},
    cases: { calc_pure: 'off', lost_queen: 'off', seduction: 'off' },
  },
  videoDurations: {
    '/assets/aistudio/angel_case_calc_pure.mp4': 8,
    '/assets/aistudio/angel_case_calc_showing.mp4': 5,
    '/assets/aistudio/angel_case_castled.mp4': 5,
    '/assets/aistudio/angel_case_intro.mp4': 5,
    '/assets/aistudio/angel_case_lost_queen.mp4': 8,
    '/assets/aistudio/angel_case_tree_browse.mp4': 6,
    '/assets/aistudio/angel_case_trial_confirm_1.mp4': 5,
    '/assets/aistudio/angel_case_trial_confirm_2.mp4': 5,
    '/assets/aistudio/angel_case_undo_done.mp4': 5,
    '/assets/aistudio/angel_case_warn_double.mp4': 5,
    '/assets/aistudio/angel_case_warn_fork_2step.mp4': 5,
    '/assets/aistudio/angel_case_warn_fork_2step_2.mp4': 5,
    '/assets/aistudio/angel_case_warn_king_file.mp4': 5,
    '/assets/aistudio/angel_case_warn_pawn_promo.mp4': 5,
    '/assets/aistudio/angel_case_watch_bishop.mp4': 5,
    '/assets/aistudio/angel_default_speaking_default.mp4': 5.6,
    '/assets/aistudio/angel_escape_point_you.mp4': 5,
    '/assets/aistudio/angel_escape_point_you_2.mp4': 5,
    '/assets/aistudio/angel_escape_push_button.mp4': 4,
    '/assets/aistudio/angel_escape_push_button_2.mp4': 3,
    '/assets/aistudio/angel_idle_idle_2.mp4': 5,
    '/assets/aistudio/angel_idle_idle_3.mp4': 5,
    '/assets/aistudio/angel_idle_idle_4.mp4': 5,
    '/assets/aistudio/angel_idle_idle_5.mp4': 5,
    '/assets/aistudio/angel_idle_idle_6.mp4': 5,
    '/assets/aistudio/angel_idle_idle_7.mp4': 5,
    '/assets/aistudio/just_lip_movements_e2adb314.mp4': 5,
    '/assets/aistudio/just_shaking_head_no_words_591ed115.mp4': 5,
    '/assets/aistudio/waving_hello_abc4f35b.mp4': 5,
  },
  escapeApexes: {
    '/assets/aistudio/angel_escape_point_you.mp4': 2.3,
    '/assets/aistudio/angel_escape_point_you_2.mp4': 1.45,
    '/assets/aistudio/angel_escape_push_button.mp4': 1.3,
    '/assets/aistudio/angel_escape_push_button_2.mp4': 1.65,
  },
  seductionAudioUrl: '/voices/female/seduction.mp3',
  seductionAudioDuration: 4.5,
};

const listeners = new Set<() => void>();
let initialFetchStarted = false;
let idleRotationCursor = 0;
let lastPickedIdleUrl = '';
let lastSecondaryIdleAtMs = 0;
const secondaryIdleLastPlayedAt = new Map<string, number>();

const escapeRotationCursor: Record<AngelEscapeCueKey, number> = {
  point_you: 0,
  push_button: 0,
};
const lastPickedEscapeUrl: Partial<Record<AngelEscapeCueKey, string>> = {};
const primedEscapePreviewUrl: Partial<Record<AngelEscapeCueKey, string>> = {};

const caseRotationCursor: Partial<Record<CommentaryCaseId, number>> = {};
const lastPickedCaseUrl: Partial<Record<CommentaryCaseId, string>> = {};
const lastCaseTriggerKey: Partial<Record<CommentaryCaseId, string>> = {};
const primedCasePreviewUrl: Partial<Record<CommentaryCaseId, string>> = {};
const lastGroupTriggerKey: Partial<Record<AngelExpressionGroup, string>> = {};

// Per-game play counters for non-case video slots (secondary idles, escape slots, #1/#2 fork sub-slots)
const gameSlotPlayCounts = new Map<string, number>();

const SECONDARY_IDLE_GLOBAL_COOLDOWN_MS = 48_000;
const SECONDARY_IDLE_PER_CLIP_COOLDOWN_MS = 110_000;

function notifyListeners(): void {
  for (const fn of listeners) {
    fn();
  }
}

function normalizeMapPayload(data?: Partial<AngelVideoMapPayload>): AngelVideoMapPayload {
  const variants: Record<string, string> = {};
  if (data?.idle) {
    variants.idle_1 = data.idle;
  }
  if (data?.idleVariants && typeof data.idleVariants === 'object') {
    for (const [k, v] of Object.entries(data.idleVariants)) {
      if (typeof v === 'string' && v.length > 0) {
        const normKey = k === 'idle_listening' ? 'idle_1' : k;
        variants[normKey] = v;
      }
    }
  }
  const fallbackLipSync = runtimeOverrides.lipSync || readStoredLipSyncFallback();
  const rawLip = data?.lipSync;
  const lipSync: AngelLipSyncConfig = rawLip
    ? {
        defaultEnabled: rawLip.defaultEnabled !== false,
        groups: { ...(rawLip.groups || {}) },
        cases: { ...(rawLip.cases || {}) },
      }
    : fallbackLipSync;
  saveStoredLipSyncFallback(lipSync);

  const prevEscEnabled = runtimeOverrides.escapeEnabled || {
    point_you: true,
    push_button: true,
  };
  const escapeEnabled: Partial<Record<AngelEscapeCueKey, boolean>> = {
    point_you:
      typeof data?.escapeEnabled?.point_you === 'boolean'
        ? data.escapeEnabled.point_you
        : prevEscEnabled.point_you !== false,
    push_button:
      typeof data?.escapeEnabled?.push_button === 'boolean'
        ? data.escapeEnabled.push_button
        : prevEscEnabled.push_button !== false,
  };

  const fallbackCaseCues = runtimeOverrides.caseEscapeCues || readStoredCaseCuesFallback();
  const caseEscapeCues: AngelCaseEscapeCuesMap = {};
  const sourceCaseCues =
    data?.caseEscapeCues && typeof data.caseEscapeCues === 'object'
      ? data.caseEscapeCues
      : fallbackCaseCues;
  for (const [cId, cueObj] of Object.entries(sourceCaseCues)) {
    if (cueObj && typeof cueObj === 'object') {
      const cleaned: Partial<Record<AngelEscapeCueKey, CaseEscapeCueRule>> = {};
      if (cueObj.point_you === 'on' || cueObj.point_you === 'off') {
        cleaned.point_you = cueObj.point_you;
      }
      if (cueObj.push_button === 'on' || cueObj.push_button === 'off') {
        cleaned.push_button = cueObj.push_button;
      }
      if (Object.keys(cleaned).length > 0) {
        caseEscapeCues[cId as CommentaryCaseId] = cleaned;
      }
    }
  }
  saveStoredCaseCuesFallback(caseEscapeCues);

  const fallbackMaxPlays = runtimeOverrides.videoMaxPlays || readStoredVideoMaxPlaysFallback();
  const videoMaxPlays: Record<string, number> = { ...DEFAULT_VIDEO_MAX_PLAYS };
  const sourceMaxPlays =
    data?.videoMaxPlays && typeof data.videoMaxPlays === 'object'
      ? data.videoMaxPlays
      : fallbackMaxPlays;
  for (const [slotId, val] of Object.entries(sourceMaxPlays)) {
    if (typeof val === 'number' && Number.isFinite(val) && (val === -1 || val >= 0)) {
      videoMaxPlays[slotId] = Math.floor(val);
    }
  }
  saveStoredVideoMaxPlaysFallback(videoMaxPlays);

  const fallbackPlayToEnd = runtimeOverrides.videoPlayToEnd || readStoredVideoPlayToEndFallback();
  const videoPlayToEnd: Record<string, boolean> = { ...DEFAULT_VIDEO_PLAY_TO_END };
  const sourcePlayToEnd =
    data?.videoPlayToEnd && typeof data.videoPlayToEnd === 'object'
      ? data.videoPlayToEnd
      : fallbackPlayToEnd;
  for (const [slotId, val] of Object.entries(sourcePlayToEnd)) {
    if (typeof val === 'boolean') {
      videoPlayToEnd[slotId] = val;
    }
  }
  saveStoredVideoPlayToEndFallback(videoPlayToEnd);

  // Keep seduction Escape Cues & Lip-Sync Tail OFF by default unless explicitly configured
  if (!caseEscapeCues.seduction) {
    caseEscapeCues.seduction = { point_you: 'off', push_button: 'off' };
  }
  if (!lipSync.cases.seduction) {
    lipSync.cases.seduction = 'off';
  }

  const seductionAudioUrl =
    typeof data?.seductionAudioUrl === 'string' && data.seductionAudioUrl.length > 0
      ? data.seductionAudioUrl
      : runtimeOverrides.seductionAudioUrl;
  const seductionAudioDuration =
    typeof data?.seductionAudioDuration === 'number' &&
    Number.isFinite(data.seductionAudioDuration) &&
    data.seductionAudioDuration > 0
      ? data.seductionAudioDuration
      : runtimeOverrides.seductionAudioDuration ?? 4.5;

  const seductionAudioVariants: Record<string, string> = {
    ...(runtimeOverrides.seductionAudioVariants || {}),
    ...(data?.seductionAudioVariants || {}),
  };
  const seductionAudioDurations: Record<string, number> = {
    ...(runtimeOverrides.seductionAudioDurations || {}),
    ...(data?.seductionAudioDurations || {}),
  };
  const validModes: ReadonlySet<string> = new Set(['balanced', 'frequent', 'dominant', 'tactical']);
  const seductionTriggerMode: SeductionTriggerMode =
    typeof data?.seductionTriggerMode === 'string' && validModes.has(data.seductionTriggerMode)
      ? (data.seductionTriggerMode as SeductionTriggerMode)
      : runtimeOverrides.seductionTriggerMode || 'balanced';

  VOICE_CLIP_DURATION_SEC.seduction_v1 = seductionAudioDuration;
  VOICE_CLIP_DURATION_SEC.seduction_v2 = seductionAudioDuration;
  VOICE_CLIP_DURATION_SEC.seduction_v3 = seductionAudioDuration;
  setSeductionAudioUrlOverride(seductionAudioUrl);

  return {
    idle: variants.idle_1 || data?.idle,
    idleVariants: variants,
    defaultSpeaking: data?.defaultSpeaking,
    groups: data?.groups || {},
    cases: data?.cases || {},
    escapes: data?.escapes || {},
    escapeEnabled,
    caseEscapeCues,
    videoMaxPlays,
    videoPlayToEnd,
    lipSync,
    videoDurations: data?.videoDurations || runtimeOverrides.videoDurations || {},
    escapeApexes: data?.escapeApexes || runtimeOverrides.escapeApexes || {},
    seductionAudioUrl,
    seductionAudioDuration,
    seductionAudioVariants,
    seductionAudioDurations,
    seductionTriggerMode,
  };
}

/**
 * Returns the configured maximum plays per chess game for `slotId` (e.g. `'case:tree_browse'`,
 * `'escape:point_you'`, `'idle:idle_2'`), or `null` when set to Unlimited (`∞`).
 * Defaults `'case:tree_browse'` to `2` so `"Don't be shocked, I am a computer..."` never repeats a 3rd time.
 */
export function getVideoSlotMaxPlays(
  slotId: string,
  map: AngelVideoMapPayload = runtimeOverrides,
): number | null {
  const raw = map.videoMaxPlays?.[slotId] ?? DEFAULT_VIDEO_MAX_PLAYS[slotId];
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
    return null;
  }
  return Math.floor(raw);
}

export function canPlayVideoSlotInGame(
  slotId: string,
  map: AngelVideoMapPayload = runtimeOverrides,
): boolean {
  const max = getVideoSlotMaxPlays(slotId, map);
  if (max === null) return true;
  if (max <= 0) return false;
  const used = gameSlotPlayCounts.get(slotId) || 0;
  return used < max;
}

export function recordVideoSlotPlayInGame(slotId: string): void {
  gameSlotPlayCounts.set(slotId, (gameSlotPlayCounts.get(slotId) || 0) + 1);
}

export function resetGameVideoPlayCounts(): void {
  gameSlotPlayCounts.clear();
  lastCaseTriggerKey.warn_fork_2step = undefined;
  lastCaseTriggerKey.warn_double = undefined;
  for (const g of Object.keys(lastGroupTriggerKey) as AngelExpressionGroup[]) {
    delete lastGroupTriggerKey[g];
  }
}

/**
 * Returns true if `slotId` (e.g. `'case:intro'`, `'escape:point_you'`, `'idle:idle_2'`)
 * is flagged in Video Studio as un-cuttable (`Full Length · No Cut`).
 */
export function isVideoSlotPlayToEnd(
  slotId: string,
  map: AngelVideoMapPayload = runtimeOverrides,
): boolean {
  const explicit = map.videoPlayToEnd?.[slotId];
  if (typeof explicit === 'boolean') return explicit;
  if (/^case:seduction(_\d+)?$/i.test(slotId)) return true;
  return Boolean(DEFAULT_VIDEO_PLAY_TO_END[slotId]);
}

/**
 * Returns true if the given video URL belongs to any Video Studio slot flagged with
 * `Full Length · No Cut` (`videoPlayToEnd`), ensuring it plays from 0.0s to its very end
 * without pre-end morph cuts, escape start-seeks, or mid-clip interruptions.
 */
export function isVideoUrlPlayToEnd(
  url: string | undefined | null,
  map: AngelVideoMapPayload = runtimeOverrides,
): boolean {
  if (!url) return false;
  const clean = url.split('?')[0];

  // Fast filename convention check for custom uploaded `angel_<kind>_<key>.mp4`
  const m = /\/angel_(idle|default|group|case|escape)_([a-z0-9_]+)\.mp4$/i.exec(clean);
  if (m) {
    const kind = m[1].toLowerCase();
    const rawKey = m[2].toLowerCase();
    const key = kind === 'idle' && rawKey === 'idle_listening' ? 'idle_1' : rawKey;
    if (isVideoSlotPlayToEnd(`${kind}:${key}`, map)) return true;
  }

  // Built-in & mapped slot URL checks
  const idle1 = (map.idleVariants?.idle_1 || map.idle || ANGEL_IDLE_LISTENING_VIDEO_SRC).split('?')[0];
  if (clean === idle1 && isVideoSlotPlayToEnd('idle:idle_1', map)) return true;

  for (const [k, v] of Object.entries(map.idleVariants || {})) {
    if (v && v.split('?')[0] === clean && isVideoSlotPlayToEnd(`idle:${k}`, map)) return true;
  }

  const defSpeak = (map.defaultSpeaking || ANGEL_DEFAULT_SPEAKING_VIDEO_SRC).split('?')[0];
  if (clean === defSpeak && isVideoSlotPlayToEnd('default:speaking_default', map)) return true;

  for (const [k, v] of Object.entries(map.groups || {})) {
    if (v && v.split('?')[0] === clean && isVideoSlotPlayToEnd(`group:${k}`, map)) return true;
  }
  for (const [k, v] of Object.entries(ANGEL_GROUP_VIDEO_MAP)) {
    if (v && v.split('?')[0] === clean && isVideoSlotPlayToEnd(`group:${k}`, map)) return true;
  }

  for (const [k, v] of Object.entries(map.cases || {})) {
    if (v && v.split('?')[0] === clean && isVideoSlotPlayToEnd(`case:${k}`, map)) return true;
  }
  for (const [k, v] of Object.entries(ANGEL_CASE_VIDEO_MAP)) {
    if (v && v.split('?')[0] === clean && isVideoSlotPlayToEnd(`case:${k}`, map)) return true;
  }

  for (const [k, v] of Object.entries(map.escapes || {})) {
    if (v && v.split('?')[0] === clean && isVideoSlotPlayToEnd(`escape:${k}`, map)) return true;
  }

  return false;
}

/**
 * Returns true if a Video Studio commentary case (or its active sub-slots, parent group, or
 * default speaking fallback) has `No Cut - Play to End` enabled anywhere in Chess Angel Video Studio.
 */
export function isEffectiveCasePlayToEnd(
  caseId: CommentaryCaseId,
  map: AngelVideoMapPayload = runtimeOverrides,
): boolean {
  if (isVideoSlotPlayToEnd(`case:${caseId}`, map)) return true;

  if (caseId === 'seduction') {
    for (const entry of getSeductionCaseEntries(map)) {
      if (isVideoSlotPlayToEnd(`case:${entry.key}`, map)) return true;
    }
    return true;
  }

  const [slot1, slot2] = getCaseSlotKeys(caseId);
  if (map.cases?.[slot1] && isVideoSlotPlayToEnd(`case:${slot1}`, map)) return true;
  if (map.cases?.[slot2] && isVideoSlotPlayToEnd(`case:${slot2}`, map)) return true;

  const hasCustomOrBuiltInCase =
    Boolean(map.cases?.[slot1]) ||
    Boolean(map.cases?.[slot2]) ||
    Boolean(ANGEL_CASE_VIDEO_MAP[caseId]);
  const group = CASE_TO_GROUP[caseId];
  if (!hasCustomOrBuiltInCase && group) {
    if (isVideoSlotPlayToEnd(`group:${group}`, map)) return true;
    const hasGroupVideo = Boolean(map.groups?.[group] || ANGEL_GROUP_VIDEO_MAP[group]);
    if (!hasGroupVideo && isVideoSlotPlayToEnd('default:speaking_default', map)) {
      return true;
    }
  } else if (group && isVideoSlotPlayToEnd(`group:${group}`, map)) {
    // Group-level No-Cut also applies unless explicitly turned false on the case slot
    const explicitCase = map.videoPlayToEnd?.[`case:${caseId}`];
    if (explicitCase !== false) return true;
  }

  return false;
}

/**
 * Returns true if the currently playing utterance + video URL has `No Cut - Play to End` enabled
 * (via its specific video URL, its commentary case button, its group button, or default speaking).
 */
export function isUtterancePlayToEnd(
  activeUrl: string | undefined | null,
  clipId?: VoiceClipId | null,
  map: AngelVideoMapPayload = runtimeOverrides,
): boolean {
  if (isVideoUrlPlayToEnd(activeUrl, map)) return true;
  const caseId = extractCaseIdFromClip(clipId);
  if (caseId && isEffectiveCasePlayToEnd(caseId, map)) return true;
  return false;
}

// Connect opponentVoice commentary case quotas directly to Video Studio's `case:<caseId>` maxPlays!
registerCaseMaxPlaysProvider((caseId) => getVideoSlotMaxPlays(`case:${caseId}`));

export function getVideoFileDurationSec(
  url: string | undefined,
  map: AngelVideoMapPayload = runtimeOverrides,
): number | null {
  if (!url) return null;
  const clean = url.split('?')[0];
  const d = map.videoDurations?.[clean];
  return typeof d === 'number' && Number.isFinite(d) ? d : null;
}

/**
 * Returns the exact gesture pointing apex timestamp (in seconds) inside an Escape Overlay .mp4
 * so we can pre-roll and start-seek the video to hit its finger point on the exact spoken word!
 */
export function getEscapeVideoApexSec(
  url: string | undefined,
  cueKey: AngelEscapeCueKey,
  map: AngelVideoMapPayload = runtimeOverrides,
): number {
  if (url) {
    const clean = url.split('?')[0];
    const measured = map.escapeApexes?.[clean];
    if (typeof measured === 'number' && Number.isFinite(measured) && measured > 0.1) {
      return measured;
    }
    if (clean.endsWith('point_you_2.mp4')) return 1.45;
    if (clean.endsWith('push_button_2.mp4')) return 1.65;
  }
  return cueKey === 'point_you' ? 2.3 : 1.3;
}

export function getAngelVideoOverridesSnapshot(): AngelVideoMapPayload {
  return runtimeOverrides;
}

export async function refreshAngelVideoOverrides(): Promise<AngelVideoMapPayload> {
  const endpoints = ['/api/angel-videos', '/assets/aistudio/angel_video_map.json'];
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, { cache: 'no-store' });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('json')) {
        const data = (await res.json()) as Partial<AngelVideoMapPayload>;
        runtimeOverrides = normalizeMapPayload(data);
        notifyListeners();
        return runtimeOverrides;
      }
    } catch {
      // Try next bundled endpoint or fall back to compiled defaults cleanly
    }
  }
  return runtimeOverrides;
}

export function subscribeAngelVideoOverrides(listener: () => void): () => void {
  listeners.add(listener);
  if (!initialFetchStarted && typeof window !== 'undefined') {
    initialFetchStarted = true;
    void refreshAngelVideoOverrides();
  }
  return () => {
    listeners.delete(listener);
  };
}

export interface UploadAngelVideoResult {
  url: string;
  extractedAudio: boolean;
}

export async function uploadAngelPortraitVideo(
  kind: 'idle' | 'default' | 'group' | 'case' | 'escape',
  key: string,
  file: File,
): Promise<UploadAngelVideoResult> {
  const res = await fetch(`/api/angel-videos/${encodeURIComponent(kind)}/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'video/mp4',
    },
    body: file,
  });
  if (!res.ok) {
    throw new Error('Failed to upload video');
  }
  const payload = (await res.json()) as {
    ok: boolean;
    url: string;
    extractedAudio?: boolean;
    map: Partial<AngelVideoMapPayload>;
  };
  runtimeOverrides = normalizeMapPayload(payload.map);
  notifyListeners();
  return { url: payload.url, extractedAudio: Boolean(payload.extractedAudio) };
}

export async function uploadAngelSeductionAudio(
  file: File,
): Promise<{ audioUrl: string; audioDuration: number }> {
  const res = await fetch('/api/angel-videos/seduction-audio', {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'audio/mpeg',
    },
    body: file,
  });
  if (!res.ok) {
    throw new Error('Failed to upload seduction.mp3');
  }
  const payload = (await res.json()) as {
    ok: boolean;
    audioUrl: string;
    audioDuration: number;
    map: Partial<AngelVideoMapPayload>;
  };
  runtimeOverrides = normalizeMapPayload(payload.map);
  notifyListeners();
  return { audioUrl: payload.audioUrl, audioDuration: payload.audioDuration };
}

export async function resetAngelPortraitVideo(
  kind: 'idle' | 'default' | 'group' | 'case' | 'escape',
  key: string,
): Promise<void> {
  const res = await fetch(`/api/angel-videos/${encodeURIComponent(kind)}/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error('Failed to reset video slot');
  }
  const payload = (await res.json()) as { ok: boolean; map: Partial<AngelVideoMapPayload> };
  runtimeOverrides = normalizeMapPayload(payload.map);
  notifyListeners();
}

export async function updateAngelEscapeEnabled(
  key: AngelEscapeCueKey,
  enabled: boolean,
): Promise<void> {
  const nextEnabled: Partial<Record<AngelEscapeCueKey, boolean>> = {
    ...(runtimeOverrides.escapeEnabled || { point_you: true, push_button: true }),
    [key]: enabled,
  };
  runtimeOverrides = { ...runtimeOverrides, escapeEnabled: nextEnabled };
  notifyListeners();

  const res = await fetch('/api/angel-videos/escape-toggle', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, enabled }),
  });
  if (res.ok) {
    const payload = (await res.json()) as { ok: boolean; map: Partial<AngelVideoMapPayload> };
    runtimeOverrides = normalizeMapPayload(payload.map);
    notifyListeners();
  }
}

export async function updateAngelCaseEscapeCue(
  caseId: CommentaryCaseId,
  cueKey: AngelEscapeCueKey,
  rule: 'on' | 'off' | 'inherit',
): Promise<void> {
  const prevMap: AngelCaseEscapeCuesMap = { ...(runtimeOverrides.caseEscapeCues || {}) };
  const nextCaseEntry: Partial<Record<AngelEscapeCueKey, CaseEscapeCueRule>> = {
    ...(prevMap[caseId] || {}),
  };

  if (rule === 'inherit') {
    delete nextCaseEntry[cueKey];
  } else {
    nextCaseEntry[cueKey] = rule;
  }

  if (Object.keys(nextCaseEntry).length === 0) {
    delete prevMap[caseId];
  } else {
    prevMap[caseId] = nextCaseEntry;
  }

  runtimeOverrides = { ...runtimeOverrides, caseEscapeCues: prevMap };
  saveStoredCaseCuesFallback(prevMap);
  notifyListeners();

  try {
    const res = await fetch('/api/angel-videos/case-cue', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId, cueKey, rule }),
    });
    if (res.ok) {
      const payload = (await res.json()) as { ok: boolean; map: Partial<AngelVideoMapPayload> };
      runtimeOverrides = normalizeMapPayload(payload.map);
      notifyListeners();
    }
  } catch {
    // Keep optimistic localStorage state if offline
  }
}

export async function updateAngelVideoMaxPlays(
  slotId: string,
  maxPlays: number | null,
): Promise<void> {
  const wireValue = maxPlays === null ? -1 : Math.max(0, Math.min(999, Math.floor(maxPlays)));
  const nextMaxPlays: Record<string, number> = {
    ...DEFAULT_VIDEO_MAX_PLAYS,
    ...(runtimeOverrides.videoMaxPlays || {}),
  };

  if (wireValue === -1) {
    if (slotId in DEFAULT_VIDEO_MAX_PLAYS) {
      nextMaxPlays[slotId] = -1;
    } else {
      delete nextMaxPlays[slotId];
    }
  } else {
    nextMaxPlays[slotId] = wireValue;
  }

  runtimeOverrides = { ...runtimeOverrides, videoMaxPlays: nextMaxPlays };
  saveStoredVideoMaxPlaysFallback(nextMaxPlays);
  notifyListeners();

  try {
    const res = await fetch('/api/angel-videos/max-plays', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotId, maxPlays: wireValue }),
    });
    if (res.ok) {
      const payload = (await res.json()) as { ok: boolean; map: Partial<AngelVideoMapPayload> };
      runtimeOverrides = normalizeMapPayload(payload.map);
      notifyListeners();
    }
  } catch {
    // Keep optimistic localStorage state if offline
  }
}

export async function updateAngelVideoPlayToEnd(
  slotId: string,
  playToEnd: boolean,
): Promise<void> {
  const nextPlayToEnd: Record<string, boolean> = {
    ...DEFAULT_VIDEO_PLAY_TO_END,
    ...(runtimeOverrides.videoPlayToEnd || {}),
  };
  if (playToEnd) {
    nextPlayToEnd[slotId] = true;
  } else if (slotId in DEFAULT_VIDEO_PLAY_TO_END || /^case:seduction(_\d+)?$/i.test(slotId)) {
    nextPlayToEnd[slotId] = false;
  } else {
    delete nextPlayToEnd[slotId];
  }

  runtimeOverrides = { ...runtimeOverrides, videoPlayToEnd: nextPlayToEnd };
  saveStoredVideoPlayToEndFallback(nextPlayToEnd);
  notifyListeners();

  try {
    const res = await fetch('/api/angel-videos/play-to-end', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotId, playToEnd }),
    });
    if (res.ok) {
      const payload = (await res.json()) as { ok: boolean; map: Partial<AngelVideoMapPayload> };
      runtimeOverrides = normalizeMapPayload(payload.map);
      notifyListeners();
    }
  } catch {
    // Keep optimistic localStorage state if offline
  }
}

export async function updateAngelSeductionTriggerMode(mode: SeductionTriggerMode): Promise<void> {
  runtimeOverrides = { ...runtimeOverrides, seductionTriggerMode: mode };
  notifyListeners();

  try {
    const res = await fetch('/api/angel-videos/seduction-mode', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    if (res.ok) {
      const payload = (await res.json()) as { ok: boolean; map: Partial<AngelVideoMapPayload> };
      runtimeOverrides = normalizeMapPayload(payload.map);
      notifyListeners();
    }
  } catch {
    // Keep optimistic runtime state if offline
  }
}

export async function updateAngelLipSyncRule(
  scope: 'global' | 'group' | 'case',
  key: string,
  rule: 'on' | 'off' | 'inherit',
): Promise<void> {
  // Optimistic update so UI & portrait video respond instantaneously
  const prevLip: AngelLipSyncConfig = runtimeOverrides.lipSync || {
    defaultEnabled: true,
    groups: {},
    cases: {},
  };
  const nextLip: AngelLipSyncConfig = {
    defaultEnabled: prevLip.defaultEnabled,
    groups: { ...prevLip.groups },
    cases: { ...prevLip.cases },
  };
  if (scope === 'global') {
    nextLip.defaultEnabled = rule !== 'off';
  } else if (scope === 'group') {
    if (rule === 'inherit') {
      delete nextLip.groups[key as AngelExpressionGroup];
    } else {
      nextLip.groups[key as AngelExpressionGroup] = rule;
    }
  } else {
    if (rule === 'inherit') {
      delete nextLip.cases[key as CommentaryCaseId];
    } else {
      nextLip.cases[key as CommentaryCaseId] = rule;
    }
  }
  runtimeOverrides = { ...runtimeOverrides, lipSync: nextLip };
  saveStoredLipSyncFallback(nextLip);
  notifyListeners();

  const res = await fetch('/api/angel-videos/lip-sync', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope, key, rule }),
  });
  if (res.ok) {
    const payload = (await res.json()) as { ok: boolean; map: Partial<AngelVideoMapPayload> };
    runtimeOverrides = normalizeMapPayload(payload.map);
    notifyListeners();
  }
}

export function extractCaseIdFromClip(clipId?: VoiceClipId | null): CommentaryCaseId | null {
  if (!clipId) return null;
  const stripped = clipId.replace(/_(v1|v2|v3)$/, '') as CommentaryCaseId;
  return stripped in CASE_TO_GROUP ? stripped : null;
}

export function parseIdleSlotNumber(key: string): number {
  const m = /^idle_(\d+)$/.exec(key);
  return m ? parseInt(m[1], 10) : 999;
}

/**
 * Returns the ordered active pool of Idle / Quiet Listening video URLs (1, 2, 3, or more).
 * Slot `idle_1` uses its custom `.mp4` if attached or falls back to the built-in silent idle clip;
 * any attached `idle_2`, `idle_3`, `idle_4`... alternatives are included in ascending order.
 */
export function getAngelIdleVideoPool(map: AngelVideoMapPayload = runtimeOverrides): string[] {
  const variants = map.idleVariants || {};
  const pool: string[] = [];

  const first = variants.idle_1 || map.idle || ANGEL_IDLE_LISTENING_VIDEO_SRC;
  pool.push(first);

  const extraKeys = Object.keys(variants)
    .filter((k) => k !== 'idle_1' && Boolean(variants[k]))
    .sort((a, b) => parseIdleSlotNumber(a) - parseIdleSlotNumber(b));

  for (const k of extraKeys) {
    const url = variants[k];
    if (url && !pool.includes(url)) {
      pool.push(url);
    }
  }

  return pool.length > 0 ? pool : [ANGEL_IDLE_LISTENING_VIDEO_SRC];
}

/**
 * Picks the next Idle / Quiet Listening video from the active pool while preventing
 * secondary gestures (`idle_2`, `idle_3`, `idle_4`... such as glancing at her wrist watch)
 * from playing back-to-back or repeating too quickly:
 * - Always interleaves calm primary quiet listening (`pool[0]`) after any secondary gesture.
 * - Enforces a 48s global cooldown between secondary idle clips and a 110s per-clip cooldown.
 */
export function pickNextAngelIdleVideo(avoidUrl?: string): string {
  const pool = getAngelIdleVideoPool();
  const primary = pool[0];
  if (pool.length <= 1) {
    lastPickedIdleUrl = primary;
    return primary;
  }

  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const secondaries = pool.slice(1);

  // 1. If the previous idle was a secondary clip (e.g. wrist watch) OR global cooldown is active,
  //    always settle back into calm primary listening (`idle_1`)!
  const lastWasSecondary = lastPickedIdleUrl !== '' && lastPickedIdleUrl !== primary;
  const globalCooldownActive =
    lastSecondaryIdleAtMs > 0 && now - lastSecondaryIdleAtMs < SECONDARY_IDLE_GLOBAL_COOLDOWN_MS;

  if (lastWasSecondary || globalCooldownActive) {
    lastPickedIdleUrl = primary;
    return primary;
  }

  // 2. Otherwise pick the next secondary variation that isn't on per-clip cooldown or capped for this game
  const variants = runtimeOverrides.idleVariants || {};
  const urlToIdleSlotId = new Map<string, string>();
  for (const [k, u] of Object.entries(variants)) {
    if (k !== 'idle_1' && u) {
      urlToIdleSlotId.set(u, `idle:${k}`);
    }
  }

  for (let offset = 0; offset < secondaries.length; offset++) {
    const idx = (idleRotationCursor + offset) % secondaries.length;
    const candidate = secondaries[idx];
    const idleSlotId = urlToIdleSlotId.get(candidate);
    if (idleSlotId && !canPlayVideoSlotInGame(idleSlotId)) {
      continue;
    }
    const lastClipAt = secondaryIdleLastPlayedAt.get(candidate) || 0;
    const clipReady =
      lastClipAt === 0 || now - lastClipAt >= SECONDARY_IDLE_PER_CLIP_COOLDOWN_MS;

    if (candidate !== avoidUrl && clipReady) {
      idleRotationCursor = (idx + 1) % secondaries.length;
      lastPickedIdleUrl = candidate;
      lastSecondaryIdleAtMs = now;
      secondaryIdleLastPlayedAt.set(candidate, now);
      if (idleSlotId) {
        recordVideoSlotPlayInGame(idleSlotId);
      }
      return candidate;
    }
  }

  lastPickedIdleUrl = primary;
  return primary;
}

export function resolveAngelIdleVideo(): string {
  return getAngelIdleVideoPool()[0];
}

/**
 * Computes prosody-weighted spoken progress [0..1] for character `charIdx` in `text`,
 * accounting for natural speech pauses at ellipses, periods, and commas.
 */
function computeProsodyProgress(text: string, charIdx: number): number {
  if (!text || text.length <= 1) return 0;
  let totalWeight = 0;
  let weightBefore = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    let w = 1;
    if (ch === '.' || ch === '!' || ch === '?' || ch === '—') {
      w = 3.1;
    } else if (ch === ',') {
      w = 2.1;
    }
    if (i < charIdx) {
      weightBefore += w;
    }
    totalWeight += w;
  }

  return totalWeight > 0 ? Math.max(0, Math.min(1, weightBefore / totalWeight)) : 0;
}

const ESCAPE_IDEAL_PRE_ROLL_SEC = 0.72;

/**
 * Scans spoken text for Chess Angel's two special word-triggered gesture cues (`"you"` & `"button"`),
 * anchoring `spokenWordSec` to exact acoustic waveform measurements for all bundled voice recordings
 * (and focal-word prosody alignment for any custom text).
 */
export function detectEscapeCuesInText(
  text: string | undefined | null,
  totalTalkSec = 5.5,
  clipId?: VoiceClipId | null,
): DetectedTextEscapeCue[] {
  if (!text) return [];
  const leadingSilenceSec = 0.15;
  const effectiveSpan = Math.max(0.75, totalTalkSec - leadingSilenceSec - 0.35);
  const useAcousticTable = Boolean(clipId && text === CLIP_TEXT[clipId]);
  const acousticEntry = useAcousticTable && clipId ? ACOUSTIC_CLIP_CUE_WORDS[clipId] : undefined;
  const cues: DetectedTextEscapeCue[] = [];

  // 1. Word "you" (pointing finger right at the player)
  const youMatch = /\byou\b/i.exec(text);
  if (youMatch && typeof youMatch.index === 'number') {
    const ratio = computeProsodyProgress(text, youMatch.index);
    const spokenWordSec =
      typeof acousticEntry?.point_you === 'number'
        ? acousticEntry.point_you
        : Number((leadingSilenceSec + ratio * effectiveSpan).toFixed(2));
    cues.push({
      key: 'point_you',
      matchedPhrase: youMatch[0],
      focalWord: youMatch[0],
      charIndex: youMatch.index,
      progressRatio: ratio,
      spokenWordSec,
      estimatedTriggerSec: Number(
        Math.max(0.03, spokenWordSec - ESCAPE_IDEAL_PRE_ROLL_SEC).toFixed(2),
      ),
    });
  }

  // 2. "push a button" / "clicking on a button" / "touch show hint" / "touch hint" / button below
  const buttonRegex =
    /\b(?:clicking[\s"“”'‘’]+on[\s"“”'‘’]+(?:a|the)[\s"“”'‘’]+button|touch[\s"“”'‘’]+show[\s"“”'‘’]+hint|touch[\s"“”'‘’]+hint|(?:push|pushing|press|pressing|click|clicking|touch|touching|tap|tapping)[\s"“”'‘’]+(?:on[\s"“”'‘’]+)?(?:a[\s"“”'‘’]+|the[\s"“”'‘’]+)?(?:[a-z]+[\s"“”'‘’]+){0,2}button|push\s+a\s+button|push\s+the\s+button|(?:touch|touching|click|clicking|press|pressing|tap|tapping|push|pushing)[\s"“”'‘’]+(?:(?:show[\s"“”'‘’]+)?hint|undo)|show\s+hint|click\s+to\s+confirm|button)\b/i;
  const btnMatch = buttonRegex.exec(text);
  if (btnMatch && typeof btnMatch.index === 'number') {
    // Anchor prosody timing right on the spoken word "button" (or "Hint"/"Undo"/"confirm") inside the phrase!
    const subButton = /\bbutton\b/i.exec(btnMatch[0]);
    const subAction = /\b(?:show\s+hint|hint|undo|confirm)\b/i.exec(btnMatch[0]);
    const focalSub = subButton || subAction;
    const focalIndex =
      btnMatch.index + (focalSub && typeof focalSub.index === 'number' ? focalSub.index : 0);
    const focalWord = focalSub ? focalSub[0] : btnMatch[0];
    const ratio = computeProsodyProgress(text, focalIndex);
    const spokenWordSec =
      typeof acousticEntry?.push_button === 'number'
        ? acousticEntry.push_button
        : Number((leadingSilenceSec + ratio * effectiveSpan).toFixed(2));
    cues.push({
      key: 'push_button',
      matchedPhrase: btnMatch[0],
      focalWord,
      charIndex: focalIndex,
      progressRatio: ratio,
      spokenWordSec,
      estimatedTriggerSec: Number(
        Math.max(0.03, spokenWordSec - ESCAPE_IDEAL_PRE_ROLL_SEC).toFixed(2),
      ),
    });
  }

  cues.sort((a, b) => a.spokenWordSec - b.spokenWordSec);
  return cues;
}

export interface CaseNaturalCueSummary {
  hasAny: boolean;
  inV1: boolean;
  variantLabel: 'v1' | 'v2' | 'v3' | null;
  cue: DetectedTextEscapeCue | null;
}

/**
 * Inspects v1, v2, and v3 of `caseId` to determine whether `cueKey` (`"you"` or `"button"`)
 * naturally occurs in that saying and at what exact acoustic second.
 */
export function getCaseNaturalCueSummary(
  caseId: CommentaryCaseId,
  cueKey: AngelEscapeCueKey,
): CaseNaturalCueSummary {
  const variants: Array<'v1' | 'v2' | 'v3'> = ['v1', 'v2', 'v3'];
  for (const v of variants) {
    const clipId = `${caseId}_${v}` as VoiceClipId;
    const txt = CLIP_TEXT[clipId];
    const dur = VOICE_CLIP_DURATION_SEC[clipId] ?? 5.5;
    const found = detectEscapeCuesInText(txt, dur, clipId).find((c) => c.key === cueKey);
    if (found) {
      return {
        hasAny: true,
        inV1: v === 'v1',
        variantLabel: v,
        cue: found,
      };
    }
  }
  return {
    hasAny: false,
    inV1: false,
    variantLabel: null,
    cue: null,
  };
}

/**
 * Returns the effective Selected / Unselected state and display timing for `cueKey` (`"you"` or `"button"`)
 * on a specific video / saying (`caseId`) in the Video Studio modal.
 */
export function getCaseEscapeCueStatus(
  caseId: CommentaryCaseId,
  cueKey: AngelEscapeCueKey,
  map: AngelVideoMapPayload = runtimeOverrides,
): {
  selected: boolean;
  explicitRule?: CaseEscapeCueRule;
  natural: CaseNaturalCueSummary;
  spokenWordSec: number;
  wordLabel: string;
} {
  const explicitRule = map.caseEscapeCues?.[caseId]?.[cueKey];
  const natural = getCaseNaturalCueSummary(caseId, cueKey);
  const selected =
    explicitRule === 'on' ? true : explicitRule === 'off' ? false : natural.hasAny;

  const v1ClipId = `${caseId}_v1` as VoiceClipId;
  const v1Dur = VOICE_CLIP_DURATION_SEC[v1ClipId] ?? 5.5;
  const fallbackForcedSec = Number(
    Math.max(
      0.55,
      Math.min(v1Dur - 0.65, v1Dur * (cueKey === 'point_you' ? 0.42 : 0.66)),
    ).toFixed(2),
  );

  const spokenWordSec = natural.cue ? natural.cue.spokenWordSec : fallbackForcedSec;
  const wordLabel =
    cueKey === 'point_you'
      ? '"you"'
      : natural.cue
        ? `"${natural.cue.focalWord}"`
        : '"button"';

  return {
    selected,
    explicitRule,
    natural,
    spokenWordSec,
    wordLabel,
  };
}

export function isEscapeCueEnabled(
  key: AngelEscapeCueKey,
  map: AngelVideoMapPayload = runtimeOverrides,
): boolean {
  return map.escapeEnabled?.[key] !== false;
}

/**
 * Returns the active pool (1 or 2 videos) configured for `cueKey` (`point_you` or `push_button`).
 */
export function getEscapeVideoPool(
  cueKey: AngelEscapeCueKey,
  map: AngelVideoMapPayload = runtimeOverrides,
): string[] {
  const slots = ESCAPE_CUE_SLOT_KEYS[cueKey];
  const pool: string[] = [];
  for (const slotKey of slots) {
    const u = map.escapes?.[slotKey];
    if (u && !pool.includes(u)) {
      pool.push(u);
    }
  }
  return pool;
}

/**
 * Primes a specific Escape Overlay video URL (`#1` or `#2`) so clicking `Test` or uploading
 * a specific alternative slot in Video Studio previews that exact slot immediately.
 */
export function primeNextEscapeSlotPreview(
  cueKey: AngelEscapeCueKey,
  preferredUrl?: string,
): void {
  if (preferredUrl) {
    primedEscapePreviewUrl[cueKey] = preferredUrl;
  } else {
    delete primedEscapePreviewUrl[cueKey];
  }
}

function pickEscapeVideoForCue(
  cueKey: AngelEscapeCueKey,
  map: AngelVideoMapPayload,
  advanceCursor: boolean,
  isStudioPreview = false,
): string | null {
  const slots = ESCAPE_CUE_SLOT_KEYS[cueKey];
  const entries: Array<{ slotId: string; url: string }> = [];
  for (const slotKey of slots) {
    const u = map.escapes?.[slotKey];
    if (u && !entries.some((e) => e.url === u)) {
      entries.push({ slotId: `escape:${slotKey}`, url: u });
    }
  }
  if (entries.length === 0) return null;

  const primed = primedEscapePreviewUrl[cueKey];
  if (primed && entries.some((e) => e.url === primed)) {
    if (advanceCursor) {
      delete primedEscapePreviewUrl[cueKey];
      const primedIdx = entries.findIndex((e) => e.url === primed);
      escapeRotationCursor[cueKey] = (primedIdx + 1) % entries.length;
      lastPickedEscapeUrl[cueKey] = primed;
    }
    return primed;
  }

  const allowed = isStudioPreview
    ? entries
    : entries.filter((e) => canPlayVideoSlotInGame(e.slotId, map));
  if (allowed.length === 0) return null;

  if (allowed.length === 1) {
    if (advanceCursor) {
      lastPickedEscapeUrl[cueKey] = allowed[0].url;
      if (!isStudioPreview) {
        recordVideoSlotPlayInGame(allowed[0].slotId);
      }
    }
    return allowed[0].url;
  }

  if (!advanceCursor) {
    const prev = lastPickedEscapeUrl[cueKey];
    if (prev && allowed.some((e) => e.url === prev)) return prev;
    return allowed[escapeRotationCursor[cueKey] % allowed.length].url;
  }

  const idx = escapeRotationCursor[cueKey] % allowed.length;
  const chosen = allowed[idx];
  escapeRotationCursor[cueKey] = (idx + 1) % allowed.length;
  lastPickedEscapeUrl[cueKey] = chosen.url;
  if (!isStudioPreview) {
    recordVideoSlotPlayInGame(chosen.slotId);
  }
  return chosen.url;
}

export function resolveActiveEscapeCues(
  text: string | undefined | null,
  clipId?: VoiceClipId | null,
  map: AngelVideoMapPayload = runtimeOverrides,
  advanceCursor = true,
  isStudioPreview = false,
): ResolvedActiveEscapeCue[] {
  const effectiveText = text || (clipId ? CLIP_TEXT[clipId] : '');
  const totalTalkSec = (clipId ? VOICE_CLIP_DURATION_SEC[clipId] : undefined) ?? 5.5;
  const caseId = extractCaseIdFromClip(clipId);
  const detected = detectEscapeCuesInText(effectiveText, totalTalkSec, clipId);

  const candidates: DetectedTextEscapeCue[] = [];
  const allKeys: AngelEscapeCueKey[] = ['point_you', 'push_button'];

  for (const cueKey of allKeys) {
    if (!isEscapeCueEnabled(cueKey, map)) continue;
    const caseRule = caseId ? map.caseEscapeCues?.[caseId]?.[cueKey] : undefined;
    if (caseRule === 'off') {
      // User unselected this cue on this video in Video Studio!
      continue;
    }

    const naturalCue = detected.find((d) => d.key === cueKey);
    if (naturalCue) {
      candidates.push(naturalCue);
    } else if (caseRule === 'on') {
      // User explicitly selected this cue on this video in Video Studio!
      const ratio = cueKey === 'point_you' ? 0.42 : 0.66;
      const forcedWordSec = Number(
        Math.max(0.55, Math.min(totalTalkSec - 0.65, totalTalkSec * ratio)).toFixed(2),
      );
      candidates.push({
        key: cueKey,
        matchedPhrase: cueKey === 'point_you' ? 'you' : 'button',
        focalWord: cueKey === 'point_you' ? 'you' : 'button',
        charIndex: 0,
        progressRatio: ratio,
        spokenWordSec: forcedWordSec,
        estimatedTriggerSec: Number(
          Math.max(0.03, forcedWordSec - ESCAPE_IDEAL_PRE_ROLL_SEC).toFixed(2),
        ),
        forcedByOverride: true,
      });
    }
  }

  candidates.sort((a, b) => a.spokenWordSec - b.spokenWordSec);

  const result: ResolvedActiveEscapeCue[] = [];
  let prevSpokenWordSec = -10;

  for (let i = 0; i < candidates.length; i++) {
    const cue = candidates[i];
    const url = pickEscapeVideoForCue(cue.key, map, advanceCursor, isStudioPreview);
    if (!url) continue;

    const videoApexSec = getEscapeVideoApexSec(url, cue.key, map);
    const fullLengthNoCut = isVideoUrlPlayToEnd(url, map);
    const idealLeadSec = fullLengthNoCut
      ? videoApexSec
      : Math.min(videoApexSec, ESCAPE_IDEAL_PRE_ROLL_SEC);
    const minTriggerSec = i === 0 ? 0.03 : prevSpokenWordSec + 0.36;
    const rawTrigger = Math.max(minTriggerSec, cue.spokenWordSec - idealLeadSec);
    const clampedTrigger =
      cue.spokenWordSec > minTriggerSec + 0.14
        ? Math.min(rawTrigger, cue.spokenWordSec - 0.14)
        : minTriggerSec;
    const estimatedTriggerSec = Number(Math.max(0.03, clampedTrigger).toFixed(2));
    const actualLeadSec = Math.max(0.12, cue.spokenWordSec - estimatedTriggerSec);
    const videoStartSeekSec = fullLengthNoCut
      ? 0
      : Number(Math.max(0, videoApexSec - actualLeadSec).toFixed(2));

    result.push({
      ...cue,
      estimatedTriggerSec,
      videoUrl: url,
      videoApexSec,
      videoStartSeekSec,
    });
    prevSpokenWordSec = cue.spokenWordSec;
  }

  return result;
}

export function isGroupUsingDefaultLipSync(
  group: AngelExpressionGroup,
  map: AngelVideoMapPayload = runtimeOverrides,
): boolean {
  const lip = map.lipSync || { defaultEnabled: true, groups: {}, cases: {} };
  const gRule = lip.groups[group];
  if (gRule === 'on') return true;
  if (gRule === 'off') return false;
  return lip.defaultEnabled !== false;
}

export function isCaseUsingDefaultLipSync(
  caseId: CommentaryCaseId,
  map: AngelVideoMapPayload = runtimeOverrides,
): boolean {
  const lip = map.lipSync || { defaultEnabled: true, groups: {}, cases: {} };
  const cRule = lip.cases[caseId];
  if (cRule === 'on') return true;
  if (cRule === 'off') return false;
  const group = CASE_TO_GROUP[caseId];
  return group ? isGroupUsingDefaultLipSync(group, map) : lip.defaultEnabled !== false;
}

export function resolveDefaultSpeakingLipVideo(): string {
  return runtimeOverrides.defaultSpeaking || ANGEL_DEFAULT_SPEAKING_VIDEO_SRC;
}

/**
 * Returns true if Chess Angel should morph into `Default Speaking Lip` whenever a custom/group
 * speaking video ends while she still has spoken words remaining.
 */
export function shouldExtendWithDefaultLipSync(clipId?: VoiceClipId | null): boolean {
  const caseId = extractCaseIdFromClip(clipId);
  if (!caseId) {
    const lip = runtimeOverrides.lipSync || { defaultEnabled: true, groups: {}, cases: {} };
    return lip.defaultEnabled !== false;
  }
  return isCaseUsingDefaultLipSync(caseId, runtimeOverrides);
}

export function getCaseSlotKeys(
  caseId: CommentaryCaseId,
): readonly [CommentaryCaseId, CaseAlternativeSlotKey] {
  return [caseId, `${caseId}_2`];
}

export function caseHasAlternativeSlotUI(
  caseId: CommentaryCaseId,
  map: AngelVideoMapPayload = runtimeOverrides,
): boolean {
  return MULTI_SLOT_CASE_IDS.has(caseId) || Boolean(map.cases[`${caseId}_2`]);
}

export function getSeductionCaseEntries(
  map: AngelVideoMapPayload = runtimeOverrides,
): Array<{ key: AnyCaseSlotKey; num: number; url: string }> {
  const found: Array<{ key: AnyCaseSlotKey; num: number; url: string }> = [];
  for (const [k, u] of Object.entries(map.cases || {})) {
    if (!u) continue;
    const num = parseSeductionSlotNumber(k);
    if (num >= 1) {
      found.push({ key: k as AnyCaseSlotKey, num, url: u });
    }
  }
  found.sort((a, b) => a.num - b.num);
  return found;
}

/**
 * Returns the active custom .mp4 pool attached to `caseId` (`#1`, `#2`, and `#1..#N` for `seduction`).
 */
export function getCaseVideoPool(
  caseId: CommentaryCaseId,
  map: AngelVideoMapPayload = runtimeOverrides,
): string[] {
  if (caseId === 'seduction') {
    const pool: string[] = [];
    for (const item of getSeductionCaseEntries(map)) {
      if (!pool.includes(item.url)) {
        pool.push(item.url);
      }
    }
    return pool;
  }
  const [slot1, slot2] = getCaseSlotKeys(caseId);
  const pool: string[] = [];
  for (const slotKey of [slot1, slot2] as const) {
    const u = map.cases[slotKey];
    if (u && !pool.includes(u)) {
      pool.push(u);
    }
  }
  return pool;
}

/**
 * Primes a specific case video slot URL (`#1`, `#2`, or `seduction #N`) so clicking `Test` or uploading
 * an alternative slot in Video Studio previews that exact video immediately.
 */
export function primeNextCaseSlotPreview(
  caseId: CommentaryCaseId,
  preferredUrl?: string,
): void {
  if (preferredUrl) {
    primedCasePreviewUrl[caseId] = preferredUrl;
  } else {
    delete primedCasePreviewUrl[caseId];
  }
}

function applySeductionSlotAudioForKey(key: string, map: AngelVideoMapPayload): void {
  const slotAudio = map.seductionAudioVariants?.[key] || map.seductionAudioUrl || null;
  setNextSeductionPlaybackAudio(slotAudio);
  const slotDur = map.seductionAudioDurations?.[key] ?? map.seductionAudioDuration;
  if (typeof slotDur === 'number' && Number.isFinite(slotDur) && slotDur > 0) {
    VOICE_CLIP_DURATION_SEC.seduction_v1 = slotDur;
    VOICE_CLIP_DURATION_SEC.seduction_v2 = slotDur;
    VOICE_CLIP_DURATION_SEC.seduction_v3 = slotDur;
  }
}

function pickCaseVideoFromPool(
  caseId: CommentaryCaseId,
  map: AngelVideoMapPayload,
  triggerKey?: string,
): string | null {
  const entries: Array<{ key: string; slotId: string; url: string; isSecondary: boolean }> = [];

  if (caseId === 'seduction') {
    for (const s of getSeductionCaseEntries(map)) {
      if (!entries.some((e) => e.url === s.url)) {
        entries.push({
          key: s.key,
          slotId: `case:${s.key}`,
          url: s.url,
          isSecondary: s.num >= 2,
        });
      }
    }
  } else {
    const [slot1, slot2] = getCaseSlotKeys(caseId);
    if (map.cases[slot1]) {
      entries.push({
        key: slot1,
        slotId: `case:${slot1}`,
        url: map.cases[slot1]!,
        isSecondary: false,
      });
    }
    if (map.cases[slot2] && !entries.some((e) => e.url === map.cases[slot2])) {
      entries.push({
        key: slot2,
        slotId: `case:${slot2}`,
        url: map.cases[slot2]!,
        isSecondary: true,
      });
    }
  }

  if (entries.length === 0) return null;

  const isStudioPreview = Boolean(triggerKey?.startsWith('preview:'));
  const hasMultiSlots = entries.length >= 2 || MULTI_SLOT_CASE_IDS.has(caseId);

  const primed = primedCasePreviewUrl[caseId];
  if (primed && entries.some((e) => e.url === primed)) {
    const primedEntry = entries.find((e) => e.url === primed)!;
    if (caseId === 'seduction') {
      applySeductionSlotAudioForKey(primedEntry.key, map);
    }
    if (!triggerKey || triggerKey !== lastCaseTriggerKey[caseId]) {
      delete primedCasePreviewUrl[caseId];
      const primedIdx = entries.findIndex((e) => e.url === primed);
      caseRotationCursor[caseId] = (primedIdx + 1) % entries.length;
      if (triggerKey) {
        lastCaseTriggerKey[caseId] = triggerKey;
      }
      lastPickedCaseUrl[caseId] = primed;
    }
    return primed;
  }

  if (triggerKey && triggerKey === lastCaseTriggerKey[caseId]) {
    const prev = lastPickedCaseUrl[caseId];
    if (prev && entries.some((e) => e.url === prev)) {
      return prev;
    }
  }

  // Note: For single-slot cases, `case:<caseId>` is already gated at commentary creation time
  // (`canPlayCaseInGame`), so only enforce separate sub-slot quotas when multiple slots are used.
  const allowed =
    isStudioPreview || !hasMultiSlots
      ? entries
      : entries.filter((e) =>
          e.isSecondary
            ? canPlayVideoSlotInGame(e.slotId, map)
            : getVideoSlotMaxPlays(`${e.slotId}_primary`, map) !== null
              ? canPlayVideoSlotInGame(`${e.slotId}_primary`, map)
              : true,
        );

  if (allowed.length === 0) return null;

  if (allowed.length === 1) {
    const only = allowed[0];
    if (caseId === 'seduction') {
      applySeductionSlotAudioForKey(only.key, map);
    }
    if (triggerKey && triggerKey !== lastCaseTriggerKey[caseId]) {
      lastCaseTriggerKey[caseId] = triggerKey;
      if (!isStudioPreview && hasMultiSlots) {
        recordVideoSlotPlayInGame(only.isSecondary ? only.slotId : `${only.slotId}_primary`);
      }
    }
    lastPickedCaseUrl[caseId] = only.url;
    return only.url;
  }

  const cursor = caseRotationCursor[caseId] ?? 0;
  const idx = cursor % allowed.length;
  const chosen = allowed[idx];
  caseRotationCursor[caseId] = (idx + 1) % allowed.length;
  if (caseId === 'seduction') {
    applySeductionSlotAudioForKey(chosen.key, map);
  }
  if (triggerKey) {
    lastCaseTriggerKey[caseId] = triggerKey;
  }
  if (!isStudioPreview && hasMultiSlots) {
    recordVideoSlotPlayInGame(chosen.isSecondary ? chosen.slotId : `${chosen.slotId}_primary`);
  }
  lastPickedCaseUrl[caseId] = chosen.url;
  return chosen.url;
}

/**
 * Resolves the silent 3:4 portrait video to play while Chess Angel is delivering `clipId`,
 * or returns `null` when that saying/group is configured to stay in Idle / Quiet Listening (no lip-sync).
 * Priority:
 *   1. Custom uploaded per-saying .mp4 (`#1` / `#2` alternating per `triggerKey` when 2 slots are attached)
 *   2. Per-saying Lip-Sync toggle ('on' -> Default Lip-Sync unless built-in case exists; 'off' -> Idle Only)
 *   3. Built-in per-saying .mp4
 *   4. Custom / built-in per-group .mp4
 *   5. Per-group Lip-Sync toggle ('on' -> Default Lip-Sync, 'off' -> Idle Only)
 *   6. Global Default Lip-Sync fallback (true -> Default Lip-Sync, false -> Idle Only)
 */
export function resolveAngelSpeakingVideo(
  clipId?: VoiceClipId | null,
  triggerKey?: string,
): string | null {
  const defaultSpeakSrc = resolveDefaultSpeakingLipVideo();
  const lip = runtimeOverrides.lipSync || { defaultEnabled: true, groups: {}, cases: {} };
  const caseId = extractCaseIdFromClip(clipId);

  if (caseId) {
    const runtimeCase = pickCaseVideoFromPool(caseId, runtimeOverrides, triggerKey);
    if (runtimeCase) return runtimeCase;

    const staticCase = ANGEL_CASE_VIDEO_MAP[caseId];
    const caseLipRule = lip.cases[caseId];

    if (staticCase) {
      // Built-in clip plays unless user explicitly cleared custom clip and forced Idle Only / Lip-Sync ON
      if (caseLipRule === 'off') return null;
      if (caseLipRule === 'on') return defaultSpeakSrc;
      return staticCase;
    }

    if (caseLipRule === 'off') return null;
    if (caseLipRule === 'on') return defaultSpeakSrc;

    const group = CASE_TO_GROUP[caseId];
    if (group) {
      const groupSlotId = `group:${group}`;
      const isPreview = Boolean(triggerKey?.startsWith('preview:'));
      const runtimeGroup = runtimeOverrides.groups[group];
      const staticGroup = ANGEL_GROUP_VIDEO_MAP[group];
      const candidateGroupUrl = runtimeGroup || staticGroup;
      if (candidateGroupUrl) {
        const sameTrigger = Boolean(triggerKey && triggerKey === lastGroupTriggerKey[group]);
        if (isPreview || sameTrigger || canPlayVideoSlotInGame(groupSlotId)) {
          if (triggerKey && !sameTrigger) {
            lastGroupTriggerKey[group] = triggerKey;
            if (!isPreview) {
              recordVideoSlotPlayInGame(groupSlotId);
            }
          }
          return candidateGroupUrl;
        }
      }

      const groupLipRule = lip.groups[group];
      if (groupLipRule === 'off') return null;
      if (groupLipRule === 'on') return defaultSpeakSrc;
    }
  }

  return lip.defaultEnabled !== false ? defaultSpeakSrc : null;
}

