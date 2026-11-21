import type { PieceColor, PieceType } from '../shared/types';

interface PromotionModalProps {
  color: PieceColor;
  onSelect: (piece: PieceType) => void;
  onCancel: () => void;
}

const CHOICES: { type: PieceType; label: string; whiteGlyph: string; blackGlyph: string }[] = [
  { type: 'q', label: 'Queen', whiteGlyph: '♕', blackGlyph: '♛' },
  { type: 'r', label: 'Rook', whiteGlyph: '♖', blackGlyph: '♜' },
  { type: 'b', label: 'Bishop', whiteGlyph: '♗', blackGlyph: '♝' },
  { type: 'n', label: 'Knight', whiteGlyph: '♘', blackGlyph: '♞' },
];

export function PromotionModal({ color, onSelect, onCancel }: PromotionModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose promotion piece"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55"
      onClick={onCancel}
    >
      <div
        className="bg-[#141820] border border-white/15 rounded-lg p-5 shadow-2xl w-[min(360px,90vw)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-base font-medium text-[#f4efe4] mb-1">
          Promote Pawn
        </h2>
        <p className="text-xs text-[#9aa3b2] mb-4">
          Select the piece to place on the promotion square.
        </p>

        <div className="grid grid-cols-4 gap-2.5">
          {CHOICES.map((c) => (
            <button
              key={c.type}
              type="button"
              onClick={() => onSelect(c.type)}
              className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-md bg-[#1d232e] hover:bg-[#272f3e] border border-white/10 hover:border-[#c89d54]/70 transition-colors cursor-pointer"
            >
              <span className="text-3xl leading-none text-[#f3ede0]">
                {color === 'w' ? c.whiteGlyph : c.blackGlyph}
              </span>
              <span className="text-[11px] font-medium text-[#cbd2df]">{c.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
