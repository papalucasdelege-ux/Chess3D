import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
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

  // Purge outdated runtime PWA caches (e.g. v4-0) so installed apps reclaim quota & drop stale media/registry entries
  if ('caches' in window) {
    const activeRuntimeCaches = new Set([
      'chessangel-voices-v4-2',
      'chessangel-videos-v4-2',
      'chessangel-registry-v4-2',
      'chessangel-images-v4-2',
    ]);
    void window.caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('chessangel-') && !activeRuntimeCaches.has(k))
            .map((k) => window.caches.delete(k)),
        ),
      )
      .catch(() => {});
  }

  // Register the copy-secured PWA Service Worker with silent auto-updates
  registerSW({
    immediate: true,
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
