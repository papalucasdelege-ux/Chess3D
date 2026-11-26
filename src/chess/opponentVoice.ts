import { Chess, type PieceSymbol, type Square } from 'chess.js';
import { APP_BUILD_ID, stripAssetQuery, withAssetBuildVersion } from './assetVersion';
import type { HumanMoveAudit } from './engine';
import {
  ENGINE_LEVELS,
  type AnalysisSnapshot,
  type BotSearchReport,
  type EngineLevel,
  type GameMode,
  type MoveRecord,
  type PieceColor,
} from '../shared/types';

export type AngelVoiceMode = 'on' | 'off';

export type CommentaryTone =
  | 'checkmate'
  | 'check'
  | 'warning'
  | 'threat'
  | 'capture'
  | 'math'
  | 'hint'
  | 'opening'
  | 'neutral';

export type CommentaryCaseId =
  | 'intro'
  | 'checkmate_win'
  | 'checkmate_lose'
  | 'stalemate'
  | 'draw'
  | 'check_knight'
  | 'check_queen'
  | 'check_general'
  | 'player_check'
  | 'calc_offer'
  | 'calc_showing'
  | 'calc_pure'
  | 'wrong_hang_queen'
  | 'wrong_hang_rook'
  | 'wrong_hang_minor'
  | 'wrong_walk_mate'
  | 'wrong_missed_tactic'
  | 'wrong_positional'
  | 'wrong_better_alt'
  | 'undo_done'
  | 'alt_shown'
  | 'hesitate_hint'
  | 'hint_shown'
  | 'warn_mate'
  | 'warn_double'
  | 'warn_fork_2step'
  | 'warn_pawn_promo'
  | 'warn_king_file'
  | 'watch_queen'
  | 'watch_rook'
  | 'watch_bishop'
  | 'watch_knight'
  | 'promotion'
  | 'capture_queen'
  | 'capture_rook'
  | 'capture_minor'
  | 'lost_queen'
  | 'castled'
  | 'opening'
  | 'trial_confirm_1'
  | 'trial_confirm_2'
  | 'wrong_distracted'
  | 'tree_browse'
  | 'seduction'
  | 'new_match'
  | 'resign'
  | 'save_game'
  | 'load_game'
  | 'level_beginner'
  | 'level_intermediate'
  | 'level_advanced'
  | 'level_master'
  | 'level_grandmaster'
  | 'clock_timeout'
  | 'angel_modal_on'
  | 'angel_modal_off'
  | 'thank_jan'
  | 'ask_promotion';

export type ExtendedSequentialClipId =
  | `hesitate_hint_${'v4' | 'v5' | 'v6'}`
  | `tree_browse_${'v4' | 'v5' | 'v6'}`;

export type VoiceClipId =
  | `${CommentaryCaseId}_${'v1' | 'v2' | 'v3'}`
  | ExtendedSequentialClipId;

export type AngelInteractiveAction =
  | {
      kind: 'calc-preview';
      report: BotSearchReport;
    }
  | {
      kind: 'undo-offer';
      preFen: string;
      reasonNote: string;
      alternatives: { uci: string; san: string }[];
      isSevereDistraction?: boolean;
    }
  | {
      kind: 'hint-offer';
      bestMoveUci: string;
      bestMoveSan: string;
    };

export interface SpeechFigureHighlight {
  square: string;
  role: 'danger' | 'attacker';
}

export interface OpponentMessage {
  id: number;
  clipId: VoiceClipId;
  text: string;
  tag: string;
  tone: CommentaryTone;
  speaker: string;
  mathSummary?: string;
  action?: AngelInteractiveAction;
  isStudioPreview?: boolean;
  concernedFigures?: SpeechFigureHighlight[];
  forkArrows?: { from: string; to: string }[];
}

interface ClipEntry {
  clipId: VoiceClipId;
  text: string;
}

export const CLIP_TEXT: Record<VoiceClipId, string> = {
  // 1. Intro / Greeting
  intro_v1:
    'Hi there... I am your Chess Angel, exploring thousands of possibilities with you on every move. Ready whenever you are.',
  intro_v2:
    'Again, welcome back... your Chess Angel is ready whenever you want to make the first move.',
  intro_v3:
    'Here we go again... make your move whenever you are ready.',

  // 2. Checkmate (Chess Angel wins)
  checkmate_win_v1:
    'Checkmate... every last escape square around your King is gently sealed.',
  checkmate_win_v2:
    'Again, checkmate... every branch on the board led right to your King.',
  checkmate_win_v3:
    'Checkmate once more... nowhere left for your King to step.',

  // 3. Checkmate (Player wins)
  checkmate_lose_v1:
    'Checkmate! Oh, bravo... you found a beautiful winning combination.',
  checkmate_lose_v2:
    'Checkmate again! Truly well played, you outcalculated every defense I had.',
  checkmate_lose_v3:
    'Another checkmate for you... crisp, fearless, and wonderfully played.',

  // 4. Stalemate
  stalemate_v1:
    'Stalemate... zero legal moves and no check at all, so we share the point.',
  stalemate_v2:
    'Again, stalemate... no legal moves left, a clean tie on the board.',
  stalemate_v3:
    'Stalemate once again... completely locked in balance.',

  // 5. Draw
  draw_v1:
    'A draw on the board... complete harmony between both sides today.',
  draw_v2:
    'As it stands, another draw... neither side gave an inch.',
  draw_v3:
    'Drawn again... a calm, even finish for both of us.',

  // 6. Knight Check
  check_knight_v1:
    'Check from my Knight... remember, you cannot block a jumping Knight.',
  check_knight_v2:
    'As I said, you cannot block a Knight... check to your King.',
  check_knight_v3:
    'Again, Knight check... move your King or capture the Knight.',

  // 7. Queen Check
  check_queen_v1:
    'Check from my Queen... step very carefully with your King.',
  check_queen_v2:
    'Again, check from my Queen... choose your safe square carefully.',
  check_queen_v3:
    'Queen check once more... watch every diagonal around your King.',

  // 8. General Check
  check_general_v1:
    'Check... better protect your King right away.',
  check_general_v2:
    'Again, check... look two steps ahead before choosing your escape square.',
  check_general_v3:
    'As I said, keep your King safe... check!',

  // 9. Player Checks Chess Angel
  player_check_v1:
    'Ooh, checking my King? Bold choice... let me answer that.',
  player_check_v2:
    'Again with a check? Alright, you have my full attention.',
  player_check_v3:
    'Another check on my King... sharp eyes, let me step out of danger.',

  // 10. Offer to Show 3 Calculated Lines
  calc_offer_v1:
    'Mmm... I just explored thousands of positions and tested three tempting lines before choosing this move. Would you like to see what I tried out?',
  calc_offer_v2:
    'Again, I tested three sharp variations across my search tree just now. Want to see them on the board?',
  calc_offer_v3:
    'Three more candidate branches explored... tell me if you want a quick look.',

  // 11. Showing the 3 Calculated Lines
  calc_showing_v1:
    'Watch closely... here are the three branches I tested, each marked with its own colored arrow.',
  calc_showing_v2:
    'As I said, watch the three colored arrows... here is what I tried out.',
  calc_showing_v3:
    'Again, here are the three lines I explored, one color for each trial.',

  // 12. General Deep Search / Positional Calculation
  calc_pure_v1:
    'Thousands of quiet variations flowed through my search tree, and they all pointed to this square.',
  calc_pure_v2:
    'Again, every deep branch in my calculation favored this exact continuation.',
  calc_pure_v3:
    'Clean and steady... this square keeps all my best lines alive.',

  // 13. Player Leaves Queen Undefended
  wrong_hang_queen_v1:
    'Oh no... were you not paying attention? You just left your Queen completely undefended! Would you like to undo your last move?',
  wrong_hang_queen_v2:
    'Again, watch your Queen! That move leaves her wide open... want to undo it?',
  wrong_hang_queen_v3:
    'As I said, keep an eye on your Queen... she is undefended! Undo if you want a safer move.',

  // 14. Player Leaves Rook Undefended
  wrong_hang_rook_v1:
    'Wait a second... that move leaves your Rook wide open. Were your thoughts wandering? Tell me if you would like to undo your last move.',
  wrong_hang_rook_v2:
    'As I said, watch your Rooks... this one is completely undefended now. Want to undo?',
  wrong_hang_rook_v3:
    'Again, your Rook is hanging for free... touch Undo if you want that move back.',

  // 15. Player Leaves Minor Piece Undefended
  wrong_hang_minor_v1:
    'Careful there... you just left a piece undefended for free. Want to undo your last move so I can show you a stronger choice?',
  wrong_hang_minor_v2:
    'Again, you left a piece unguarded... would you like to undo and see a safer square?',
  wrong_hang_minor_v3:
    'As I said, check your piece protection... that one is hanging. Undo if you like.',

  // 16. Player Walks Into Forced Mate
  wrong_walk_mate_v1:
    'Oh my... were you not paying attention just now? That move walks straight into forced checkmate. Would you like to undo it?',
  wrong_walk_mate_v2:
    'Again, careful! That steps right into a checkmate net... want to undo it first?',
  wrong_walk_mate_v3:
    'As I said, watch your King safety... that allows forced mate! Undo right away if you want.',

  // 17. Player Misses a Tactical Strike
  wrong_missed_tactic_v1:
    'Hmm... the evaluation just swung sharply my way because you missed a much stronger tactical strike. Want to undo your last move and see it?',
  wrong_missed_tactic_v2:
    'Again, there was a sharp tactical shot waiting for you there... want to undo and spot it?',
  wrong_missed_tactic_v3:
    'You missed a lovely tactic just now... undo if you want to play the winning line.',

  // 18. Player Makes a Positional Mistake
  wrong_positional_v1:
    'That move loosens your position and hands me the initiative. Were you distracted, or would you like to undo for a stronger alternative?',
  wrong_positional_v2:
    'As I said, careful with loose moves... that gives away your edge. Want to undo?',
  wrong_positional_v3:
    'Again, a much steadier move was available... undo if you want to see it.',

  // 19. Player Misses a Cleaner Continuation
  wrong_better_alt_v1:
    'Hmm... there was a much cleaner continuation on the board than that. Would you like to undo your last move and see the better alternative?',
  wrong_better_alt_v2:
    'Again, a cleaner continuation was right there... want to undo and try the stronger line?',
  wrong_better_alt_v3:
    'There was a simpler, stronger move here... touch Undo if you want to see it.',

  // 20. Undo Confirmed
  undo_done_v1:
    'There we go... let us rewind that. Follow the flat arrow on the board, that is the stronger move you were looking for.',
  undo_done_v2:
    'Rewound again... just follow the highlighted arrow on the board.',
  undo_done_v3:
    'As I said, no worries... take it back and check the arrow.',

  // 21. Keep Move & Show Stronger Alternative
  alt_shown_v1:
    'Look at the highlighted arrow on the board... my search tree rates that alternative much higher for you.',
  alt_shown_v2:
    'Again, check the flat arrow... that was the stronger option here.',
  alt_shown_v3:
    'Right there on the arrow... keep that idea in mind for next turn.',

  // 22. Player Hesitates -> Offer Hint (6 sequential shorter stages, then stops asking)
  hesitate_hint_v1:
    'Taking your time? I can see you hesitating... I spot a lovely idea for you. Touch Show Hint if you want me to light it up.',
  hesitate_hint_v2:
    'Hesitating again? As I said, just touch Show Hint whenever you want a gentle nudge.',
  hesitate_hint_v3:
    'Still thinking deeply? Touch Show Hint if you want me to point out my top candidate.',
  hesitate_hint_v4:
    'Just touch Show Hint whenever you want a gentle nudge.',
  hesitate_hint_v5:
    'Make your move whenever you are ready.',
  hesitate_hint_v6:
    'Ready whenever you are.',

  // 23. Hint Shown on Board
  hint_shown_v1:
    'Here is a little clue from my search tree... follow the flat arrow on the board.',
  hint_shown_v2:
    'As I said, follow the arrow on the board... that is your cleanest move.',
  hint_shown_v3:
    'Again, right along that arrow... a very strong square for you.',

  // 24. Two-Step Mate Threat Warning
  warn_mate_v1:
    'Watch out... look two steps ahead, or I have checkmate on the very next turn.',
  warn_mate_v2:
    'As I said, watch your King closely... checkmate is right around the corner.',
  warn_mate_v3:
    'Again, mate is threatened... defend your King right now.',

  // 25. Double Threat Warning
  warn_double_v1:
    'Ooh, careful... two of your pieces are caught in my sights at once.',
  warn_double_v2:
    'Again, a double attack... two of your pieces are under fire.',
  warn_double_v3:
    'Watch out... another double threat on two pieces at once.',

  // 26. Two-Step Fork Warning
  warn_fork_2step_v1:
    'Think two steps ahead... my pieces are lining up a sneaky fork on the next turn.',
  warn_fork_2step_v2:
    'As I said, look two moves ahead... a fork is brewing.',
  warn_fork_2step_v3:
    'Again, watch for the fork on my next turn.',

  // 27. Passed Pawn Close to Promotion
  warn_pawn_promo_v1:
    'Watch this little pawn... only a few steps left before she promotes into a new Queen.',
  warn_pawn_promo_v2:
    'As I said, keep watching that passed pawn... she is almost at the eighth rank.',
  warn_pawn_promo_v3:
    'Again, my passed pawn is marching closer to a new Queen.',

  // 28. Open File Pressure on King
  warn_king_file_v1:
    'Feel that pressure along your King file? My heavy pieces are lining up.',
  warn_king_file_v2:
    'As I said, watch that open file toward your King.',
  warn_king_file_v3:
    'Again, heavy pressure building straight down your King file.',

  // 29. Direct Threat on Player's Queen
  watch_queen_v1:
    'Watch your Queen... she is standing right in my line of fire.',
  watch_queen_v2:
    'As I said, careful with your Queen... I am attacking her.',
  watch_queen_v3:
    'Again, eyes on your Queen... she is targeted right now.',

  // 30. Direct Threat on Player's Rook
  watch_rook_v1:
    'Watch your Rook... it is looking dangerously exposed right now.',
  watch_rook_v2:
    'Again, watch your Rook... my piece has it targeted.',
  watch_rook_v3:
    'As I said, protect that Rook before you lose it.',

  // 31. Direct Threat on Player's Bishop
  watch_bishop_v1:
    'Careful with your Bishop... my pieces have it targeted.',
  watch_bishop_v2:
    'As I said, watch your Bishop... it is under attack.',
  watch_bishop_v3:
    'Again, your Bishop is in danger on that square.',

  // 32. Direct Threat on Player's Knight
  watch_knight_v1:
    'Watch your Knight... one slow move and I will capture it.',
  watch_knight_v2:
    'Again, careful with your Knight... it is under attack right now.',
  watch_knight_v3:
    'As I said, save your Knight before my next move.',

  // 33. Pawn Promotion
  promotion_v1:
    'Ooh, a brand new Queen joins the board... things just got much trickier for your King.',
  promotion_v2:
    'Again, another pawn promotes to a Queen!',
  promotion_v3:
    'A new Queen once more... watch your King closely now.',

  // 34. Captured Player's Queen
  capture_queen_v1:
    'Your Queen is mine... that tilts the entire board in my favor.',
  capture_queen_v2:
    'Again, I take your Queen... a huge swing on the board.',
  capture_queen_v3:
    'Queen captured... now the endgame leans strongly my way.',

  // 35. Captured Player's Rook
  capture_rook_v1:
    'I will happily take that Rook... keep a close eye on your remaining defenses.',
  capture_rook_v2:
    'Again, another Rook captured... tighten up your defense.',
  capture_rook_v3:
    'Rook off the board... your turn to respond.',

  // 36. Captured Minor Piece
  capture_minor_v1:
    'Cleanly captured... your turn to move.',
  capture_minor_v2:
    'Again, a clean capture... over to you.',
  capture_minor_v3:
    'Piece taken... your move.',

  // 37. Player Captured Chess Angel's Queen
  lost_queen_v1:
    'Ooh, you captured my Queen! Very clever... let us see if my remaining pieces can still outplay you.',
  lost_queen_v2:
    'My Queen again? Sharp tactics... I will have to fight extra resourcefully now.',
  lost_queen_v3:
    'You got my Queen... nicely spotted, play on!',

  // 38. Castled
  castled_v1:
    'My King is tucked safely away... now I can focus purely on the attack.',
  castled_v2:
    'Castled again... safe King, active Rook.',
  castled_v3:
    'As I like to play it, King tucked safe first... your move.',

  // 39. Opening Move
  opening_v1:
    'Ooh, a classic opening... thousands of bright possibilities are already unfolding between us.',
  opening_v2:
    'Lovely start again... watch the center squares open up.',
  opening_v3:
    'Fresh board, clean diagonals... let us see where this game leads.',

  // 40. Confirm Branch 1 Seen & Understood Before Playing Branch 2
  trial_confirm_1_v1:
    'Have you seen and understood this first branch? Click to confirm whenever you are ready, and I will play the second one.',
  trial_confirm_1_v2:
    'As I said, click to confirm once you have seen and understood this first line, and I will show you the next.',
  trial_confirm_1_v3:
    'First branch shown... click to confirm when you are ready for the second.',

  // 41. Confirm Branch 2 Seen & Understood Before Playing Branch 3
  trial_confirm_2_v1:
    'Have you seen and understood that second branch too? Click to confirm when you are ready, and I will play the third one.',
  trial_confirm_2_v2:
    'Again, click to confirm once you have seen and understood this second line, and I will show the third.',
  trial_confirm_2_v3:
    'Second branch complete... click to confirm and I will play the third.',

  // 42. Player Makes a Very Bad Move Almost by Distraction -> Chess Angel Undo Modal
  wrong_distracted_v1:
    'Well, you were not concentrated there... Try to be more focused! Do you want us to replay the last one? Then click the Undo button, please.',
  wrong_distracted_v2:
    'Again, you were not concentrated there... Try to stay focused! If you want us to replay the last one, click the Undo button, please.',
  wrong_distracted_v3:
    'As I said, stay focused... you lost concentration there! Click the Undo button, please, if you want to replay that last move.',

  // 43. Full Search Tree Shown -> 6 sequential shorter stages, then does not repeat anymore
  tree_browse_v1:
    "Don't be shocked, I am a computer... if you want, you can now browse through all my simulations one by one before we go on... or if you want to, you can see only my three best evaluations by clicking on the button.",
  tree_browse_v2:
    "As I said, don't be shocked that I am a computer... feel free to browse calmly through all my simulations one by one before we go on, or click the button to see only my three best evaluations.",
  tree_browse_v3:
    'Again, browse calmly through all my simulations one by one before we go on, or click the button to see only my three best evaluations.',
  tree_browse_v4:
    'Feel free to browse calmly through all my simulations one by one before we go on.',
  tree_browse_v5:
    'Three more candidate branches explored.',
  tree_browse_v6:
    'Watch closely.',

  // 44. Special Seduction / Distraction Video when the Player Plays Too Well (uses separated seduction.mp3)
  seduction_v1:
    'Oh, bravo... Very clever... Alright, you have my full attention.',
  seduction_v2:
    'Again, such sharp chess... you are making it hard for me to look away.',
  seduction_v3:
    'Three brilliant strokes in a row... careful, you might actually distract your Chess Angel.',

  // 45. New Match Button
  new_match_v1:
    'A brand new match... all thirty-two pieces are back home, and I am ready whenever you want to make the first move.',
  new_match_v2:
    'Fresh board again... I have reset every piece and clock for you. Play whenever you are ready.',
  new_match_v3:
    'New match ready... over to you for the opening move.',

  // 46. Resign Button
  resign_v1:
    'You clicked the Resign button... thank you for playing this game with me. Click the New Match button whenever you would like a rematch.',
  resign_v2:
    'Resigning this one? Well fought... touch the New Match button whenever you want to play me again.',
  resign_v3:
    'Game resigned... I enjoyed every move with you. Ready whenever you want a fresh start.',

  // 47. Save Button
  save_game_v1:
    'Game saved... I have tucked every piece and clock second safely away for you. Click the Load button anytime you want to continue.',
  save_game_v2:
    'Saved again... I am keeping this exact board position safe for you whenever you return.',
  save_game_v3:
    'Position saved safely... we can pick right back up anytime you like.',

  // 48. Load Button
  load_game_v1:
    'Opening your saved games... pick any match you saved with me, or click the Load button on a game to jump right back in.',
  load_game_v2:
    'Back to your saved games... choose whichever board position you want me to restore for you.',
  load_game_v3:
    'Saved games ready... pick a match and let us continue right where we left off.',

  // 49. Thinking Level: Beginner (800 Elo)
  level_beginner_v1:
    'Beginner level selected... I will keep my search gentle and shallow so you can explore the board at a relaxed pace.',
  level_beginner_v2:
    'Back to Beginner level... I will play gently with you and leave plenty of room to experiment.',
  level_beginner_v3:
    'Beginner eight hundred ready... nice and gentle from me.',

  // 50. Thinking Level: Club / Intermediate (1200 Elo)
  level_intermediate_v1:
    'Club level selected... I am balancing my search tree for a lively, friendly tactical game with you.',
  level_intermediate_v2:
    'Club twelve hundred again... expect steady, classic club tactics from me.',
  level_intermediate_v3:
    'Club level ready... let us play a balanced, spirited game.',

  // 51. Thinking Level: Candidate / Advanced (1600 Elo)
  level_advanced_v1:
    'Candidate level selected... I am sharpening my multi-branch search now, so watch out for tactical combinations from me.',
  level_advanced_v2:
    'Candidate sixteen hundred again... my tactical eyes are sharp, so guard your pieces carefully.',
  level_advanced_v3:
    'Candidate level active... sharp multi-branch search ready for you.',

  // 52. Thinking Level: Master (2000 Elo)
  level_master_v1:
    'Master level activated... I will calculate much deeper positional and tactical lines against you on every turn now.',
  level_master_v2:
    'Master two thousand again... I am looking many moves ahead now, so stay focused.',
  level_master_v3:
    'Master strength ready... deep positional calculation engaged.',

  // 53. Thinking Level: Grandmaster (2400 Elo)
  level_grandmaster_v1:
    'Grandmaster level... my full search tree and deepest evaluations are wide awake now. Show me your very best chess!',
  level_grandmaster_v2:
    'Grandmaster twenty-four hundred again... I am holding nothing back in my search tree. Good luck to you!',
  level_grandmaster_v3:
    'Full Grandmaster strength... bring me your sharpest game!',

  // 54. Chess Clock Time Over (Timeout at 0:00)
  clock_timeout_v1:
    'Oh, time is over on the chess clock... the flag just fell at zero! Click the New Match button whenever you want another game with me.',
  clock_timeout_v2:
    'Time ran out on the clock again... every last second slipped away! Touch the New Match button whenever you are ready for a rematch.',
  clock_timeout_v3:
    'Clock time is over... zero seconds left! Ready whenever you want to play me again.',

  // 55. Angel & Modal Turned ON
  angel_modal_on_v1:
    'Welcome back... your Chess Angel and modal are right beside the board whenever you want to make your move.',
  angel_modal_on_v2:
    'Hi there, I am your Chess Angel... we can pick right back up anytime you like.',
  angel_modal_on_v3:
    'Here we go again... make your move whenever you are ready.',

  // 56. Angel & Modal Turned OFF
  angel_modal_off_v1:
    'Stepping quietly aside... I am keeping this exact board position safe for you whenever you return.',
  angel_modal_off_v2:
    'Stepping out of sight for now... I enjoyed every move with you, ready whenever you want me back.',
  angel_modal_off_v3:
    'Hiding my portrait and modal... we can pick right back up anytime you like.',

  // 57. Special Thank You to Jan (Title / Version Click)
  thank_jan_v1:
    'Thank you, Jan, for all the trouble you gave yourself to create me and this game. Now enjoy playing chess with me, too...',
  thank_jan_v2:
    'Again, thank you, Jan... every piece, board light, and line of code here carries your care. Let us play another fine game together.',
  thank_jan_v3:
    'Always grateful to you, Jan... thank you for bringing me to life. Now sit back and enjoy our match.',

  // 58. Pawn Promotion Choice Prompt (Player Pawn Reaches Eighth Rank)
  ask_promotion_v1:
    'Ooh, your brave pawn has reached the eighth rank! Tell me—which piece do you choose: a Queen, a Rook, a Bishop, or a Knight?',
  ask_promotion_v2:
    'Another pawn arrives at the eighth rank! Shall I crown her a Queen, or transform her into a Rook, a Bishop, or a Knight?',
  ask_promotion_v3:
    'Eighth rank reached! Tell me whether you choose a Queen, a Rook, a Bishop, or a Knight.',
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
const SPEAKER_NAME = 'Chess Angel';

// Per-match play quota counter (resets on New Match via resetGameCommentaryCounts).
// Enforces per-game limits like max 2 fork warnings, max 1 seduction, or max 6 hesitation/tree hints.
const inGameCasePlayCounts = new Map<CommentaryCaseId, number>();

// Persistent inter-match conversation branch flags across ALL 57 remarks:
// - 1st occurrence (flag 0 -> 1): plays _v1 (full first-time remark)
// - 2nd occurrence (flag 1 -> 2, within the same match OR in a following match): plays _v2
// - 3rd occurrence (flag 2 -> 3, within the same match OR in a following match): plays _v3
// - 4th+ occurrences: alternates cleanly between _v2 and _v3 (and stays concise v4..v6 for 6-stage cases)
const interMatchCaseFlags = new Map<CommentaryCaseId, number>();
let forkWarningsShownInGame = 0;
const MAX_FORK_WARNINGS_PER_GAME = 2;
let messageSeq = 1;

type CaseMaxPlaysProvider = (caseId: CommentaryCaseId) => number | null;
let caseMaxPlaysProvider: CaseMaxPlaysProvider = (caseId) =>
  caseId === 'tree_browse' || caseId === 'hesitate_hint'
    ? 6
    : caseId === 'warn_double' || caseId === 'warn_fork_2step'
      ? 2
      : caseId === 'seduction'
        ? 1
        : null;

export function registerCaseMaxPlaysProvider(provider: CaseMaxPlaysProvider): void {
  caseMaxPlaysProvider = provider;
}

export function getCaseMaxPlaysInGame(caseId: CommentaryCaseId): number | null {
  return caseMaxPlaysProvider(caseId);
}

export function canPlayCaseInGame(caseId: CommentaryCaseId): boolean {
  const maxPlays = getCaseMaxPlaysInGame(caseId);
  if (maxPlays === null) return true;
  if (maxPlays <= 0) return false;
  const used = inGameCasePlayCounts.get(caseId) || 0;
  return used < maxPlays;
}

const INTER_MATCH_FLAGS_STORAGE_KEY = 'chess_angel_inter_match_flags_v1';
const LEGACY_INTRO_VISIT_STORAGE_KEY = 'chess_angel_intro_count_v1';

function hydrateInterMatchFlags(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(INTER_MATCH_FLAGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
            interMatchCaseFlags.set(k as CommentaryCaseId, Math.floor(v));
          }
        }
      }
    }
    const legacyIntro = Number(window.localStorage.getItem(LEGACY_INTRO_VISIT_STORAGE_KEY) || '0');
    if (
      Number.isFinite(legacyIntro) &&
      legacyIntro > 0 &&
      legacyIntro > (interMatchCaseFlags.get('intro') || 0)
    ) {
      interMatchCaseFlags.set('intro', Math.floor(legacyIntro));
    }
  } catch {
    // Ignore storage read errors
  }
}

