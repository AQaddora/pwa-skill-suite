// P-203 — No persistent shell; the whole page re-renders per route. Tag the shell node,
// navigate to another route the way a user would (click an in-app link), and assert the
// shell node kept its identity. A lost tag means the shell was re-created (full re-render).
import { withPage } from '../lib/single.mjs';
import { resolveRole } from '../lib/roles.mjs';
import { makeFinding } from '../lib/finding.mjs';
import { aggregate } from '../lib/outcome.mjs';

const TOKEN = 'pwa-shell-token-203';

export default {
  ids: ['P-203'],
  name: 'Shell node identity across navigation',
  async run(harness) {
    const routes = harness.config.routes;
    if (routes.length < 2) {
      return aggregate({ resolved: false, targetIsLocal: harness.config.targetIsLocal, detail: 'need at least two routes to test shell persistence' });
    }
    return withPage(harness, { route: routes[0] }, async (page, cell) => {
      const shellSel = await resolveRole(page, 'shell', harness.config);
      if (!shellSel) {
        return aggregate({ resolved: false, targetIsLocal: harness.config.targetIsLocal, detail: 'no shell resolved (set config.selectors.shell or data-pwa-role="shell")' });
      }
      await page.evaluate(({ sel, token }) => document.querySelector(sel).setAttribute('data-pwa-token', token), { sel: shellSel, token: TOKEN });

      const target = routes[1];
      const link = page.locator(`a[href="${target}"], a[href$="${target}"]`).first();
      if ((await link.count()) === 0) {
        return aggregate({ resolved: false, targetIsLocal: harness.config.targetIsLocal, detail: `no in-app link to ${target} to drive navigation` });
      }
      await link.click();
      await page.waitForFunction((t) => location.pathname === t || location.pathname.endsWith(t), target);

      const token = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el ? el.getAttribute('data-pwa-token') : null;
      }, shellSel);

      const findings = [];
      if (token !== TOKEN) {
        findings.push(
          makeFinding('P-203', {
            context: `${routes[0]} → ${target}`,
            selector: shellSel,
            detail: 'shell node was re-created on navigation (no persistent shell — full re-render per route)',
            cell,
          }),
        );
      }
      return aggregate({ findings, targetIsLocal: harness.config.targetIsLocal, detail: 'checked shell identity across an in-app navigation' });
    });
  },
};
