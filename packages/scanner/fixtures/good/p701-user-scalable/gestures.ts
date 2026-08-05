const observeGesture = (event: Event) => {
  console.info(event.type);
};

const protectCanvasDrag = (event: TouchEvent) => {
  if (event.touches.length === 1) event.preventDefault();
};

document.addEventListener('gesturestart', observeGesture);
document.addEventListener('touchmove', protectCanvasDrag, { passive: false });
