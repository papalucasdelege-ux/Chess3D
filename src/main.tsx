import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Web-only enforcement: suppress browser PWA install prompts, remove any manifest link,
// unregister any previously installed Service Workers, and purge offline caches so the
// browser URL address bar never shows an Install / Download App button.
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

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
  });

  document.querySelectorAll('link[rel="manifest"]').forEach((el) => el.remove());

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => {
        for (const reg of regs) {
          void reg.unregister();
        }
      })
      .catch(() => {});
  }

  if ('caches' in window) {
    window.caches
      .keys()
      .then((keys) => {
        for (const key of keys) {
          if (key.startsWith('workbox-') || key.startsWith('chessangel-') || key.includes('precache')) {
            void window.caches.delete(key);
          }
        }
      })
      .catch(() => {});
  }
}

createRoot(document.getElementById('root')!).render(<App />);
