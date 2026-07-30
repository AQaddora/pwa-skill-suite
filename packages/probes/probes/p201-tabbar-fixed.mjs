// P-201 — Tab bar is a normal div in the page flow. The resolved tab bar must be pinned
// (position: fixed or sticky); a static-flow bar scrolls away with the content.
import { withPage } from '../lib/single.mjs';
import { resolveRole } from '../lib/roles.mjs';
import { makeFinding } from '../lib/finding.mjs';
import { aggregate } from '../lib/outcome.mjs';

export default {
  ids: ['P-201'],
  name: 'Tab bar not fixed/sticky',
  async run(harness) {
    return withPage(harness, {}, async (page, cell) => {
      const sel = await resolveRole(page, 'tabbar', harness.config);
      if (!sel) {
        return aggregate({
          resolved: false,
          targetIsLocal: harness.config.targetIsLocal,
          detail: 'no tab bar resolved (set config.selectors.tabbar or data-pwa-role="tabbar")',
        });
      }
      const info = await page.evaluate((s) => {
        const el = document.querySelector(s);
        return { pos: getComputedStyle(el).position, selector: window.__pwa.cssPath(el) };
      }, sel);
      const findings = [];
      if (info.pos !== 'fixed' && info.pos !== 'sticky') {
        findings.push(
          makeFinding('P-201', {
            context: harness.config.routes[0] || '/',
            selector: info.selector,
            detail: `tab bar is position:${info.pos} — it scrolls with the page instead of staying pinned`,
            cell,
          }),
        );
      }
      return aggregate({ findings, targetIsLocal: harness.config.targetIsLocal, detail: 'checked tab bar positioning' });
    });
  },
};
