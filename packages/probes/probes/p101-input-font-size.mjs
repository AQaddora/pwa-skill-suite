// P-101 — Input focus zooms the whole page (device-only, partial signal).
//
// The zoom heuristic itself is iOS-Safari-only and cannot be reproduced in Playwright, so
// this entry is never PASS. But its *cause* — a form control with computed font-size < 16px —
// is fully checkable, and when found it is a real FAIL (positive evidence). A clean font-size
// does NOT launder into PASS: it stays UNVERIFIED, because the zoom behaviour is unproven.
//
//   font-size < 16px found   → FAIL   (verifiable defect)
//   font-size all ≥ 16px     → UNVERIFIED (device-only; zoom itself unverified)
import { elementSweep, representativeCells } from '../lib/sweep.mjs';
import { DEVICE_ONLY_REPRODUCTION } from '../lib/device-only.mjs';

export default {
  ids: ['P-101'],
  name: 'Input focus zoom (font-size ≥ 16px; zoom device-only)',
  deviceOnly: true,
  async run(harness) {
    return elementSweep(harness, {
      id: 'P-101',
      cells: representativeCells(harness),
      deviceOnly: true,
      reproduction: DEVICE_ONLY_REPRODUCTION['P-101'].join('\n'),
      detail: 'computed font-size checked; iOS input-zoom itself is device-only',
      collect: () => {
        const out = [];
        for (const el of document.querySelectorAll('input:not([type="hidden"]), select, textarea')) {
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          const size = parseFloat(style.fontSize) || 0;
          if (size > 0 && size < 16) {
            out.push({ selector: window.__pwa.cssPath(el), detail: `computed font-size ${size}px < 16px — iOS Safari will zoom on focus` });
          }
        }
        return out;
      },
    });
  },
};
