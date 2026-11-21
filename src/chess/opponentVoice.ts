import { Chess, type PieceSymbol, type Square } from 'chess.js';
import type { AnalysisSnapshot, MoveRecord, PieceColor } from '../shared/types';

export type OpponentVoiceGender = 'female' | 'male' | 'off';

export type CommentaryTone =
  | 'checkmate'
  | 'check'
  | 'warning'
  | 'threat'
  | 'capture'
  | 'opening'
  | 'neutral';

export type VoiceClipId =
  | 'intro'
  | 'checkmate_win_1'
  | 'checkmate_win_2'
  | 'checkmate_win_3'
  | 'checkmate_lose_1'
  | 'checkmate_lose_2'
  | 'stalemate'
  | 'draw'
  | 'check_knight'
  | 'check_queen'
  | 'check_1'
  | 'check_2'
  | 'player_check_1'
  | 'player_check_2'
  | 'warn_mate_1'
  | 'warn_mate_2'
  | 'warn_mate_3'
  | 'warn_double_1'
  | 'warn_double_2'
  | 'watch_queen_1'
  | 'watch_queen_2'
  | 'watch_rook'
  | 'watch_bishop'
  | 'watch_knight'
  | 'blunder_queen'
  | 'warn_fork_2step'
  | 'warn_pawn_promo'
  | 'warn_king_file'
  | 'promotion'
  | 'capture_queen'
  | 'capture_rook'
  | 'capture_minor'
  | 'lost_queen'
  | 'castled'
  | 'opening_1'
  | 'opening_2'
  | 'strategy_1'
  | 'strategy_2';

export interface OpponentMessage {
  id: number;
  clipId: VoiceClipId;
  text: string;
  tag: string;
  tone: CommentaryTone;
  speaker: string;
  gender: 'female' | 'male';
}

interface ClipEntry {
  clipId: VoiceClipId;
  text: string;
}

const CLIP_TEXT: Record<VoiceClipId, string> = {
  intro: 'Elena here. Watch your pieces, and think two steps ahead.',
  checkmate_win_1: 'Checkmate! Your King has nowhere left to run.',
  checkmate_win_2: 'Checkmate. That final trap closed completely.',
  checkmate_win_3: 'Checkmate! Every escape square is covered.',
  checkmate_lose_1: 'Checkmate. Well played! I walked right into your net.',
  checkmate_lose_2: 'Checkmate! You outcalculated me on that finish.',
  stalemate: 'Stalemate! Not a single legal square left.',
  draw: 'A draw on the board. Neither side gave an inch.',
  check_knight: 'Check from the Knight! Remember, you cannot block a jumping horse.',
  check_queen: 'Check from my Queen! Guard your King carefully.',
  check_1: 'Check! Better tend to your King right away.',
  check_2: 'Check! Think two steps ahead before you move that King.',
  player_check_1: 'Check on my King? Bold. Let me answer that.',
  player_check_2: 'A check! Alright, you have my full attention now.',
  warn_mate_1: 'Watch out! Think two steps ahead, or it is checkmate next move.',
  warn_mate_2: 'Careful now! Checkmate is only two steps away if you miss this.',
  warn_mate_3: 'Warning two steps ahead! Protect your King before the trap closes.',
  warn_double_1: 'Watch out! Two of your pieces are in danger at once.',
  warn_double_2: 'Careful! You are facing a double attack. You may not save both.',
  watch_queen_1: 'Watch your Queen! She is standing right in my sights.',
  watch_queen_2: 'Careful with your Queen! Leave her there and she is mine.',
  watch_rook: 'Watch your Rook! It is looking very exposed.',
  watch_bishop: 'Watch your Bishop! It is right in my crosshairs.',
  watch_knight: 'Watch your Knight! One step too slow and I take it.',
  blunder_queen: 'Wait… did you just leave your Queen wide open?',
  warn_fork_2step: 'Think two steps ahead! My pieces are eyeing a nasty fork next turn.',
  warn_pawn_promo: 'Watch out! This pawn is only steps away from becoming a Queen.',
  warn_king_file: 'Watch out along that file! My heavy pieces are lining up on your King.',
  promotion: 'A fresh Queen enters the board! Watch out now.',
  capture_queen: 'Your Queen is mine! That tilts the entire board.',
  capture_rook: 'I will gladly pocket that Rook. Watch your remaining defenses.',
  capture_minor: 'Cleanly captured! Stay sharp, your move.',
  lost_queen: 'You took my Queen! Watch out, I am not done yet.',
  castled: 'King tucked safely behind the pawns. Now the real battle begins.',
  opening_1: 'A classic opening. Remember to think two steps ahead.',
  opening_2: 'Good start. Watch the diagonals as the board opens up.',
  strategy_1: 'A quiet move, or is it? Look two steps ahead.',
  strategy_2: 'Careful. The quietest moves often hide the sharpest traps.',
};

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 100,
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

