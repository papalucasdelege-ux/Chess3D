import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Register offline-capable PWA service worker
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(<App />);
