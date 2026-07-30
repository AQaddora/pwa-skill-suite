const IN_APP_BROWSER = /FBAN|FBAV|Instagram|Line|TikTok/;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  if (IN_APP_BROWSER.test(navigator.userAgent)) {
    return;
  }
  showInstallBanner(event);
});
