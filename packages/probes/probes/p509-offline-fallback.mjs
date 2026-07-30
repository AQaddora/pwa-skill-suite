// P-509 — No offline fallback. Register whatever service worker the app ships, take the
// context offline, and require that a navigation still renders *something* (a cached shell or
// an offline fallback) rather than the browser's error page.
import { withPage } from '../lib/single.mjs';
import { makeFinding } from '../lib/finding.mjs';
import { aggregate } from '../lib/outcome.mjs';

export default {
  ids: ['P-509'],
  name: 'Offline navigation fallback',
  async run(harness) {
    return withPage(harness, {}, async (page, cell) => {
      const route = harness.config.routes[0] || '/';
      // Wait (bounded) for a service worker to take control; proceed regardless.
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            if (!('serviceWorker' in navigator)) return resolve(false);
            const done = () => resolve(true);
            navigator.serviceWorker.ready.then(done).catch(() => resolve(false));
            setTimeout(() => resolve(false), 2000);
          }),
      );
      // Reload once online so the SW controls this client before we cut the network.
      await page.reload({ waitUntil: 'load' });

      await page.context().setOffline(true);
      let navigated = true;
      try {
        await page.reload({ waitUntil: 'load' });
      } catch {
        navigated = false; // browser could not produce a page offline
      }
      const hasContent = navigated
        ? await page.evaluate(() => !!document.body && document.body.innerText.trim().length > 0)
        : false;
      await page.context().setOffline(false);

      const findings = [];
      if (!navigated || !hasContent) {
        findings.push(
          makeFinding('P-509', {
            context: route,
            selector: '(navigation)',
            detail: navigated ? 'offline navigation rendered a blank page (no fallback content)' : 'offline navigation failed with no fallback (browser error page)',
            cell,
          }),
        );
      }
      return aggregate({ findings, targetIsLocal: harness.config.targetIsLocal, detail: 'checked offline navigation fallback' });
    });
  },
};
