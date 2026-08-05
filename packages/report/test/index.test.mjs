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
  const model = buildReport({
    findings,
    catalog,
    surfaces: { forms: false, rtl: true },
    coverageById: { 'P-801': 2 },
  });
  assert.equal(model.outcomesByEntry.get('P-801'), 'FAIL'); // has findings
  assert.equal(model.outcomesByEntry.get('P-902'), 'N/A'); // forms surface absent
  assert.equal(model.outcomesByEntry.get('P-101'), 'UNVERIFIED'); // device-only
});

test('buildReport never labels an emitted finding N/A when surface detection missed it', () => {
  const model = buildReport({ findings, catalog, surfaces: { rtl: false } });
  assert.equal(model.outcomesByEntry.get('P-801'), 'FAIL');
});

test('buildReport summary counts instances by bucket', () => {
  const model = buildReport({ findings, catalog, surfaces: {} });
  assert.equal(model.summary.p0, 2);
  assert.equal(model.summary.advisory, 0);
});

test('renderJson emits parseable JSON carrying the findings', () => {
  const model = buildReport({ findings, catalog, surfaces: {}, coverageById: { 'P-801': 2 } });
  const parsed = JSON.parse(renderJson(model));
  assert.equal(parsed.status, 'COMPLETE');
  assert.equal(parsed.blocked, false);
  assert.equal(parsed.findings.length, 2);
  assert.equal(parsed.coverage['P-801'], 2);
  assert.ok(parsed.summary);
});

test('buildReport and JSON preserve baselined evidence as FAIL instead of PASS', () => {
  const baselinedFindings = [findings[0]];
  const model = buildReport({
    findings: [],
    baselinedFindings,
    catalog,
    surfaces: { rtl: true },
    coverageById: { 'P-801': 1 },
  });
  assert.equal(model.outcomesByEntry.get('P-801'), 'FAIL');
  const parsed = JSON.parse(renderJson(model));
  assert.deepEqual(parsed.baselinedFindings, baselinedFindings);
  assert.equal(parsed.outcomes['P-801'], 'FAIL');
});

test('buildReport does not synthesize PASS without rule applicability coverage', () => {
  const model = buildReport({ findings: [], catalog, surfaces: { rtl: true } });
  assert.equal(model.outcomesByEntry.get('P-801'), 'UNVERIFIED');
});

test('buildReport does not synthesize PASS from partial mixed-format coverage', () => {
  const model = buildReport({
    findings: [],
    catalog,
    surfaces: { rtl: true },
    coverageById: { 'P-801': 2 },
    incompleteCoverageById: { 'P-801': 1 },
  });
  assert.equal(model.outcomesByEntry.get('P-801'), 'UNVERIFIED');
  const parsed = JSON.parse(renderJson(model));
  assert.equal(parsed.coverage['P-801'], 2);
  assert.equal(parsed.incompleteCoverage['P-801'], 1);
});

test('blocked reports preserve diagnostics and never expose PASS outcomes', () => {
  const diagnostics = [{ code: 'RULE_EXECUTION_FAILED', message: 'rule exploded' }];
  const model = buildReport({ findings: [], catalog, blocked: true, diagnostics });
  const parsed = JSON.parse(renderJson(model));
  assert.equal(parsed.status, 'BLOCKED');
  assert.deepEqual(parsed.diagnostics, diagnostics);
  assert.ok(Object.values(parsed.outcomes).every((outcome) => outcome === 'BLOCKED'));
});
