navigator.serviceWorker.register('/sw.js')
  .catch((err) => {
    reportError(err);
  });

async function registerWithTry() {
  try {
    await navigator.serviceWorker.register('/sw.js');
  } catch (err) {
    reportError(err);
  }
}
