window.addEventListener('pagehide', () => {
  navigator.sendBeacon('/api/draft', draftPayload());
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    navigator.sendBeacon('/api/draft', draftPayload());
  }
});
