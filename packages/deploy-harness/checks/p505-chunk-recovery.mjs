// P-505 — Lazy chunk 404s after deploy. Load A's shell, swap the origin to B (deleting A's
// hashed chunk), then trigger the lazy import again on the *already-loaded* A tab. The chunk
// 404s; the app must recover (reload once) rather than white-screen, and must not loop.
import { makeFinding } from '../lib/finding.mjs';
import { aggregate } from '../lib/outcome.mjs';

export default {
  ids: ['P-505'],
  name: 'Lazy chunk 404 recovers instead of white-screening',
  async run({ proxy, browser, buildADir, buildBDir }) {
    const context = await browser.newContext();
    const page = await context.newPage();
    let navigations = 0;
    page.on('load', () => navigations++);
    try {
      proxy.swapTo(buildADir);
      await page.goto(proxy.url + '/', { waitUntil: 'load' });
      navigations = 0;

      proxy.swapTo(buildBDir);
      // A's hashed chunk is now gone; loadRoute() must catch the failed import, guard against
      // a reload loop, and reload once so the tab converges on B. A correct recovery destroys
      // this evaluate's execution context mid-flight via the reload, which Playwright surfaces
      // as a rejection — that is the expected shape of "it recovered", not an error.
      const triggered = page.evaluate(() => window.app.loadRoute()).catch(() => {});
      let recovered = true;
      try {
        await page.waitForEvent('load', { timeout: 8000 });
      } catch {
        recovered = false; // no navigation at all within the window — looks like a hang/white-screen
      }
      await triggered;

      const findings = [];
      if (!recovered) {
        findings.push(
          makeFinding('P-505', {
            context: '/',
            selector: '(navigation)',
            detail: 'a deleted lazy chunk produced no recovery navigation within the timeout — white screen with no fallback',
          }),
        );
        return aggregate({ findings, detail: "deleted A's lazy chunk mid-session; the app never recovered" });
      }

      await page
        .waitForFunction(() => window.app && window.app.booted === true, null, { timeout: 8000 })
        .catch(() => {});
      const bodyText = await page.evaluate(() => document.body.innerText.trim()).catch(() => '');
      const buildId = await page.evaluate(() => window.app && window.app.buildId).catch(() => null);

      if (!bodyText) {
        findings.push(
          makeFinding('P-505', {
            context: '/',
            selector: '#app',
            detail: 'a deleted lazy chunk left the page blank instead of recovering',
          }),
        );
      }
      if (navigations > 1) {
        findings.push(
          makeFinding('P-505', {
            context: '/',
            selector: '(navigation)',
            detail: `recovering from a deleted chunk caused ${navigations} reloads — looks like a reload loop`,
          }),
        );
      }
      if (buildId !== 'B') {
        findings.push(
          makeFinding('P-505', {
            context: '/',
            selector: '(navigation)',
            detail: `after recovering from the deleted chunk the tab did not converge on build B (still ${buildId})`,
          }),
        );
      }
      return aggregate({ findings, detail: 'deleted A\'s lazy chunk mid-session and asserted the app recovered without a reload loop' });
    } finally {
      await context.close();
    }
  },
};
