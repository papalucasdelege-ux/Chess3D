/**
 * Cross-OS Screen & System Keep-Awake Controller (Windows, macOS, Linux, Android, iOS/iPadOS, ChromeOS).
 *
 * 100% self-contained with zero external network calls:
 * 1. Primary: W3C Screen Wake Lock API (`navigator.wakeLock.request('screen')`) with automatic
 *    re-acquisition on tab visibility restore, window focus, fullscreen transitions, user gestures,
 *    and a 20-second liveness watchdog.
 * 2. Fallback Display Lock (iOS standalone WebKit / Firefox / restricted contexts where
 *    `navigator.wakeLock` is unsupported or denied): plays a tiny 16x16 silent H.264 Baseline MP4
 *    decoded from an in-memory Blob URL (`playsinline`, `muted`, `loop`). Never instantiated when
 *    native `navigator.wakeLock` succeeds so mobile hardware MediaCodec decoders stay free.
 * 3. CPU / App-Nap Keep-Alive (macOS App Nap, Windows EcoQoS, mobile audio session): maintains a
 *    sub-audible (-100 dBFS) Web Audio signal after user activation while the app is visible.
 */

interface WakeLockSentinelLike extends EventTarget {
  readonly released: boolean;
  readonly type: 'screen';
  release(): Promise<void>;
}

interface NavigatorWithWakeLock {
  wakeLock?: {
    request(type: 'screen'): Promise<WakeLockSentinelLike>;
  };
}

// 1.4 KB 16x16 1fps silent H.264 Baseline@3.0 MP4 (100% embedded, zero network dependency)
const SILENT_WAKE_MP4_BASE64 =
  'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMPbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAA+gAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAjl0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAA+gAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAPoAAAAAAABAAAAAAGxbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAQABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABXG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAARxzdGJsAAAAuHN0c2QAAAAAAAAAAQAAAKhhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAALmF2Y0MBQsAe/+EAFmdCwB7ZHsBEAAADAAQAAAMACDxYuSABAAVoy4DksgAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAABQYAAAUGAAAABhzdHRzAAAAAAAAAAEAAAABAABAAAAAABxzdHNjAAAAAAAAAAEAAAABAAAAAQAAAAEAAAAUc3RzegAAAAAAAAKDAAAAAQAAABRzdGNvAAAAAAAAAAEAAAM/AAAAYnVkdGEAAABabWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAtaWxzdAAAACWpdG9vAAAAHWRhdGEAAAABAAAAAExhdmY1OC43Ni4xMDAAAAAIZnJlZQAAAottZGF0AAACcAYF//9s3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2MyByMzA2MCA1ZGI2YWE2IC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyMSAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTAgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MToweDExMSBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MCBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0wIHdlaWdodHA9MCBrZXlpbnQ9MjUwIGtleWludF9taW49MSBzY2VuZWN1dD00MCBpbnRyYV9yZWZyZXNoPTAgcmNfbG9va2FoZWFkPTQwIHJjPWNyZiBtYnRyZWU9MSBjcmY9NDAuMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0xOjEuMDAAgAAAAAtliIQFfJigACTXgA==';

/**
 * After 5 minutes (300,000 ms) of zero pointer/touch/keyboard/game movement,
 * allow both the OS display/system and Chess Angel's idle animation to sleep.
 * While active (< 5 minutes since last movement), keep-awake stays continuously locked
 * across Windows, macOS, Linux, Android, iOS/iPadOS, and ChromeOS.
 */
export const INACTIVITY_SLEEP_MS = 5 * 60 * 1000;

let installed = false;
let sentinel: WakeLockSentinelLike | null = null;
let acquiring = false;
let fallbackVideoEl: HTMLVideoElement | null = null;
let fallbackBlobUrl: string | null = null;
let keepAliveAudioCtx: AudioContext | null = null;
let hasUserActivated = false;
let lastActivityAtMs = typeof Date !== 'undefined' ? Date.now() : 0;
let lastMoveStampMs = 0;
let currentlyInactivityAsleep = false;
const activityWakeListeners = new Set<() => void>();

export function getMsSinceLastUserActivity(): number {
  if (typeof Date === 'undefined') return 0;
  return Math.max(0, Date.now() - lastActivityAtMs);
}