// Track recently played clips so the adversary stays varied and fresh
const recentClips: VoiceClipId[] = [];
let messageSeq = 1;

function pickFreshClip(candidates: VoiceClipId[]): ClipEntry {
  const unseen = candidates.filter((id) => !recentClips.includes(id));
  const pool = unseen.length > 0 ? unseen : candidates;
  const clipId = pool[Math.floor(Math.random() * pool.length)];
  recentClips.push(clipId);
  if (recentClips.length > 10) recentClips.shift();
  return { clipId, text: CLIP_TEXT[clipId] };
}

export function getSpeakerName(gender: 'female' | 'male'): string {
  return gender === 'female' ? 'Elena' : 'Viktor';
}

export function createIntroMessage(gender: 'female' | 'male'): OpponentMessage {
  const speaker = getSpeakerName(gender);
  const text =
    gender === 'female'
      ? 'Elena here. Watch your pieces, and think two steps ahead.'
      : 'Viktor here. Set the wood, and see if you can spot my threats two moves ahead.';
  return {
    id: messageSeq++,
    clipId: 'intro',
    text,
    tag: 'VOICE ACTIVE',
    tone: 'opening',
    speaker,
    gender,
  };
}

interface ThreatenedPiece {
  square: Square;
  type: PieceSymbol;
  value: number;
  undefended: boolean;
}

function countThreatenedValuables(
  chess: Chess,
  attacker: PieceColor,
  defender: PieceColor,
): ThreatenedPiece[] {
  const board = chess.board();
  const list: ThreatenedPiece[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      if (!cell || cell.color !== defender || cell.type === 'p' || cell.type === 'k') continue;
      const sq = `${FILES[c]}${8 - r}` as Square;
      if (chess.isAttacked(sq, attacker)) {
        const defended = chess.isAttacked(sq, defender);
        list.push({
          square: sq,
          type: cell.type,
          value: PIECE_VALUES[cell.type],
          undefended: !defended,
        });
      }
    }
  }
  list.sort((a, b) => {
    if (a.undefended !== b.undefended) return a.undefended ? -1 : 1;
    return b.value - a.value;
  });
  return list;
}

/**
 * Checks whether the adversary can deliver checkmate in 1 move if the player
 * makes a careless move (a true "watch out two steps ahead" mate threat!),
 * or if the adversary has a devastating Knight/Queen/Bishop fork one move away.
 */
function detectTwoStepThreats(
  fen: string,
  aiColor: PieceColor,
  humanColor: PieceColor,
): {
  hasMateThreat: boolean;
  hasForkPreview: boolean;
  passedPawnClose: boolean;
  openFileKingPressure: boolean;
} {
  let hasMateThreat = false;
  let hasForkPreview = false;
  let passedPawnClose = false;
  let openFileKingPressure = false;

  try {
    const parts = fen.split(' ');
    parts[1] = aiColor;
    parts[3] = '-';
    const aiTurnChess = new Chess(parts.join(' '));
    const aiMoves = aiTurnChess.moves({ verbose: true });

    for (const m of aiMoves) {
      aiTurnChess.move(m);
      if (aiTurnChess.isCheckmate()) {
        hasMateThreat = true;
        aiTurnChess.undo();
        break;
      }
      if (!hasForkPreview && (m.piece === 'n' || m.piece === 'q' || m.piece === 'b')) {
        const attackedValuables = countThreatenedValuables(aiTurnChess, aiColor, humanColor);
        if (attackedValuables.length >= 2) {
          hasForkPreview = true;
        }
      }
      aiTurnChess.undo();
    }
  } catch {
    // Hypothetical null-move FEN can be invalid when human is already in check — safely ignore
  }

  const chess = new Chess(fen);
  const board = chess.board();
  let humanKingFile = -1;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      if (!cell) continue;
      if (cell.type === 'k' && cell.color === humanColor) {
        humanKingFile = c;
      }
      if (cell.type === 'p' && cell.color === aiColor) {
        const rank = 8 - r;
        if ((aiColor === 'w' && rank >= 6) || (aiColor === 'b' && rank <= 3)) {
          passedPawnClose = true;
        }
      }
    }
  }

  if (humanKingFile >= 0) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = board[r][c];
        if (
          cell &&
          cell.color === aiColor &&
          (cell.type === 'r' || cell.type === 'q') &&
          Math.abs(c - humanKingFile) <= 1
        ) {
          openFileKingPressure = true;
        }
      }
    }
  }

  return { hasMateThreat, hasForkPreview, passedPawnClose, openFileKingPressure };
}

