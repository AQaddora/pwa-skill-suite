const onGesture = (event: Event) => {
  event.preventDefault();
};

export function installObservationListener() {
  const onGesture = (event: Event) => {
    console.info('inner observer', event.type);
  };

  document.addEventListener('gesturestart', onGesture);
}
