import * as Sentry from '@sentry/browser';

// Global handlers + reporting sink are wired up, but there is still no real error
// boundary anywhere — a generic `handleError` utility must not be mistaken for one.
export function handleError(error) {
  Sentry.captureException(error);
}

window.addEventListener('error', (event) => handleError(event.error));
window.addEventListener('unhandledrejection', (event) => handleError(event.reason));
