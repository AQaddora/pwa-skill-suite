import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveOutcome } from '../outcomes.mjs';

const entry = (over = {}) => ({ id: 'P-X', deviceOnly: false, rule: 'x.mjs', ...over });

test('blocked override short-circuits to BLOCKED before any other rule', () => {
  assert.equal(
    deriveOutcome({ catalogEntry: entry(), findings: [{ id: 'P-X' }], blocked: true }),
    'BLOCKED',
  );
});

test('absent surface is N/A even with a rule present', () => {
  assert.equal(
    deriveOutcome({ catalogEntry: entry(), findings: [], surfacePresent: false }),
    'N/A',
  );
});

test('device-only entry is UNVERIFIED even when the scanner found nothing', () => {
  assert.equal(
    deriveOutcome({ catalogEntry: entry({ deviceOnly: true }), findings: [] }),
    'UNVERIFIED',
  );
});

test('device-only entry is never PASS', () => {
  const out = deriveOutcome({ catalogEntry: entry({ deviceOnly: true }), findings: [] });
  assert.notEqual(out, 'PASS');
});

test('findings present yields FAIL', () => {
  assert.equal(deriveOutcome({ catalogEntry: entry(), findings: [{ id: 'P-X' }] }), 'FAIL');
});

test('no rule implemented yields UNVERIFIED', () => {
  assert.equal(deriveOutcome({ catalogEntry: entry({ rule: null }), findings: [] }), 'UNVERIFIED');
});

test('rule present, surface present, no findings yields PASS', () => {
  assert.equal(
    deriveOutcome({ catalogEntry: entry(), findings: [], surfacePresent: true }),
    'PASS',
  );
});
