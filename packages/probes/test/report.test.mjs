import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectFindings, renderProbeOutcomes, renderDeviceOnlyBlock, anyFailures } from '../report.mjs';

const RESULTS = [
  { ids: ['P-301'], name: 'Overflow', outcome: 'FAIL', detail: 'x', findings: [{ id: 'P-301', file: '/', line: 0, excerpt: 'div — over' }] },
  { ids: ['P-201'], name: 'Tab bar', outcome: 'PASS', detail: 'ok', findings: [] },
  { ids: ['P-202'], name: 'Behind bar', outcome: 'BLOCKED', detail: 'no tabbar', findings: [] },
  { ids: ['P-101'], name: 'Zoom', outcome: 'UNVERIFIED', detail: 'device-only', findings: [], reproduction: 'Open on a real iPhone.\nTap a field.' },
];

test('collectFindings flattens all probe findings', () => {
  assert.equal(collectFindings(RESULTS).length, 1);
});

test('anyFailures is true when any probe FAILed', () => {
  assert.equal(anyFailures(RESULTS), true);
  assert.equal(anyFailures([{ outcome: 'PASS' }, { outcome: 'UNVERIFIED' }]), false);
});

test('outcome table lists engines and sorts FAIL before PASS', () => {
  const md = renderProbeOutcomes(RESULTS, { engines: ['chromium', 'webkit'], skipped: [] });
  assert.match(md, /chromium, webkit/);
  assert.ok(md.indexOf('P-301') < md.indexOf('P-201'), 'FAIL should sort above PASS');
});

test('skipped engines are disclosed, never hidden', () => {
  const md = renderProbeOutcomes(RESULTS, {
    engines: ['chromium'],
    skipped: [{ engine: 'webkit', reason: 'missing libs' }],
    engineCoverage: {
      status: 'BLOCKED',
      expected: ['chromium', 'webkit'],
      run: ['chromium'],
      skipped: [{ engine: 'webkit', reason: 'missing libs' }],
      missing: ['webkit'],
    },
  });
  assert.match(md, /webkit.*missing libs/);
  assert.match(md, /Engine coverage: \*\*BLOCKED\*\*/);
});

test('device-only block renders reproduction steps for UNVERIFIED entries', () => {
  const md = renderDeviceOnlyBlock(RESULTS);
  assert.match(md, /real iPhone/);
  assert.match(md, /P-101/);
});
