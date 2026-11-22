import { useState } from 'react';
import {
  Check,
  Download,
  FileArchive,
  FileText,
  GitBranch,
  Laptop,
  Loader2,
  Share,
  WifiOff,
  X,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface DownloadGameModalProps {
  onClose: () => void;
  currentPgn: string;
  canExportPgn: boolean;
  onExportTreeJpg: () => void;
}

export function DownloadGameModal({
  onClose,
  currentPgn,
  canExportPgn,
  onExportTreeJpg,
}: DownloadGameModalProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [zipState, setZipState] = useState<'idle' | 'downloading' | 'done' | 'error'>('idle');
  const [zipError, setZipError] = useState<string | null>(null);
  const [batDone, setBatDone] = useState(false);
  const [pgnDone, setPgnDone] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  const handleDownloadZip = async () => {
    if (zipState === 'downloading') return;
    setZipState('downloading');
    setZipError(null);
    try {
      const response = await fetch('/api/download-game');
      if (!response.ok) {
        throw new Error(`Download failed (${response.status})`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'chessangel3d.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      setZipState('done');
      window.setTimeout(() => setZipState('idle'), 3500);
    } catch (err) {
      setZipState('error');
      setZipError(err instanceof Error ? err.message : 'Unable to download game archive.');
    }
  };

  const handleDownloadBat = async () => {
    setZipError(null);
    try {
      const response = await fetch('/api/download-bat');
      if (!response.ok) {
        throw new Error(`Download failed (${response.status})`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'install-and-play.bat';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 3000);
      setBatDone(true);
      window.setTimeout(() => setBatDone(false), 3000);
    } catch (err) {
      setZipError(err instanceof Error ? err.message : 'Unable to download Windows installer.');
    }
  };

  const handleDownloadPgn = () => {
    if (!canExportPgn) return;
    const blob = new Blob([currentPgn], { type: 'application/x-chess-pgn;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chessangel3d-game-${new Date().toISOString().slice(0, 10)}.pgn`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 3000);
    setPgnDone(true);
    window.setTimeout(() => setPgnDone(false), 2500);
  };

  const handleInstallPwa = async () => {
    if (isInstallable) {
      await install();
    } else if (isIOS) {
      setShowIOSGuide((v) => !v);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0d12]/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="download-game-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-[#12161f] border border-white/14 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <h2 id="download-game-title" className="font-display text-lg text-[#f4efe4]">
              Download ChessAngel3D
            </h2>
            <p className="text-xs text-[#9aa3b2] mt-0.5">
              Play offline or install the complete 3D chess game on Windows.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close download modal"
            className="p-1.5 rounded-md text-[#9aa3b2] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Options */}
        <div className="p-5 flex flex-col gap-3">
          {/* Option 1: Full Game ZIP Package + Windows .bat Installer */}
          <div className="p-4 rounded-lg bg-[#181d28] border border-white/10 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md bg-[#c89d54]/15 text-[#e6c47f] shrink-0">
                <FileArchive className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-[#f3f1ec]">
                  Full Game + Windows Installer (.zip)
                </h3>
                <p className="text-xs text-[#9aa3b2] mt-0.5 leading-relaxed">
                  Unzip{' '}
                  <span className="font-mono-tabular text-[#d9be95]">chessangel3d.zip</span> and
                  double-click{' '}
                  <span className="font-mono-tabular text-[#d9be95]">install-and-play.bat</span>.
                  It checks/installs Node.js, builds ChessAngel3D, creates a Desktop shortcut, and
                  opens the game automatically.
                </p>
              </div>
            </div>

            {zipError && (
              <p className="text-xs text-[#fca5a5] bg-[#2a191c] border border-[#f87171]/30 rounded px-2.5 py-1.5">
                {zipError}
              </p>
            )}

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleDownloadZip}
                disabled={zipState === 'downloading'}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-[#d6ae63] hover:bg-[#e3be78] disabled:opacity-60 text-[#111419] text-xs font-semibold transition-colors cursor-pointer"
              >
                {zipState === 'downloading' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Packaging chessangel3d.zip...
                  </>
                ) : zipState === 'done' ? (
                  <>
                    <Check className="w-4 h-4" />
                    Downloaded chessangel3d.zip
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Download Full Game (.zip with .bat Installer)
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownloadBat}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-md bg-[#222a38] hover:bg-[#2c3648] border border-white/12 text-[#d7dce5] text-[11px] font-medium transition-colors cursor-pointer"
              >
                {batDone ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#6ee7b7]" />
                    Downloaded install-and-play.bat
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5 text-[#d6ae63]" />
                    Download install-and-play.bat Only
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Option 2: Installable Offline App (PWA) */}
          <div className="p-4 rounded-lg bg-[#181d28] border border-white/10 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md bg-white/8 text-[#cfd5e0] shrink-0">
                <Laptop className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[#f3f1ec]">Install Offline App</h3>
                  <span className="inline-flex items-center gap-1 text-[11px] text-[#9aa3b2]">
                    <WifiOff className="w-3 h-3 text-[#c89d54]" />
                    Offline Ready
                  </span>
                </div>
                <p className="text-xs text-[#9aa3b2] mt-0.5 leading-relaxed">
                  Install ChessAngel3D directly to your desktop or home screen. Chess Angel voice
                  commentary, Pass &amp; Play, analysis, and saved replays work without internet.
                </p>
              </div>
            </div>

            {isInstalled ? (
              <div className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-[#162721] border border-[#6ee7b7]/30 text-[#6ee7b7] text-xs font-medium">
                <Check className="w-4 h-4" />
                Installed as Standalone App
              </div>
            ) : isInstallable ? (
              <button
                type="button"
                onClick={handleInstallPwa}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-[#222a38] hover:bg-[#2c3648] border border-white/14 text-[#f3f1ec] text-xs font-semibold transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4 text-[#d6ae63]" />
                Install App to Device
              </button>
            ) : isIOS ? (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleInstallPwa}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-[#222a38] hover:bg-[#2c3648] border border-white/14 text-[#f3f1ec] text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Share className="w-4 h-4 text-[#d6ae63]" />
                  Install on iPhone / iPad
                </button>
                {showIOSGuide && (
                  <p className="text-xs text-[#cfd5e0] bg-[#12161f] border border-white/10 rounded px-3 py-2 leading-relaxed">
                    1. Tap the <strong>Share</strong> icon in Safari.
                    <br />
                    2. Scroll down and tap <strong>Add to Home Screen</strong>.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-[#8d96a6] bg-[#12161f] border border-white/8 rounded px-3 py-2 leading-relaxed">
                Open this app directly in Chrome, Edge, or Safari (outside an embedded preview) and
                click the browser&apos;s <strong>Install</strong> icon in the address bar — or grab
                the complete <strong>.zip</strong> package above.
              </p>
            )}
          </div>

          {/* Option 3: Open Top-View Thinking-Tree Schematic on Pure Black Screen */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onExportTreeJpg();
              }}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-black hover:bg-[#171e2b] border border-[#38bdf8]/45 text-xs font-medium text-[#bae6fd] transition-colors cursor-pointer"
            >
              <GitBranch className="w-3.5 h-3.5 text-[#38bdf8]" />
              Show Thinking-Tree Frontal View on Screen (Pure Black)
            </button>
          </div>

          {/* Option 4: Export Current Match PGN */}
          {canExportPgn && (
            <button
              type="button"
              onClick={handleDownloadPgn}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-[#161b25] hover:bg-[#1f2634] border border-white/10 text-xs font-medium text-[#cfd5e0] transition-colors cursor-pointer"
            >
              {pgnDone ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#6ee7b7]" />
                  Exported Current Match (.pgn)
                </>
              ) : (
                <>
                  <FileText className="w-3.5 h-3.5 text-[#c89d54]" />
                  Export Current Match Notation (.pgn)
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
