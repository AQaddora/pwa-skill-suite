// P-301 — Horizontal overflow. Walk the rendered DOM for boxes that extend past the
// viewport, and report the *outermost* offender in each subtree (naming every descendant
// would bury the culprit). Viewport-sensitive, so it sweeps the full matrix.
import { elementSweep } from '../lib/sweep.mjs';

export default {
  ids: ['P-301'],
  name: 'Horizontal overflow (element identified)',
  async run(harness) {
    return elementSweep(harness, {
      id: 'P-301',
      cells: [...harness.cells()],
      collect: () => {
        const vw = window.innerWidth;
        const overflowing = new Set();
        const rects = new Map();
        for (const el of document.querySelectorAll('*')) {
          const style = getComputedStyle(el);
          if (style.visibility === 'hidden' || style.display === 'none') continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.right > vw + 1 || r.left < -1) {
            overflowing.add(el);
            rects.set(el, r);
          }
        }
        const out = [];
        for (const el of overflowing) {
          if (el.parentElement && overflowing.has(el.parentElement)) continue; // keep outermost
          const r = rects.get(el);
          const past = Math.round(Math.max(r.right - vw, -r.left));
          out.push({
            selector: window.__pwa.cssPath(el),
            detail: `extends ${past}px past the ${vw}px viewport`,
          });
        }
        return out;
      },
    });
  },
};
