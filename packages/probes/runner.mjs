// Orchestrates a probe run: detect engines, build a harness, run each probe, collect
// probe-shaped results, always close browsers. A probe that throws is recorded as BLOCKED
// with the error (never silently dropped, never a false PASS).

import { availableEngines } from './lib/engines.mjs';
import { createHarness } from './lib/harness.mjs';
import { ALL_PROBES } from './probes/index.mjs';

/**
 * @param {object} o
 * @param {object} o.config    normalized config (see lib/config.mjs) with a live baseURL
 * @param {Array}  [o.probes]  probe modules (defaults to the full set)
 * @param {string[]} [o.engines] override engine list (defaults to detected)
 * @returns {Promise<{ results: object[], engines: string[], skipped: object[] }>}
 */
export async function runProbes({ config, probes = ALL_PROBES, engines }) {
  const detection = engines ? { available: engines, skipped: [] } : await availableEngines();
  const usable = detection.available;
  if (usable.length === 0) {
    return {
      results: probes.map((p) => ({
        ids: p.ids,
        name: p.name,
        outcome: 'BLOCKED',
        findings: [],
        detail: 'no browser engine could launch on this host',
      })),
      engines: [],
      skipped: detection.skipped,
    };
  }

  const harness = createHarness({ config, engines: usable });
  const results = [];
  try {
    for (const probe of probes) {
      let res;
      try {
        res = await probe.run(harness);
      } catch (err) {
        res = {
          outcome: 'BLOCKED',
          findings: [],
          detail: `probe error: ${(err?.message || String(err)).split('\n')[0]}`,
        };
      }
      results.push({ ids: probe.ids, name: probe.name, ...res });
    }
  } finally {
    await harness.closeAll();
  }
  return { results, engines: usable, skipped: detection.skipped };
}