function persistInterMatchFlags(): void {
  if (typeof window === 'undefined') return;
  try {
    const serialized: Record<string, number> = {};
    for (const [k, v] of interMatchCaseFlags.entries()) {
      if (v > 0) serialized[k] = v;
    }
    window.localStorage.setItem(INTER_MATCH_FLAGS_STORAGE_KEY, JSON.stringify(serialized));
  } catch {
    // Ignore storage write errors
  }
}

hydrateInterMatchFlags();

function resolveClipIdForOccurrence(caseId: CommentaryCaseId, occurrenceCount: number): VoiceClipId {
  if (caseId === 'hesitate_hint' || caseId === 'tree_browse') {
    const seqStage = Math.min(6, Math.max(1, occurrenceCount)) as 1 | 2 | 3 | 4 | 5 | 6;
    return `${caseId}_v${seqStage}` as VoiceClipId;
  }

  const variant: 'v1' | 'v2' | 'v3' =
    occurrenceCount <= 1
      ? 'v1'
      : occurrenceCount === 2
        ? 'v2'
        : occurrenceCount === 3
          ? 'v3'
          : occurrenceCount % 2 === 0
            ? 'v2'
            : 'v3';
  return `${caseId}_${variant}` as VoiceClipId;
}

/**
 * Returns how many times Chess Angel has already delivered `caseId` across matches/sessions.
 */
export function getInterMatchRemarkFlag(caseId: CommentaryCaseId): number {
  return interMatchCaseFlags.get(caseId) || 0;
}

/**
 * Resets all persistent inter-match conversation branch flags (returns Chess Angel to 1st-time _v1 remarks).
 */
export function resetInterMatchRemarkFlags(): void {
  interMatchCaseFlags.clear();
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(INTER_MATCH_FLAGS_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_INTRO_VISIT_STORAGE_KEY);
    } catch {
      // Ignore storage remove errors
    }
  }
}

/**
 * Called when starting a new match: resets ONLY per-match play quotas (fork warnings, seduction,
 * hesitation caps) while preserving inter-match conversation branch flags so 2nd & 3rd alternatives
 * continue naturally when one match is played after another.
 */
export function resetGameCommentaryCounts(): void {
  inGameCasePlayCounts.clear();
  forkWarningsShownInGame = 0;
}

function tryPickCaseClip(caseId: CommentaryCaseId): ClipEntry | null {
  if (!canPlayCaseInGame(caseId)) {
    return null;
  }
  const inGameCount = (inGameCasePlayCounts.get(caseId) || 0) + 1;
  inGameCasePlayCounts.set(caseId, inGameCount);

  const interMatchCount = (interMatchCaseFlags.get(caseId) || 0) + 1;
  interMatchCaseFlags.set(caseId, interMatchCount);
  persistInterMatchFlags();

  const clipId = resolveClipIdForOccurrence(caseId, interMatchCount);
  return { clipId, text: CLIP_TEXT[clipId] };
}

export function getSpeakerName(): string {
  return SPEAKER_NAME;
}

export function createIntroMessage(): OpponentMessage | null {
  const entry = tryPickCaseClip('intro');
  if (!entry) return null;
  return {
    id: messageSeq++,
    clipId: entry.clipId,
    text: entry.text,
    tag: 'WELCOME',
    tone: 'opening',
    speaker: SPEAKER_NAME,
  };
}

export function createCalcShowingMessage(report: BotSearchReport): OpponentMessage | null {
  const entry = tryPickCaseClip('calc_showing');
  if (!entry) return null;
  return {
    id: messageSeq++,
    clipId: entry.clipId,
    text: entry.text,
    tag: 'SEARCH TREE REPLAY',
    tone: 'math',
    speaker: SPEAKER_NAME,
    mathSummary: `${report.nodes.toLocaleString()} nodes · Depth ${report.depth} · Animating ${Math.min(3, report.triedLines.length)} branches`,
  };
}

