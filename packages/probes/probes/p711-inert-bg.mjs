// P-711 — Background content not inert behind a modal. With the overlay open, the
// background must be `inert` or `aria-hidden="true"`, or assistive tech and Tab focus leak
// into content the user can't see.
import { withPage } from '../lib/single.mjs';
import { resolveRole } from '../lib/roles.mjs';
import { makeFinding } from '../lib/finding.mjs';
import { aggregate } from '../lib/outcome.mjs';

export default {
  ids: ['P-711'],
  name: 'Background not inert behind a modal',
  async run(harness) {
    return withPage(harness, {}, async (page, cell) => {
      const trigger = await resolveRole(page, 'overlayTrigger', harness.config);
      if (!trigger) {
        return aggregate({
          resolved: false,
          targetIsLocal: harness.config.targetIsLocal,
          detail: 'no overlayTrigger role to open a modal',
        });
      }
      await page.locator(trigger).first().click();
      const dialog = '[role="dialog"], [data-pwa-role="overlay"]';
      await page.locator(dialog).first().waitFor({ state: 'visible' });

      const result = await page.evaluate((dlgSel) => {
        const dlg = document.querySelector(dlgSel);
        // Any background focusable outside the dialog that is neither inert nor aria-hidden?
        const focusables = document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]');
        const leaks = [];
        for (const el of focusables) {
          if (dlg.contains(el)) continue;
          let node = el;
          let guarded = false;
          while (node && node !== document.body.parentElement) {
            if (node.hasAttribute && (node.hasAttribute('inert') || node.getAttribute('aria-hidden') === 'true')) {
              guarded = true;
              break;
            }
            node = node.parentElement;
          }
          if (!guarded) leaks.push(window.__pwa.cssPath(el));
        }
        return { leaks: leaks.slice(0, 5), count: leaks.length };
      }, dialog);

      const findings = [];
      if (result.count > 0) {
        findings.push(
          makeFinding('P-711', {
            context: harness.config.routes[0] || '/',
            selector: result.leaks[0],
            detail: `${result.count} background control(s) reachable while the modal is open (background not inert/aria-hidden)`,
            cell,
          }),
        );
      }
      return aggregate({ findings, targetIsLocal: harness.config.targetIsLocal, detail: 'checked background inertness with the modal open' });
    });
  },
};
