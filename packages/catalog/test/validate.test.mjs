import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCatalog } from '../validate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');

function makeValidEntry(id, overrides = {}) {
  return {
    id,
    title: `Title for ${id}`,
    section: 'ios-webkit',
    severity: 'P1',
    detect: ['static'],
    confidence: 'advisory',
    deviceOnly: false,
    aiWrites: null,
    symptom: 'Some symptom text.',
    correct: 'The correct behavior.',
    detectNotes: 'Some detection notes.',
    rule: null,
    probe: null,
    verified: {
      ios: '18.x',
      chrome: '13x',
      date: '2026-07-30',
    },
    ...overrides,
  };
}

test('valid minimal catalog (2 entries, distinct IDs) passes with no errors', () => {
  const entries = [makeValidEntry('P-101'), makeValidEntry('P-102', { section: 'app-shell', severity: 'P0' })];
  const result = validateCatalog(entries);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('duplicate id produces an error mentioning the duplicate id', () => {
  const entries = [makeValidEntry('P-101'), makeValidEntry('P-101')];
  const result = validateCatalog(entries);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) => e.includes('P-101') && e.toLowerCase().includes('duplicate')),
    `expected a duplicate-id error mentioning P-101, got: ${JSON.stringify(result.errors)}`
  );
});

test('unknown section value produces an error naming the entry and the bad section', () => {
  const entries = [makeValidEntry('P-101', { section: 'not-a-real-section' })];
  const result = validateCatalog(entries);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) => e.includes('P-101') && e.includes('not-a-real-section')),
    `expected an error naming P-101 and not-a-real-section, got: ${JSON.stringify(result.errors)}`
  );
});

test('bad severity produces an error', () => {
  const entries = [makeValidEntry('P-101', { severity: 'P3' })];
  const result = validateCatalog(entries);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) => e.includes('P-101') && e.includes('P3')),
    `expected an error naming P-101 and P3, got: ${JSON.stringify(result.errors)}`
  );
});

test('rule pointing at a nonexistent file produces an error naming the dead path', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'catalog-validate-'));
  const realFile = path.join(dir, 'real-rule.mjs');
  writeFileSync(realFile, '// exists\n');

  const entries = [
    makeValidEntry('P-101', { rule: 'real-rule.mjs' }),
    makeValidEntry('P-102', { rule: 'missing-rule.mjs' }),
  ];
  const result = validateCatalog(entries, { cwd: dir });
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) => e.includes('P-102') && e.includes('missing-rule.mjs')),
    `expected an error naming P-102 and missing-rule.mjs, got: ${JSON.stringify(result.errors)}`
  );
  assert.ok(
    !result.errors.some((e) => e.includes('P-101') && e.includes('real-rule.mjs')),
    `did not expect an error about real-rule.mjs, got: ${JSON.stringify(result.errors)}`
  );
});

test('the real catalog.json passes with zero errors and has exactly 152 entries / 32 P0', () => {
  const catalogPath = path.join(repoRoot, 'packages', 'catalog', 'catalog.json');
  const entries = JSON.parse(readFileSync(catalogPath, 'utf8'));

  assert.equal(entries.length, 152);
  assert.equal(entries.filter((e) => e.severity === 'P0').length, 32);

  const result = validateCatalog(entries, { cwd: repoRoot });
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});