export function createTrialConfirmMessage(
  completedBranchIndex: 1 | 2,
  pvSan: string[],
): OpponentMessage | null {
  const caseId: CommentaryCaseId =
    completedBranchIndex === 1 ? 'trial_confirm_1' : 'trial_confirm_2';
  const entry = tryPickCaseClip(caseId);
  if (!entry) return null;
  return {
    id: messageSeq++,
    clipId: entry.clipId,
    text: entry.text,
    tag: `BRANCH ${completedBranchIndex} · CLICK TO CONFIRM`,
    tone: 'math',
    speaker: SPEAKER_NAME,
    mathSummary: pvSan.length > 0 ? `Branch ${completedBranchIndex}: ${pvSan.join(' → ')}` : undefined,
  };
}

export function createTreeBrowseMessage(
  totalSimulations: number,
  depth?: number,
  nodes?: number,
): OpponentMessage | null {
  const entry = tryPickCaseClip('tree_browse');
  if (!entry) return null;
  const summaryParts: string[] = [];
  if (nodes && nodes > 0) summaryParts.push(`${nodes.toLocaleString()} nodes`);
  if (depth && depth > 0) summaryParts.push(`Depth ${depth}`);
  summaryParts.push(`${totalSimulations} simulations`);
  return {
    id: messageSeq++,
    clipId: entry.clipId,
    text: entry.text,
    tag: 'FULL SEARCH TREE · BROWSE SIMULATIONS',
    tone: 'math',
    speaker: SPEAKER_NAME,
    mathSummary: summaryParts.join(' · '),
  };
}

export function createUndoConfirmedMessage(bestAltSan?: string): OpponentMessage | null {
  const entry = tryPickCaseClip('undo_done');
  if (!entry) return null;
  return {
    id: messageSeq++,
    clipId: entry.clipId,
    text: entry.text,
    tag: 'REWIND & BETTER LINE',
    tone: 'hint',
    speaker: SPEAKER_NAME,
    mathSummary: bestAltSan ? `Recommended continuation: ${bestAltSan}` : undefined,
  };
}

export function createAltShownMessage(bestAltSan?: string): OpponentMessage | null {
  const entry = tryPickCaseClip('alt_shown');
  if (!entry) return null;
  return {
    id: messageSeq++,
    clipId: entry.clipId,
    text: entry.text,
    tag: 'STRONGER ALTERNATIVE',
    tone: 'hint',
    speaker: SPEAKER_NAME,
    mathSummary: bestAltSan ? `Higher-rated branch: ${bestAltSan}` : undefined,
  };
}

export function createHintShownMessage(bestMoveSan?: string): OpponentMessage | null {
  const entry = tryPickCaseClip('hint_shown');
  if (!entry) return null;
  return {
    id: messageSeq++,
    clipId: entry.clipId,
    text: entry.text,
    tag: 'CHESS ANGEL HINT',
    tone: 'hint',
    speaker: SPEAKER_NAME,
    mathSummary: bestMoveSan ? `Top candidate: ${bestMoveSan}` : undefined,
  };
}

export function createNewMatchMessage(): OpponentMessage | null {
  const entry = tryPickCaseClip('new_match');
  if (!entry) return null;
  return {
    id: messageSeq++,
    clipId: entry.clipId,
    text: entry.text,
    tag: 'NEW MATCH',
    tone: 'opening',
    speaker: SPEAKER_NAME,
  };
}

export function createResignMessage(winner?: PieceColor): OpponentMessage | null {
  const entry = tryPickCaseClip('resign');
  if (!entry) return null;
  return {
    id: messageSeq++,
    clipId: entry.clipId,
    text: entry.text,
    tag: 'MATCH RESIGNED',
    tone: 'neutral',
    speaker: SPEAKER_NAME,
    mathSummary: winner ? `${winner === 'w' ? 'White' : 'Black'} wins by resignation` : undefined,
  };
}

export function createSaveGameMessage(savedTitle?: string): OpponentMessage | null {
  const entry = tryPickCaseClip('save_game');
  if (!entry) return null;
  return {
    id: messageSeq++,
    clipId: entry.clipId,
    text: entry.text,
    tag: 'GAME SAVED',
    tone: 'hint',
    speaker: SPEAKER_NAME,
    mathSummary: savedTitle ? `Archived: ${savedTitle}` : undefined,
  };
}

export function createLoadGameMessage(detail?: string): OpponentMessage | null {
  const entry = tryPickCaseClip('load_game');
  if (!entry) return null;
  return {
    id: messageSeq++,
    clipId: entry.clipId,
    text: entry.text,
    tag: 'LOAD SAVED GAME',
    tone: 'opening',
    speaker: SPEAKER_NAME,
    mathSummary: detail ? `Restored: ${detail}` : undefined,
  };
}

const LEVEL_TO_CASE_ID: Record<EngineLevel, CommentaryCaseId> = {
  beginner: 'level_beginner',
  intermediate: 'level_intermediate',
  advanced: 'level_advanced',
  master: 'level_master',
  grandmaster: 'level_grandmaster',
};

export function createEngineLevelMessage(level: EngineLevel): OpponentMessage | null {
  const caseId = LEVEL_TO_CASE_ID[level];
  const entry = tryPickCaseClip(caseId);
  if (!entry) return null;
  const spec = ENGINE_LEVELS[level];
  return {
    id: messageSeq++,
    clipId: entry.clipId,
    text: entry.text,
    tag: `THINKING LEVEL · ${spec.label.toUpperCase()} (${spec.elo})`,
    tone: 'math',
    speaker: SPEAKER_NAME,
    mathSummary: `${spec.label} · ${spec.elo} Elo · ${spec.description}`,
  };
}

export function createClockTimeoutMessage(
  winner: PieceColor,
  humanColor?: PieceColor,
  mode?: GameMode,
): OpponentMessage | null {
  const entry = tryPickCaseClip('clock_timeout');
  if (!entry) return null;
  const flaggedSide = winner === 'w' ? 'Black' : 'White';
  const winnerSide = winner === 'w' ? 'White' : 'Black';
  const outcomeNote =
    mode === 'engine' && humanColor
      ? winner === humanColor
        ? `${flaggedSide} flagged at 0:00 · You win on time`
        : `${flaggedSide} flagged at 0:00 · Chess Angel wins on time`
      : `${flaggedSide} flagged at 0:00 · ${winnerSide} wins on time`;
  return {
    id: messageSeq++,
    clipId: entry.clipId,
    text: entry.text,
    tag: 'CLOCK TIME OVER · 0:00',
    tone: 'warning',
    speaker: SPEAKER_NAME,
    mathSummary: outcomeNote,
  };
}

export function createAngelModalOnMessage(): OpponentMessage | null {
  const entry = tryPickCaseClip('angel_modal_on');
  if (!entry) return null;
  return {
    id: messageSeq++,
    clipId: entry.clipId,
    text: entry.text,
    tag: 'ANGEL & MODAL · ON',
    tone: 'opening',
    speaker: SPEAKER_NAME,
  };
}

export function createAngelModalOffMessage(): OpponentMessage | null {
  const entry = tryPickCaseClip('angel_modal_off');
  if (!entry) return null;
  return {
    id: messageSeq++,
    clipId: entry.clipId,
    text: entry.text,
    tag: 'ANGEL & MODAL · OFF',
    tone: 'neutral',
    speaker: SPEAKER_NAME,
  };
}

export function createThankJanMessage(): OpponentMessage {
  const entry = tryPickCaseClip('thank_jan') || {
    clipId: 'thank_jan_v1' as VoiceClipId,
    text: CLIP_TEXT.thank_jan_v1,
  };
  return {
    id: messageSeq++,
    clipId: entry.clipId,
    text: entry.text,
    tag: 'FOR JAN · CHESS ANGEL',
    tone: 'opening',
    speaker: SPEAKER_NAME,
  };
}

export function createAskPromotionMessage(
  toSquare: string,
  color: PieceColor,
): OpponentMessage {
  const entry = tryPickCaseClip('ask_promotion') || {
    clipId: 'ask_promotion_v1' as VoiceClipId,
    text: CLIP_TEXT.ask_promotion_v1,
  };
  const rankLabel = color === 'w' ? '8th Rank' : '1st Rank';
  return {
    id: messageSeq++,
    clipId: entry.clipId,
    text: entry.text,
    tag: `PAWN PROMOTION · ${toSquare.toUpperCase()}`,
    tone: 'hint',
    speaker: SPEAKER_NAME,
    mathSummary: `Pawn reached ${toSquare.toUpperCase()} (${rankLabel}) · Choose Queen, Rook, Bishop, or Knight`,
    concernedFigures: [{ square: toSquare, role: 'attacker' }],
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

function findKingSquareOfColor(chess: Chess, color: PieceColor): Square | null {
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      if (cell && cell.color === color && cell.type === 'k') {
        return `${FILES[c]}${8 - r}` as Square;
      }
    }
  }
  return null;
}

function findPiecesOfType(chess: Chess, color: PieceColor, type: PieceSymbol): Square[] {
  const board = chess.board();
  const out: Square[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      if (cell && cell.color === color && cell.type === type) {
        out.push(`${FILES[c]}${8 - r}` as Square);
      }
    }
  }
  return out;
}

/**
 * Geometrically locates all squares containing pieces of `attackerColor` that currently
 * attack `targetSq` (works regardless of whose turn is active in `chess`).
 */
function findPiecesAttackingSquare(
  chess: Chess,
  targetSq: Square | null,
  attackerColor: PieceColor,
): Square[] {
  if (!targetSq || targetSq.length < 2) return [];
  const tc = targetSq.charCodeAt(0) - 97;
  const tr = 8 - Number(targetSq[1]);
  if (tc < 0 || tc > 7 || tr < 0 || tr > 7) return [];

  const board = chess.board();
  const attackers: Square[] = [];

  // 1. Knights
  const knightOffsets: ReadonlyArray<readonly [number, number]> = [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ];
  for (const [dr, dc] of knightOffsets) {
    const r = tr + dr;
    const c = tc + dc;
    if (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const cell = board[r][c];
      if (cell && cell.color === attackerColor && cell.type === 'n') {
        attackers.push(`${FILES[c]}${8 - r}` as Square);
      }
    }
  }

  // 2. Pawns (White attacks upward toward smaller r, so White pawn sits at tr + 1; Black at tr - 1)
  const pawnRow = attackerColor === 'w' ? tr + 1 : tr - 1;
  if (pawnRow >= 0 && pawnRow < 8) {
    for (const dc of [-1, 1]) {
      const c = tc + dc;
      if (c >= 0 && c < 8) {
        const cell = board[pawnRow][c];
        if (cell && cell.color === attackerColor && cell.type === 'p') {
          attackers.push(`${FILES[c]}${8 - pawnRow}` as Square);
        }
      }
    }
  }

  // 3. Adjacent King
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = tr + dr;
      const c = tc + dc;
      if (r >= 0 && r < 8 && c >= 0 && c < 8) {
        const cell = board[r][c];
        if (cell && cell.color === attackerColor && cell.type === 'k') {
          attackers.push(`${FILES[c]}${8 - r}` as Square);
        }
      }
    }
  }

  // 4. Orthogonal rays (Rooks & Queens)
  const orthoDirs: ReadonlyArray<readonly [number, number]> = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (const [dr, dc] of orthoDirs) {
    let r = tr + dr;
    let c = tc + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const cell = board[r][c];
      if (cell) {
        if (cell.color === attackerColor && (cell.type === 'r' || cell.type === 'q')) {
          attackers.push(`${FILES[c]}${8 - r}` as Square);
        }
        break;
      }
      r += dr;
      c += dc;
    }
  }

  // 5. Diagonal rays (Bishops & Queens)
  const diagDirs: ReadonlyArray<readonly [number, number]> = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];
  for (const [dr, dc] of diagDirs) {
    let r = tr + dr;
    let c = tc + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8) {
      const cell = board[r][c];
      if (cell) {
        if (cell.color === attackerColor && (cell.type === 'b' || cell.type === 'q')) {
          attackers.push(`${FILES[c]}${8 - r}` as Square);
        }
        break;
      }
      r += dr;
      c += dc;
    }
  }

  return attackers;
}

function buildConcernedFigures(
  dangerSqs: Iterable<string | null | undefined>,
  attackerSqs: Iterable<string | null | undefined> = [],
): SpeechFigureHighlight[] | undefined {
  const bySquare = new Map<string, 'danger' | 'attacker'>();
  for (const sq of dangerSqs) {
    if (sq && sq.length === 2) {
      bySquare.set(sq, 'danger');
    }
  }
  for (const sq of attackerSqs) {
    if (sq && sq.length === 2 && !bySquare.has(sq)) {
      bySquare.set(sq, 'attacker');
    }
  }
  if (bySquare.size === 0) return undefined;
  return Array.from(bySquare.entries()).map(([square, role]) => ({ square, role }));
}

/**
 * Resolves representative concerned 3D board figures when testing a warning/watch saying
 * directly from Chess Angel Video Studio (`Test` button).
 */
export function resolvePreviewConcernedFigures(
  caseId: CommentaryCaseId,
  fen: string,
  humanColor: PieceColor,
): SpeechFigureHighlight[] | undefined {
  const aiColor: PieceColor = humanColor === 'w' ? 'b' : 'w';
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return undefined;
  }

  const humanKing = findKingSquareOfColor(chess, humanColor);
  const aiKing = findKingSquareOfColor(chess, aiColor);

  switch (caseId) {
    case 'watch_queen':
    case 'wrong_hang_queen':
      return buildConcernedFigures(
        findPiecesOfType(chess, humanColor, 'q'),
        findPiecesOfType(chess, aiColor, 'q').slice(0, 1),
      );
    case 'watch_rook':
    case 'wrong_hang_rook':
      return buildConcernedFigures(
        findPiecesOfType(chess, humanColor, 'r').slice(0, 1),
        findPiecesOfType(chess, aiColor, 'b').slice(0, 1),
      );
    case 'watch_bishop':
      return buildConcernedFigures(
        findPiecesOfType(chess, humanColor, 'b').slice(0, 1),
        findPiecesOfType(chess, aiColor, 'n').slice(0, 1),
      );
    case 'watch_knight':
    case 'wrong_hang_minor':
      return buildConcernedFigures(
        findPiecesOfType(chess, humanColor, 'n').slice(0, 1),
        findPiecesOfType(chess, aiColor, 'b').slice(0, 1),
      );
    case 'warn_double':
    case 'warn_fork_2step': {
      const targets = [
        ...findPiecesOfType(chess, humanColor, 'q'),
        ...findPiecesOfType(chess, humanColor, 'r'),
        ...findPiecesOfType(chess, humanColor, 'b'),
      ].slice(0, 2);
      const forkers = [
        ...findPiecesOfType(chess, aiColor, 'n'),
        ...findPiecesOfType(chess, aiColor, 'q'),
      ].slice(0, 1);
      return buildConcernedFigures(targets, forkers);
    }
    case 'warn_mate':
    case 'wrong_walk_mate':
    case 'check_queen':
    case 'checkmate_win':
      return buildConcernedFigures(
        [humanKing],
        findPiecesOfType(chess, aiColor, 'q').slice(0, 1),
      );
    case 'check_knight':
      return buildConcernedFigures(
        [humanKing],
        findPiecesOfType(chess, aiColor, 'n').slice(0, 1),
      );
    case 'check_general':
    case 'warn_king_file':
      return buildConcernedFigures(
        [humanKing],
        [
          ...findPiecesOfType(chess, aiColor, 'r'),
          ...findPiecesOfType(chess, aiColor, 'q'),
        ].slice(0, 1),
      );
    case 'warn_pawn_promo':
      return buildConcernedFigures(
        [humanKing],
        findPiecesOfType(chess, aiColor, 'p').slice(0, 1),
      );
    case 'player_check':
    case 'checkmate_lose':
      return buildConcernedFigures(
        [aiKing],
        findPiecesOfType(chess, humanColor, 'q').slice(0, 1),
      );
    default:
      return undefined;
  }
}

