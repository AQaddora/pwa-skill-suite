// P-208 — Hardware/gesture back doesn't close the modal. Open the overlay, trigger history
// back, and require that it closes the overlay while staying on the page — not that it
// navigates away (leaving the overlay stranded) or does nothing.
import { withPage } from '../lib/single.mjs';
import { resolveRole } from '../lib/roles.mjs';
import { makeFinding } from '../lib/finding.mjs';
import { aggregate } from '../lib/outcome.mjs';

const DIALOG = '[role="dialog"], [data-pwa-role="overlay"]';

export default {
  ids: ['P-208'],
  name: 'History back does not close the overlay',
  async run(harness) {
    return withPage(harness, {}, async (page, cell) => {
      const triggerSel = await resolveRole(page, 'overlayTrigger', harness.config);
      if (!triggerSel) {
        return aggregate({ resolved: false, targetIsLocal: harness.config.targetIsLocal, detail: 'no overlayTrigger role to open a modal' });
      }
      const route = harness.config.routes[0] || '/';
      const startPath = new URL(page.url()).pathname;

      await page.locator(triggerSel).first().click();
      await page.locator(DIALOG).first().waitFor({ state: 'visible' });

      await page.goBack().catch(() => {}); // may be a no-op when the overlay wasn't pushed to history

      // Give a client-side popstate a moment to settle without a fixed sleep: wait for the
      // overlay to become hidden, but bounded — a bad app simply never hides it.
      let closed = true;
      try {
        await page.locator(DIALOG).first().waitFor({ state: 'hidden', timeout: 1000 });
      } catch {
        closed = false;
      }
      const nowPath = new URL(page.url()).pathname;
      const navigatedAway = nowPath !== startPath;

      const findings = [];
      if (!closed) {
        findings.push(makeFinding('P-208', { context: route, selector: DIALOG, detail: 'history back did not close the open overlay', cell }));
      } else if (navigatedAway) {
        findings.push(
          makeFinding('P-208', { context: route, selector: DIALOG, detail: `history back navigated away (${startPath} → ${nowPath}) instead of just closing the overlay`, cell }),
        );
      }
      return aggregate({ findings, targetIsLocal: harness.config.targetIsLocal, detail: 'checked history-back overlay dismissal' });
    });
  },
};
