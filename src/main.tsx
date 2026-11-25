import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { APP_BUILD_ID } from './chess/assetVersion';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined') {
  const canonicalHref = window.location.origin + window.location.pathname;
  let canonicalLink = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonicalLink) {
    canonicalLink = document.createElement('link');
    canonicalLink.rel = 'canonical';
    document.head.appendChild(canonicalLink);
  }
  canonicalLink.href = canonicalHref;

  let ogUrlMeta = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
  if (!ogUrlMeta) {
    ogUrlMeta = document.createElement('meta');
    ogUrlMeta.setAttribute('property', 'og:url');
    document.head.appendChild(ogUrlMeta);
  }
  ogUrlMeta.content = canonicalHref;

  // Build-stamp migration: whenever a newly published build loads, purge ALL previous
  // runtime caches (videos, voices, music, registry, images) and stale media overrides
  // so 100% of assets renew cleanly to match the latest release (while keeping user games & stats).
  const BUILD_ID_STORAGE_KEY = 'chessangel_active_build_id';
  let isNewPublishedBuild = false;
  try {
    const prevBuildId = window.localStorage.getItem(BUILD_ID_STORAGE_KEY);
    if (prevBuildId !== APP_BUILD_ID) {
      isNewPublishedBuild = true;
      window.localStorage.setItem(BUILD_ID_STORAGE_KEY, APP_BUILD_ID);
      if (!import.meta.env.DEV) {
        for (const staleKey of [
          'chess_angel_lipsync_rules_v1',
          'chess_angel_case_cues_v1',
          'chess_angel_video_max_plays_v2',
          'chess_angel_video_play_to_end_v2',
          'chess_angel_dog_run_jump_sec_v1',
        ]) {
          window.localStorage.removeItem(staleKey);
        }
      }
    }
  } catch {
    // ignore private-browsing storage restrictions
  }

  if ('caches' in window) {
    const activeRuntimeCaches = new Set([
      'chessangel-voices-v4-5',
      'chessangel-videos-v4-5',
      'chessangel-registry-v4-5',
      'chessangel-images-v4-5',
    ]);
    void window.caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => {
              // Purge outdated Workbox precache buckets from prior versions
              if (k.includes('precache') && !k.includes('chessangel-v4-5')) return true;
              // On every newly published build, wipe runtime media caches so updated MP4s/MP3s renew 100%
              if (k.startsWith('chessangel-')) {
                return isNewPublishedBuild || !activeRuntimeCaches.has(k);
              }
              return false;
            })
            .map((k) => window.caches.delete(k)),
        ),
      )
      .catch(() => {});
  }

  // Register PWA Service Worker with proactive update polling & instant one-time reload on upgrade
  const hadController = Boolean('serviceWorker' in navigator && navigator.serviceWorker.controller);
  let swReloadTriggered = false;
  if ('serviceWorker' in navigator && hadController) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (swReloadTriggered) return;
      try {
        const reloadFlag = `chessangel_sw_reloaded_${APP_BUILD_ID}`;
        if (window.sessionStorage.getItem(reloadFlag) === '1') return;
        window.sessionStorage.setItem(reloadFlag, '1');
      } catch {
        // ignore sessionStorage restrictions
      }
      swReloadTriggered = true;
      window.location.reload();
    });
  }

  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // Check immediately for a newer published build and again whenever the user returns to the app
      void registration.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          void registration.update().catch(() => {});
        }
      });
      window.setInterval(() => {
        void registration.update().catch(() => {});
      }, 5 * 60 * 1000);
    },
    onRegisterError() {
      // Gracefully continue in standard browser mode if SW registration is unavailable
    },
  });

  // Client-side copy deterrence: protect media, canvas, and game chrome from casual saving/copying
  // while keeping text inputs, PGN/FEN import fields, and intentional copy buttons fully usable.
  const isEditableTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      target.isContentEditable
    );
  };

  window.addEventListener('contextmenu', (e) => {
    if (!isEditableTarget(e.target)) {
      e.preventDefault();
    }
  });

  window.addEventListener('dragstart', (e) => {
    if (!isEditableTarget(e.target)) {
      e.preventDefault();
    }
  });

  window.addEventListener('copy', (e) => {
    if (!isEditableTarget(e.target)) {
      e.preventDefault();
    }
  });

  window.addEventListener('cut', (e) => {
    if (!isEditableTarget(e.target)) {
      e.preventDefault();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    // Block Save Page (Ctrl/Cmd+S) and View Source (Ctrl/Cmd+U)
    if (key === 's' || key === 'u') {
      e.preventDefault();
    }
  });
}

createRoot(document.getElementById('root')!).render(<App />);
