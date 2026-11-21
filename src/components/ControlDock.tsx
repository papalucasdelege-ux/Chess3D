import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Rewind,
  FastForward,
  Volume2,
  VolumeX,
  RotateCcw,
  Copy,
  Check,
  Save,
  Trash2,
  Flag,
  Handshake,
  Users,
  Eye,
  Download,
} from 'lucide-react';
import {
  ENGINE_LEVELS,
  TIME_CONTROLS,
  type AnalysisSnapshot,
  type AnalyzedMoveMeta,
  type BoardSkinId,
  type CameraPreset,
  type EngineLevel,
  type GameMode,
  type LightingMood,
  type MoveRecord,
  type PieceColor,
  type PublicRoomSummary,
  type RoomState,
  type SavedGame,
  type TimeControlId,
} from '../shared/types';
import { SKIN_LIST } from '../three/skins';
import { formatEvalLabel } from '../chess/engine';
import type { OpponentVoiceGender } from '../chess/opponentVoice';
import type { ConnectionStatus } from '../services/multiplayerClient';
import type { DockTab } from './TopBar';

interface ControlDockProps {
  activeTab: DockTab;
  onSelectTab: (tab: DockTab) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;

  // Play & AI
  gameMode: GameMode;
  onStartLocalGame: (tc: TimeControlId) => void;
  onStartEngineGame: (level: EngineLevel, playerColor: PieceColor | 'random', tc: TimeControlId) => void;
  engineLevel: EngineLevel;
  onChangeEngineLevel: (level: EngineLevel) => void;
  humanColorVsAi: PieceColor | 'random';
  onChangeHumanColorVsAi: (c: PieceColor | 'random') => void;
  timeControl: TimeControlId;
  onChangeTimeControl: (tc: TimeControlId) => void;
  cameraPreset: CameraPreset;
  onSelectCameraPreset: (preset: CameraPreset) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  opponentVoice: OpponentVoiceGender;
  onChangeOpponentVoice: (gender: OpponentVoiceGender) => void;
  showSpeechBubbles: boolean;
  onToggleSpeechBubbles: () => void;
  onOpenDownload: () => void;
  canUndo: boolean;
  onUndo: () => void;
  onResignLocal: () => void;
  isGameActive: boolean;

  // Multiplayer
  wsStatus: ConnectionStatus;
  onlineCount: number;
  queueCount: number;
  playerName: string;
  onChangePlayerName: (name: string) => void;
  inQueue: boolean;
  onJoinMatchmaking: () => void;
  onCancelMatchmaking: () => void;
  publicRooms: PublicRoomSummary[];
  activeRoom: RoomState | null;
  myRoomRole: PieceColor | 'spectator' | null;
  roomError: string | null;
  onCreateRoom: (preferredColor: PieceColor | 'random', isPublic: boolean) => void;
  onJoinRoom: (roomId: string) => void;
  onLeaveRoom: () => void;
  onOfferDraw: () => void;
  onRespondDraw: (accept: boolean) => void;
  onResignOnline: () => void;
  onVoteRematch: () => void;

  // Analysis
  analysisEnabled: boolean;
  onToggleAnalysis: () => void;
  showBestMoveArrow: boolean;
  onToggleBestMoveArrow: () => void;
  analysis: AnalysisSnapshot | null;
  moveHistory: MoveRecord[];
  viewPly: number;
  onJumpToPly: (ply: number) => void;
  moveEvalMeta: Record<number, AnalyzedMoveMeta>;
  currentFen: string;
  currentPgn: string;
  onPlayEngineMove: (uci: string) => void;

  // Replay
  isReplayMode: boolean;
  activeReplayGame: SavedGame | null;
  replayPlaying: boolean;
  replaySpeed: number;
  onToggleReplayPlay: () => void;
  onChangeReplaySpeed: (speed: number) => void;
  onRewindStep: () => void;
  onFastForwardStep: () => void;
  savedGames: SavedGame[];
  classicReplays: SavedGame[];
  onLoadReplay: (game: SavedGame) => void;
  onExitReplay: () => void;
  onSaveCurrentGame: () => void;
  onDeleteSavedGame: (id: string) => void;
  canSaveCurrent: boolean;

  // Skins
  skinId: BoardSkinId;
  onSelectSkin: (id: BoardSkinId) => void;
  lightingMood: LightingMood;
  onSelectLightingMood: (mood: LightingMood) => void;
  showCoordinates: boolean;
  onToggleCoordinates: () => void;
}

const QUALITY_COLORS: Record<string, string> = {
  best: 'text-[#6ee7b7]',
  excellent: 'text-[#93c5fd]',
  good: 'text-[#cbd5e1]',
  inaccuracy: 'text-[#fbbf24]',
  mistake: 'text-[#fb923c]',
  blunder: 'text-[#f87171]',
};

const LEVEL_ORDER: EngineLevel[] = ['beginner', 'intermediate', 'advanced', 'master', 'grandmaster'];
const TC_ORDER: TimeControlId[] = ['3+0', '5+3', '10+0', 'unlimited'];

