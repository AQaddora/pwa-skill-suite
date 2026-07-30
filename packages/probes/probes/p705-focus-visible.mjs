// P-705 — `outline: none` with no focus replacement. Tab through the focusable controls and,
// for each keyboard-focused element, assert there is *some* visible focus indicator (a
// non-zero outline or a box-shadow). None → the control is unusable for keyboard users.
//
// Limitation: a focus style expressed only as a background/border swap is not counted here;
// this checks the two indicators that reliably read as "focused" (outline, box-shadow).
import { withPage } from '../lib/single.mjs';
import { makeFinding } from '../lib/finding.mjs';
import { aggregate } from '../lib/outcome.mjs';

export default {
  ids: ['P-705'],
  name: 'No visible focus indicator',
  async run(harness) {
    return withPage(harness, {}, async (page, cell) => {
      const count = await page
        .locator('button, a[href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])')
        .count();
      if (count === 0) {
        return aggregate({ resolved: false, targetIsLocal: harness.config.targetIsLocal, detail: 'no focusable controls found to test' });
      }
      const findings = [];
      const seen = new Set();
      for (let i = 0; i < count + 1; i++) {
        await page.keyboard.press('Tab');
        const info = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body || el === document.documentElement) return null;
          const s = getComputedStyle(el);
          const ow = parseFloat(s.outlineWidth) || 0;
          const hasOutline = s.outlineStyle !== 'none' && ow > 0;
          const hasShadow = !!s.boxShadow && s.boxShadow !== 'none';
          return { selector: window.__pwa.cssPath(el), hasOutline, hasShadow };
        });
        if (!info || seen.has(info.selector)) continue;
        seen.add(info.selector);
        if (!info.hasOutline && !info.hasShadow) {
          findings.push(
            makeFinding('P-705', {
              context: harness.config.routes[0] || '/',
              selector: info.selector,
              detail: 'keyboard focus shows no outline or box-shadow (focus indicator removed)',
              cell,
            }),
          );
        }
      }
      return aggregate({ findings, targetIsLocal: harness.config.targetIsLocal, detail: `tabbed through ${seen.size} control(s)` });
    });
  },
};
