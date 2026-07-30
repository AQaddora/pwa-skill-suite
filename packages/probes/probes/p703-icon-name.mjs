// P-703 — Icon-only controls with no accessible name. A button/link/[role=button] that has
// no computed accessible name (no text, aria-label, aria-labelledby, title, or img alt) is
// invisible to a screen reader. Not viewport-dependent → representative cell per engine.
//
// Limitation: click handlers attached with addEventListener on non-semantic elements are not
// in the DOM and cannot be seen here — that is P-704's static/review territory.
import { elementSweep, representativeCells } from '../lib/sweep.mjs';

export default {
  ids: ['P-703'],
  name: 'Icon-only buttons with no accessible name',
  async run(harness) {
    return elementSweep(harness, {
      id: 'P-703',
      cells: representativeCells(harness),
      collect: () => {
        const out = [];
        for (const el of document.querySelectorAll('button, a[href], [role="button"], [role="link"]')) {
          const style = getComputedStyle(el);
          if (style.visibility === 'hidden' || style.display === 'none') continue;
          if (window.__pwa.accessibleName(el) === '') {
            out.push({ selector: window.__pwa.cssPath(el), detail: 'actionable control has no accessible name' });
          }
        }
        return out;
      },
    });
  },
};
