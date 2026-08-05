import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assessEngineCoverage,
  engineCoverageBlockedResult,
} from '../lib/engine-policy.mjs';
import { runProbes } from '../runner.mjs';

test('missing WebKit is typed BLOCKED and retains the launch reason', () => {
  const coverage = assessEngineCoverage({
    run: ['chromium'],
    skipped: [{ engine: 'webkit', reason: 'browser executable is missing' }],
  });

  assert.deepEqual(coverage, {
    status: 'BLOCKED',
    expected: ['chromium', 'webkit'],
    run: ['chromium'],
    skipped: [{ engine: 'webkit', reason: 'browser executable is missing' }],
    missing: ['webkit'],
  });
  const result = engineCoverageBlockedResult(coverage);
  assert.equal(result.outcome, 'BLOCKED');
  assert.equal(result.diagnostic.code, 'REQUIRED_BROWSER_ENGINE_UNAVAILABLE');
  assert.match(result.detail, /webkit.*browser executable is missing/);
});

test('both required engines produce complete coverage', () => {
  assert.deepEqual(
    assessEngineCoverage({ run: ['chromium', 'webkit'], skipped: [] }),
    {
      status: 'COMPLETE',
      expected: ['chromium', 'webkit'],
      run: ['chromium', 'webkit'],
      skipped: [],
      missing: [],
    },
  );
});

test('runner appends a blocker when its injected engine set is incomplete', async () => {
  const result = await runProbes({
    config: { baseURL: 'http://127.0.0.1:9' },
    engines: ['chromium'],
    probes: [
      {
        ids: ['TEST-PROBE'],
        name: 'Injected probe',
        run: async () => ({ outcome: 'PASS', findings: [], detail: 'test seam' }),
      },
    ],
  });

  assert.equal(result.engineCoverage.status, 'BLOCKED');
  assert.deepEqual(result.engineCoverage.run, ['chromium']);
  assert.equal(
    result.results.find((entry) => entry.ids.includes('PWA-ENGINE-COVERAGE'))?.outcome,
    'BLOCKED',
  );
});