export function isUserInactiveForSleep(): boolean {
  return getMsSinceLastUserActivity() >= INACTIVITY_SLEEP_MS;
}

export function subscribeActivityWake(listener: () => void): () => void {
  activityWakeListeners.add(listener);
  return () => {
    activityWakeListeners.delete(listener);
  };
}

function isAppVisible(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'visible';
}

function canStayAwakeNow(): boolean {
  return isAppVisible() && !isUserInactiveForSleep();
}

function getFallbackBlobUrl(): string | null {
  if (fallbackBlobUrl) return fallbackBlobUrl;
  try {
    const binary = window.atob(SILENT_WAKE_MP4_BASE64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'video/mp4' });
    fallbackBlobUrl = URL.createObjectURL(blob);
    return fallbackBlobUrl;
  } catch {
    return null;
  }
}

function stopFallbackVideo(): void {
  if (!fallbackVideoEl) return;
  try {
    fallbackVideoEl.pause();
  } catch {
    // ignore
  }
}

function releaseNativeWakeLock(): void {
  if (!sentinel) return;
  const s = sentinel;
  sentinel = null;
  if (!s.released) {
    void s.release().catch(() => {});
  }
}

function startFallbackVideoIfNeeded(): void {
  if (!hasUserActivated || !canStayAwakeNow()) {
    stopFallbackVideo();
    return;
  }
  if (sentinel && !sentinel.released) {
    stopFallbackVideo();
    return;
  }
  if (typeof document === 'undefined' || !document.body) return;

  if (!fallbackVideoEl) {
    const url = getFallbackBlobUrl();
    if (!url) return;
    const vid = document.createElement('video');
    vid.muted = true;
    vid.defaultMuted = true;
    vid.loop = true;
    vid.playsInline = true;
    vid.preload = 'auto';
    vid.setAttribute('muted', '');
    vid.setAttribute('loop', '');
    vid.setAttribute('playsinline', '');
    vid.setAttribute('webkit-playsinline', 'true');
    vid.setAttribute('disablePictureInPicture', 'true');
    vid.setAttribute('disableRemotePlayback', 'true');
    vid.setAttribute('aria-hidden', 'true');
    vid.tabIndex = -1;
    // Keep a 1x1 nearly-transparent pixel on-compositor so iOS/WebKit & Firefox treat it as active media
    vid.style.position = 'fixed';
    vid.style.width = '1px';
    vid.style.height = '1px';
    vid.style.bottom = '0';
    vid.style.right = '0';
    vid.style.opacity = '0.001';
    vid.style.pointerEvents = 'none';
    vid.style.zIndex = '-1';
    vid.src = url;
    document.body.appendChild(vid);
    fallbackVideoEl = vid;
  } else if (!fallbackVideoEl.isConnected) {
    document.body.appendChild(fallbackVideoEl);
  }

  if (fallbackVideoEl.paused) {
    void fallbackVideoEl.play().catch(() => {
      // Will retry on next user gesture
    });
  }
}

function syncSubAudibleAudioKeepAlive(): void {
  if (!hasUserActivated || typeof window === 'undefined') return;
  const AudioCtxCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtxCtor) return;

  if (!canStayAwakeNow()) {
    if (keepAliveAudioCtx && keepAliveAudioCtx.state === 'running') {
      void keepAliveAudioCtx.suspend().catch(() => {});
    }
    return;
  }

  try {
    if (!keepAliveAudioCtx) {
      const ctx = new AudioCtxCtor();
      const gain = ctx.createGain();
      // -100 dBFS: completely silent to human ears & speakers while preventing macOS App Nap / Windows EcoQoS sleep
      gain.gain.value = 0.00001;
      gain.connect(ctx.destination);

      if (typeof ctx.createConstantSource === 'function') {
        const src = ctx.createConstantSource();
        src.offset.value = 1;
        src.connect(gain);
        src.start();
      } else {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 30;
        osc.connect(gain);
        osc.start();
      }
      keepAliveAudioCtx = ctx;
    }
    if (keepAliveAudioCtx.state === 'suspended') {
      void keepAliveAudioCtx.resume().catch(() => {});
    }
  } catch {
    // Ignore restricted audio environments
  }
}

