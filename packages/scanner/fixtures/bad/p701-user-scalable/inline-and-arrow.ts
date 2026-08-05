export const generateViewport = () => ({
  width: 'device-width',
  maximumScale: 1,
});

window.addEventListener('gesturechange', (event) => {
  event.preventDefault();
});