export function ControlDock(props: ControlDockProps) {
  const [joinCode, setJoinCode] = useState('');
  const [roomColorPref, setRoomColorPref] = useState<PieceColor | 'random'>('random');
  const [roomPublic, setRoomPublic] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [replayListTab, setReplayListTab] = useState<'saved' | 'classics'>('saved');

  const copyText = (key: string, value: string) => {
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1800);
  };

  const totalPlies = props.moveHistory.length;
  const currentMoveRec = props.viewPly > 0 ? props.moveHistory[props.viewPly - 1] : null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 w-[min(960px,95vw)] pointer-events-none flex flex-col items-center">
      {/* Collapse / Expand Handle */}
      <div className="pointer-events-auto flex items-center gap-2 mb-1.5">
        <button
          type="button"
          onClick={props.onToggleCollapse}
          aria-expanded={!props.collapsed}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#12161e]/92 hover:bg-[#1a202c] border border-white/12 text-[11px] font-medium text-[#cfd5e0] transition-colors cursor-pointer whitespace-nowrap shadow-md"
        >
          {props.collapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5 text-[#c89d54]" />
              Show Controls
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5 text-[#c89d54]" />
              Hide Controls
            </>
          )}
        </button>

        <button
          type="button"
          onClick={props.onToggleSound}
          aria-pressed={!props.soundEnabled}
          aria-label={props.soundEnabled ? 'Mute sound' : 'Unmute sound'}
          title={props.soundEnabled ? 'Mute sound (M)' : 'Unmute sound (M)'}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md border text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap shadow-md ${
            props.soundEnabled
              ? 'bg-[#12161e]/92 hover:bg-[#1a202c] border-white/12 text-[#cfd5e0]'
              : 'bg-[#2a191c]/95 hover:bg-[#3a2024] border-[#f87171]/40 text-[#fca5a5]'
          }`}
        >
          {props.soundEnabled ? (
            <>
              <Volume2 className="w-3.5 h-3.5 text-[#c89d54]" />
              Sound On
            </>
          ) : (
            <>
              <VolumeX className="w-3.5 h-3.5 text-[#f87171]" />
              Muted
            </>
          )}
        </button>

        <button
          type="button"
          onClick={props.onOpenDownload}
          aria-label="Download entire game"
          title="Download full game (.zip) or install offline app"
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#12161e]/92 hover:bg-[#1a202c] border border-white/12 text-[11px] font-medium text-[#cfd5e0] transition-colors cursor-pointer whitespace-nowrap shadow-md"
        >
          <Download className="w-3.5 h-3.5 text-[#c89d54]" />
          Download
        </button>

        {/* Mobile tab quick-switcher when header nav is hidden */}
        {!props.collapsed && (
          <div className="flex md:hidden items-center bg-[#12161e]/92 border border-white/12 rounded-md p-0.5 text-[11px]">
            {(['play', 'multiplayer', 'analysis', 'replay', 'skins'] as DockTab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => props.onSelectTab(t)}
                className={`px-2 py-1 rounded capitalize cursor-pointer ${
                  props.activeTab === t ? 'bg-[#c89d54] text-[#111419] font-semibold' : 'text-[#9aa3b2]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Unified Horizontal Bottom Control Dock (solid/rgba surface — zero backdrop-filter over WebGL) */}
      <div
        className={`pointer-events-auto w-full rounded-lg bg-[#11151d]/95 border border-white/12 shadow-2xl transition-all duration-200 overflow-hidden ${
          props.collapsed
            ? 'max-h-0 opacity-0 translate-y-4 pointer-events-none border-transparent'
            : 'max-h-[340px] opacity-100 translate-y-0'
        }`}
      >
        <div className="p-4">
          {/* ==================== PLAY TAB ==================== */}
          {props.activeTab === 'play' && (
            <div className="flex flex-col gap-3.5">
              {/* Row 1: Mode + Time Control + Quick Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1 p-1 bg-[#191f2a] rounded-md border border-white/8">
                  <button
                    type="button"
                    onClick={() =>
                      props.onStartEngineGame(props.engineLevel, props.humanColorVsAi, props.timeControl)
                    }
                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                      props.gameMode === 'engine'
                        ? 'bg-[#d6ae63] text-[#111419] font-semibold'
                        : 'text-[#aeb7c6] hover:text-white'
                    }`}
                  >
                    vs AI Opponent
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onStartLocalGame(props.timeControl)}
                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                      props.gameMode === 'local'
                        ? 'bg-[#d6ae63] text-[#111419] font-semibold'
                        : 'text-[#aeb7c6] hover:text-white'
                    }`}
                  >
                    Pass &amp; Play
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onSelectTab('multiplayer')}
                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                      props.gameMode === 'multiplayer'
                        ? 'bg-[#d6ae63] text-[#111419] font-semibold'
                        : 'text-[#aeb7c6] hover:text-white'
                    }`}
                  >
                    Online Multiplayer
                  </button>
                </div>

                {/* Time control selector */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-[#8d96a6] mr-1 whitespace-nowrap">Clock</span>
                  <div className="flex items-center gap-1 p-1 bg-[#191f2a] rounded-md border border-white/8">
                    {TC_ORDER.map((tc) => (
                      <button
                        key={tc}
                        type="button"
                        onClick={() => props.onChangeTimeControl(tc)}
                        className={`px-2.5 py-1 text-[11px] font-mono-tabular rounded transition-colors whitespace-nowrap cursor-pointer ${
                          props.timeControl === tc
                            ? 'bg-white/14 text-white font-medium'
                            : 'text-[#8e98a8] hover:text-white'
                        }`}
                      >
                        {tc === 'unlimited' ? '∞' : tc}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Camera + Sound + Board controls */}
                <div className="flex items-center gap-1.5">
                  {(['white', 'black', 'top', 'cinematic'] as CameraPreset[]).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => props.onSelectCameraPreset(preset)}
                      className={`px-2.5 py-1.5 text-[11px] font-medium rounded border transition-colors capitalize whitespace-nowrap cursor-pointer ${
                        props.cameraPreset === preset
                          ? 'bg-white/12 border-[#c89d54]/60 text-[#f5efe2]'
                          : 'bg-[#181d27] border-white/8 text-[#9aa3b2] hover:text-white'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={props.onToggleSound}
                    aria-label={props.soundEnabled ? 'Mute sound' : 'Unmute sound'}
                    className="p-1.5 rounded bg-[#181d27] border border-white/8 text-[#cbd2df] hover:text-white cursor-pointer"
                  >
                    {props.soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Row 2: AI Difficulty (Beginner -> Grandmaster) + Play As + Match Utilities */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-white/8">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-[#8d96a6] whitespace-nowrap">AI Strength</span>
                  <div className="flex items-center gap-1 p-1 bg-[#191f2a] rounded-md border border-white/8 overflow-x-auto">
                    {LEVEL_ORDER.map((lvl) => {
                      const spec = ENGINE_LEVELS[lvl];
                      const active = props.engineLevel === lvl;
                      return (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => props.onChangeEngineLevel(lvl)}
                          title={`${spec.label} (${spec.elo} Elo) — ${spec.description}`}
                          className={`px-2.5 py-1 text-[11px] rounded transition-colors whitespace-nowrap cursor-pointer ${
                            active
                              ? 'bg-[#d6ae63]/20 text-[#f0d192] font-semibold border border-[#d6ae63]/50'
                              : 'text-[#9aa3b2] hover:text-white border border-transparent'
                          }`}
                        >
                          {spec.label} <span className="font-mono-tabular opacity-75">{spec.elo}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Side selector vs AI */}
                  <div className="flex items-center gap-1 p-1 bg-[#191f2a] rounded-md border border-white/8">
                    {(['w', 'b', 'random'] as const).map((side) => (
                      <button
                        key={side}
                        type="button"
                        onClick={() => props.onChangeHumanColorVsAi(side)}
                        className={`px-2 py-1 text-[11px] rounded transition-colors whitespace-nowrap cursor-pointer ${
                          props.humanColorVsAi === side
                            ? 'bg-white/14 text-white font-medium'
                            : 'text-[#8e98a8] hover:text-white'
                        }`}
                      >
                        {side === 'w' ? 'White' : side === 'b' ? 'Black' : 'Random'}
                      </button>
                    ))}
                  </div>

                  {/* Opponent Voice selector (Female / Male / Off) + explicit Speech Bubbles toggle */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-[#8d96a6] whitespace-nowrap">Voice</span>
                      <div className="flex items-center gap-1 p-1 bg-[#191f2a] rounded-md border border-white/8">
                        {(['female', 'male', 'off'] as OpponentVoiceGender[]).map((g) => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => props.onChangeOpponentVoice(g)}
                            className={`px-2 py-1 text-[11px] rounded transition-colors capitalize whitespace-nowrap cursor-pointer ${
                              props.opponentVoice === g
                                ? 'bg-[#d6ae63]/20 text-[#f0d192] font-semibold border border-[#d6ae63]/50'
                                : 'text-[#8e98a8] hover:text-white border border-transparent'
                            }`}
                          >
                            {g === 'female' ? 'Female' : g === 'male' ? 'Male' : 'Off'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={props.onToggleSpeechBubbles}
                      disabled={props.opponentVoice === 'off'}
                      title={
                        props.opponentVoice === 'off'
                          ? 'Choose Female or Male voice first to enable speech bubbles'
                          : props.showSpeechBubbles
                            ? 'Hide opponent speech bubbles'
                            : 'Show opponent speech bubbles on screen'
                      }
                      className={`px-2.5 py-1.5 text-[11px] rounded-md border transition-colors whitespace-nowrap cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        props.showSpeechBubbles && props.opponentVoice !== 'off'
                          ? 'bg-[#d6ae63]/20 text-[#f0d192] font-semibold border-[#d6ae63]/50'
                          : 'bg-[#191f2a] text-[#8e98a8] hover:text-white border-white/8'
                      }`}
                    >
                      Bubbles: {props.showSpeechBubbles && props.opponentVoice !== 'off' ? 'On' : 'Off'}
                    </button>
                  </div>
                </div>

                {/* Match actions */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={props.onUndo}
                    disabled={!props.canUndo}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-[#181d27] hover:bg-[#222937] border border-white/10 text-[#d7dce5] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Undo
                  </button>
                  <button
                    type="button"
                    onClick={props.onSaveCurrentGame}
                    disabled={!props.canSaveCurrent}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-[#181d27] hover:bg-[#222937] border border-white/10 text-[#d7dce5] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save
                  </button>
                  {props.gameMode !== 'multiplayer' && props.isGameActive && (
                    <button
                      type="button"
                      onClick={props.onResignLocal}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-[#2a191c] hover:bg-[#3a2024] border border-[#f87171]/30 text-[#fca5a5] cursor-pointer whitespace-nowrap"
                    >
                      <Flag className="w-3.5 h-3.5" />
                      Resign
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==================== MULTIPLAYER TAB ==================== */}
          {props.activeTab === 'multiplayer' && (
            <div className="flex flex-col gap-3">
              {/* Top line: connection metadata + player name */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-[#9aa3b2]">
                  <span className="font-medium text-[#e6e1d7]">
                    {props.wsStatus === 'connected'
                      ? 'Live Server Connected'
                      : props.wsStatus === 'reconnecting'
                        ? 'Reconnecting to Server...'
                        : 'Connecting...'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular">{props.onlineCount} online</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular">{props.queueCount} in queue</span>
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor="mp-name" className="text-[11px] text-[#8d96a6] whitespace-nowrap">
                    Display Name
                  </label>
                  <input
                    id="mp-name"
                    type="text"
                    maxLength={22}
                    value={props.playerName}
                    onChange={(e) => props.onChangePlayerName(e.target.value)}
                    placeholder="Your name"
                    className="w-36 px-2.5 py-1 text-xs rounded bg-[#191f2a] border border-white/12 text-[#f3f1ec] focus:outline-none focus:border-[#c89d54]"
                  />
                </div>
              </div>

              {props.roomError && (
                <div className="text-xs text-[#fca5a5] bg-[#2a191c] border border-[#f87171]/30 rounded px-3 py-1.5">
                  {props.roomError}
                </div>
              )}

              {props.activeRoom ? (
                /* Inside an active Multiplayer Room */
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/8">
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="text-[#9aa3b2]">Room</span>
                    <span className="font-mono-tabular text-sm font-semibold text-[#e6c47f] tracking-wider">
                      {props.activeRoom.id}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${props.activeRoom!.id}`;
                        copyText('invite', inviteUrl);
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#1c2330] hover:bg-[#252f40] border border-white/12 text-[#e6e1d7] cursor-pointer whitespace-nowrap"
                    >
                      {copiedKey === 'invite' ? <Check className="w-3.5 h-3.5 text-[#6ee7b7]" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedKey === 'invite' ? 'Invite Link Copied' : 'Copy Invite Link'}
                    </button>
                    <span className="text-[#8d96a6]">
                      Seat: {props.myRoomRole === 'w' ? 'White' : props.myRoomRole === 'b' ? 'Black' : 'Spectator'}
                    </span>
                    {props.activeRoom.spectatorCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-[#8d96a6] font-mono-tabular">
                        <Eye className="w-3.5 h-3.5" />
                        {props.activeRoom.spectatorCount}
                      </span>
                    )}
                  </div>

                  {/* Draw offer banner or room controls */}
                  <div className="flex items-center gap-2">
                    {props.activeRoom.drawOfferFrom &&
                      props.myRoomRole &&
                      props.myRoomRole !== 'spectator' &&
                      props.activeRoom.drawOfferFrom !== props.myRoomRole && (
                        <div className="flex items-center gap-1.5 mr-2 text-xs">
                          <span className="text-[#e6c47f]">Draw offered:</span>
                          <button
                            type="button"
                            onClick={() => props.onRespondDraw(true)}
                            className="px-2.5 py-1 rounded bg-[#d6ae63] text-[#111419] font-semibold cursor-pointer"
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => props.onRespondDraw(false)}
                            className="px-2.5 py-1 rounded bg-[#1d2430] text-[#cbd2df] border border-white/12 cursor-pointer"
                          >
                            Decline
                          </button>
                        </div>
                      )}

                    {props.activeRoom.status === 'active' &&
                      props.myRoomRole !== 'spectator' &&
                      !props.activeRoom.drawOfferFrom && (
                        <button
                          type="button"
                          onClick={props.onOfferDraw}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-[#181d27] hover:bg-[#222937] border border-white/10 text-[#d7dce5] cursor-pointer whitespace-nowrap"
                        >
                          <Handshake className="w-3.5 h-3.5" />
                          Offer Draw
                        </button>
                      )}

                    {props.activeRoom.status === 'active' && props.myRoomRole !== 'spectator' && (
                      <button
                        type="button"
                        onClick={props.onResignOnline}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-[#2a191c] hover:bg-[#3a2024] border border-[#f87171]/30 text-[#fca5a5] cursor-pointer whitespace-nowrap"
                      >
                        <Flag className="w-3.5 h-3.5" />
                        Resign
                      </button>
                    )}

                    {props.activeRoom.status === 'finished' && props.myRoomRole !== 'spectator' && (
                      <button
                        type="button"
                        onClick={props.onVoteRematch}
                        className="px-3 py-1.5 text-xs font-semibold rounded bg-[#d6ae63] hover:bg-[#e3be78] text-[#111419] cursor-pointer whitespace-nowrap"
                      >
                        {props.activeRoom.rematchVotes.includes(props.myRoomRole as PieceColor)
                          ? 'Waiting for Rematch...'
                          : 'Request Rematch'}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={props.onLeaveRoom}
                      className="px-3 py-1.5 text-xs font-medium rounded bg-[#181d27] hover:bg-[#222937] border border-white/10 text-[#cbd2df] cursor-pointer whitespace-nowrap"
                    >
                      Leave Room
                    </button>
                  </div>
                </div>
              ) : (
                /* Multiplayer Lobby Controls */
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-white/8">
                  {/* Quick Match & Create Room */}
                  <div className="md:col-span-7 flex flex-wrap items-center gap-2">
                    {props.inQueue ? (
                      <button
                        type="button"
                        onClick={props.onCancelMatchmaking}
                        className="px-3.5 py-2 text-xs font-semibold rounded bg-[#3a291a] border border-[#d6ae63]/60 text-[#f3d89c] hover:bg-[#493420] cursor-pointer whitespace-nowrap"
                      >
                        Searching for Opponent... Cancel
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={props.onJoinMatchmaking}
                        disabled={props.wsStatus !== 'connected'}
                        className="px-3.5 py-2 text-xs font-semibold rounded bg-[#d6ae63] hover:bg-[#e3be78] text-[#111419] disabled:opacity-40 cursor-pointer whitespace-nowrap"
                      >
                        Quick Match ({TIME_CONTROLS[props.timeControl].label})
                      </button>
                    )}

                    <div className="flex items-center gap-1 p-0.5 bg-[#191f2a] rounded border border-white/10">
                      {(['w', 'b', 'random'] as const).map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setRoomColorPref(c)}
                          className={`px-2 py-1 text-[11px] rounded cursor-pointer ${
                            roomColorPref === c ? 'bg-white/15 text-white' : 'text-[#8d96a6]'
                          }`}
                        >
                          {c === 'w' ? 'White' : c === 'b' ? 'Black' : 'Rand'}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setRoomPublic((p) => !p)}
                      className="px-2.5 py-1.5 text-[11px] rounded bg-[#191f2a] border border-white/10 text-[#cbd2df] hover:text-white cursor-pointer whitespace-nowrap"
                    >
                      {roomPublic ? 'Public' : 'Private'}
                    </button>

                    <button
                      type="button"
                      onClick={() => props.onCreateRoom(roomColorPref, roomPublic)}
                      disabled={props.wsStatus !== 'connected'}
                      className="px-3 py-1.5 text-xs font-medium rounded bg-[#1d2533] hover:bg-[#273144] border border-white/15 text-[#f3f1ec] disabled:opacity-40 cursor-pointer whitespace-nowrap"
                    >
                      Create Room
                    </button>

                    {/* Join by code */}
                    <form
                      className="flex items-center gap-1.5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (joinCode.trim()) props.onJoinRoom(joinCode.trim());
                      }}
                    >
                      <input
                        type="text"
                        maxLength={8}
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                        placeholder="Room code"
                        className="w-24 px-2.5 py-1.5 text-xs font-mono-tabular uppercase rounded bg-[#191f2a] border border-white/12 text-white focus:outline-none focus:border-[#c89d54]"
                      />
                      <button
                        type="submit"
                        disabled={!joinCode.trim() || props.wsStatus !== 'connected'}
                        className="px-2.5 py-1.5 text-xs font-medium rounded bg-[#1d2533] hover:bg-[#273144] border border-white/15 text-[#f3f1ec] disabled:opacity-40 cursor-pointer"
                      >
                        Join
                      </button>
                    </form>
                  </div>

                  {/* Live Public Rooms */}
                  <div className="md:col-span-5 flex flex-col gap-1 max-h-24 overflow-y-auto thin-scroll border-l border-white/8 pl-3">
                    <div className="flex items-center justify-between text-[11px] text-[#8d96a6]">
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3 h-3" /> Open Tables
                      </span>
                      <span className="font-mono-tabular">{props.publicRooms.length}</span>
                    </div>
                    {props.publicRooms.length === 0 ? (
                      <p className="text-[11px] text-[#6d7686]">
                        No public tables open yet. Create a room or share an invite link.
                      </p>
                    ) : (
                      props.publicRooms.map((rm) => (
                        <div
                          key={rm.id}
                          className="flex items-center justify-between gap-2 text-xs py-1 border-b border-white/5 last:border-b-0"
                        >
                          <div className="truncate text-[#d7dce5]">
                            <span className="font-medium">{rm.hostName}</span>
                            <span className="text-[#8d96a6]"> · {rm.timeControl} · </span>
                            <span className="font-mono-tabular text-[#c89d54]">{rm.id}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => props.onJoinRoom(rm.id)}
                            className="px-2 py-0.5 text-[11px] font-medium rounded bg-[#d6ae63]/20 hover:bg-[#d6ae63]/35 text-[#f0d192] cursor-pointer whitespace-nowrap shrink-0"
                          >
                            {rm.status === 'waiting' ? 'Join' : 'Watch'}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ==================== ANALYSIS TAB ==================== */}
          {props.activeTab === 'analysis' && (
            <div className="flex flex-col gap-3">
              {/* Row 1: Engine controls & metrics */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={props.onToggleAnalysis}
                    className={`px-3 py-1.5 text-xs font-semibold rounded border transition-colors cursor-pointer whitespace-nowrap ${
                      props.analysisEnabled
                        ? 'bg-[#d6ae63] border-[#d6ae63] text-[#111419]'
                        : 'bg-[#181d27] border-white/12 text-[#cbd2df]'
                    }`}
                  >
                    {props.analysisEnabled ? 'Engine Active' : 'Enable Engine'}
                  </button>
                  <button
                    type="button"
                    onClick={props.onToggleBestMoveArrow}
                    disabled={!props.analysisEnabled}
                    className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap ${
                      props.showBestMoveArrow && props.analysisEnabled
                        ? 'bg-[#172838] border-[#38bdf8]/60 text-[#7dd3fc]'
                        : 'bg-[#181d27] border-white/10 text-[#9aa3b2]'
                    }`}
                  >
                    3D Best-Move Arrow
                  </button>

                  {props.analysisEnabled && props.analysis && (
                    <div className="hidden sm:flex items-center gap-2 text-xs text-[#9aa3b2] ml-2 font-mono-tabular">
                      <span className="text-[#f3f1ec] font-semibold">
                        {props.analysis.lines[0]
                          ? formatEvalLabel(props.analysis.lines[0].scoreCp, props.analysis.lines[0].mateIn)
                          : '0.0'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>Depth {props.analysis.depth}</span>
                      <span aria-hidden="true">·</span>
                      <span>{(props.analysis.nps / 1000).toFixed(1)}k n/s</span>
                    </div>
                  )}
                </div>

                {/* Ply Navigation & Export */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => props.onJumpToPly(0)}
                    disabled={props.viewPly === 0}
                    aria-label="First move"
                    className="p-1.5 rounded bg-[#181d27] hover:bg-[#232b3a] border border-white/10 text-[#cbd2df] disabled:opacity-35 cursor-pointer"
                  >
                    <SkipBack className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onJumpToPly(Math.max(0, props.viewPly - 1))}
                    disabled={props.viewPly === 0}
                    aria-label="Previous move"
                    className="p-1.5 rounded bg-[#181d27] hover:bg-[#232b3a] border border-white/10 text-[#cbd2df] disabled:opacity-35 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onJumpToPly(Math.min(totalPlies, props.viewPly + 1))}
                    disabled={props.viewPly >= totalPlies}
                    aria-label="Next move"
                    className="p-1.5 rounded bg-[#181d27] hover:bg-[#232b3a] border border-white/10 text-[#cbd2df] disabled:opacity-35 cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onJumpToPly(totalPlies)}
                    disabled={props.viewPly >= totalPlies}
                    aria-label="Latest move"
                    className="p-1.5 rounded bg-[#181d27] hover:bg-[#232b3a] border border-white/10 text-[#cbd2df] disabled:opacity-35 cursor-pointer"
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                  </button>

                  <span className="text-white/15 mx-1" aria-hidden="true">|</span>

                  <button
                    type="button"
                    onClick={() => copyText('fen', props.currentFen)}
                    className="px-2.5 py-1.5 text-[11px] font-medium rounded bg-[#181d27] hover:bg-[#232b3a] border border-white/10 text-[#cbd2df] cursor-pointer whitespace-nowrap"
                  >
                    {copiedKey === 'fen' ? 'FEN Copied' : 'Copy FEN'}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyText('pgn', props.currentPgn)}
                    className="px-2.5 py-1.5 text-[11px] font-medium rounded bg-[#181d27] hover:bg-[#232b3a] border border-white/10 text-[#cbd2df] cursor-pointer whitespace-nowrap"
                  >
                    {copiedKey === 'pgn' ? 'PGN Copied' : 'Copy PGN'}
                  </button>
                </div>
              </div>

              {/* Row 2: Top 3 Principal Variations + Interactive Move Strip */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-white/8">
                {/* Multi-PV Candidate Lines */}
                <div className="md:col-span-6 flex flex-col gap-1">
                  {!props.analysisEnabled ? (
                    <p className="text-xs text-[#7f8999] py-2">
                      Enable the integrated engine to inspect live multi-PV candidate lines and 3D best-move arrows.
                    </p>
                  ) : !props.analysis || props.analysis.lines.length === 0 ? (
                    <p className="text-xs text-[#7f8999] py-2">Evaluating position...</p>
                  ) : (
                    props.analysis.lines.slice(0, 3).map((line) => (
                      <div
                        key={line.multipv}
                        className="flex items-center gap-2.5 text-xs py-1 px-2 rounded bg-[#171c25] border border-white/6"
                      >
                        <span className="font-mono-tabular font-semibold text-[#e6c47f] w-11 shrink-0">
                          {formatEvalLabel(line.scoreCp, line.mateIn)}
                        </span>
                        <span className="font-mono-tabular text-[#d7dce5] truncate flex-1">
                          {line.pvSan.join(' ')}
                        </span>
                        {!props.isReplayMode && props.gameMode !== 'multiplayer' && props.viewPly === totalPlies && (
                          <button
                            type="button"
                            onClick={() => props.onPlayEngineMove(line.bestMoveUci)}
                            className="text-[11px] text-[#7dd3fc] hover:text-white cursor-pointer whitespace-nowrap shrink-0"
                          >
                            Play
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Scrollable Move Tape with Quality Classification */}
                <div className="md:col-span-6 flex flex-wrap items-start content-start gap-x-2 gap-y-1 max-h-[86px] overflow-y-auto thin-scroll border-l border-white/8 pl-3 text-xs font-mono-tabular">
                  {props.moveHistory.length === 0 ? (
                    <span className="text-[#6f7888] font-sans">Moves played in this game will appear here.</span>
                  ) : (
                    props.moveHistory.map((m) => {
                      const active = props.viewPly === m.ply;
                      const meta = props.moveEvalMeta[m.ply];
                      const qualityClass = meta?.quality ? QUALITY_COLORS[meta.quality] : 'text-[#d7dce5]';
                      return (
                        <button
                          key={m.ply}
                          type="button"
                          onClick={() => props.onJumpToPly(m.ply)}
                          title={meta?.quality ? `${m.san} · ${meta.quality}` : m.san}
                          className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#d6ae63] text-[#111419] font-semibold'
                              : `hover:bg-white/10 ${qualityClass}`
                          }`}
                        >
                          {m.ply % 2 === 1 ? `${Math.ceil(m.ply / 2)}. ` : ''}
                          {m.san}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==================== REPLAY TAB ==================== */}
          {props.activeTab === 'replay' && (
            <div className="flex flex-col gap-3">
              {/* Row 1: Playback Transport Controls (Rewind, Step Back, Play/Pause, Step Forward, Fast-Forward, Speed) */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => props.onJumpToPly(0)}
                    disabled={props.viewPly === 0}
                    title="Jump to start"
                    className="p-1.5 rounded bg-[#181d27] hover:bg-[#232b3a] border border-white/10 text-[#cbd2df] disabled:opacity-35 cursor-pointer"
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={props.onRewindStep}
                    disabled={props.viewPly === 0}
                    title="Rewind 2 plies"
                    className="p-1.5 rounded bg-[#181d27] hover:bg-[#232b3a] border border-white/10 text-[#cbd2df] disabled:opacity-35 cursor-pointer"
                  >
                    <Rewind className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onJumpToPly(Math.max(0, props.viewPly - 1))}
                    disabled={props.viewPly === 0}
                    title="Step back 1 move"
                    className="p-1.5 rounded bg-[#181d27] hover:bg-[#232b3a] border border-white/10 text-[#cbd2df] disabled:opacity-35 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={props.onToggleReplayPlay}
                    disabled={totalPlies === 0}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-[#d6ae63] hover:bg-[#e3be78] text-[#111419] text-xs font-semibold disabled:opacity-40 cursor-pointer whitespace-nowrap"
                  >
                    {props.replayPlaying ? (
                      <>
                        <Pause className="w-3.5 h-3.5" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        {props.viewPly >= totalPlies && totalPlies > 0 ? 'Replay' : 'Play'}
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => props.onJumpToPly(Math.min(totalPlies, props.viewPly + 1))}
                    disabled={props.viewPly >= totalPlies}
                    title="Step forward 1 move"
                    className="p-1.5 rounded bg-[#181d27] hover:bg-[#232b3a] border border-white/10 text-[#cbd2df] disabled:opacity-35 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={props.onFastForwardStep}
                    disabled={props.viewPly >= totalPlies}
                    title="Fast-forward 2 plies"
                    className="p-1.5 rounded bg-[#181d27] hover:bg-[#232b3a] border border-white/10 text-[#cbd2df] disabled:opacity-35 cursor-pointer"
                  >
                    <FastForward className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onJumpToPly(totalPlies)}
                    disabled={props.viewPly >= totalPlies}
                    title="Jump to end"
                    className="p-1.5 rounded bg-[#181d27] hover:bg-[#232b3a] border border-white/10 text-[#cbd2df] disabled:opacity-35 cursor-pointer"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                </div>

                {/* Scrubber Slider */}
                <div className="flex items-center gap-2.5 flex-1 min-w-[180px] max-w-sm">
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, totalPlies)}
                    value={props.viewPly}
                    onChange={(e) => props.onJumpToPly(Number(e.target.value))}
                    disabled={totalPlies === 0}
                    aria-label="Scrub move timeline"
                    className="flex-1 accent-[#d6ae63] cursor-pointer"
                  />
                  <span className="font-mono-tabular text-[11px] text-[#cfd5e0] whitespace-nowrap w-24 text-right">
                    {props.viewPly}/{totalPlies}
                    {currentMoveRec ? ` · ${currentMoveRec.san}` : ''}
                  </span>
                </div>

                {/* Speed & Save */}
                <div className="flex items-center gap-1.5">
                  {[0.5, 1, 2, 3].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => props.onChangeReplaySpeed(spd)}
                      className={`px-2 py-1 text-[11px] font-mono-tabular rounded border cursor-pointer ${
                        props.replaySpeed === spd
                          ? 'bg-white/14 border-[#c89d54]/60 text-white'
                          : 'bg-[#181d27] border-white/8 text-[#8d96a6] hover:text-white'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}

                  {!props.isReplayMode && (
                    <button
                      type="button"
                      onClick={props.onSaveCurrentGame}
                      disabled={!props.canSaveCurrent}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded bg-[#1d2533] hover:bg-[#273144] border border-white/12 text-[#f3f1ec] disabled:opacity-40 cursor-pointer whitespace-nowrap ml-1"
                    >
                      <Save className="w-3 h-3" />
                      Save Current
                    </button>
                  )}
                  {props.isReplayMode && (
                    <button
                      type="button"
                      onClick={props.onExitReplay}
                      className="px-2.5 py-1 text-[11px] font-medium rounded bg-[#1d2533] hover:bg-[#273144] border border-white/12 text-[#f3f1ec] cursor-pointer whitespace-nowrap ml-1"
                    >
                      Return to Live
                    </button>
                  )}
                </div>
              </div>

              {/* Row 2: Saved Games Archive & Classic Master Games */}
              <div className="flex flex-col gap-2 pt-2 border-t border-white/8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 p-0.5 bg-[#191f2a] rounded border border-white/8">
                    <button
                      type="button"
                      onClick={() => setReplayListTab('saved')}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded cursor-pointer ${
                        replayListTab === 'saved' ? 'bg-white/14 text-white' : 'text-[#8d96a6]'
                      }`}
                    >
                      Saved Games ({props.savedGames.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setReplayListTab('classics')}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded cursor-pointer ${
                        replayListTab === 'classics' ? 'bg-white/14 text-white' : 'text-[#8d96a6]'
                      }`}
                    >
                      Master Classics ({props.classicReplays.length})
                    </button>
                  </div>
                  <span className="text-[11px] text-[#8d96a6]">
                    Completed games save automatically · click any game to review in 3D
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-[88px] overflow-y-auto thin-scroll">
                  {(replayListTab === 'saved' ? props.savedGames : props.classicReplays).length === 0 ? (
                    <p className="text-xs text-[#6f7888] col-span-full py-2">
                      No saved games yet. Finish a match or click &ldquo;Save Current&rdquo; to archive it for replay, or inspect a Master Classic.
                    </p>
                  ) : (
                    (replayListTab === 'saved' ? props.savedGames : props.classicReplays).map((g) => {
                      const isLoaded = props.activeReplayGame?.id === g.id && props.isReplayMode;
                      return (
                        <div
                          key={g.id}
                          className={`flex items-center justify-between gap-2 px-3 py-2 rounded border transition-colors ${
                            isLoaded
                              ? 'bg-[#222938] border-[#c89d54]/70'
                              : 'bg-[#171c25] border-white/8 hover:border-white/20'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => props.onLoadReplay(g)}
                            className="text-left min-w-0 flex-1 cursor-pointer"
                          >
                            <div className="text-xs font-medium text-[#f3f1ec] truncate">{g.title}</div>
                            <div className="text-[11px] text-[#8d96a6] truncate font-mono-tabular">
                              {g.resultLabel} · {g.moves.length} plies · {g.dateIso.slice(0, 10)}
                            </div>
                          </button>
                          {replayListTab === 'saved' && (
                            <button
                              type="button"
                              onClick={() => props.onDeleteSavedGame(g.id)}
                              aria-label={`Delete ${g.title}`}
                              className="p-1 text-[#7f8999] hover:text-[#f87171] cursor-pointer shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==================== SKINS TAB ==================== */}
          {props.activeTab === 'skins' && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                {SKIN_LIST.map((skin) => {
                  const selected = props.skinId === skin.id;
                  return (
                    <button
                      key={skin.id}
                      type="button"
                      onClick={() => props.onSelectSkin(skin.id)}
                      className={`flex flex-col items-start gap-2 p-2.5 rounded-md border text-left transition-colors cursor-pointer ${
                        selected
                          ? 'bg-[#1f2634] border-[#d6ae63]'
                          : 'bg-[#161b24] border-white/8 hover:border-white/22'
                      }`}
                    >
                      {/* Checkerboard + trim swatch */}
                      <div className="flex items-center gap-1.5 w-full">
                        <div className="grid grid-cols-2 w-7 h-7 rounded-sm overflow-hidden border border-white/15 shrink-0">
                          <span style={{ backgroundColor: skin.previewSwatches[0] }} />
                          <span style={{ backgroundColor: skin.previewSwatches[1] }} />
                          <span style={{ backgroundColor: skin.previewSwatches[1] }} />
                          <span style={{ backgroundColor: skin.previewSwatches[0] }} />
                        </div>
                        <span
                          className="w-1.5 h-7 rounded-sm shrink-0"
                          style={{ backgroundColor: skin.previewSwatches[2] }}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-[#f4efe4] truncate">{skin.name}</div>
                        </div>
                      </div>
                      <p className="text-[11px] text-[#8d96a6] leading-snug line-clamp-2">
                        {skin.subtitle}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/8">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#8d96a6]">Studio Lighting</span>
                  <div className="flex items-center gap-1 p-1 bg-[#191f2a] rounded-md border border-white/8">
                    {(
                      [
                        { id: 'warm-studio', label: 'Warm Studio' },
                        { id: 'gallery-cool', label: 'Gallery Cool' },
                        { id: 'evening-amber', label: 'Evening Amber' },
                      ] as { id: LightingMood; label: string }[]
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => props.onSelectLightingMood(m.id)}
                        className={`px-2.5 py-1 text-[11px] rounded transition-colors cursor-pointer whitespace-nowrap ${
                          props.lightingMood === m.id
                            ? 'bg-white/14 text-white font-medium'
                            : 'text-[#8d96a6] hover:text-white'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={props.onToggleCoordinates}
                  className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors cursor-pointer whitespace-nowrap ${
                    props.showCoordinates
                      ? 'bg-[#1f2634] border-[#c89d54]/60 text-[#f3efe4]'
                      : 'bg-[#181d27] border-white/10 text-[#8d96a6]'
                  }`}
                >
                  Coordinates {props.showCoordinates ? 'Shown' : 'Hidden'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
