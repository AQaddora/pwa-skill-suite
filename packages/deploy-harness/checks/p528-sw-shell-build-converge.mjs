// P-528 — Service worker and app shell from different builds. Drive the full, real update
// flow (discover the waiting worker, activate it, reload) and assert the shell's own build id
// and the now-controlling SW's build id converge on the same value.
import { makeFinding } from '../lib/finding.mjs';
import { aggregate } from '../lib/outcome.mjs';

export default {
  ids: ['P-528'],
  name: 'SW and shell build ids converge after an applied update',
  async run({ proxy, browser, buildADir, buildBDir }) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      proxy.swapTo(buildADir);
      await page.goto(proxy.url + '/', { waitUntil: 'load' });
      await page.evaluate(() => navigator.serviceWorker.ready);

      proxy.swapTo(buildBDir);
      const applied = await page.evaluate(() => window.app.applyUpdate());
      if (!applied) {
        return aggregate({ resolved: false, detail: 'no waiting worker became available to activate — cannot exercise the convergence path' });
      }
      await page.reload({ waitUntil: 'load' });

      const shellBuild = await page.evaluate(() => window.app.buildId);
      const swBuild = await page.evaluate(() => window.app.swBuildId());

      const findings = [];
      if (shellBuild !== swBuild || shellBuild !== 'B') {
        findings.push(
          makeFinding('P-528', {
            context: '/',
            selector: '(build id)',
            detail: `shell build "${shellBuild}" and SW build "${swBuild}" did not converge on B after the update was applied`,
          }),
        );
      }
      return aggregate({ findings, detail: `activated the waiting worker and reloaded; shell=${shellBuild} sw=${swBuild}` });
    } finally {
      await context.close();
    }
  },
};