export interface ComposeContext {
  fen: string;
  lastMove: MoveRecord;
  aiColor: PieceColor;
  humanColor: PieceColor;
  plyCount: number;
  gender: 'female' | 'male';
  analysis: AnalysisSnapshot | null;
}

/**
 * Selects an integrated pre-recorded MP3 clip + matching caption based on
 * real board tactics: checkmate, check, 2-step mate/fork warnings, hanging
 * piece callouts ("Watch your Queen / Rook / Bishop / Knight!"), promotions,
 * captures, castling, and openings.
 */
export function composeOpponentMessage(ctx: ComposeContext): OpponentMessage | null {
  const { fen, lastMove, aiColor, humanColor, plyCount, gender, analysis } = ctx;
  const speaker = getSpeakerName(gender);
  const chess = new Chess(fen);
  const aiJustMoved = lastMove.color === aiColor;

  const make = (entry: ClipEntry, tag: string, tone: CommentaryTone): OpponentMessage => ({
    id: messageSeq++,
    clipId: entry.clipId,
    text: entry.text,
    tag,
    tone,
    speaker,
    gender,
  });

  // 1. CHECKMATE
  if (chess.isCheckmate()) {
    if (aiJustMoved) {
      return make(
        pickFreshClip(['checkmate_win_1', 'checkmate_win_2', 'checkmate_win_3']),
        'CHECKMATE',
        'checkmate',
      );
    }
    return make(
      pickFreshClip(['checkmate_lose_1', 'checkmate_lose_2']),
      'CHECKMATE',
      'checkmate',
    );
  }

  // 2. DRAW / STALEMATE
  if (chess.isStalemate()) {
    return make(pickFreshClip(['stalemate']), 'STALEMATE', 'neutral');
  }
  if (chess.isDraw()) {
    return make(pickFreshClip(['draw']), 'DRAW', 'neutral');
  }

  // 3. DIRECT CHECK
  if (chess.inCheck()) {
    if (aiJustMoved) {
      if (lastMove.piece === 'n') {
        return make(pickFreshClip(['check_knight']), 'CHECK', 'check');
      }
      if (lastMove.piece === 'q') {
        return make(pickFreshClip(['check_queen']), 'CHECK', 'check');
      }
      return make(pickFreshClip(['check_1', 'check_2']), 'CHECK', 'check');
    }
    return make(pickFreshClip(['player_check_1', 'player_check_2']), 'CHECK', 'check');
  }

  // Human-turn reactions (Queen capture or leaving Queen hanging)
  if (!aiJustMoved) {
    if (lastMove.captured === 'q') {
      return make(pickFreshClip(['lost_queen']), 'CAPTURE', 'capture');
    }
    const hangingQueens = countThreatenedValuables(chess, aiColor, humanColor).filter(
      (p) => p.type === 'q' && p.undefended,
    );
    if (hangingQueens.length > 0) {
      return make(pickFreshClip(['blunder_queen']), 'BLUNDER', 'warning');
    }
    return null;
  }

  // ===== AI JUST MOVED — SCAN REAL BOARD TACTICS =====
  const topLine = analysis?.lines[0];
  const aiSign = aiColor === 'w' ? 1 : -1;
  const aiMateIn =
    topLine?.mateIn != null && Math.sign(topLine.mateIn) === aiSign
      ? Math.abs(topLine.mateIn)
      : null;

  const twoStep = detectTwoStepThreats(fen, aiColor, humanColor);
  const threatenedHuman = countThreatenedValuables(chess, aiColor, humanColor);

  // 4. FORCED MATE OR DIRECT 2-STEP MATE THREAT
  if ((aiMateIn !== null && aiMateIn <= 3) || twoStep.hasMateThreat) {
    return make(
      pickFreshClip(['warn_mate_1', 'warn_mate_2', 'warn_mate_3']),
      '2-STEP WARNING',
      'warning',
    );
  }

  // 5. PROMOTION BY AI
  if (lastMove.promotion) {
    return make(pickFreshClip(['promotion']), 'PROMOTION', 'threat');
  }

  // 6. DOUBLE ATTACK / FORK WARNING
  if (threatenedHuman.length >= 2) {
    return make(
      pickFreshClip(['warn_double_1', 'warn_double_2']),
      'DOUBLE THREAT',
      'warning',
    );
  }

  // 7. DIRECT PIECE THREAT ("Watch your Queen / Rook / Bishop / Knight!")
  if (threatenedHuman.length === 1) {
    const target = threatenedHuman[0];
    if (target.type === 'q') {
      return make(
        pickFreshClip(['watch_queen_1', 'watch_queen_2']),
        'WATCH YOUR QUEEN',
        'threat',
      );
    }
    if (target.undefended || target.value >= 5) {
      if (target.type === 'r') {
        return make(pickFreshClip(['watch_rook']), 'WATCH YOUR ROOK', 'threat');
      }
      if (target.type === 'b') {
        return make(pickFreshClip(['watch_bishop']), 'WATCH YOUR BISHOP', 'threat');
      }
      if (target.type === 'n') {
        return make(pickFreshClip(['watch_knight']), 'WATCH YOUR KNIGHT', 'threat');
      }
    }
  }

  // 8. TWO-STEP TACTICAL LOOKAHEAD WARNINGS
  if (twoStep.hasForkPreview && Math.random() < 0.72) {
    return make(pickFreshClip(['warn_fork_2step']), '2-STEP WARNING', 'warning');
  }

  if (twoStep.passedPawnClose && lastMove.piece === 'p') {
    return make(pickFreshClip(['warn_pawn_promo']), 'PROMOTION THREAT', 'warning');
  }

  // 9. CAPTURE BY AI
  if (lastMove.captured) {
    if (lastMove.captured === 'q') {
      return make(pickFreshClip(['capture_queen']), 'QUEEN CAPTURED', 'capture');
    }
    if (lastMove.captured === 'r') {
      return make(pickFreshClip(['capture_rook']), 'CAPTURE', 'capture');
    }
    if (lastMove.captured === 'n' || lastMove.captured === 'b') {
      return make(pickFreshClip(['capture_minor']), 'CAPTURE', 'capture');
    }
  }

  // 10. CASTLING
  if (lastMove.san === 'O-O' || lastMove.san === 'O-O-O') {
    return make(pickFreshClip(['castled']), 'CASTLED', 'opening');
  }

  // 11. OPENING REMARKS
  if (plyCount <= 4) {
    return make(pickFreshClip(['opening_1', 'opening_2']), 'OPENING', 'opening');
  }

  // 12. KING PRESSURE OR QUIET STRATEGY
  if (twoStep.openFileKingPressure && Math.random() < 0.5) {
    return make(pickFreshClip(['warn_king_file']), 'PRESSURE', 'warning');
  }

  if (Math.random() < 0.35) {
    return make(pickFreshClip(['strategy_1', 'strategy_2']), 'STRATEGY', 'neutral');
  }

  return null;
}

