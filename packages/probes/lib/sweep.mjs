// Shared driver for element-level probes: open every (cell × route), run an in-page
// collector that returns raw violations, and turn each into a culprit-named finding.
//
// The in-page collector runs in the browser via page.evaluate and must be self-contained
// (it may use window.__pwa, installed for it). It returns [{ selector, detail }].

import { installUtils } from './inpage.mjs';
import { makeFinding } from './finding.mjs';
import { aggregate } from './outcome.mjs';

/**
 * @param {object} harness
 * @param {object} o
 * @param {string} o.id                catalog id these findings carry
 * @param {Array}  o.cells             matrix cells to sweep
 * @param {Function} o.collect         in-page fn () => [{selector, detail}]
 * @param {boolean} [o.deviceOnly]
 * @param {boolean} [o.originOnly]
 * @param {boolean} [o.authenticated]
 * @param {string}  [o.detail]
 */
export async function elementSweep(harness, { id, cells, collect, deviceOnly = false, originOnly = false, authenticated = false, detail = '' }) {
  const routes = harness.config.routes;
  const findings = [];
  for (const cell of cells) {
    for (const route of routes) {
      const { page, close } = await harness.openPage({ ...cell, route, authenticated });
      try {
        await installUtils(page);
        const violations = await page.evaluate(collect);
        for (const v of violations) {
          findings.push(makeFinding(id, { context: route, selector: v.selector, detail: v.detail, cell }));
        }
      } finally {
        await close();
      }
    }
  }
  return aggregate({
    findings,
    deviceOnly,
    originOnly,
    targetIsLocal: harness.config.targetIsLocal,
    resolved: true,
    detail: detail || `swept ${[...cells].length} cell(s) × ${routes.length} route(s)`,
  });
}

// A small representative cell subset for probes whose result is not viewport-sensitive
// (a11y, structure) — one portrait phone per available engine keeps the run fast without
// pretending to more coverage than it has.
export function representativeCells(harness) {
  return harness.engines.map((engine) => ({ engine, width: 390, height: 844, orientation: 'portrait' }));
}
