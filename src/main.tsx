import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

if (import.meta.env.PROD) {
  registerSW({ immediate: true });
} else if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  // Ensure no stale dev service worker intercepts new /voices/female/*.mp3 assets in dev preview
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => {
      for (const reg of regs) {
        void reg.unregister();
      }
    })
    .catch(() => {});
}

createRoot(document.getElementById('root')!).render(<App />);
