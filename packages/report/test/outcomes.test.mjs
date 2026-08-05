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

test('a positive finding outranks an absent-surface heuristic', () => {
  assert.equal(
    deriveOutcome({
      catalogEntry: entry(),
      findings: [{ id: 'P-X' }],
      surfacePresent: false,
    }),
    'FAIL',
  );
});

test('a positive finding outranks incomplete applicability coverage', () => {
  assert.equal(
    deriveOutcome({
      catalogEntry: entry(),
      findings: [{ id: 'P-X' }],
      applicableFiles: 1,
      incompleteFiles: 2,
    }),
    'FAIL',
  );
});

test('a baselined current finding is FAIL and outranks an absent-surface heuristic', () => {
  assert.equal(
    deriveOutcome({
      catalogEntry: entry(),
      findings: [],
      baselinedFindings: [{ id: 'P-X' }],
      surfacePresent: false,
      applicableFiles: 1,
    }),
    'FAIL',
  );
});

test('an absent surface remains N/A with incomplete source coverage', () => {
  assert.equal(
    deriveOutcome({
      catalogEntry: entry(),
      findings: [],
      surfacePresent: false,
      applicableFiles: 1,
      incompleteFiles: 2,
    }),
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

test('a positive finding on a device-only concern is still FAIL', () => {
  assert.equal(
    deriveOutcome({ catalogEntry: entry({ deviceOnly: true }), findings: [{ id: 'P-X' }] }),
    'FAIL',
  );
});

test('findings present yields FAIL', () => {
  assert.equal(deriveOutcome({ catalogEntry: entry(), findings: [{ id: 'P-X' }] }), 'FAIL');
});

test('no rule implemented yields UNVERIFIED', () => {
  assert.equal(deriveOutcome({ catalogEntry: entry({ rule: null }), findings: [] }), 'UNVERIFIED');
});

test('rule with no applicable input remains UNVERIFIED', () => {
  assert.equal(
    deriveOutcome({ catalogEntry: entry(), findings: [], applicableFiles: 0 }),
    'UNVERIFIED',
  );
});

test('rule with supported and relevant unsupported input remains UNVERIFIED', () => {
  assert.equal(
    deriveOutcome({
      catalogEntry: entry(),
      findings: [],
      applicableFiles: 3,
      incompleteFiles: 1,
    }),
    'UNVERIFIED',
  );
});

test('rule present, surface present, no findings yields PASS', () => {
  assert.equal(
    deriveOutcome({
      catalogEntry: entry(),
      findings: [],
      surfacePresent: true,
      applicableFiles: 1,
    }),
    'PASS',
  );
});
