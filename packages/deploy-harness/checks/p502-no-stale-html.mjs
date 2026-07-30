// P-502 — Cache-first on HTML/navigation. Install on build A, swap the origin to B, then
// navigate again the way a live tab would (a reload). If the SW served navigations
// cache-first, the reload would still render A. It must render B.
import { makeFinding } from '../lib/finding.mjs';
import { aggregate } from '../lib/outcome.mjs';

export default {
  ids: ['P-502'],
  name: 'No stale HTML after a deploy swap',
  async run({ proxy, browser, buildADir, buildBDir }) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      proxy.swapTo(buildADir);
      await page.goto(proxy.url + '/', { waitUntil: 'load' });
      await page.evaluate(() => navigator.serviceWorker.ready);

      proxy.swapTo(buildBDir);
      await page.reload({ waitUntil: 'load' });
      const shellBuild = await page.evaluate(() => window.__SHELL_BUILD__);

      const findings = [];
      if (shellBuild !== 'B') {
        findings.push(
          makeFinding('P-502', {
            context: '/',
            selector: 'index.html',
            detail: `navigation after the A→B swap still rendered build ${shellBuild} — cache-first navigation is pinning stale HTML`,
          }),
        );
      }
      return aggregate({ findings, detail: 'reloaded a live navigation after the A→B swap and asserted fresh HTML' });
    } finally {
      await context.close();
    }
  },
};
