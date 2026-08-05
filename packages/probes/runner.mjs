// Orchestrates a probe run: detect engines, build a harness, run each probe, collect
// probe-shaped results, always close browsers. A probe that throws or a required engine
// that cannot launch is recorded as BLOCKED (never silently dropped, never a false PASS).

import { availableEngines } from './lib/engines.mjs';
import {
  assessEngineCoverage,
  DEFAULT_REQUIRED_ENGINES,
  engineCoverageBlockedResult,
} from './lib/engine-policy.mjs';
import { createHarness } from './lib/harness.mjs';
import { ALL_PROBES } from './probes/index.mjs';

/**
 * @param {object} o
 * @param {object} o.config    normalized config (see lib/config.mjs) with a live baseURL
 * @param {Array}  [o.probes]  probe modules (defaults to the full set)
 * @param {string[]} [o.engines] test seam overriding engines known to be launchable
 * @param {string[]} [o.requiredEngines] engines required for a complete gate
 * @returns {Promise<{ results: object[], engines: string[], skipped: object[], engineCoverage: object }>}
 */
export async function runProbes({
  config,
  probes = ALL_PROBES,
  engines,
  requiredEngines = DEFAULT_REQUIRED_ENGINES,
}) {
  const detection = engines
    ? { expected: requiredEngines, available: engines, skipped: [] }
    : await availableEngines({ engines: requiredEngines });
  const usable = detection.available;
  const engineCoverage = assessEngineCoverage({
    expected: requiredEngines,
    run: usable,
    skipped: detection.skipped,
  });
  if (usable.length === 0) {
    return {
      results: [
        ...probes.map((p) => ({
          ids: p.ids,
          name: p.name,
          outcome: 'BLOCKED',
          findings: [],
          detail: 'no browser engine could launch on this host',
        })),
        engineCoverageBlockedResult(engineCoverage),
      ],
      engines: [],
      skipped: engineCoverage.skipped,
      engineCoverage,
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
        const diagnostic =
          err &&
          typeof err === 'object' &&
          err.outcome === 'BLOCKED' &&
          err.diagnostic &&
          typeof err.diagnostic.code === 'string' &&
          typeof err.diagnostic.message === 'string'
            ? err.diagnostic
            : null;
        res = {
          outcome: 'BLOCKED',
          findings: [],
          detail:
            diagnostic?.message ??
            `probe error: ${(err?.message || String(err)).split('\n')[0]}`,
          ...(diagnostic ? { diagnostic } : {}),
        };
      }
      results.push({ ids: probe.ids, name: probe.name, ...res });
    }
  } finally {
    await harness.closeAll();
  }
  if (engineCoverage.status === 'BLOCKED') {
    results.push(engineCoverageBlockedResult(engineCoverage));
  }
  return { results, engines: usable, skipped: engineCoverage.skipped, engineCoverage };
}
