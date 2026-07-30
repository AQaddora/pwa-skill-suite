// P-308 — Touch targets smaller than 44px. Report every actionable control whose hit box is
// under 44px in either axis. Target size is not viewport-dependent, so this runs on a
// representative cell per engine rather than the full matrix.
import { elementSweep, representativeCells } from '../lib/sweep.mjs';

export default {
  ids: ['P-308'],
  name: 'Touch targets under 44px',
  async run(harness) {
    return elementSweep(harness, {
      id: 'P-308',
      cells: representativeCells(harness),
      collect: () => {
        const out = [];
        for (const el of document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [role="link"], [onclick]')) {
          if (el.type === 'hidden') continue;
          const style = getComputedStyle(el);
          if (style.visibility === 'hidden' || style.display === 'none') continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const w = Math.round(r.width);
          const h = Math.round(r.height);
          if (w < 44 || h < 44) {
            out.push({ selector: window.__pwa.cssPath(el), detail: `hit box ${w}×${h}px, below the 44px minimum` });
          }
        }
        return out;
      },
    });
  },
};
