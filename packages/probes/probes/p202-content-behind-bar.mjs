// P-202 — Content hidden behind the tab bar. After scrolling to the bottom, the last
// text-bearing content must not render underneath the fixed tab bar (i.e. the layout must
// reserve room for it). Names the buried element.
import { withPage } from '../lib/single.mjs';
import { resolveRole } from '../lib/roles.mjs';
import { makeFinding } from '../lib/finding.mjs';
import { aggregate } from '../lib/outcome.mjs';

export default {
  ids: ['P-202'],
  name: 'Content buried behind the tab bar',
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
      const result = await page.evaluate((s) => {
        const bar = document.querySelector(s);
        const barPos = getComputedStyle(bar).position;
        if (barPos !== 'fixed' && barPos !== 'sticky') return { skip: true }; // P-201's concern
        window.scrollTo(0, document.body.scrollHeight);
        const barTop = bar.getBoundingClientRect().top;
        // Find the lowest-rendered text leaf that is not the bar itself.
        let worst = null;
        for (const el of document.querySelectorAll('body *')) {
          if (el === bar || bar.contains(el) || el.contains(bar)) continue;
          if (!el.textContent || !el.textContent.trim()) continue;
          if (el.children.length > 0) continue; // leaf only
          const r = el.getBoundingClientRect();
          if (r.height === 0 || r.width === 0) continue;
          if (!worst || r.bottom > worst.bottom) worst = { bottom: r.bottom, selector: window.__pwa.cssPath(el) };
        }
        if (worst && worst.bottom > barTop + 2) {
          return { buried: true, selector: worst.selector, overlap: Math.round(worst.bottom - barTop) };
        }
        return { buried: false };
      }, sel);

      if (result.skip) {
        return aggregate({ targetIsLocal: harness.config.targetIsLocal, detail: 'tab bar is not fixed; see P-201' });
      }
      const findings = [];
      if (result.buried) {
        findings.push(
          makeFinding('P-202', {
            context: harness.config.routes[0] || '/',
            selector: result.selector,
            detail: `renders ${result.overlap}px under the fixed tab bar (no room reserved)`,
            cell,
          }),
        );
      }
      return aggregate({ findings, targetIsLocal: harness.config.targetIsLocal, detail: 'checked content occlusion at scroll bottom' });
    });
  },
};
