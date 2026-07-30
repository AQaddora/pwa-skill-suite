let wakeLock = null;

async function requestWakeLock() {
  wakeLock = await navigator.wakeLock.request('screen');
}

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible') {
    await requestWakeLock();
  }
});

requestWakeLock();
