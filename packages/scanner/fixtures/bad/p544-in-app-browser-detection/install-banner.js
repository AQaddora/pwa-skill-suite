window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  showInstallBanner(event);
});
