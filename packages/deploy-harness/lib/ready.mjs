// Bounded wait for the SW to activate — never an unbounded hang. Every check that needs a
// controlling worker before it can drive an A→B swap uses this instead of awaiting
// `navigator.serviceWorker.ready` directly, so a fixture bug (or, eventually, a real
// project with no SW at all) reports BLOCKED rather than wedging the whole run.
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * @param {import('playwright').Page} page
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>} true once a SW controls this page, false on timeout
 */
export function waitForServiceWorkerReady(page, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return page
    .evaluate(
      (ms) =>
        Promise.race([
          navigator.serviceWorker.ready.then(() => true),
          new Promise((resolve) => setTimeout(() => resolve(false), ms)),
        ]),
      timeoutMs,
    )
    .catch(() => false);
}
