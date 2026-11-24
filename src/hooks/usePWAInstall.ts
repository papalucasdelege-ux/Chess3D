import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// Module-level capture so even if `beforeinstallprompt` fires before React mounts,
// the deferred prompt event is preserved for the in-app installer button.
let cachedDeferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<(ev: BeforeInstallPromptEvent | null) => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    cachedDeferredPrompt = e as BeforeInstallPromptEvent;
    promptListeners.forEach((cb) => cb(cachedDeferredPrompt));
  });
  window.addEventListener('appinstalled', () => {
    cachedDeferredPrompt = null;
    promptListeners.forEach((cb) => cb(null));
  });
}

function detectStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => cachedDeferredPrompt,
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(() => detectStandaloneMode());
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    setIsInstalled(detectStandaloneMode());

    const ua = window.navigator.userAgent.toLowerCase();
    const isIOSDevice =
      /iphone|ipad|ipod/.test(ua) ||
      (ua.includes('macintosh') && navigator.maxTouchPoints > 1);
    const isAndroidDevice = /android/.test(ua);
    setIsIOS(isIOSDevice);
    setIsAndroid(isAndroidDevice);

    const onPromptChange = (ev: BeforeInstallPromptEvent | null) => {
      setDeferredPrompt(ev);
    };
    promptListeners.add(onPromptChange);

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    const mql = window.matchMedia('(display-mode: standalone)');
    const handleDisplayChange = () => {
      if (detectStandaloneMode()) {
        setIsInstalled(true);
      }
    };
    mql.addEventListener?.('change', handleDisplayChange);

    return () => {
      promptListeners.delete(onPromptChange);
      window.removeEventListener('appinstalled', handleAppInstalled);
      mql.removeEventListener?.('change', handleDisplayChange);
    };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    const promptEv = deferredPrompt || cachedDeferredPrompt;
    if (!promptEv) return false;
    try {
      await promptEv.prompt();
      const { outcome } = await promptEv.userChoice;
      if (outcome === 'accepted') {
        cachedDeferredPrompt = null;
        setDeferredPrompt(null);
        setIsInstalled(true);
        return true;
      }
    } catch {
      // User dismissed or browser blocked prompt
    }
    return false;
  }, [deferredPrompt]);

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    isAndroid,
    install,
  };
}

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
