import { useState } from 'react';
import { Download, ShieldCheck, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  /** 'topbar' renders beside Full Screen only when directly installable or on iOS; 'dock' stays available inside the bottom menu dock until installed */
  variant?: 'topbar' | 'dock';
}

export function PWAInstallButton({ variant = 'topbar' }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [guideOpen, setGuideOpen] = useState(false);

  // Suppress installer automatically once running as an installed standalone PWA
  if (isInstalled) {
    return null;
  }

  // Keep the floating top bar clean unless native install or iOS Add-to-Home-Screen applies
  if (variant === 'topbar' && !isInstallable && !isIOS) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setGuideOpen(true);
  };

  const buttonClass =
    variant === 'topbar'
      ? 'pointer-events-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#1a150b]/90 hover:bg-[#2a200f] border border-[#d6ae63]/65 hover:border-[#f3cf83] text-[11px] font-medium text-[#f5dfaa] hover:text-[#fff6dc] transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-[#e3be78]'
      : 'inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded border bg-[#1b150b] hover:bg-[#281f0f] border-[#d6ae63]/55 text-[#f3d38b] hover:text-[#fff2cc] transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-[#e3be78]';

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title={
          isInstallable
            ? 'Install ChessAngel 3D as a standalone copy-secured app'
            : isIOS
              ? 'Install ChessAngel 3D on iPhone or iPad'
              : 'Install ChessAngel 3D as a standalone app'
        }
        aria-label="Install ChessAngel 3D app"
        className={buttonClass}
      >
        <Download className="w-3.5 h-3.5 text-[#d6ae63] shrink-0" />
        <span>Install App</span>
      </button>

      {guideOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 pointer-events-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-guide-title"
          onClick={() => setGuideOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-[#0e1118] border border-[#d6ae63]/55 p-5 shadow-2xl text-[#f3f1ec]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-lg bg-[#1c160c] border border-[#d6ae63]/50 inline-flex items-center justify-center shrink-0">
                  <Smartphone className="w-4 h-4 text-[#f3cf83]" />
                </span>
                <div>
                  <h3
                    id="pwa-install-guide-title"
                    className="font-display text-base font-medium text-[#fbf3df]"
                  >
                    Install ChessAngel 3D
                  </h3>
                  <div className="inline-flex items-center gap-1 text-[11px] text-[#cbbd9f]">
                    <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span>Copy-secured standalone PWA</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                aria-label="Close install instructions"
                className="p-1 rounded text-[#9aa3b2] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="mt-4 space-y-2 text-xs text-[#d6dce6] leading-relaxed list-decimal list-inside">
                <li>
                  Tap the <strong className="text-[#f3cf83]">Share</strong> button in Safari&rsquo;s
                  toolbar.
                </li>
                <li>
                  Scroll down and tap{' '}
                  <strong className="text-[#f3cf83]">Add to Home Screen</strong>.
                </li>
                <li>
                  Tap <strong className="text-[#f3cf83]">Add</strong> to launch ChessAngel 3D
                  full-screen from your home screen.
                </li>
              </ol>
            ) : isAndroid ? (
              <ol className="mt-4 space-y-2 text-xs text-[#d6dce6] leading-relaxed list-decimal list-inside">
                <li>
                  Open this link directly in{' '}
                  <strong className="text-[#f3cf83]">Chrome</strong> or{' '}
                  <strong className="text-[#f3cf83]">Samsung Internet</strong>.
                </li>
                <li>
                  Tap the browser menu (<strong className="text-[#f3cf83]">⋮</strong>) in the top
                  corner.
                </li>
                <li>
                  Tap <strong className="text-[#f3cf83]">Install app</strong> or{' '}
                  <strong className="text-[#f3cf83]">Add to Home screen</strong>.
                </li>
              </ol>
            ) : (
              <ol className="mt-4 space-y-2 text-xs text-[#d6dce6] leading-relaxed list-decimal list-inside">
                <li>
                  Open the app directly in its own browser tab (Chrome, Edge, or Brave).
                </li>
                <li>
                  Click the <strong className="text-[#f3cf83]">Install</strong> icon in the address
                  bar, or click <strong className="text-[#f3cf83]">Install App</strong> once opened
                  outside an embedded frame.
                </li>
              </ol>
            )}

            <p className="mt-3 text-[11px] text-[#9aa3b2] leading-snug">
              Installs directly into your device&rsquo;s sandboxed app storage with offline chess
              engine support and protected media—no loose files to copy.
            </p>

            <button
              type="button"
              onClick={() => setGuideOpen(false)}
              className="mt-4 w-full rounded-md bg-[#1d170c] hover:bg-[#2a2110] border border-[#d6ae63]/55 py-2 text-xs font-semibold text-[#f5dfaa] transition-colors cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-3 left-3 z-50 inline-flex items-center gap-2 rounded-md bg-[#19130a]/95 border border-[#d6ae63]/65 px-3 py-1.5 text-[11px] font-medium text-[#f5dfaa] shadow-xl pointer-events-none"
    >
      <WifiOff className="w-3.5 h-3.5 text-[#f3cf83] shrink-0" />
      <span>Offline Mode — Playing with cached engine &amp; media</span>
    </div>
  );
}
