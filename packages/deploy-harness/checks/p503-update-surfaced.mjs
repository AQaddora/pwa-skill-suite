// P-503 — No update flow: a new SW would wait forever. After the origin swaps to B, the app
// must be able to discover the waiting worker within a bounded window (waitForUpdate resolves
// to it) rather than sitting on it with no path to find out.
import { makeFinding } from '../lib/finding.mjs';
import { aggregate } from '../lib/outcome.mjs';

export default {
  ids: ['P-503'],
  name: 'A waiting update is surfaced, not sat on forever',
  async run({ proxy, browser, buildADir, buildBDir }) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      proxy.swapTo(buildADir);
      await page.goto(proxy.url + '/', { waitUntil: 'load' });
      await page.evaluate(() => navigator.serviceWorker.ready);

      proxy.swapTo(buildBDir);
      const found = await page.evaluate(() => window.app.waitForRegistrationUpdate().then((w) => !!w));

      const findings = [];
      if (!found) {
        findings.push(
          makeFinding('P-503', {
            context: '/',
            selector: '(service worker registration)',
            detail: 'a new worker was available after the deploy but the app had no bounded way to discover it — it would wait indefinitely',
          }),
        );
      }
      return aggregate({ findings, detail: 'asserted a waiting worker after A→B is discoverable within a bounded wait' });
    } finally {
      await context.close();
    }
  },
};
