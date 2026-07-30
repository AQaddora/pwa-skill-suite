import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport } from '../index.mjs';
import { renderJson } from '../render-json.mjs';

const catalog = [
  { id: 'P-801', title: 'Physical CSS', section: 'rtl', severity: 'P0', confidence: 'high', deviceOnly: false, rule: 'r.mjs' },
  { id: 'P-902', title: 'Autocomplete', section: 'forms', severity: 'P1', confidence: 'advisory', deviceOnly: false, rule: 'r.mjs' },
  { id: 'P-101', title: 'Font size', section: 'ios-webkit', severity: 'P0', confidence: 'advisory', deviceOnly: true, rule: null },
];

const findings = [
  { id: 'P-801', file: 'a.css', line: 1, excerpt: 'ml-4', severity: 'P0', confidence: 'high' },
  { id: 'P-801', file: 'b.css', line: 2, excerpt: 'mr-2', severity: 'P0', confidence: 'high' },
];

test('buildReport derives an outcome per catalog entry', () => {
  const model = buildReport({ findings, catalog, surfaces: { forms: false, rtl: true } });
  assert.equal(model.outcomesByEntry.get('P-801'), 'FAIL'); // has findings
  assert.equal(model.outcomesByEntry.get('P-902'), 'N/A'); // forms surface absent
  assert.equal(model.outcomesByEntry.get('P-101'), 'UNVERIFIED'); // device-only
});

test('buildReport summary counts instances by bucket', () => {
  const model = buildReport({ findings, catalog, surfaces: {} });
  assert.equal(model.summary.p0, 2);
  assert.equal(model.summary.advisory, 0);
});

test('renderJson emits parseable JSON carrying the findings', () => {
  const model = buildReport({ findings, catalog, surfaces: {} });
  const parsed = JSON.parse(renderJson(model));
  assert.equal(parsed.findings.length, 2);
  assert.ok(parsed.summary);
});
