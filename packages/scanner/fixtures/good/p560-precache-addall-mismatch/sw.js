const PRECACHE = ['/index.html', '/assets/app.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open('v1').then((cache) => cache.addAll(PRECACHE)));
});
