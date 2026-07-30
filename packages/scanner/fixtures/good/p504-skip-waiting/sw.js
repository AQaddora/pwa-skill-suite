self.addEventListener('install', (event) => {
  event.waitUntil(precache());
});
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
navigator.serviceWorker.addEventListener('controllerchange', () => {
  window.location.reload();
});
