// P-706 — Focus not trapped in overlays, not restored on close. With the overlay open, Tab
// must cycle within it (not leak to background content); closing it must return focus to the
// element that opened it.
import { withPage } from '../lib/single.mjs';
import { resolveRole } from '../lib/roles.mjs';
import { makeFinding } from '../lib/finding.mjs';
import { aggregate } from '../lib/outcome.mjs';

const DIALOG = '[role="dialog"], [data-pwa-role="overlay"]';

async function isHidden(page, selector, timeout) {
  try {
    await page.locator(selector).first().waitFor({ state: 'hidden', timeout });
    return true;
  } catch {
    return false;
  }
}

export default {
  ids: ['P-706'],
  name: 'Overlay focus not trapped / not restored',
  async run(harness) {
    return withPage(harness, {}, async (page, cell) => {
      const triggerSel = await resolveRole(page, 'overlayTrigger', harness.config);
      if (!triggerSel) {
        return aggregate({ resolved: false, targetIsLocal: harness.config.targetIsLocal, detail: 'no overlayTrigger role to open a modal' });
      }
      const route = harness.config.routes[0] || '/';
      const findings = [];

      await page.locator(triggerSel).first().focus();
      await page.locator(triggerSel).first().click();
      await page.locator(DIALOG).first().waitFor({ state: 'visible' });

      // Trap: Tab a handful of times and require focus to stay inside the dialog.
      let escaped = false;
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab');
        const inside = await page.evaluate((sel) => document.querySelector(sel).contains(document.activeElement), DIALOG);
        if (!inside) {
          escaped = true;
          break;
        }
      }
      if (escaped) {
        findings.push(
          makeFinding('P-706', {
            context: route,
            selector: DIALOG,
            detail: 'Tab escaped the open overlay to background content (focus not trapped)',
            cell,
          }),
        );
      }

      // Restore: close (Escape, then the close control) and require focus back on the trigger.
      await page.keyboard.press('Escape');
      let hidden = await isHidden(page, DIALOG, 800);
      if (!hidden) {
        const closeSel = await resolveRole(page, 'overlayCloseVia', harness.config);
        if (closeSel) {
          await page.locator(closeSel).first().click();
          hidden = await isHidden(page, DIALOG, 800);
        }
      }
      if (hidden) {
        const restored = await page.evaluate((sel) => document.activeElement === document.querySelector(sel), triggerSel);
        if (!restored) {
          findings.push(
            makeFinding('P-706', {
              context: route,
              selector: triggerSel,
              detail: 'focus was not restored to the trigger after the overlay closed',
              cell,
            }),
          );
        }
      } else {
        findings.push(
          makeFinding('P-706', { context: route, selector: DIALOG, detail: 'overlay did not close via Escape or a close control', cell }),
        );
      }

      return aggregate({ findings, targetIsLocal: harness.config.targetIsLocal, detail: 'checked focus trap and restoration' });
    });
  },
};