/**
 * Resolves representative fork arrows (`from -> to`) when previewing `warn_double` or `warn_fork_2step`
 * in Chess Angel Video Studio (`Test` button).
 */
export function resolvePreviewForkArrows(
  caseId: CommentaryCaseId,
  fen: string,
  humanColor: PieceColor,
): { from: string; to: string }[] {
  if (caseId !== 'warn_double' && caseId !== 'warn_fork_2step') return [];
  const aiColor: PieceColor = humanColor === 'w' ? 'b' : 'w';
  try {
    const chess = new Chess(fen);
    const twoStep = detectTwoStepThreats(fen, aiColor, humanColor);
    if (twoStep.forkArrows.length >= 2) {
      return twoStep.forkArrows;
    }
    const targets = [
      findKingSquareOfColor(chess, humanColor),
      ...findPiecesOfType(chess, humanColor, 'q'),
      ...findPiecesOfType(chess, humanColor, 'r'),
      ...findPiecesOfType(chess, humanColor, 'b'),
      ...findPiecesOfType(chess, humanColor, 'n'),
    ]
      .filter((sq): sq is Square => Boolean(sq))
      .slice(0, 2);
    const forker =
      [
        ...findPiecesOfType(chess, aiColor, 'n'),
        ...findPiecesOfType(chess, aiColor, 'q'),
        ...findPiecesOfType(chess, aiColor, 'b'),
      ][0] || null;
    if (forker && targets.length >= 2) {
      return targets.map((sq) => ({ from: forker, to: sq }));
    }
  } catch {
    // ignore invalid FEN
  }
  return [];
}

/**
 * Finds all valuable defender pieces (King, Queen, Rook, Bishop, Knight) genuinely forked
 * from `attackerSq` by a piece of type `attackerType`.
 */
function findGenuineForkTargetsFromSquare(
  chess: Chess,
  attackerSq: Square,
  attackerType: PieceSymbol,
  attackerColor: PieceColor,
  defenderColor: PieceColor,
): Square[] {
  const board = chess.board();
  const attackerVal = PIECE_VALUES[attackerType] ?? 3;
  const candidates: { square: Square; value: number; undefended: boolean; isKing: boolean }[] = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      if (!cell || cell.color !== defenderColor || cell.type === 'p') continue;
      const sq = `${FILES[c]}${8 - r}` as Square;
      const attackers = findPiecesAttackingSquare(chess, sq, attackerColor);
      if (!attackers.includes(attackerSq)) continue;

      const isKing = cell.type === 'k';
      const val = PIECE_VALUES[cell.type];
      const undefended = !isKing && !chess.isAttacked(sq, defenderColor);
      const isGenuineForkTarget =
        isKing ||
        undefended ||
        val > attackerVal ||
        ((attackerType === 'n' || attackerType === 'p') && val >= 3);

      if (isGenuineForkTarget) {
        candidates.push({ square: sq, value: val, undefended, isKing });
      }
    }
  }

  candidates.sort((a, b) => {
    if (a.isKing !== b.isKing) return a.isKing ? -1 : 1;
    if (a.undefended !== b.undefended) return a.undefended ? -1 : 1;
    return b.value - a.value;
  });

  return candidates.map((c) => c.square);
}

/**
 * Detects an immediate fork created on the board right after `aiColor` played to `lastMoveTo`.
 */
function detectImmediateForkByAi(
  chess: Chess,
  lastMoveTo: Square,
  aiColor: PieceColor,
  humanColor: PieceColor,
): {
  forkerSqs: Square[];
  targetSqs: Square[];
  arrows: { from: string; to: string }[];
} | null {
  const movedCell = chess.get(lastMoveTo);
  if (movedCell && movedCell.color === aiColor) {
    const directTargets = findGenuineForkTargetsFromSquare(
      chess,
      lastMoveTo,
      movedCell.type,
      aiColor,
      humanColor,
    );
    if (directTargets.length >= 2) {
      const topTargets = directTargets.slice(0, 3);
      return {
        forkerSqs: [lastMoveTo],
        targetSqs: topTargets,
        arrows: topTargets.map((sq) => ({ from: lastMoveTo, to: sq })),
      };
    }
  }

  // Also check discovered double-attack forks (e.g. moving one piece uncovers a second attacker)
  const threatened = countThreatenedValuables(chess, aiColor, humanColor);
  const genuineMulti: { targetSq: Square; attackerSq: Square }[] = [];
  if (chess.inCheck()) {
    const kingSq = findKingSquareOfColor(chess, humanColor);
    const kingAttackers = findPiecesAttackingSquare(chess, kingSq, aiColor);
    if (kingSq && kingAttackers.length > 0) {
      genuineMulti.push({ targetSq: kingSq, attackerSq: kingAttackers[0] });
    }
  }
  for (const t of threatened) {
    const attSqs = findPiecesAttackingSquare(chess, t.square, aiColor);
    for (const aSq of attSqs) {
      const aPiece = chess.get(aSq);
      if (!aPiece) continue;
      const aVal = PIECE_VALUES[aPiece.type] ?? 3;
      if (t.undefended || t.value > aVal) {
        genuineMulti.push({ targetSq: t.square, attackerSq: aSq });
        break;
      }
    }
  }

  const uniqueTargets = new Map<Square, Square>();
  for (const item of genuineMulti) {
    if (!uniqueTargets.has(item.targetSq)) {
      uniqueTargets.set(item.targetSq, item.attackerSq);
    }
  }
  if (uniqueTargets.size >= 2) {
    const entries = Array.from(uniqueTargets.entries()).slice(0, 3);
    return {
      forkerSqs: Array.from(new Set(entries.map(([, a]) => a))),
      targetSqs: entries.map(([t]) => t),
      arrows: entries.map(([t, a]) => ({ from: a, to: t })),
    };
  }

  return null;
}

function detectTwoStepThreats(
  fen: string,
  aiColor: PieceColor,
  humanColor: PieceColor,
): {
  hasMateThreat: boolean;
  mateAttackerSqs: Square[];
  hasForkPreview: boolean;
  forkAttackerSq: Square | null;
  forkMoveToSq: Square | null;
  forkTargetSqs: Square[];
  forkArrows: { from: string; to: string }[];
  passedPawnClose: boolean;
  passedPawnSqs: Square[];
  openFileKingPressure: boolean;
  kingFileAttackerSqs: Square[];
} {
  let hasMateThreat = false;
  const mateAttackerSqs: Square[] = [];
  let hasForkPreview = false;
  let forkAttackerSq: Square | null = null;
  let forkMoveToSq: Square | null = null;
  let forkTargetSqs: Square[] = [];
  let forkArrows: { from: string; to: string }[] = [];
  let passedPawnClose = false;
  const passedPawnSqs: Square[] = [];
  let openFileKingPressure = false;
  const kingFileAttackerSqs: Square[] = [];

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
        if (!mateAttackerSqs.includes(m.from as Square)) {
          mateAttackerSqs.push(m.from as Square);
        }
        aiTurnChess.undo();
        break;
      }
      if (
        !hasForkPreview &&
        (m.piece === 'n' || m.piece === 'q' || m.piece === 'b' || m.piece === 'r' || m.piece === 'p')
      ) {
        const landingSq = m.to as Square;
        // Landing square must be safe (not simply captured by the player on arrival)
        if (!aiTurnChess.isAttacked(landingSq, humanColor)) {
          const forkedSqs = findGenuineForkTargetsFromSquare(
            aiTurnChess,
            landingSq,
            m.piece,
            aiColor,
            humanColor,
          );
          if (forkedSqs.length >= 2) {
            const topTargets = forkedSqs.slice(0, 3);
            hasForkPreview = true;
            forkAttackerSq = m.from as Square;
            forkMoveToSq = landingSq;
            forkTargetSqs = topTargets;
            forkArrows = [
              { from: m.from, to: landingSq },
              ...topTargets.map((sq) => ({ from: landingSq, to: sq })),
            ];
          }
        }
      }
      aiTurnChess.undo();
    }
  } catch {
    // Ignore invalid null-move FEN when King is already in check
  }

  const chess = new Chess(fen);
  const board = chess.board();
  let humanKingFile = -1;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      if (!cell) continue;
      const sq = `${FILES[c]}${8 - r}` as Square;
      if (cell.type === 'k' && cell.color === humanColor) {
        humanKingFile = c;
      }
      if (cell.type === 'p' && cell.color === aiColor) {
        const rank = 8 - r;
        if ((aiColor === 'w' && rank >= 6) || (aiColor === 'b' && rank <= 3)) {
          passedPawnClose = true;
          passedPawnSqs.push(sq);
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
          kingFileAttackerSqs.push(`${FILES[c]}${8 - r}` as Square);
        }
      }
    }
  }

  return {
    hasMateThreat,
    mateAttackerSqs,
    hasForkPreview,
    forkAttackerSq,
    forkMoveToSq,
    forkTargetSqs,
    forkArrows,
    passedPawnClose,
    passedPawnSqs,
    openFileKingPressure,
    kingFileAttackerSqs,
  };
}

/**
 * Checks ahead of time whether a pending bot move (`from -> to`) on `preFen` creates an
 * immediate fork or a 2-step fork threat (without mutating game commentary counters).
 */
export function inspectPostMoveForkState(
  preFen: string,
  from: string,
  to: string,
  promotion: string | undefined,
  aiColor: PieceColor,
  humanColor: PieceColor,
): { isFork: boolean; shouldWarn: boolean } {
  try {
    const chess = new Chess(preFen);
    const res = chess.move({ from, to, promotion: promotion || 'q' });
    if (!res || chess.isCheckmate() || chess.isStalemate() || chess.isDraw()) {
      return { isFork: false, shouldWarn: false };
    }
    const postFen = chess.fen();
    const imm = detectImmediateForkByAi(chess, res.to as Square, aiColor, humanColor);
    if (imm) {
      return { isFork: true, shouldWarn: forkWarningsShownInGame < MAX_FORK_WARNINGS_PER_GAME };
    }
    const twoStep = detectTwoStepThreats(postFen, aiColor, humanColor);
    if (twoStep.hasForkPreview) {
      return { isFork: true, shouldWarn: forkWarningsShownInGame < MAX_FORK_WARNINGS_PER_GAME };
    }
  } catch {
    // ignore invalid move
  }
  return { isFork: false, shouldWarn: false };
}

export interface HumanCommentaryContext {
  preFen: string;
  postFen: string;
  lastMove: MoveRecord;
  aiColor: PieceColor;
  humanColor: PieceColor;
  audit: HumanMoveAudit | null;
  plyCount?: number;
  humanGoodStreak?: number;
  humanEvalAdvantageCp?: number;
  canTriggerSeductionNow?: boolean;
  seductionTriggerMode?: SeductionTriggerMode;
}

export type SeductionTriggerMode = 'balanced' | 'frequent' | 'dominant' | 'tactical';

/**
 * Evaluates the player's move immediately after it is played:
 * - Detects checkmate/draw/check/Queen capture
 * - Detects blunders/mistakes (hanging Queen/Rook/minor piece, walking into mate,
 *   missing a tactic, or dropping >= 110 cp), explains why, lists stronger
 *   alternatives, and asks if the player wants to undo the move.
 * - Uses 1st -> 2nd -> 3rd occurrence variants for every single message case.
 */