export type VoicePlaybackState = 'idle' | 'speaking';

type StateListener = (state: VoicePlaybackState) => void;

/**
 * 100% self-contained integrated MP3 voice player.
 * Loads pre-recorded studio MP3 clips bundled directly inside /public/voices/{female|male}/*.mp3
 * and decodes/plays them through a user-unlocked Web Audio AudioContext (with instant in-memory
 * buffer caching and HTMLAudioElement fallback). Zero external AI APIs, zero OS voice drivers.
 */
class OpponentSpeechController {
  private audioCtx: AudioContext | null = null;
  private activeSource: AudioBufferSourceNode | null = null;
  private activeHtmlAudio: HTMLAudioElement | null = null;
  private activeAbort: AbortController | null = null;
  private bufferCache = new Map<string, AudioBuffer>();
  private speakSeq = 0;

  private playbackState: VoicePlaybackState = 'idle';
  private listeners = new Set<StateListener>();

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.playbackState);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setPlaybackState(next: VoicePlaybackState): void {
    if (this.playbackState === next) return;
    this.playbackState = next;
    for (const fn of this.listeners) {
      fn(next);
    }
  }

  private ensureAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      this.audioCtx = new Ctx();
    }
    if (this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  /**
   * Unlocks the shared Web AudioContext inside any user pointer/key gesture so
   * integrated MP3 voice lines play immediately after AI moves inside iframes.
   */
  public unlock(): void {
    const ctx = this.ensureAudioContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
    if (ctx && ctx.state === 'running') {
      try {
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
      } catch {
        // ignore
      }
    }
  }

  private stopActivePlayback(): void {
    if (this.activeAbort) {
      this.activeAbort.abort();
      this.activeAbort = null;
    }
    if (this.activeSource) {
      try {
        this.activeSource.onended = null;
        this.activeSource.stop();
        this.activeSource.disconnect();
      } catch {
        // already stopped
      }
      this.activeSource = null;
    }
    if (this.activeHtmlAudio) {
      try {
        this.activeHtmlAudio.pause();
        this.activeHtmlAudio.currentTime = 0;
      } catch {
        // ignore
      }
      this.activeHtmlAudio = null;
    }
  }

  private async playDecodedBuffer(buffer: AudioBuffer, seq: number): Promise<boolean> {
    if (seq !== this.speakSeq) return false;
    const ctx = this.ensureAudioContext();
    if (!ctx) return false;

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        return false;
      }
    }
    if (seq !== this.speakSeq) return false;

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(1.0, ctx.currentTime);
    source.connect(gain);
    gain.connect(ctx.destination);

    source.onended = () => {
      if (this.activeSource === source) {
        this.activeSource = null;
        if (seq === this.speakSeq) {
          this.setPlaybackState('idle');
        }
      }
    };

    this.activeSource = source;
    this.setPlaybackState('speaking');
    source.start(0);
    return true;
  }

  private async playViaHtmlAudio(url: string, seq: number): Promise<void> {
    if (seq !== this.speakSeq) return;
    const audio = new Audio(url);
    audio.volume = 1.0;
    this.activeHtmlAudio = audio;

    audio.onended = () => {
      if (this.activeHtmlAudio === audio) {
        this.activeHtmlAudio = null;
        if (seq === this.speakSeq) {
          this.setPlaybackState('idle');
        }
      }
    };
    audio.onerror = () => {
      if (this.activeHtmlAudio === audio) {
        this.activeHtmlAudio = null;
        if (seq === this.speakSeq) {
          this.setPlaybackState('idle');
        }
      }
    };

    try {
      this.setPlaybackState('speaking');
      await audio.play();
    } catch {
      if (this.activeHtmlAudio === audio) {
        this.activeHtmlAudio = null;
      }
      if (seq === this.speakSeq) {
        this.setPlaybackState('idle');
      }
    }
  }

  public playClip(
    clipId: VoiceClipId,
    gender: OpponentVoiceGender,
    soundEnabled: boolean,
  ): void {
    if (!soundEnabled || gender === 'off') return;

    this.stopActivePlayback();
    const seq = ++this.speakSeq;
    const url = `/voices/${gender}/${clipId}.mp3`;

    // Ensure AudioContext is unlocked/resumed synchronously when triggered by a click
    const ctx = this.ensureAudioContext();

    const cached = this.bufferCache.get(url);
    if (cached && ctx) {
      void this.playDecodedBuffer(cached, seq);
      return;
    }

    const controller = new AbortController();
    this.activeAbort = controller;

    void (async () => {
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (seq !== this.speakSeq || !res.ok) return;
        const mp3Bytes = await res.arrayBuffer();
        if (seq !== this.speakSeq || mp3Bytes.byteLength < 128) return;

        const audioCtx = this.ensureAudioContext();
        if (audioCtx) {
          try {
            const decoded = await audioCtx.decodeAudioData(mp3Bytes.slice(0));
            if (seq !== this.speakSeq) return;
            this.bufferCache.set(url, decoded);
            const played = await this.playDecodedBuffer(decoded, seq);
            if (played) return;
          } catch {
            // Fall back to direct HTMLAudioElement playback
          }
        }
        await this.playViaHtmlAudio(url, seq);
      } catch {
        if (!controller.signal.aborted && seq === this.speakSeq) {
          this.setPlaybackState('idle');
        }
      } finally {
        if (this.activeAbort === controller) {
          this.activeAbort = null;
        }
      }
    })();
  }

  public stop(): void {
    this.speakSeq++;
    this.stopActivePlayback();
    this.setPlaybackState('idle');
  }
}

export const opponentSpeech = new OpponentSpeechController();
