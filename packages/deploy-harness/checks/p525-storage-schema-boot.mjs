// P-525 — Client storage schema migration missing. Seed A's persisted storage shape, load B,
// assert boot succeeds rather than white-screening on hydration.
import { makeFinding } from '../lib/finding.mjs';
import { aggregate } from '../lib/outcome.mjs';

export default {
  ids: ['P-525'],
  name: "Boot succeeds against A's persisted storage shape",
  async run({ proxy, browser, buildADir, buildBDir }) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      proxy.swapTo(buildADir);
      await page.goto(proxy.url + '/', { waitUntil: 'load' });
      const seededSchema = await page.evaluate(() => JSON.parse(localStorage.getItem('appState')).schema);

      proxy.swapTo(buildBDir);
      let threw = null;
      try {
        await page.reload({ waitUntil: 'load' });
      } catch (e) {
        threw = e?.message || String(e);
      }

      const findings = [];
      if (threw) {
        findings.push(
          makeFinding('P-525', {
            context: '/',
            selector: '(boot)',
            detail: `loading B against A's persisted storage shape (schema ${seededSchema}) crashed the navigation: ${threw}`,
          }),
        );
      } else {
        const booted = await page.evaluate(() => window.app && window.app.booted === true);
        const bodyText = await page.evaluate(() => document.body.innerText.trim());
        if (!booted || !bodyText) {
          findings.push(
            makeFinding('P-525', {
              context: '/',
              selector: '#app',
              detail: `B failed to boot against A's persisted storage shape (schema ${seededSchema}) — white screen on hydration`,
            }),
          );
        }
      }
      return aggregate({ findings, detail: `seeded A's storage (schema ${seededSchema}), loaded B, asserted boot succeeded` });
    } finally {
      await context.close();
    }
  },
};