export function evaluateHumanMoveCommentary(ctx: HumanCommentaryContext): OpponentMessage | null {
  const { preFen, postFen, lastMove, aiColor, humanColor, audit } = ctx;
  const postChess = new Chess(postFen);

  const humanKingSq = findKingSquareOfColor(postChess, humanColor);
  const aiKingSq = findKingSquareOfColor(postChess, aiColor);

  if (postChess.isCheckmate()) {
    const entry = tryPickCaseClip('checkmate_lose');
    if (!entry) return null;
    return {
      id: messageSeq++,
      clipId: entry.clipId,
      text: entry.text,
      tag: 'CHECKMATE',
      tone: 'checkmate',
      speaker: SPEAKER_NAME,
      concernedFigures: buildConcernedFigures(
        [aiKingSq],
        findPiecesAttackingSquare(postChess, aiKingSq, humanColor),
      ),
    };
  }

  if (postChess.isStalemate()) {
    const entry = tryPickCaseClip('stalemate');
    if (!entry) return null;
    return {
      id: messageSeq++,
      clipId: entry.clipId,
      text: entry.text,
      tag: 'STALEMATE',
      tone: 'neutral',
      speaker: SPEAKER_NAME,
    };
  }

  if (postChess.isDraw()) {
    const entry = tryPickCaseClip('draw');
    if (!entry) return null;
    return {
      id: messageSeq++,
      clipId: entry.clipId,
      text: entry.text,
      tag: 'DRAW',
      tone: 'neutral',
      speaker: SPEAKER_NAME,
    };
  }

  // Check if player walked straight into a mate-in-1 or forced mate-in-2
  const mateReplyFromSqs: Square[] = [];
  const aiCanMateImmediately = (() => {
    const replies = postChess.moves({ verbose: true });
    for (const r of replies) {
      postChess.move(r);
      const mate = postChess.isCheckmate();
      postChess.undo();
      if (mate) {
        mateReplyFromSqs.push(r.from as Square);
        return true;
      }
    }
    return false;
  })();

  const alts = (audit?.alternatives || []).map((a) => ({ uci: a.uci, san: a.san }));
  const altLabel = alts.length > 0 ? `Better: ${alts.map((a) => a.san).join(' or ')}` : '';

  // Check newly undefended or hanging valuable pieces after human's move
  const preChess = new Chess(preFen);
  const preHanging = new Set(
    countThreatenedValuables(preChess, aiColor, humanColor)
      .filter((p) => p.undefended)
      .map((p) => `${p.type}@${p.square}`),
  );
  const postHanging = countThreatenedValuables(postChess, aiColor, humanColor).filter(
    (p) => p.undefended,
  );
  const newlyExposed =
    postHanging.find((p) => !preHanging.has(`${p.type}@${p.square}`)) || postHanging[0];

  const movedDestAttacked = postChess.isAttacked(lastMove.to as Square, aiColor);
  const cpLossVal = audit?.cpLoss ?? 0;

  // Severe blunder ("almost by distraction"): walking into forced mate, leaving Queen/Rook/minor
  // completely en prise, moving a piece straight into a losing capture, or dropping >= 240 cp.
  const isSevereDistractionBlunder =
    aiCanMateImmediately ||
    Boolean(audit?.walkedIntoMate) ||
    (Boolean(newlyExposed) &&
      (newlyExposed!.type === 'q' ||
        (newlyExposed!.type === 'r' && (audit === null || cpLossVal >= 130)) ||
        ((newlyExposed!.type === 'b' || newlyExposed!.type === 'n') &&
          (audit === null || cpLossVal >= 210)))) ||
    (movedDestAttacked && cpLossVal >= 220) ||
    cpLossVal >= 240;

  if (isSevereDistractionBlunder) {
    const entry = tryPickCaseClip('wrong_distracted');
    if (entry) {
      let reasonNote = 'Severe loss of material or king safety';
      let summaryCore = '';
      let blunderFigures: SpeechFigureHighlight[] | undefined;

      if (aiCanMateImmediately || audit?.walkedIntoMate) {
        reasonNote = 'Walks straight into forced checkmate';
        summaryCore = 'Allows forced mate';
        blunderFigures = buildConcernedFigures([humanKingSq, lastMove.to], mateReplyFromSqs);
      } else if (newlyExposed?.type === 'q') {
        reasonNote = `Queen left undefended on ${newlyExposed.square}`;
        summaryCore = `Queen undefended on ${newlyExposed.square}`;
        blunderFigures = buildConcernedFigures(
          [newlyExposed.square],
          findPiecesAttackingSquare(postChess, newlyExposed.square, aiColor),
        );
      } else if (newlyExposed?.type === 'r') {
        reasonNote = `Rook left undefended on ${newlyExposed.square}`;
        summaryCore = `Rook undefended on ${newlyExposed.square}`;
        blunderFigures = buildConcernedFigures(
          [newlyExposed.square],
          findPiecesAttackingSquare(postChess, newlyExposed.square, aiColor),
        );
      } else if (newlyExposed && (newlyExposed.type === 'b' || newlyExposed.type === 'n')) {
        const pieceWord = newlyExposed.type === 'b' ? 'Bishop' : 'Knight';
        reasonNote = `${pieceWord} left undefended on ${newlyExposed.square}`;
        summaryCore = `${pieceWord} undefended on ${newlyExposed.square}`;
        blunderFigures = buildConcernedFigures(
          [newlyExposed.square],
          findPiecesAttackingSquare(postChess, newlyExposed.square, aiColor),
        );
      } else if (cpLossVal > 0) {
        const pawnsLost = (cpLossVal / 100).toFixed(1);
        reasonNote = `Blunder (−${pawnsLost} pawns)`;
        summaryCore = `−${pawnsLost} eval swing`;
        blunderFigures = buildConcernedFigures(
          [lastMove.to],
          movedDestAttacked
            ? findPiecesAttackingSquare(postChess, lastMove.to as Square, aiColor)
            : [],
        );
      }

      const mathSummary = [summaryCore, altLabel].filter(Boolean).join(' · ') || undefined;

      return {
        id: messageSeq++,
        clipId: entry.clipId,
        text: entry.text,
        tag: 'LOST FOCUS · UNDO?',
        tone: 'warning',
        speaker: SPEAKER_NAME,
        mathSummary,
        concernedFigures: blunderFigures,
        action: {
          kind: 'undo-offer',
          preFen,
          reasonNote,
          alternatives: alts,
          isSevereDistraction: true,
        },
      };
    }
  }

  if (newlyExposed && (audit === null || audit.cpLoss >= 95)) {
    if (
      (newlyExposed.type === 'b' || newlyExposed.type === 'n') &&
      (audit?.cpLoss ?? 200) >= 135
    ) {
      const pieceWord = newlyExposed.type === 'b' ? 'Bishop' : 'Knight';
      const entry = tryPickCaseClip('wrong_hang_minor');
      if (entry) {
        return {
          id: messageSeq++,
          clipId: entry.clipId,
          text: entry.text,
          tag: `${pieceWord.toUpperCase()} HANGING · UNDO?`,
          tone: 'warning',
          speaker: SPEAKER_NAME,
          mathSummary: `${pieceWord} undefended on ${newlyExposed.square}${altLabel ? ` · ${altLabel}` : ''}`,
          concernedFigures: buildConcernedFigures(
            [newlyExposed.square],
            findPiecesAttackingSquare(postChess, newlyExposed.square, aiColor),
          ),
          action: {
            kind: 'undo-offer',
            preFen,
            reasonNote: `${pieceWord} left undefended on ${newlyExposed.square}`,
            alternatives: alts,
          },
        };
      }
    }
  }

  // Audit evaluation swings (missed tactic, positional mistake, or clear inaccuracy)
  if (audit && alts.length > 0) {
    const pawnsLost = (audit.cpLoss / 100).toFixed(1);
    const altOriginSq =
      alts[0].uci.length >= 4 && postChess.get(alts[0].uci.slice(0, 2) as Square)?.color === humanColor
        ? alts[0].uci.slice(0, 2)
        : null;
    const mistakeFigures = buildConcernedFigures(
      [lastMove.to],
      movedDestAttacked
        ? findPiecesAttackingSquare(postChess, lastMove.to as Square, aiColor)
        : [altOriginSq],
    );

    if (audit.missedTacticalCapture) {
      const entry = tryPickCaseClip('wrong_missed_tactic');
      if (entry) {
        return {
          id: messageSeq++,
          clipId: entry.clipId,
          text: entry.text,
          tag: 'MISSED TACTIC · UNDO?',
          tone: 'warning',
          speaker: SPEAKER_NAME,
          mathSummary: `−${pawnsLost} eval swing · ${altLabel}`,
          concernedFigures: mistakeFigures,
          action: {
            kind: 'undo-offer',
            preFen,
            reasonNote: `Missed stronger tactical strike (${alts[0].san})`,
            alternatives: alts,
          },
        };
      }
    }
    if (audit.cpLoss >= 175) {
      const entry = tryPickCaseClip('wrong_positional');
      if (entry) {
        return {
          id: messageSeq++,
          clipId: entry.clipId,
          text: entry.text,
          tag: 'MISTAKE · UNDO?',
          tone: 'warning',
          speaker: SPEAKER_NAME,
          mathSummary: `−${pawnsLost} pawns · ${altLabel}`,
          concernedFigures: mistakeFigures,
          action: {
            kind: 'undo-offer',
            preFen,
            reasonNote: `Drops ${pawnsLost} pawns of evaluation`,
            alternatives: alts,
          },
        };
      }
    }
    if (audit.cpLoss >= 110) {
      const entry = tryPickCaseClip('wrong_better_alt');
      if (entry) {
        return {
          id: messageSeq++,
          clipId: entry.clipId,
          text: entry.text,
          tag: 'BETTER LINE · UNDO?',
          tone: 'hint',
          speaker: SPEAKER_NAME,
          mathSummary: `−${pawnsLost} pawns · ${altLabel}`,
          concernedFigures: mistakeFigures,
          action: {
            kind: 'undo-offer',
            preFen,
            reasonNote: `${alts[0].san} kept a cleaner edge`,
            alternatives: alts,
          },
        };
      }
    }
  }

  // Positive / neutral reactions to sharp human moves
  if (postChess.inCheck()) {
    const entry = tryPickCaseClip('player_check');
    if (!entry) return null;
    return {
      id: messageSeq++,
      clipId: entry.clipId,
      text: entry.text,
      tag: 'CHECK',
      tone: 'check',
      speaker: SPEAKER_NAME,
      concernedFigures: buildConcernedFigures(
        [aiKingSq],
        findPiecesAttackingSquare(postChess, aiKingSq, humanColor),
      ),
    };
  }

  if (lastMove.captured === 'q') {
    const entry = tryPickCaseClip('lost_queen');
    if (!entry) return null;
    return {
      id: messageSeq++,
      clipId: entry.clipId,
      text: entry.text,
      tag: 'CAPTURE',
      tone: 'capture',
      speaker: SPEAKER_NAME,
    };
  }

  // Special Seduction / Distraction trigger when the player is playing too well!
  const ply = ctx.plyCount ?? lastMove.ply ?? 0;
  const goodStreak = ctx.humanGoodStreak ?? 0;
  const humanAdvCp = ctx.humanEvalAdvantageCp ?? 0;
  const cleanAccuracy = audit === null || audit.cpLoss <= 28;
  const sharpMaterialGain =
    (lastMove.captured === 'r' || lastMove.captured === 'n' || lastMove.captured === 'b') &&
    (audit?.cpLoss ?? 0) <= 20 &&
    humanAdvCp >= 75;
  const triggerMode: SeductionTriggerMode = ctx.seductionTriggerMode || 'balanced';

  const modeMatched =
    triggerMode === 'frequent'
      ? goodStreak >= 2 || humanAdvCp >= 90 || sharpMaterialGain
      : triggerMode === 'dominant'
        ? (goodStreak >= 4 && humanAdvCp >= 110) || humanAdvCp >= 230
        : triggerMode === 'tactical'
          ? sharpMaterialGain || (Boolean(lastMove.captured) && cleanAccuracy && humanAdvCp >= 60)
          : humanAdvCp >= 145 || (goodStreak >= 3 && humanAdvCp >= 35) || sharpMaterialGain;

  const minPlyForMode = triggerMode === 'frequent' ? 4 : 6;
  const playingTooWell = ply >= minPlyForMode && !newlyExposed && cleanAccuracy && modeMatched;

  if (playingTooWell && ctx.canTriggerSeductionNow !== false && canPlayCaseInGame('seduction')) {
    const entry = tryPickCaseClip('seduction');
    if (entry) {
      return {
        id: messageSeq++,
        clipId: entry.clipId,
        text: entry.text,
        tag: 'PLAYING TOO WELL · DISTRACTION',
        tone: 'opening',
        speaker: SPEAKER_NAME,
      };
    }
  }

  return null;
}

export interface BotCommentaryContext {
  fen: string;
  lastMove: MoveRecord;
  aiColor: PieceColor;
  humanColor: PieceColor;
  plyCount: number;
  analysis: AnalysisSnapshot | null;
  report: BotSearchReport | null;
  allowCalcProposal?: boolean;
}

/**
 * Composes Chess Angel's commentary after completing a move, progressing naturally
 * through 1st, 2nd ("As I said..." / "Again..."), and 3rd occurrence phrasings.
 */
export function composeBotMoveCommentary(ctx: BotCommentaryContext): OpponentMessage | null {
  const { fen, lastMove, aiColor, humanColor, plyCount, analysis, report } = ctx;
  const allowCalc = ctx.allowCalcProposal !== false;
  const chess = new Chess(fen);

  const mathBadge = report
    ? `${report.nodes.toLocaleString()} nodes · Depth ${report.depth} · ${report.triedLines.length} branches`
    : undefined;

  const calcAction: AngelInteractiveAction | undefined =
    allowCalc && report && report.triedLines.length >= 2
      ? { kind: 'calc-preview', report }
      : undefined;

  const humanKingSq = findKingSquareOfColor(chess, humanColor);

  const make = (
    caseId: CommentaryCaseId,
    tag: string,
    tone: CommentaryTone,
    withCalcOffer = false,
    concernedFigures?: SpeechFigureHighlight[],
    forkArrows?: { from: string; to: string }[],
  ): OpponentMessage | null => {
    const entry = tryPickCaseClip(caseId);
    if (!entry) return null;
    return {
      id: messageSeq++,
      clipId: entry.clipId,
      text: entry.text,
      tag,
      tone,
      speaker: SPEAKER_NAME,
      mathSummary: mathBadge,
      action: withCalcOffer ? calcAction : undefined,
      concernedFigures,
      forkArrows,
    };
  };

  // 1. CHECKMATE
  if (chess.isCheckmate()) {
    const checkers = findPiecesAttackingSquare(chess, humanKingSq, aiColor);
    return make(
      'checkmate_win',
      'CHECKMATE',
      'checkmate',
      false,
      buildConcernedFigures([humanKingSq], checkers.length > 0 ? checkers : [lastMove.to]),
    );
  }

  // 2. STALEMATE / DRAW
  if (chess.isStalemate()) {
    return make('stalemate', 'STALEMATE', 'neutral');
  }
  if (chess.isDraw()) {
    return make('draw', 'DRAW', 'neutral');
  }

  const topLine = analysis?.lines[0];
  const aiSign = aiColor === 'w' ? 1 : -1;
  const aiMateIn =
    topLine?.mateIn != null && Math.sign(topLine.mateIn) === aiSign
      ? Math.abs(topLine.mateIn)
      : null;

  const immediateFork = detectImmediateForkByAi(
    chess,
    lastMove.to as Square,
    aiColor,
    humanColor,
  );
  const twoStep = detectTwoStepThreats(fen, aiColor, humanColor);
  const threatenedHuman = countThreatenedValuables(chess, aiColor, humanColor);

  // 3. TOP PRIORITY #1 IN GAMEPLAY: FORK WARNINGS (1st & 2nd time show 3s transparent lila arrows; 3rd+ time say nothing & let player play)
  if (immediateFork !== null || twoStep.hasForkPreview) {
    if (forkWarningsShownInGame >= MAX_FORK_WARNINGS_PER_GAME) {
      // 3rd and following forks in the same game: say nothing about forks anymore and let the player play
      return null;
    }

    if (immediateFork !== null) {
      const msg = make(
        'warn_double',
        'FORK THREAT',
        'warning',
        false,
        buildConcernedFigures(immediateFork.targetSqs, immediateFork.forkerSqs),
        immediateFork.arrows,
      );
      if (msg) {
        forkWarningsShownInGame += 1;
        return msg;
      }
    }

    if (twoStep.hasForkPreview) {
      const msg = make(
        'warn_fork_2step',
        '2-STEP FORK',
        'warning',
        false,
        buildConcernedFigures(twoStep.forkTargetSqs, [twoStep.forkAttackerSq || lastMove.to]),
        twoStep.forkArrows,
      );
      if (msg) {
        forkWarningsShownInGame += 1;
        return msg;
      }
    }

    return null;
  }

  // 4. DIRECT CHECK (non-fork checks)
  if (chess.inCheck()) {
    const checkers = findPiecesAttackingSquare(chess, humanKingSq, aiColor);
    const checkFigures = buildConcernedFigures(
      [humanKingSq],
      checkers.length > 0 ? checkers : [lastMove.to],
    );
    if (lastMove.piece === 'n' && canPlayCaseInGame('check_knight')) {
      return make('check_knight', 'CHECK', 'check', false, checkFigures);
    }
    if (lastMove.piece === 'q' && canPlayCaseInGame('check_queen')) {
      return make('check_queen', 'CHECK', 'check', false, checkFigures);
    }
    return make('check_general', 'CHECK', 'check', false, checkFigures);
  }

  // 5. FORCED MATE OR 2-STEP MATE THREAT
  if (((aiMateIn !== null && aiMateIn <= 3) || twoStep.hasMateThreat) && canPlayCaseInGame('warn_mate')) {
    const mateAttackers =
      twoStep.mateAttackerSqs.length > 0 ? twoStep.mateAttackerSqs : [lastMove.to];
    return make(
      'warn_mate',
      '2-STEP MATE THREAT',
      'warning',
      true,
      buildConcernedFigures([humanKingSq], mateAttackers),
    );
  }

  // 6. PROMOTION
  if (lastMove.promotion && canPlayCaseInGame('promotion')) {
    return make(
      'promotion',
      'PROMOTION',
      'threat',
      false,
      buildConcernedFigures([humanKingSq], [lastMove.to]),
    );
  }

  // 7. HIGH-VALUE CAPTURE
  if (lastMove.captured === 'q' && canPlayCaseInGame('capture_queen')) {
    return make('capture_queen', 'QUEEN CAPTURED', 'capture');
  }
  if (lastMove.captured === 'r' && canPlayCaseInGame('capture_rook')) {
    return make('capture_rook', 'ROOK CAPTURED', 'capture');
  }

  // 8. DIRECT PIECE THREAT
  if (threatenedHuman.length === 1) {
    const target = threatenedHuman[0];
    const targetAttackers = findPiecesAttackingSquare(chess, target.square, aiColor);
    const watchFigures = buildConcernedFigures(
      [target.square],
      targetAttackers.length > 0 ? targetAttackers : [lastMove.to],
    );
    if (target.type === 'q' && canPlayCaseInGame('watch_queen')) {
      return make('watch_queen', 'WATCH YOUR QUEEN', 'threat', true, watchFigures);
    }
    if (target.undefended || target.value >= 5) {
      if (target.type === 'r' && canPlayCaseInGame('watch_rook')) {
        return make('watch_rook', 'WATCH YOUR ROOK', 'threat', true, watchFigures);
      }
      if (target.type === 'b' && canPlayCaseInGame('watch_bishop')) {
        return make('watch_bishop', 'WATCH YOUR BISHOP', 'threat', true, watchFigures);
      }
      if (target.type === 'n' && canPlayCaseInGame('watch_knight')) {
        return make('watch_knight', 'WATCH YOUR KNIGHT', 'threat', true, watchFigures);
      }
    }
  }

  // 9. OPENING (first move pair)
  if (plyCount <= 2 && canPlayCaseInGame('opening')) {
    return make('opening', 'OPENING', 'opening', Boolean(calcAction));
  }

  // 10. SEARCH TREE OFFER (shows tried possibilities on the board)
  if (
    calcAction &&
    canPlayCaseInGame('calc_offer') &&
    (plyCount % 4 === 0 || Math.random() < 0.58)
  ) {
    return make('calc_offer', 'SEARCH TREE · SHOW LINES?', 'math', true);
  }

  // 11. CASTLING / PAWN / MINOR CAPTURE / SEARCH TREE
  if ((lastMove.san === 'O-O' || lastMove.san === 'O-O-O') && canPlayCaseInGame('castled')) {
    return make('castled', 'CASTLED', 'opening', Boolean(calcAction));
  }

  if (twoStep.passedPawnClose && lastMove.piece === 'p' && canPlayCaseInGame('warn_pawn_promo')) {
    const promoPawns =
      twoStep.passedPawnSqs.length > 0 ? twoStep.passedPawnSqs : [lastMove.to];
    return make(
      'warn_pawn_promo',
      'PASSED PAWN',
      'warning',
      false,
      buildConcernedFigures([humanKingSq], promoPawns),
    );
  }

  if ((lastMove.captured === 'n' || lastMove.captured === 'b') && canPlayCaseInGame('capture_minor')) {
    return make('capture_minor', 'CAPTURE', 'capture');
  }

  if (twoStep.openFileKingPressure && canPlayCaseInGame('warn_king_file') && Math.random() < 0.45) {
    return make(
      'warn_king_file',
      'FILE PRESSURE',
      'warning',
      false,
      buildConcernedFigures(
        [humanKingSq],
        twoStep.kingFileAttackerSqs.length > 0 ? twoStep.kingFileAttackerSqs : [lastMove.to],
      ),
    );
  }

  if (!allowCalc) {
    return null;
  }

  return make('calc_pure', 'SEARCH TREE', 'math', Boolean(calcAction));
}

