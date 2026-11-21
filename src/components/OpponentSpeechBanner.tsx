import { Volume2, X } from 'lucide-react';
import type { OpponentMessage, VoicePlaybackState } from '../chess/opponentVoice';

interface OpponentSpeechBannerProps {
  message: OpponentMessage | null;
  soundEnabled: boolean;
  voiceState: VoicePlaybackState;
  onReplayVoice: () => void;
  onDismiss: () => void;
}

const TONE_ACCENT: Record<OpponentMessage['tone'], { border: string; tagText: string }> = {
  checkmate: { border: 'border-l-[#ef4444]', tagText: 'text-[#fca5a5]' },
  check: { border: 'border-l-[#f87171]', tagText: 'text-[#fca5a5]' },
  warning: { border: 'border-l-[#e5b357]', tagText: 'text-[#f3cf83]' },
  threat: { border: 'border-l-[#fb923c]', tagText: 'text-[#fdba74]' },
  capture: { border: 'border-l-[#d6ae63]', tagText: 'text-[#e8c784]' },
  opening: { border: 'border-l-[#93c5fd]', tagText: 'text-[#bfdbfe]' },
  neutral: { border: 'border-l-[#c89d54]', tagText: 'text-[#d9be95]' },
};

export function OpponentSpeechBanner({
  message,
  soundEnabled,
  voiceState,
  onReplayVoice,
  onDismiss,
}: OpponentSpeechBannerProps) {
  if (!message) return null;
  const style = TONE_ACCENT[message.tone];
  const isSpeaking = voiceState === 'speaking';

  return (
    <aside
      aria-live="polite"
      className={`fixed top-20 right-4 z-30 w-[min(310px,calc(100vw-2rem))] rounded-lg bg-[#12161f]/95 border border-white/12 border-l-[3px] ${style.border} shadow-2xl px-3.5 py-2.5 pointer-events-auto transition-opacity duration-200`}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-semibold text-[#f3f1ec] truncate">
            {message.speaker}
          </span>
          <span className="text-[10px] text-[#7f8999]">·</span>
          <span className={`text-[10px] font-mono-tabular font-semibold tracking-wider uppercase ${style.tagText}`}>
            {message.tag}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {soundEnabled && (
            <button
              type="button"
              onClick={onReplayVoice}
              title={isSpeaking ? 'Speaking — click to replay' : 'Replay opponent voice'}
              aria-label="Replay opponent voice"
              className={`p-1 rounded transition-colors cursor-pointer ${
                isSpeaking
                  ? 'text-[#f3cf83] bg-[#d6ae63]/15'
                  : 'text-[#9aa3b2] hover:text-[#f3f1ec] hover:bg-white/8'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            title="Dismiss message"
            aria-label="Dismiss message"
            className="p-1 rounded text-[#7f8999] hover:text-white hover:bg-white/8 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-[#e4dfd5]">
        &ldquo;{message.text}&rdquo;
      </p>
    </aside>
  );
}
