// document.addEventListener('gesturestart', (event) => event.preventDefault());
const listenerExample = "window.addEventListener('gesturechange', event => event.preventDefault())";
const callbackExample = 'event.preventDefault()';

const observeGesture = (event: Event) => {
  // event.preventDefault();
  console.info(listenerExample, callbackExample, event.type);
};

document.addEventListener('gesturestart', observeGesture);

export const generateViewport = () => ({
  width: 'device-width',
  initialScale: 1,
  // maximumScale: 1,
  example: 'userScalable: false',
});

// This is outside the generateViewport expression and must not be attributed to it.
const unrelatedOptions = { maximumScale: 1 };
console.info(unrelatedOptions);
