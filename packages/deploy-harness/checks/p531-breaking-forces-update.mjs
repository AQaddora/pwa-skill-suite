// P-531 — Breaking update never forced. Mark B as a breaking change (version.json
// `breaking: true`, minSupported bumped past A) and assert A's client force-updates —
// actually converges on B — rather than lingering on a polite optional-update banner.
import { makeFinding } from '../lib/finding.mjs';
import { aggregate } from '../lib/outcome.mjs';

export default {
  ids: ['P-531'],
  name: "A breaking deploy force-updates A's client rather than lingering",
  async run({ proxy, browser, buildADir, buildBBreakingDir }) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      proxy.swapTo(buildADir);
      await page.goto(proxy.url + '/', { waitUntil: 'load' });
      await page.evaluate(() => navigator.serviceWorker.ready);

      proxy.swapTo(buildBBreakingDir);
      const navigated = page.waitForEvent('load', { timeout: 8000 }).catch(() => null);
      const stateBeforeNav = await page.evaluate(() => window.app.checkUpdate()).catch(() => null);
      await navigated;

      const findings = [];
      const buildId = await page.evaluate(() => window.app.buildId).catch(() => null);
      if (buildId !== 'B') {
        findings.push(
          makeFinding('P-531', {
            context: '/',
            selector: '(update state)',
            detail: `marked B as breaking, but A's client did not converge on B (still "${buildId}", last update state before navigation: "${stateBeforeNav}") — it lingered instead of force-updating`,
          }),
        );
      }
      return aggregate({ findings, detail: `checked for an update against a breaking version.json; client ended on build ${buildId}` });
    } finally {
      await context.close();
    }
  },
};