/**
 * Triggered by the independent 100ms ticker when Chess Angel detects the player
 * hesitating on their turn, offering a gentle spoken hint + flat board arrow.
 */
export function composeHesitationCommentary(
  fen: string,
  analysis: AnalysisSnapshot | null,
): OpponentMessage | null {
  if (!canPlayCaseInGame('hesitate_hint')) return null;

  const chess = new Chess(fen);
  const legalMoves = chess.moves({ verbose: true });
  if (legalMoves.length === 0) return null;

  let bestMoveUci = '';
  let bestMoveSan = '';

  if (analysis && analysis.fen === fen && analysis.lines.length > 0) {
    bestMoveUci = analysis.lines[0].bestMoveUci;
    bestMoveSan = analysis.lines[0].pvSan[0] || bestMoveUci;
  } else {
    const captures = legalMoves.filter((m) => m.captured);
    const chosen = captures[0] || legalMoves[0];
    bestMoveUci = `${chosen.from}${chosen.to}${chosen.promotion || ''}`;
    bestMoveSan = chosen.san;
  }

  const entry = tryPickCaseClip('hesitate_hint');
  if (!entry) return null;

  return {
    id: messageSeq++,
    clipId: entry.clipId,
    text: entry.text,
    tag: 'HESITATION · HINT?',
    tone: 'hint',
    speaker: SPEAKER_NAME,
    mathSummary: `Top candidate ready`,
    action: {
      kind: 'hint-offer',
      bestMoveUci,
      bestMoveSan,
    },
  };
}

export type VoicePlaybackState = 'idle' | 'speaking' | 'awaiting-gesture';

type StateListener = (state: VoicePlaybackState) => void;

const VOICE_ASSET_VERSION = APP_BUILD_ID;
let seductionCustomAudioUrl: string | null = null;
let nextSeductionSlotAudioUrl: string | null = null;
let thankJanCustomAudioUrl: string | null = null;

export function setNextSeductionPlaybackAudio(url?: string | null): void {
  nextSeductionSlotAudioUrl = url && url.trim().length > 0 ? url : null;
}

export interface MusicTrack {
  id: string;
  title: string;
  url: string;
}

export interface MusicPlaybackSnapshot {
  enabled: boolean;
  playing: boolean;
  trackIndex: number;
  track: MusicTrack | null;
  tracks: MusicTrack[];
  unavailableTrackIndices: number[];
}

type MusicStateListener = (snapshot: MusicPlaybackSnapshot) => void;

export const QUEEN_THEME_MUSIC_URL = withAssetBuildVersion(
  '/assets/aistudio/Chess_Angle__a_beautiful_queen_and_her_infinite_re_8a3d493b.mp3',
);

export const CHESS_ANGEL_RAP_MUSIC_URL = withAssetBuildVersion(
  '/assets/aistudio/Chess_Angel_Rap_d8f30f60.mp3',
);

export const CHESS_ANGEL_THEME_MUSIC_URL = withAssetBuildVersion(
  '/assets/aistudio/Chess_Angle_2f568dfd.mp3',
);

export const MEDITATIONAL_MUSIC_URL = withAssetBuildVersion(
  '/assets/aistudio/meditational.mp3',
);

export const DEFAULT_MUSIC_TRACKS: readonly MusicTrack[] = [
  {
    id: 'queen_infinite_reign',
    title: "Queen's Infinite Reign",
    url: QUEEN_THEME_MUSIC_URL,
  },
  {
    id: 'chess_angel_rap',
    title: 'Chess Angel Rap',
    url: CHESS_ANGEL_RAP_MUSIC_URL,
  },
  {
    id: 'chess_angel_theme',
    title: 'Chess Angel',
    url: CHESS_ANGEL_THEME_MUSIC_URL,
  },
  {
    id: 'meditational',
    title: 'Meditational',
    url: MEDITATIONAL_MUSIC_URL,
  },
];

function buildVoiceUrl(clipId: VoiceClipId): string {
  if (clipId.startsWith('seduction_')) {
    return (
      nextSeductionSlotAudioUrl ||
      seductionCustomAudioUrl ||
      QUEEN_THEME_MUSIC_URL
    );
  }
  if (clipId.startsWith('thank_jan_')) {
    return thankJanCustomAudioUrl || `/voices/female/thank_jan.mp3?v=${VOICE_ASSET_VERSION}`;
  }
  return `/voices/female/${clipId}.mp3?v=${VOICE_ASSET_VERSION}`;
}

/**
 * 100% self-contained integrated MP3 voice player for Chess Angel.
 * - Preloads core sweet female studio MP3 clips into RAM on startup.
 * - Attaches capture-phase user-activation listeners ('click', 'pointerup', 'touchend',
 *   'mouseup', 'mousedown', 'pointerdown', 'keydown') so Web Audio & HTMLAudioElement
 *   unlock reliably across Chrome, Safari, Firefox, Edge, Android, iOS, and iframes.
 * - Never hangs on AudioContext.resume() (guarded by a strict 150ms timeout + HTMLAudio fallback).
 * - Routes decoded audio through an airy presence filter + makeup gain + dynamics limiter
 *   so her voice is clear and immediately audible.
 */
class OpponentSpeechController {
  private audioCtx: AudioContext | null = null;
  private masterInput: AudioNode | null = null;
  private activeSource: AudioBufferSourceNode | null = null;
  private activeHtmlAudio: HTMLAudioElement | null = null;
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private activeUtteranceTimer: number | null = null;
  private activeAbort: AbortController | null = null;
  private bgMusicElement: HTMLAudioElement | null = null;
  private bgMusicAudio: HTMLAudioElement | null = null;
  private bgMusicUrl: string | null = null;
  private pendingGestureBgMusicUrl: string | null = null;
  private bgMusicFadeRaf: number | null = null;
  private bgMusicStallTimer: number | null = null;
  private musicTracks: MusicTrack[] = [...DEFAULT_MUSIC_TRACKS];
  private unavailableMusicUrls = new Set<string>();
  private musicTrackIndex = 0;
  private musicPlaylistEnabled = false;
  private musicSoundAllowed = true;
  private musicStateListeners = new Set<MusicStateListener>();
  private preloadedMusicBlobUrls = new Map<string, string>();
  private bgMusicSeq = 0;
  private rawBytesCache = new Map<string, ArrayBuffer>();
  private bufferCache = new Map<string, AudioBuffer>();
  private speakSeq = 0;
  private sourceStartedAtCtxTime = 0;
  private sourceDurationSec = 0;
  private activeClipId: VoiceClipId | null = null;
  private speechStartedAtMs = 0;
  private pendingSpeechClip = false;

  private pendingGestureClip: {
    clipId: VoiceClipId;
    voiceMode: AngelVoiceMode;
    soundEnabled: boolean;
  } | null = null;

