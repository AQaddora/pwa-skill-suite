// P-204 — No per-tab scroll restoration. Scroll a tab, navigate away, navigate back, and
// assert the tab's own scroll position was restored. A reset-to-top on return is the defect.
import { withPage } from '../lib/single.mjs';
import { resolveRole } from '../lib/roles.mjs';
import { makeFinding } from '../lib/finding.mjs';
import { aggregate } from '../lib/outcome.mjs';

const SCROLL_TO = 300;

export default {
  ids: ['P-204'],
  name: 'Per-tab scroll restoration',
  async run(harness) {
    const routes = harness.config.routes;
    if (routes.length < 2) {
      return aggregate({ resolved: false, targetIsLocal: harness.config.targetIsLocal, detail: 'need at least two routes to test scroll restoration' });
    }
    return withPage(harness, { route: routes[0] }, async (page, cell) => {
      const scrollerSel = await resolveRole(page, 'scroller', harness.config);
      if (!scrollerSel) {
        return aggregate({ resolved: false, targetIsLocal: harness.config.targetIsLocal, detail: 'no scroller resolved (set config.selectors.scroller or data-pwa-role="scroller")' });
      }
      const scrolled = await page.evaluate(
        ({ sel, to }) => {
          const el = document.querySelector(sel);
          el.scrollTop = to;
          return el.scrollTop;
        },
        { sel: scrollerSel, to: SCROLL_TO },
      );
      if (scrolled < 50) {
        return aggregate({ resolved: false, targetIsLocal: harness.config.targetIsLocal, detail: 'scroller is not actually scrollable — cannot test restoration' });
      }

      const target = routes[1];
      const link = page.locator(`a[href="${target}"], a[href$="${target}"]`).first();
      if ((await link.count()) === 0) {
        return aggregate({ resolved: false, targetIsLocal: harness.config.targetIsLocal, detail: `no in-app link to ${target} to drive navigation` });
      }
      await link.click();
      await page.waitForFunction((t) => location.pathname === t || location.pathname.endsWith(t), target);
      await page.goBack();
      await page.waitForFunction((t) => location.pathname === t || location.pathname.endsWith(t), routes[0]);

      const restored = await page.evaluate((sel) => document.querySelector(sel).scrollTop, scrollerSel);
      const findings = [];
      if (restored < SCROLL_TO - 50) {
        findings.push(
          makeFinding('P-204', {
            context: `${routes[0]} ⇄ ${target}`,
            selector: scrollerSel,
            detail: `scroll not restored on return (was ${SCROLL_TO}px, now ${Math.round(restored)}px)`,
            cell,
          }),
        );
      }
      return aggregate({ findings, targetIsLocal: harness.config.targetIsLocal, detail: 'checked per-tab scroll restoration' });
    });
  },
};
