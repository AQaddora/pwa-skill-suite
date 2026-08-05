// P-504 — skipWaiting() fired unconditionally. After the origin swaps to B, and *without* the
// app explicitly activating the update, the live tab's controller must not change out from
// under it. An uncontrolled skipWaiting fires an unprompted 'controllerchange' — that is the
// observable signature of assets swapping mid-session without consent.
import { makeFinding } from '../lib/finding.mjs';
import { aggregate } from '../lib/outcome.mjs';
import { waitForServiceWorkerReady } from '../lib/ready.mjs';

const OBSERVE_MS = 3000;

export default {
  ids: ['P-504'],
  name: 'skipWaiting does not swap assets under a live tab',
  async run({ proxy, browser, buildADir, buildBDir }) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      proxy.swapTo(buildADir);
      await page.goto(proxy.url + '/', { waitUntil: 'load' });
      if (!(await waitForServiceWorkerReady(page))) {
        return aggregate({ resolved: false, detail: 'the SW never activated on build A — cannot exercise the swap' });
      }

      proxy.swapTo(buildBDir);
      // Install the observer *before* asking the registration to update. An
      // unconditional skipWaiting() can change the controller before update()
      // resolves, especially on a busy CI host; observing afterwards creates a
      // false PASS race.
      const controllerChanged = await page.evaluate(
        async (ms) => {
          const initialController = navigator.serviceWorker.controller;
          const changed = new Promise((resolve) => {
            const t = setTimeout(() => resolve(false), ms);
            navigator.serviceWorker.addEventListener(
              'controllerchange',
              () => {
                clearTimeout(t);
                resolve(true);
              },
              { once: true },
            );
          });
          const registration = await navigator.serviceWorker.getRegistration();
          await registration?.update().catch(() => {});
          if (navigator.serviceWorker.controller !== initialController) return true;
          return changed;
        },
        OBSERVE_MS,
      );
      const buildIdStillA = await page.evaluate(() => window.app.buildId);

      const findings = [];
      if (controllerChanged || buildIdStillA !== 'A') {
        findings.push(
          makeFinding('P-504', {
            context: '/',
            selector: '(service worker)',
            detail: 'the controller changed out from under the live tab without the app activating it — skipWaiting fired unconditionally',
          }),
        );
      }
      return aggregate({ findings, detail: 'watched for an unprompted controllerchange after A→B with no explicit activation' });
    } finally {
      await context.close();
    }
  },
};