  private playbackState: VoicePlaybackState = 'idle';
  private listeners = new Set<StateListener>();
  private gestureListenersAttached = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.attachGlobalGestureUnlock();
      window.setTimeout(() => {
        this.preloadCoreClips();
        this.preloadBackgroundMusicTracks();
      }, 60);
    }
  }

  private isValidMp3Buffer(buf: ArrayBuffer): boolean {
    if (buf.byteLength < 65_536) return false;
    const view = new Uint8Array(buf, 0, Math.min(32, buf.byteLength));
    // Standard ID3v2 tag header ("ID3")
    if (view[0] === 0x49 && view[1] === 0x44 && view[2] === 0x33) return true;
    // Raw MPEG audio frame sync (11 set bits: 0xFF 0xE0..0xFF)
    for (let i = 0; i < view.length - 1; i++) {
      if (view[i] === 0xff && (view[i + 1] & 0xe0) === 0xe0) return true;
    }
    return false;
  }

  /**
   * Returns a single persistent, DOM-attached HTMLAudioElement for background music.
   * Reusing one unlocked element preserves user-gesture activation across track switches
   * (Queen <-> Rap) and async fallback retries on Windows Chrome, Android Chrome, iOS/macOS Safari & Firefox.
   */
  private ensureBgMusicElement(): HTMLAudioElement | null {
    if (typeof window === 'undefined' || typeof document === 'undefined') return null;
    if (!this.bgMusicElement) {
      const el = document.createElement('audio');
      el.preload = 'auto';
      el.loop = false;
      el.setAttribute('playsinline', '');
      el.setAttribute('webkit-playsinline', 'true');
      el.setAttribute('aria-hidden', 'true');
      el.style.display = 'none';
      if (document.body) {
        document.body.appendChild(el);
      }
      this.bgMusicElement = el;
    } else if (!this.bgMusicElement.isConnected && document.body) {
      document.body.appendChild(this.bgMusicElement);
    }
    return this.bgMusicElement;
  }

  public preloadBackgroundMusicTracks(): void {
    if (typeof window === 'undefined') return;
    // Lightweight HEAD check to detect any missing MP3 files up front without downloading megabytes
    for (const track of this.musicTracks) {
      const cleanKey = stripAssetQuery(track.url);
      void fetch(track.url, { method: 'HEAD', credentials: 'same-origin' })
        .then((res) => {
          const ct = (res.headers.get('content-type') || '').toLowerCase();
          const len = Number(res.headers.get('content-length') || '0');
          if (!res.ok || ct.includes('text/html') || (len > 0 && len < 65_536)) {
            if (!this.unavailableMusicUrls.has(cleanKey)) {
              this.unavailableMusicUrls.add(cleanKey);
              this.emitMusicState();
            }
          } else if (this.unavailableMusicUrls.delete(cleanKey)) {
            this.emitMusicState();
          }
        })
        .catch(() => {
          // Keep optimistic if offline/blocked
        });
    }
  }

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
    this.updateBgMusicDucking(next === 'speaking');
    for (const fn of this.listeners) {
      fn(next);
    }
  }

  private fadeBgMusicVolumeTo(targetVolume: number, durationMs: number): void {
    if (typeof window === 'undefined') return;
    if (this.bgMusicFadeRaf !== null) {
      window.cancelAnimationFrame(this.bgMusicFadeRaf);
      this.bgMusicFadeRaf = null;
    }
    const audio = this.bgMusicAudio;
    if (!audio || audio.paused || audio.ended) return;

    const startVol = audio.volume;
    const clampedTarget = Math.max(0, Math.min(1, targetVolume));
    if (Math.abs(startVol - clampedTarget) < 0.01 || durationMs <= 0) {
      audio.volume = clampedTarget;
      return;
    }
    const startMs = performance.now();
    const step = (now: number) => {
      if (this.bgMusicAudio !== audio || audio.paused || audio.ended) {
        this.bgMusicFadeRaf = null;
        return;
      }
      const t = Math.min(1, (now - startMs) / durationMs);
      audio.volume = startVol + (clampedTarget - startVol) * t;
      if (t < 1) {
        this.bgMusicFadeRaf = window.requestAnimationFrame(step);
      } else {
        this.bgMusicFadeRaf = null;
      }
    };
    this.bgMusicFadeRaf = window.requestAnimationFrame(step);
  }

  private getMusicTargetVolume(isVoiceSpeaking: boolean): number {
    if (isVoiceSpeaking) return 0.22;
    return this.musicPlaylistEnabled ? 0.68 : 0.84;
  }

  private getMusicSnapshot(): MusicPlaybackSnapshot {
    const safeIdx =
      this.musicTracks.length > 0
        ? ((this.musicTrackIndex % this.musicTracks.length) + this.musicTracks.length) %
          this.musicTracks.length
        : 0;
    const playing = Boolean(
      this.bgMusicAudio && !this.bgMusicAudio.paused && !this.bgMusicAudio.ended,
    );
    const unavailableTrackIndices: number[] = [];
    for (let i = 0; i < this.musicTracks.length; i++) {
      if (this.unavailableMusicUrls.has(stripAssetQuery(this.musicTracks[i].url))) {
        unavailableTrackIndices.push(i);
      }
    }
    return {
      enabled: this.musicPlaylistEnabled,
      playing,
      trackIndex: safeIdx,
      track: this.musicTracks[safeIdx] ?? null,
      tracks: [...this.musicTracks],
      unavailableTrackIndices,
    };
  }

  private emitMusicState(): void {
    const snap = this.getMusicSnapshot();
    for (const fn of this.musicStateListeners) {
      fn(snap);
    }
  }

  public subscribeMusicState(listener: MusicStateListener): () => void {
    this.musicStateListeners.add(listener);
    listener(this.getMusicSnapshot());
    return () => {
      this.musicStateListeners.delete(listener);
    };
  }

  public getMusicTracks(): MusicTrack[] {
    return [...this.musicTracks];
  }

  public setMusicTracks(tracks: MusicTrack[]): void {
    const cleaned = tracks
      .filter(
        (t) =>
          t &&
          typeof t.url === 'string' &&
          t.url.trim().length > 0 &&
          typeof t.title === 'string' &&
          t.title.trim().length > 0,
      )
      .map((t) => ({ ...t, url: withAssetBuildVersion(t.url) }));
    // Always preserve all locked DEFAULT_MUSIC_TRACKS while allowing updated URLs for the same id/title to replace a slot in place
    const merged: MusicTrack[] = [...DEFAULT_MUSIC_TRACKS];
    for (const t of cleaned) {
      const cleanUrl = stripAssetQuery(t.url);
      if (
        cleanUrl === '/assets/aistudio/Chess_Angle_RAP.mp3' ||
        cleanUrl === '/assets/aistudio/Angle_45923f8a.mp3'
      ) {
        continue;
      }
      const slotIdx = merged.findIndex(
        (m) =>
          m.id === t.id ||
          m.title.toLowerCase() === t.title.toLowerCase() ||
          stripAssetQuery(m.url) === cleanUrl,
      );
      if (slotIdx >= 0) {
        const prevClean = stripAssetQuery(merged[slotIdx].url);
        if (prevClean !== cleanUrl) {
          this.evictBrokenMusicBlob(prevClean);
        }
        merged[slotIdx] = { ...merged[slotIdx], url: t.url };
      } else {
        merged.push(t);
      }
    }
    const nextTracks = merged;
    const currentClean = this.musicTracks[this.musicTrackIndex]?.url
      ? stripAssetQuery(this.musicTracks[this.musicTrackIndex].url)
      : this.bgMusicUrl
        ? stripAssetQuery(this.bgMusicUrl)
        : null;
    this.musicTracks = nextTracks;
    if (currentClean) {
      const matchedIdx = nextTracks.findIndex((t) => stripAssetQuery(t.url) === currentClean);
      if (matchedIdx >= 0) {
        this.musicTrackIndex = matchedIdx;
      }
    } else {
      this.musicTrackIndex = 0;
    }
    this.preloadBackgroundMusicTracks();
    this.emitMusicState();
  }

  public updateMusicTrackSlotUrl(
    slotIndex: number,
    freshUrl: string,
    autoPlay: boolean,
    soundEnabled: boolean,
  ): void {
    if (slotIndex < 0 || slotIndex >= this.musicTracks.length) return;
    const prevClean = stripAssetQuery(this.musicTracks[slotIndex].url);
    const nextClean = stripAssetQuery(freshUrl);
    this.evictBrokenMusicBlob(prevClean);
    this.evictBrokenMusicBlob(nextClean);
    this.unavailableMusicUrls.delete(prevClean);
    this.unavailableMusicUrls.delete(nextClean);
    this.musicTracks[slotIndex] = {
      ...this.musicTracks[slotIndex],
      url: freshUrl,
    };
    if (autoPlay) {
      this.musicTrackIndex = slotIndex;
      this.musicPlaylistEnabled = true;
      this.musicSoundAllowed = soundEnabled;
      this.stopBackgroundMusicInternal(false);
      if (soundEnabled) {
        this.startBackgroundMusicUrl(freshUrl, 'direct-bust');
      }
    }
    this.emitMusicState();
  }

  public setBackgroundMusicEnabled(enabled: boolean, soundEnabled: boolean): void {
    this.musicPlaylistEnabled = enabled;
    this.musicSoundAllowed = soundEnabled;
    if (!enabled || !soundEnabled) {
      this.stopBackgroundMusicInternal(false);
      this.emitMusicState();
      return;
    }
    const track = this.musicTracks[this.musicTrackIndex] ?? DEFAULT_MUSIC_TRACKS[0];
    if (track) {
      this.startBackgroundMusicUrl(track.url);
    }
    this.emitMusicState();
  }

  public nextBackgroundMusicTrack(soundEnabled: boolean): void {
    if (this.musicTracks.length === 0) return;
    this.musicTrackIndex = (this.musicTrackIndex + 1) % this.musicTracks.length;
    this.musicPlaylistEnabled = true;
    this.musicSoundAllowed = soundEnabled;
    if (!soundEnabled) {
      this.stopBackgroundMusicInternal(false);
      this.emitMusicState();
      return;
    }
    const track = this.musicTracks[this.musicTrackIndex];
    if (track) {
      this.stopBackgroundMusicInternal(false);
      this.startBackgroundMusicUrl(track.url);
    }
    this.emitMusicState();
  }

  public selectBackgroundMusicTrack(index: number, soundEnabled: boolean): void {
    if (this.musicTracks.length === 0) return;
    const safeIdx = ((index % this.musicTracks.length) + this.musicTracks.length) % this.musicTracks.length;
    this.musicTrackIndex = safeIdx;
    this.musicPlaylistEnabled = true;
    this.musicSoundAllowed = soundEnabled;
    if (!soundEnabled) {
      this.stopBackgroundMusicInternal(false);
      this.emitMusicState();
      return;
    }
    const track = this.musicTracks[safeIdx];
    if (track) {
      const sameTrackPlaying = Boolean(
        this.bgMusicAudio &&
          !this.bgMusicAudio.paused &&
          !this.bgMusicAudio.ended &&
          !this.bgMusicAudio.error &&
          this.bgMusicAudio.readyState >= 2 &&
          this.bgMusicAudio.currentTime > 0.05 &&
          this.bgMusicUrl &&
          stripAssetQuery(this.bgMusicUrl) === stripAssetQuery(track.url),
      );
      if (!sameTrackPlaying) {
        this.stopBackgroundMusicInternal(false);
        this.startBackgroundMusicUrl(track.url, 'direct');
      } else {
        this.updateBgMusicDucking(this.playbackState === 'speaking');
      }
    }
    this.emitMusicState();
  }

  private updateBgMusicDucking(isVoiceSpeaking: boolean): void {
    if (!this.bgMusicAudio || this.bgMusicAudio.paused || this.bgMusicAudio.ended) return;
    // Gently duck background music while Chess Angel speaks so her voice stays crystal clear,
    // then swell smoothly back up once she finishes speaking.
    const target = this.getMusicTargetVolume(isVoiceSpeaking);
    if (isVoiceSpeaking) {
      this.fadeBgMusicVolumeTo(target, 240);
    } else {
      this.fadeBgMusicVolumeTo(target, 520);
    }
  }

  private clearBgMusicStallTimer(): void {
    if (this.bgMusicStallTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.bgMusicStallTimer);
      this.bgMusicStallTimer = null;
    }
  }

  private evictBrokenMusicBlob(cleanKey: string): void {
    const blobUrl = this.preloadedMusicBlobUrls.get(cleanKey);
    if (blobUrl) {
      this.preloadedMusicBlobUrls.delete(cleanKey);
      try {
        URL.revokeObjectURL(blobUrl);
      } catch {
        // ignore
      }
    }
  }

  private async fetchMusicBlobUrl(url: string): Promise<string | null> {
    const cleanKey = stripAssetQuery(url);
    const existing = this.preloadedMusicBlobUrls.get(cleanKey);
    if (existing) return existing;
    try {
      const fetchUrl = `${url}${url.includes('?') ? '&' : '?'}musicblob=1`;
      const res = await fetch(fetchUrl, { credentials: 'same-origin' });
      if (!res.ok) return null;
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html')) return null;
      const bytes = await res.arrayBuffer();
      if (!this.isValidMp3Buffer(bytes)) return null;
      const objUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
      this.preloadedMusicBlobUrls.set(cleanKey, objUrl);
      return objUrl;
    } catch {
      return null;
    }
  }

  private startBackgroundMusicUrl(
    url: string,
    mode: 'direct' | 'blob' | 'direct-bust' = 'direct',
  ): void {
    const cleanTarget = stripAssetQuery(url);
    // If the same song is already actively advancing in the background, keep it playing smoothly
    if (
      this.bgMusicAudio &&
      !this.bgMusicAudio.paused &&
      !this.bgMusicAudio.ended &&
      !this.bgMusicAudio.error &&
      this.bgMusicAudio.readyState >= 2 &&
      this.bgMusicAudio.currentTime > 0.05 &&
      this.bgMusicUrl &&
      stripAssetQuery(this.bgMusicUrl) === cleanTarget
    ) {
      this.updateBgMusicDucking(this.playbackState === 'speaking');
      this.emitMusicState();
      return;
    }

    this.stopBackgroundMusicInternal(false);
    const seq = ++this.bgMusicSeq;

    const audio = this.ensureBgMusicElement() || new Audio();
    const cachedBlobUrl = this.preloadedMusicBlobUrls.get(cleanTarget);

    // Prefer already-verified Blob URL if present; otherwise stream untouched MP3 directly via HTTP 206
    let playSrc = url;
    let usingBlob = false;
    if (mode === 'blob') {
      if (cachedBlobUrl) {
        playSrc = cachedBlobUrl;
        usingBlob = true;
      } else {
        // Fetch the full untouched MP3 into a Blob URL (bypasses any OS/SW HTTP Range quirk)
        this.bgMusicAudio = audio;
        this.bgMusicUrl = url;
        void this.fetchMusicBlobUrl(url).then((blobUrl) => {
          if (this.bgMusicSeq !== seq) return;
          if (blobUrl) {
            this.startBackgroundMusicUrl(url, 'blob');
          } else {
            this.startBackgroundMusicUrl(url, 'direct-bust');
          }
        });
        return;
      }
    } else if (mode === 'direct' && cachedBlobUrl) {
      playSrc = cachedBlobUrl;
      usingBlob = true;
    } else if (mode === 'direct-bust') {
      playSrc = `${url}${url.includes('?') ? '&' : '?'}direct=1`;
    }

    audio.onended = null;
    audio.onerror = null;
    audio.oncanplay = null;
    audio.onplaying = null;
    audio.onstalled = null;
    audio.loop = false;
    audio.muted = false;
    audio.preload = 'auto';
    audio.volume = this.getMusicTargetVolume(this.playbackState === 'speaking');

    try {
      audio.pause();
    } catch {
      // ignore
    }
    audio.src = playSrc;
    try {
      audio.currentTime = 0;
    } catch {
      // ignore if metadata not yet ready
    }
    audio.load();

    this.bgMusicAudio = audio;
    this.bgMusicUrl = url;

    const triggerFallback = () => {
      if (this.bgMusicSeq !== seq || this.bgMusicAudio !== audio) return;
      this.clearBgMusicStallTimer();
      if (usingBlob) {
        this.evictBrokenMusicBlob(cleanTarget);
        if (mode !== 'direct-bust') {
          this.startBackgroundMusicUrl(url, 'direct-bust');
          return;
        }
      } else if (mode === 'direct') {
        this.startBackgroundMusicUrl(url, 'blob');
        return;
      }
      this.unavailableMusicUrls.add(cleanTarget);
      this.bgMusicAudio = null;
      this.bgMusicUrl = null;
      this.emitMusicState();
    };

    audio.onplaying = () => {
      if (this.bgMusicSeq !== seq || this.bgMusicAudio !== audio) return;
      this.clearBgMusicStallTimer();
      this.unavailableMusicUrls.delete(cleanTarget);
      this.pendingGestureBgMusicUrl = null;
      this.updateBgMusicDucking(this.playbackState === 'speaking');
      this.emitMusicState();
    };

    audio.oncanplay = () => {
      if (this.bgMusicSeq !== seq || this.bgMusicAudio !== audio) return;
      if (audio.paused && !audio.ended && !audio.error && this.musicSoundAllowed) {
        const retryP = audio.play();
        if (retryP !== undefined) {
          retryP.catch(() => {});
        }
      }
    };

    audio.onstalled = () => {
      if (this.bgMusicSeq !== seq || this.bgMusicAudio !== audio) return;
      if (audio.currentTime < 0.05 && mode === 'direct') {
        triggerFallback();
      }
    };

    audio.onended = () => {
      if (this.bgMusicSeq !== seq || this.bgMusicAudio !== audio) return;
      this.clearBgMusicStallTimer();
      this.bgMusicAudio = null;
      this.bgMusicUrl = null;
      if (this.musicPlaylistEnabled && this.musicSoundAllowed && this.musicTracks.length > 0) {
        let nextIdx = (this.musicTrackIndex + 1) % this.musicTracks.length;
        for (let step = 0; step < this.musicTracks.length; step++) {
          const cand = this.musicTracks[nextIdx];
          if (cand && !this.unavailableMusicUrls.has(stripAssetQuery(cand.url))) {
            this.musicTrackIndex = nextIdx;
            this.startBackgroundMusicUrl(cand.url, 'direct');
            return;
          }
          nextIdx = (nextIdx + 1) % this.musicTracks.length;
        }
      }
      this.emitMusicState();
    };

    audio.onerror = () => {
      if (this.bgMusicSeq !== seq || this.bgMusicAudio !== audio) return;
      triggerFallback();
    };

    // Startup stall watchdog: if native direct HTTP streaming doesn't start advancing within 4.5s,
    // automatically switch to verified Blob-URL playback on the same unlocked audio element.
    if (typeof window !== 'undefined' && mode === 'direct') {
      this.clearBgMusicStallTimer();
      this.bgMusicStallTimer = window.setTimeout(() => {
        this.bgMusicStallTimer = null;
        if (this.bgMusicSeq !== seq || this.bgMusicAudio !== audio) return;
        if (audio.paused || audio.readyState < 2 || audio.currentTime < 0.02) {
          triggerFallback();
        }
      }, 4500);
    }

    const attemptPlay = (allowAbortRetry: boolean) => {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            if (this.bgMusicSeq === seq && this.bgMusicAudio === audio) {
              this.pendingGestureBgMusicUrl = null;
              this.emitMusicState();
            }
          })
          .catch((err) => {
            if (this.bgMusicSeq !== seq) return;
            const errName =
              err && typeof err === 'object' && 'name' in err
                ? String((err as { name?: unknown }).name)
                : '';
            if (errName === 'NotAllowedError') {
              this.clearBgMusicStallTimer();
              if (this.bgMusicAudio === audio) {
                this.bgMusicAudio = null;
                this.bgMusicUrl = null;
              }
              this.pendingGestureBgMusicUrl = url;
              this.emitMusicState();
              return;
            }
            if (errName === 'AbortError' && allowAbortRetry && typeof window !== 'undefined') {
              // Switching tracks rapidly (pause + src swap + load + play) can throw AbortError on Chrome:
              // retry once cleanly on the same unlocked element.
              window.setTimeout(() => {
                if (this.bgMusicSeq === seq && this.bgMusicAudio === audio && !audio.error) {
                  attemptPlay(false);
                }
              }, 120);
              return;
            }
            triggerFallback();
          });
      } else {
        this.emitMusicState();
      }
    };

    attemptPlay(true);
  }

  private playSeductionBackgroundMusic(url: string): void {
    // If continuous background music is already playing via the Music toggle, keep it flowing seamlessly
    if (
      this.musicPlaylistEnabled &&
      this.bgMusicAudio &&
      !this.bgMusicAudio.paused &&
      !this.bgMusicAudio.ended
    ) {
      this.updateBgMusicDucking(this.playbackState === 'speaking');
      return;
    }
    const cleanUrl = stripAssetQuery(url);
    const matchedIdx = this.musicTracks.findIndex((t) => stripAssetQuery(t.url) === cleanUrl);
    if (matchedIdx >= 0) {
      this.musicTrackIndex = matchedIdx;
    }
    this.startBackgroundMusicUrl(url, 'direct');
  }

  private stopBackgroundMusicInternal(clearPlaylist: boolean): void {
    this.bgMusicSeq++;
    this.clearBgMusicStallTimer();
    if (clearPlaylist) {
      this.musicPlaylistEnabled = false;
    }
    if (this.bgMusicFadeRaf !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(this.bgMusicFadeRaf);
      this.bgMusicFadeRaf = null;
    }
    this.pendingGestureBgMusicUrl = null;
    if (this.bgMusicAudio) {
      try {
        this.bgMusicAudio.onended = null;
        this.bgMusicAudio.onerror = null;
        this.bgMusicAudio.oncanplay = null;
        this.bgMusicAudio.onplaying = null;
        this.bgMusicAudio.onstalled = null;
        this.bgMusicAudio.pause();
        if (this.bgMusicAudio.readyState >= 1) {
          this.bgMusicAudio.currentTime = 0;
        }
      } catch {
        // ignore
      }
      this.bgMusicAudio = null;
    }
    this.bgMusicUrl = null;
  }

  public stopBackgroundMusic(): void {
    this.stopBackgroundMusicInternal(false);
    this.emitMusicState();
  }

  private attachGlobalGestureUnlock(): void {
    if (this.gestureListenersAttached || typeof window === 'undefined') return;
    this.gestureListenersAttached = true;

    const handleActivation = (ev: Event) => {
      this.unlock();
      const targetEl = ev.target instanceof Element ? ev.target : null;
      const isMusicSelectorClick = Boolean(
        targetEl?.closest('[aria-label="Select background song"]'),
      );
      if (this.pendingGestureBgMusicUrl && this.musicSoundAllowed && !isMusicSelectorClick) {
        const queuedMusicUrl = this.pendingGestureBgMusicUrl;
        this.pendingGestureBgMusicUrl = null;
        this.startBackgroundMusicUrl(queuedMusicUrl, 'direct');
      }
      if (this.pendingGestureClip) {
        const queued = this.pendingGestureClip;
        this.pendingGestureClip = null;
        this.playClip(queued.clipId, queued.voiceMode, queued.soundEnabled);
      }
    };

    const events = [
      'click',
      'pointerup',
      'touchend',
      'mouseup',
      'mousedown',
      'pointerdown',
      'keydown',
    ] as const;

    for (const evt of events) {
      window.addEventListener(evt, handleActivation, { capture: true, passive: true });
    }
  }

  public preloadCoreClips(): void {
    const coreCases: CommentaryCaseId[] = [
      'intro',
      'opening',
      'resign',
      'new_match',
      'clock_timeout',
      'save_game',
      'load_game',
      'ask_promotion',
      'promotion',
      'calc_offer',
      'calc_pure',
      'wrong_distracted',
      'tree_browse',
      'wrong_hang_minor',
      'wrong_better_alt',
      'hesitate_hint',
    ];
    for (const caseId of coreCases) {
      const nextCount = (interMatchCaseFlags.get(caseId) || 0) + 1;
      const nextClipId = resolveClipIdForOccurrence(caseId, nextCount);
      void this.fetchMp3Bytes(buildVoiceUrl(nextClipId));
    }
  }

  private async fetchMp3Bytes(url: string, signal?: AbortSignal): Promise<ArrayBuffer | null> {
    const existing = this.rawBytesCache.get(url);
    if (existing) return existing;

    try {
      const res = await fetch(url, { signal });
      if (!res.ok) return null;
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('text/html')) return null;
      const bytes = await res.arrayBuffer();
      if (bytes.byteLength < 256) return null;
      this.rawBytesCache.set(url, bytes);
      return bytes;
    } catch {
      return null;
    }
  }

  private ensureAudioGraph(): { ctx: AudioContext; input: AudioNode } | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      try {
        this.audioCtx = new Ctx();
      } catch {
        return null;
      }
    }

    const ctx = this.audioCtx;
    if (!this.masterInput) {
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 80;
      highpass.Q.value = 0.707;

      const warmthClarity = ctx.createBiquadFilter();
      warmthClarity.type = 'peaking';
      warmthClarity.frequency.value = 300;
      warmthClarity.Q.value = 1.1;
      warmthClarity.gain.value = -1.2;

      const silkAir = ctx.createBiquadFilter();
      silkAir.type = 'highshelf';
      silkAir.frequency.value = 5200;
      silkAir.gain.value = 0.8;

      const makeupGain = ctx.createGain();
      makeupGain.gain.value = 1.08;

      // Transparent true-peak ceiling only (16ms attack > 5ms female F0 period so individual
      // glottal cycles are never wave-shaped or intermodulated)
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -1.0;
      limiter.knee.value = 2.5;
      limiter.ratio.value = 12.0;
      limiter.attack.value = 0.016;
      limiter.release.value = 0.16;

      highpass.connect(warmthClarity);
      warmthClarity.connect(silkAir);
      silkAir.connect(makeupGain);
      makeupGain.connect(limiter);
      limiter.connect(ctx.destination);
      this.masterInput = highpass;
    }

    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
    return { ctx, input: this.masterInput };
  }

  public unlock(): void {
    const graph = this.ensureAudioGraph();
    if (!graph) return;
    const { ctx } = graph;
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
    if ((ctx.state as string) === 'running') {
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

  private async tryResumeWithTimeout(ctx: AudioContext, timeoutMs = 150): Promise<boolean> {
    if ((ctx.state as string) === 'running') return true;
    try {
      await Promise.race([
        ctx.resume(),
        new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs)),
      ]);
    } catch {
      return false;
    }
    return (ctx.state as string) === 'running';
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
    this.sourceStartedAtCtxTime = 0;
    this.sourceDurationSec = 0;
    this.speechStartedAtMs = 0;
    this.pendingSpeechClip = false;
    if (this.activeHtmlAudio) {
      try {
        this.activeHtmlAudio.onended = null;
        this.activeHtmlAudio.onerror = null;
        this.activeHtmlAudio.pause();
        this.activeHtmlAudio.currentTime = 0;
      } catch {
        // ignore
      }
      this.activeHtmlAudio = null;
    }
    if (this.activeUtteranceTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.activeUtteranceTimer);
      this.activeUtteranceTimer = null;
    }
    if (this.activeUtterance) {
      this.activeUtterance.onend = null;
      this.activeUtterance.onerror = null;
      this.activeUtterance = null;
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // ignore
        }
      }
    }
  }

  private speakViaSpeechSynthesis(clipId: VoiceClipId, seq: number): boolean {
    if (seq !== this.speakSeq || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return false;
    }
    const text = CLIP_TEXT[clipId];
    if (!text) return false;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'en-US';
      utter.rate = 0.98;
      utter.pitch = 1.06;
      const voices = window.speechSynthesis.getVoices?.() || [];
      const femaleVoice =
        voices.find(
          (v) =>
            v.lang.toLowerCase().startsWith('en') &&
            /female|zira|aria|jenny|samantha|victoria|karen|moira|google uk english female|google us english/i.test(
              v.name,
            ),
        ) || voices.find((v) => v.lang.toLowerCase().startsWith('en'));
      if (femaleVoice) {
        utter.voice = femaleVoice;
      }
      const finish = () => {
        if (this.activeUtteranceTimer !== null) {
          window.clearTimeout(this.activeUtteranceTimer);
          this.activeUtteranceTimer = null;
        }
        if (this.activeUtterance === utter) {
          this.activeUtterance = null;
          if (seq === this.speakSeq) {
            this.setPlaybackState('idle');
          }
        }
      };
      utter.onend = finish;
      utter.onerror = finish;
      this.activeUtterance = utter;
      this.pendingSpeechClip = false;
      this.speechStartedAtMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.pendingGestureClip = null;
      this.setPlaybackState('speaking');
      window.speechSynthesis.speak(utter);
      this.activeUtteranceTimer = window.setTimeout(finish, 8500);
      return true;
    } catch {
      return false;
    }
  }

  private async playDecodedBuffer(buffer: AudioBuffer, seq: number): Promise<boolean> {
    if (seq !== this.speakSeq) return false;
    const graph = this.ensureAudioGraph();
    if (!graph) return false;

    const { ctx, input } = graph;
    const running = await this.tryResumeWithTimeout(ctx, 150);
    if (!running || seq !== this.speakSeq) {
      return false;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(input);

    source.onended = () => {
      if (this.activeSource === source) {
        this.activeSource = null;
        this.sourceStartedAtCtxTime = 0;
        this.sourceDurationSec = 0;
        if (seq === this.speakSeq) {
          this.setPlaybackState('idle');
        }
      }
    };

    this.activeSource = source;
    this.sourceStartedAtCtxTime = ctx.currentTime;
    this.sourceDurationSec = buffer.duration;
    this.pendingSpeechClip = false;
    this.speechStartedAtMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.pendingGestureClip = null;
    this.setPlaybackState('speaking');
    source.start(0);
    return true;
  }

  private async playViaHtmlAudio(
    url: string,
    seq: number,
    clipInfo: { clipId: VoiceClipId; voiceMode: AngelVoiceMode; soundEnabled: boolean },
    allowSpeechFallback = false,
  ): Promise<void> {
    if (seq !== this.speakSeq) return;
    const audio = new Audio(url);
    audio.preload = 'auto';
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
          if (allowSpeechFallback && this.speakViaSpeechSynthesis(clipInfo.clipId, seq)) {
            return;
          }
          this.setPlaybackState('idle');
        }
      }
    };

    try {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        await playPromise;
      }
      if (seq === this.speakSeq) {
        this.pendingSpeechClip = false;
        this.speechStartedAtMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
        this.pendingGestureClip = null;
        this.setPlaybackState('speaking');
      }
    } catch (err) {
      if (this.activeHtmlAudio === audio) {
        this.activeHtmlAudio = null;
      }
      const isAutoplayBlocked =
        err instanceof DOMException && err.name === 'NotAllowedError';
      if (seq === this.speakSeq) {
        this.pendingSpeechClip = false;
        if (isAutoplayBlocked) {
          this.pendingGestureClip = clipInfo;
          this.setPlaybackState('awaiting-gesture');
        } else if (allowSpeechFallback && this.speakViaSpeechSynthesis(clipInfo.clipId, seq)) {
          return;
        } else {
          this.setPlaybackState('idle');
        }
      }
    }
  }

  public playClip(
    clipId: VoiceClipId,
    voiceMode: AngelVoiceMode,
    soundEnabled: boolean,
  ): void {
    if (!soundEnabled || voiceMode === 'off') {
      this.pendingGestureClip = null;
      this.pendingSpeechClip = false;
      return;
    }

    this.stopActivePlayback();
    const seq = ++this.speakSeq;
    const url = buildVoiceUrl(clipId);
    const clipInfo = { clipId, voiceMode, soundEnabled };

    // Play the seduction soundtrack on its own independent background music channel (non-looping)
    // so it plays all the way until its natural end and continues smoothly in the background
    // across subsequent moves and Chess Angel voice lines (softly ducking while she speaks).
    if (clipId.startsWith('seduction_')) {
      this.activeClipId = null;
      this.pendingSpeechClip = false;
      this.setPlaybackState('idle');
      this.playSeductionBackgroundMusic(url);
      return;
    }

    this.activeClipId = clipId;
    this.pendingSpeechClip = true;

    const graph = this.ensureAudioGraph();
    const cachedBuffer = this.bufferCache.get(url);

    if (cachedBuffer && graph && (graph.ctx.state as string) === 'running') {
      void this.playDecodedBuffer(cachedBuffer, seq);
      return;
    }

    // Emit 'idle' while preparing a new async clip so secondary messages cleanly transition
    // false -> true on audio start (while `isPreparingSpeech()` keeps portrait lip-sync active).
    if (this.playbackState === 'speaking') {
      this.setPlaybackState('idle');
    }

    const controller = new AbortController();
    this.activeAbort = controller;

    void (async () => {
      try {
        const mp3Bytes = await this.fetchMp3Bytes(url, controller.signal);
        if (seq !== this.speakSeq) return;

        if (mp3Bytes && graph) {
          try {
            let decoded = this.bufferCache.get(url);
            if (!decoded) {
              decoded = await graph.ctx.decodeAudioData(mp3Bytes.slice(0));
              this.bufferCache.set(url, decoded);
            }
            if (seq !== this.speakSeq) return;
            const playedViaWebAudio = await this.playDecodedBuffer(decoded, seq);
            if (playedViaWebAudio) return;
          } catch {
            // Fall through to HTMLAudioElement playback
          }
        }

        await this.playViaHtmlAudio(url, seq, clipInfo, !mp3Bytes);
      } catch {
        if (!controller.signal.aborted && seq === this.speakSeq) {
          this.pendingSpeechClip = false;
          this.setPlaybackState('idle');
        }
      } finally {
        if (this.activeAbort === controller) {
          this.activeAbort = null;
        }
      }
    })();
  }

  /**
   * True while a newly triggered spoken voice clip is being fetched or decoded before frame 0 of audio.
   * Prevents the portrait from prematurely settling to closed-mouth idle between consecutive messages.
   */
  public isPreparingSpeech(): boolean {
    return this.pendingSpeechClip;
  }

  public getActiveClipId(): VoiceClipId | null {
    return this.activeClipId;
  }

  /**
   * Returns exact elapsed spoken audio time in seconds for the currently playing voice line,
   * or 0 when Chess Angel is silent.
   */
  public getElapsedSpeechSeconds(): number {
    if (this.playbackState !== 'speaking') return 0;

    if (this.activeSource && this.audioCtx && this.sourceDurationSec > 0) {
      const elapsed = Math.max(0, this.audioCtx.currentTime - this.sourceStartedAtCtxTime);
      return Math.min(this.sourceDurationSec, elapsed);
    }

    if (this.activeHtmlAudio && !this.activeHtmlAudio.paused && !this.activeHtmlAudio.ended) {
      return Math.max(0, this.activeHtmlAudio.currentTime);
    }

    if (this.activeUtterance && this.speechStartedAtMs > 0) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      return Math.max(0, (now - this.speechStartedAtMs) / 1000);
    }

    return 0;
  }

  /**
   * Returns exact remaining spoken audio time in seconds for the currently playing voice line,
   * or a positive buffer while an active spoken clip is still preparing/playing.
   */
  public getRemainingSpeechSeconds(): number {
    if (this.pendingSpeechClip) return 2.0;
    if (this.playbackState !== 'speaking') return 0;

    if (this.activeSource && this.audioCtx && this.sourceDurationSec > 0) {
      const elapsed = Math.max(0, this.audioCtx.currentTime - this.sourceStartedAtCtxTime);
      return Math.max(0, this.sourceDurationSec - elapsed);
    }

    if (this.activeHtmlAudio && !this.activeHtmlAudio.paused && !this.activeHtmlAudio.ended) {
      const dur = this.activeHtmlAudio.duration;
      if (Number.isFinite(dur) && dur > 0) {
        return Math.max(0, dur - this.activeHtmlAudio.currentTime);
      }
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const elapsed = this.speechStartedAtMs > 0 ? Math.max(0, (now - this.speechStartedAtMs) / 1000) : 0;
      return Math.max(0.8, 5.5 - elapsed);
    }

    if (this.activeUtterance) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const elapsed = this.speechStartedAtMs > 0 ? Math.max(0, (now - this.speechStartedAtMs) / 1000) : 0;
      return Math.max(0.8, 6.0 - elapsed);
    }

    // playbackState is explicitly 'speaking' — never under-report 0 while voice is active
    return 0.8;
  }

  public invalidateSeductionCache(): void {
    for (const k of Array.from(this.rawBytesCache.keys())) {
      if (k.includes('seduction.mp3') || k.includes('Chess_Angle__a_beautiful_queen')) {
        this.rawBytesCache.delete(k);
      }
    }
    for (const k of Array.from(this.bufferCache.keys())) {
      if (k.includes('seduction.mp3') || k.includes('Chess_Angle__a_beautiful_queen')) {
        this.bufferCache.delete(k);
      }
    }
  }

  public invalidateThankJanCache(): void {
    for (const k of Array.from(this.rawBytesCache.keys())) {
      if (k.includes('thank_jan')) {
        this.rawBytesCache.delete(k);
      }
    }
    for (const k of Array.from(this.bufferCache.keys())) {
      if (k.includes('thank_jan')) {
        this.bufferCache.delete(k);
      }
    }
  }

  public stop(): void {
    this.speakSeq++;
    this.pendingGestureClip = null;
    this.stopActivePlayback();
    this.setPlaybackState('idle');
  }
}

export const opponentSpeech = new OpponentSpeechController();

export function setSeductionAudioUrlOverride(url?: string | null): void {
  const next = url && url.length > 0 ? url : null;
  if (next !== seductionCustomAudioUrl) {
    seductionCustomAudioUrl = next;
    opponentSpeech.invalidateSeductionCache();
  }
}

export function setThankJanAudioUrlOverride(url?: string | null): void {
  const next = url && url.length > 0 ? url : null;
  if (next !== thankJanCustomAudioUrl) {
    thankJanCustomAudioUrl = next;
    opponentSpeech.invalidateThankJanCache();
  }
}

export function setMusicTracksOverride(tracks?: MusicTrack[] | null): void {
  if (Array.isArray(tracks) && tracks.length > 0) {
    opponentSpeech.setMusicTracks(tracks);
  }
}
