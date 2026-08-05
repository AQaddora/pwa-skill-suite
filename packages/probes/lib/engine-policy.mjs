// Browser-engine coverage is part of the verification claim, not an optional detail.
// The default gate requires both Chromium and WebKit. A host that cannot launch one of
// them may still produce useful probe findings, but that run is BLOCKED rather than PASS.

export const DEFAULT_REQUIRED_ENGINES = Object.freeze(['chromium', 'webkit']);

function uniqueEngineNames(values) {
  return [...new Set((values ?? []).filter((value) => typeof value === 'string' && value))];
}

function skippedReason(item) {
  if (item && typeof item.reason === 'string' && item.reason.trim()) return item.reason.trim();
  return 'the engine was required but the runner did not report why it was unavailable';
}

/**
 * Normalize the engine evidence emitted by a runner and decide whether the required
 * matrix completed. Every missing required engine receives a human-readable reason.
 *
 * @param {object} evidence
 * @param {string[]} [evidence.expected]
 * @param {string[]} [evidence.run]
 * @param {Array<{engine:string,reason?:string}>} [evidence.skipped]
 */
export function assessEngineCoverage({
  expected = DEFAULT_REQUIRED_ENGINES,
  run = [],
  skipped = [],
} = {}) {
  const expectedEngines = uniqueEngineNames(expected);
  const runEngines = uniqueEngineNames(run);
  const suppliedSkipped = new Map();
  for (const item of skipped ?? []) {
    if (!item || typeof item.engine !== 'string' || !item.engine) continue;
    suppliedSkipped.set(item.engine, skippedReason(item));
  }

  const normalizedSkipped = [];
  for (const engine of expectedEngines) {
    if (runEngines.includes(engine)) continue;
    normalizedSkipped.push({
      engine,
      reason: suppliedSkipped.get(engine) ?? skippedReason(null),
    });
  }

  // Preserve disclosed non-required skips too. They do not block this policy, but they
  // remain useful evidence when a caller deliberately requests an additional engine.
  for (const [engine, reason] of suppliedSkipped) {
    if (
      runEngines.includes(engine) ||
      normalizedSkipped.some((item) => item.engine === engine)
    ) {
      continue;
    }
    normalizedSkipped.push({ engine, reason });
  }

  const missing = expectedEngines.filter((engine) => !runEngines.includes(engine));
  return {
    status: missing.length === 0 ? 'COMPLETE' : 'BLOCKED',
    expected: expectedEngines,
    run: runEngines,
    skipped: normalizedSkipped,
    missing,
  };
}

export function engineCoverageBlockedResult(coverage) {
  const missing = coverage.missing.join(', ');
  const reasons = coverage.skipped
    .filter((item) => coverage.missing.includes(item.engine))
    .map((item) => `${item.engine}: ${item.reason}`)
    .join('; ');
  return {
    ids: ['PWA-ENGINE-COVERAGE'],
    name: 'Required browser-engine coverage',
    outcome: 'BLOCKED',
    findings: [],
    detail: `required engine${coverage.missing.length === 1 ? '' : 's'} not run: ${missing}${
      reasons ? ` (${reasons})` : ''
    }`,
    diagnostic: {
      code: 'REQUIRED_BROWSER_ENGINE_UNAVAILABLE',
      missing: [...coverage.missing],
    },
  };
}