async function acquireWakeLock(): Promise<void> {
  if (typeof navigator === 'undefined') return;
  if (!canStayAwakeNow()) {
    releaseNativeWakeLock();
    stopFallbackVideo();
    return;
  }
  if (sentinel && !sentinel.released) {
    stopFallbackVideo();
    return;
  }
  if (acquiring) return;

  const nav = navigator as unknown as NavigatorWithWakeLock;
  if (!nav.wakeLock || typeof nav.wakeLock.request !== 'function') {
    startFallbackVideoIfNeeded();
    return;
  }

  acquiring = true;
  try {
    const nextSentinel = await nav.wakeLock.request('screen');
    if (!canStayAwakeNow()) {
      void nextSentinel.release().catch(() => {});
      return;
    }
    sentinel = nextSentinel;
    // Native wake lock succeeded — ensure fallback video decoder is idle
    stopFallbackVideo();
    nextSentinel.addEventListener('release', () => {
      if (sentinel === nextSentinel) {
        sentinel = null;
      }
      if (canStayAwakeNow()) {
        void acquireWakeLock();
      }
    });
  } catch {
    sentinel = null;
    startFallbackVideoIfNeeded();
  } finally {
    acquiring = false;
  }
}

function refreshAllKeepAwake(): void {
  if (!canStayAwakeNow()) {
    if (isUserInactiveForSleep()) {
      currentlyInactivityAsleep = true;
    }
    releaseNativeWakeLock();
    stopFallbackVideo();
    syncSubAudibleAudioKeepAlive();
    return;
  }
  void acquireWakeLock();
  syncSubAudibleAudioKeepAlive();
}

export function markUserActivity(isActivationGesture = false): void {
  const now = Date.now();
  const wasAsleep = currentlyInactivityAsleep;
  lastActivityAtMs = now;
  currentlyInactivityAsleep = false;
  if (isActivationGesture) {
    hasUserActivated = true;
  }
  if (wasAsleep) {
    refreshAllKeepAwake();
    for (const listener of activityWakeListeners) {
      try {
        listener();
      } catch {
        // ignore listener errors
      }
    }
  } else if (isActivationGesture) {
    refreshAllKeepAwake();
  }
}

export function installGlobalKeepAwake(): void {
  if (installed || typeof window === 'undefined' || typeof document === 'undefined') return;
  installed = true;
  lastActivityAtMs = Date.now();
  currentlyInactivityAsleep = false;

  const onUserGesture = (): void => {
    markUserActivity(true);
  };

  const onPointerMovement = (): void => {
    const now = Date.now();
    if (!currentlyInactivityAsleep && now - lastMoveStampMs < 250) return;
    lastMoveStampMs = now;
    markUserActivity(false);
  };

  // Attempt immediately (succeeds without gesture on installed PWAs, Android Chrome, Desktop Chrome/Edge)
  void acquireWakeLock();

  // Capture-phase gesture hooks unlock wake locks & fallback mechanisms on iOS Safari, Firefox, and iframes
  const gestureEvents = ['pointerdown', 'touchend', 'mousedown', 'keydown', 'click'] as const;
  for (const evt of gestureEvents) {
    window.addEventListener(evt, onUserGesture, { capture: true, passive: true });
  }

  // Movement hooks reset the 5-minute inactivity sleep timer on every OS (mouse, trackpad, touch, scroll)
  const moveEvents = ['pointermove', 'mousemove', 'touchmove', 'wheel'] as const;
  for (const evt of moveEvents) {
    window.addEventListener(evt, onPointerMovement, { capture: true, passive: true });
  }

  document.addEventListener('visibilitychange', refreshAllKeepAwake);
  window.addEventListener('focus', () => {
    markUserActivity(false);
    refreshAllKeepAwake();
  });
  window.addEventListener('pageshow', refreshAllKeepAwake);
  document.addEventListener('fullscreenchange', refreshAllKeepAwake);

  // Periodic 15s watchdog enforces keep-awake while active and releases cleanly after 5 minutes of no movement
  window.setInterval(() => {
    refreshAllKeepAwake();
  }, 15_000);
}
