// P-115 — No back button in standalone mode. Under an emulated standalone display-mode on a
// deep route (where the browser back button is gone), the app must provide its own back
// affordance. Absence strands the user on the page.
//
// Note: the standalone chrome itself (no URL bar) is device-only; what is checkable here is
// whether the app *renders a back affordance* when it believes it is standalone.
import { withPage } from '../lib/single.mjs';
import { makeFinding } from '../lib/finding.mjs';
import { aggregate } from '../lib/outcome.mjs';

export default {
  ids: ['P-115'],
  name: 'Back affordance in standalone mode',
  async run(harness) {
    const deep = harness.config.routes.find((r) => r !== '/');
    if (!deep) {
      return aggregate({ resolved: false, targetIsLocal: harness.config.targetIsLocal, detail: 'no deep (non-"/") route to test a standalone back affordance' });
    }
    return withPage(harness, { route: deep, displayMode: 'standalone' }, async (page, cell) => {
      const standalone = await page.evaluate(() => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true);
      if (!standalone) {
        return aggregate({ resolved: false, targetIsLocal: harness.config.targetIsLocal, detail: 'standalone display-mode emulation did not take effect' });
      }
      const hasBack = await page.evaluate(() => {
        if (document.querySelector('[data-pwa-role="back"], button[aria-label*="back" i], a[aria-label*="back" i]')) return true;
        for (const el of document.querySelectorAll('button, a[href], [role="button"]')) {
          const n = window.__pwa.accessibleName(el).toLowerCase();
          if (/^(back|‹|←|<)/.test(n)) return true;
        }
        return false;
      });
      const findings = [];
      if (!hasBack) {
        findings.push(
          makeFinding('P-115', {
            context: deep,
            selector: '(document)',
            detail: 'no in-app back affordance found while standalone on a deep route',
            cell,
          }),
        );
      }
      return aggregate({ findings, targetIsLocal: harness.config.targetIsLocal, detail: 'checked for a standalone back affordance' });
    });
  },
};
