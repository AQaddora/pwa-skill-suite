// Build A service worker. Network-first for navigations (P-502). Does NOT skipWaiting on
// install, so an updated worker cannot swap assets under a live tab mid-session (P-504);
// it only takes over when the app explicitly messages 'skip-waiting' (the correct flow).
const BUILD_ID = 'A';
self.addEventListener('install', () => { /* intentionally no skipWaiting */ });
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'build-id' && e.ports[0]) e.ports[0].postMessage(BUILD_ID);
  if (e.data && e.data.type === 'skip-waiting') self.skipWaiting();
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/index.html')));
  }
});
