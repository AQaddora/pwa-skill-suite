// P-522 — API contract skew: A's cached shell keeps running (no reload) and calls B's API
// after the swap. Must be handled gracefully — forced update or a compatible response —
// never a silent blank / uncaught error.
import { makeFinding } from '../lib/finding.mjs';
import { aggregate } from '../lib/outcome.mjs';

export default {
  ids: ['P-522'],
  name: "A's shell against B's API is handled gracefully, never a silent blank",
  async run({ proxy, browser, buildADir, buildBDir }) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      proxy.swapTo(buildADir);
      await page.goto(proxy.url + '/', { waitUntil: 'load' });

      proxy.swapTo(buildBDir);
      // Still A's in-memory shell — no reload — calling the now-swapped API.
      let result;
      let threw = null;
      try {
        result = await page.evaluate(() => window.app.callApi());
      } catch (e) {
        threw = e?.message || String(e);
      }
      const bodyText = await page.evaluate(() => document.body.innerText.trim());

      const findings = [];
      if (threw) {
        findings.push(
          makeFinding('P-522', {
            context: '/',
            selector: '(api call)',
            detail: `A's shell threw calling B's API instead of handling the skew: ${threw}`,
          }),
        );
      } else if (!result || result.handled !== true) {
        findings.push(
          makeFinding('P-522', {
            context: '/',
            selector: '(api call)',
            detail: 'A\'s shell against B\'s API produced an unhandled result — not a forced update, not a compatible response',
          }),
        );
      } else if (!bodyText) {
        findings.push(
          makeFinding('P-522', {
            context: '/',
            selector: '#app',
            detail: 'A\'s shell against B\'s API left the page blank',
          }),
        );
      }
      return aggregate({ findings, detail: 'called B\'s API from A\'s still-loaded shell after the swap, with no reload' });
    } finally {
      await context.close();
    }
  },
};
