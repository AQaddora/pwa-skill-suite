import * as Sentry from '@sentry/browser';

export function initErrorReporting() {
  Sentry.init({ dsn: 'https://example.ingest.sentry.io/1' });

  window.addEventListener('error', (event) => {
    Sentry.captureException(event.error);
  });
  window.addEventListener('unhandledrejection', (event) => {
    Sentry.captureException(event.reason);
  });
}
