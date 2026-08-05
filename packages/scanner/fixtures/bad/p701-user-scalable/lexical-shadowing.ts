const onGesture = (event: Event) => {
  console.info('outer observer', event.type);
};

export function installBlockingGestureGuard() {
  const onGesture = (event: Event) => {
    event.preventDefault();
  };

  document.addEventListener('gesturestart', onGesture, { passive: false });
}
