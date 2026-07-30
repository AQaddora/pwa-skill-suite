// P-207 — Modal renders behind the fixed bar / stacking-context trap. Open the overlay and
// assert that at the point where the tab bar sits, the topmost element is the overlay (its
// backdrop/content), not the tab bar. A modal that the tab bar paints over is the defect.
import { withPage } from '../lib/single.mjs';
import { resolveRole } from '../lib/roles.mjs';
import { makeFinding } from '../lib/finding.mjs';
import { aggregate } from '../lib/outcome.mjs';

async function resolveOverlay(page, config) {
  const explicit = await resolveRole(page, 'overlay', config);
  if (explicit) return explicit;
  const dialog = '[role="dialog"]';
  return (await page.locator(dialog).count()) > 0 ? dialog : null;
}

export default {
  ids: ['P-207'],
  name: 'Overlay clipped by / behind the tab bar',
  async run(harness) {
    return withPage(harness, {}, async (page, cell) => {
      const trigger = await resolveRole(page, 'overlayTrigger', harness.config);
      const bar = await resolveRole(page, 'tabbar', harness.config);
      if (!trigger || !bar) {
        return aggregate({
          resolved: false,
          targetIsLocal: harness.config.targetIsLocal,
          detail: 'need both an overlayTrigger and a tabbar role to test overlay stacking',
        });
      }
      await page.locator(trigger).first().click();
      const overlaySel = await resolveOverlay(page, harness.config);
      if (!overlaySel) {
        return aggregate({
          resolved: false,
          targetIsLocal: harness.config.targetIsLocal,
          detail: 'trigger did not reveal a resolvable overlay ([role=dialog] or data-pwa-role="overlay")',
        });
      }
      await page.locator(overlaySel).first().waitFor({ state: 'visible' });

      const verdict = await page.evaluate(
        ({ barSel, ovSel }) => {
          const bar = document.querySelector(barSel);
          const ov = document.querySelector(ovSel);
          const br = bar.getBoundingClientRect();
          const x = Math.round(br.left + br.width / 2);
          const y = Math.round(br.top + br.height / 2);
          const top = document.elementFromPoint(x, y);
          const overlayOnTop = top && (ov.contains(top) || top === ov);
          return { overlayOnTop, selector: window.__pwa.cssPath(ov) };
        },
        { barSel: bar, ovSel: overlaySel },
      );

      const findings = [];
      if (!verdict.overlayOnTop) {
        findings.push(
          makeFinding('P-207', {
            context: harness.config.routes[0] || '/',
            selector: verdict.selector,
            detail: 'the tab bar paints over the open overlay (overlay is behind the fixed bar)',
            cell,
          }),
        );
      }
      return aggregate({ findings, targetIsLocal: harness.config.targetIsLocal, detail: 'checked overlay stacking over the tab bar' });
    });
  },
};
