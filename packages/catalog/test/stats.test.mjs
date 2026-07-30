import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeStats } from '../stats.mjs';

function makeEntry(overrides = {}) {
  return {
    id: 'P-101',
    title: 'Input focus zooms the whole page',
    section: 'ios-webkit',
    severity: 'P1',
    detect: ['static', 'runtime'],
    confidence: 'advisory',
    deviceOnly: true,
    aiWrites: '`<input class="text-sm">` on form controls.',
    symptom: 'iOS Safari auto-zooms any focused control whose computed font-size < 16px.',
    correct: 'Computed font-size >= 16px on every input, select, textarea.',
    detectNotes: '[S] scan computed styles. [R] focus each control, assert visualViewport.scale === 1.',
    rule: null,
    probe: null,
    verified: { ios: '18.x', chrome: '13x', date: '2026-07-30' },
    ...overrides,
  };
}

const fixtureEntries = [
  makeEntry({ id: 'P-101', section: 'ios-webkit', severity: 'P1', deviceOnly: true, rule: null, probe: null }),
  makeEntry({
    id: 'P-108',
    section: 'ios-webkit',
    severity: 'P2',
    deviceOnly: false,
    rule: 'packages/rules/ios-webkit/p-108.mjs',
    probe: null,
  }),
  makeEntry({
    id: 'P-401',
    section: 'manifest',
    severity: 'P0',
    deviceOnly: false,
    rule: null,
    probe: null,
  }),
  makeEntry({
    id: 'P-402',
    section: 'manifest',
    severity: 'P0',
    deviceOnly: false,
    rule: 'packages/rules/manifest/p-402.mjs',
    probe: null,
  }),
  makeEntry({
    id: 'P-501',
    section: 'service-worker',
    severity: 'P1',
    deviceOnly: false,
    rule: null,
    probe: null,
  }),
];

test('computeStats returns the correct total entry count', () => {
  const stats = computeStats(fixtureEntries);
  assert.equal(stats.total, 5);
});

test('computeStats counts entries per severity', () => {
  const stats = computeStats(fixtureEntries);
  assert.deepEqual(stats.bySeverity, { P0: 2, P1: 2, P2: 1 });
});

test('computeStats counts entries per section', () => {
  const stats = computeStats(fixtureEntries);
  assert.deepEqual(stats.bySection, {
    'ios-webkit': 2,
    manifest: 2,
    'service-worker': 1,
  });
});

test('computeStats counts entries with a non-null rule as rulesImplemented', () => {
  const stats = computeStats(fixtureEntries);
  assert.equal(stats.rulesImplemented, 2);
});

test('computeStats counts entries with a non-null probe as probesImplemented', () => {
  const stats = computeStats(fixtureEntries);
  assert.equal(stats.probesImplemented, 0);
});

test('computeStats counts entries with deviceOnly === true', () => {
  const stats = computeStats(fixtureEntries);
  assert.equal(stats.deviceOnly, 1);
});

test('computeStats on an empty array returns zeroed-out stats with no thrown error', () => {
  const stats = computeStats([]);
  assert.equal(stats.total, 0);
  assert.deepEqual(stats.bySeverity, { P0: 0, P1: 0, P2: 0 });
  assert.deepEqual(stats.bySection, {});
  assert.equal(stats.rulesImplemented, 0);
  assert.equal(stats.probesImplemented, 0);
  assert.equal(stats.deviceOnly, 0);
});

test('computeStats treats a non-null, non-empty-string probe as implemented', () => {
  const entries = [
    makeEntry({ id: 'P-901', section: 'forms', severity: 'P1', rule: null, probe: 'packages/probes/forms/p-901.mjs' }),
  ];
  const stats = computeStats(entries);
  assert.equal(stats.probesImplemented, 1);
});
