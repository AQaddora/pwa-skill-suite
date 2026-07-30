import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import p101 from '../probes/p101-input-font-size.mjs';
import { fixturePath, runProbeAgainst } from './helpers.mjs';
import { deviceOnlyResults, DEVICE_ONLY_IDS } from '../lib/device-only.mjs';

const catalog = JSON.parse(
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../catalog/catalog.json'), 'utf8'),
);

test('P-101 FAILs on a 14px input — the verifiable half is real evidence', async () => {
  const res = await runProbeAgainst(p101, fixturePath('bad', 'p101-input-zoom'));
  assert.equal(res.outcome, 'FAIL');
  assert.match(res.findings.map((f) => f.excerpt).join('\n'), /14px < 16px/);
});

test('P-101 with clean font-size is UNVERIFIED, NEVER PASS (zoom is device-only)', async () => {
  const res = await runProbeAgainst(p101, fixturePath('good', 'p101-input-zoom'));
  assert.equal(res.outcome, 'UNVERIFIED');
  assert.ok(res.reproduction && /real iPhone/.test(res.reproduction));
});

test('all eight catalog device-only entries are covered with reproduction steps', () => {
  const flagged = catalog.filter((e) => e.deviceOnly).map((e) => e.id).sort();
  assert.deepEqual(DEVICE_ONLY_IDS.slice().sort(), flagged);
});

test('deviceOnlyResults reports UNVERIFIED for the seven non-P-101 device-only entries', () => {
  const results = deviceOnlyResults(catalog);
  assert.equal(results.length, 7);
  for (const r of results) {
    assert.equal(r.outcome, 'UNVERIFIED');
    assert.ok(r.reproduction.length > 0);
  }
  assert.ok(!results.some((r) => r.ids.includes('P-101')));
});
