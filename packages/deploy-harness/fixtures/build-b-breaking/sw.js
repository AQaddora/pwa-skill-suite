// Build B service worker. Same contract as build A: network-first navigations, no
// unconditional skipWaiting — only activates on an explicit 'skip-waiting' message.
const BUILD_ID = 'B';
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
