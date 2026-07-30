navigator.serviceWorker
  .register('/sw.js')
  .then((registration) => {
    console.log('Service worker registered', registration);
  })
  .catch((err) => {
    reportError(err);
  });
