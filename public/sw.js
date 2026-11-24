// ChessAngel 3D — Self-Unregistering Service Worker Kill-Switch for Static Hosts (Netlify / Cloud Run)
// Ensures any previously installed PWA/Workbox Service Worker immediately clears stale caches
// and unregisters itself so HTML5 <video> HTTP 206 Partial Content Range requests on Android never stall.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => {
        for (const client of clients) {
          if ('navigate' in client) {
            // Leave active game session uninterrupted; next load runs 100% network-native
          }
        }
      }),
  );
});
