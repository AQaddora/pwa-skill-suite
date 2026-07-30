import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregate } from '../lib/outcome.mjs';

test('positive findings always produce FAIL, even on a device-only entry', () => {
  const r = aggregate({ deviceOnly: true, findings: [{ id: 'P-101' }] });
  assert.equal(r.outcome, 'FAIL');
});

test('origin-only check on a local target is N/A, not PASS', () => {
  const r = aggregate({ originOnly: true, targetIsLocal: true, findings: [] });
  assert.equal(r.outcome, 'N/A');
});

test('device-only entry with no findings is UNVERIFIED, never PASS', () => {
  const r = aggregate({ deviceOnly: true, findings: [] });
  assert.equal(r.outcome, 'UNVERIFIED');
});

test('unresolved target with no findings is BLOCKED, never PASS', () => {
  const r = aggregate({ resolved: false, findings: [] });
  assert.equal(r.outcome, 'BLOCKED');
});

test('resolved target, clean run is PASS', () => {
  const r = aggregate({ resolved: true, findings: [] });
  assert.equal(r.outcome, 'PASS');
});

test('device-only wins over unresolved when there are no findings', () => {
  const r = aggregate({ deviceOnly: true, resolved: false, findings: [] });
  assert.equal(r.outcome, 'UNVERIFIED');
});

test('result carries findings through unchanged', () => {
  const findings = [{ id: 'P-301' }, { id: 'P-301' }];
  const r = aggregate({ findings });
  assert.deepEqual(r.findings, findings);
});
