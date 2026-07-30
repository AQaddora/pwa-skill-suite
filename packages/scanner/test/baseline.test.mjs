import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readBaseline, writeBaseline, filterAgainstBaseline } from '../lib/baseline.mjs';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'baseline-'));
}

test('writeBaseline then readBaseline round-trips the file:line:id keys', () => {
  const dir = tmp();
  try {
    const path = join(dir, 'baseline.txt');
    const findings = [
      { id: 'P-113', file: 'src/a.js', line: 10 },
      { id: 'P-801', file: 'src/b.css', line: 3 },
    ];
    writeBaseline(path, findings);
    const set = readBaseline(path);
    assert.ok(set.has('src/a.js:10:P-113'));
    assert.ok(set.has('src/b.css:3:P-801'));
    assert.equal(set.size, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readBaseline on a missing file returns an empty set', () => {
  const set = readBaseline(join(tmp(), 'does-not-exist.txt'));
  assert.equal(set.size, 0);
});

test('filterAgainstBaseline drops baselined findings but keeps a same-file/id finding at a different line', () => {
  const baseline = new Set(['src/a.js:10:P-113']);
  const findings = [
    { id: 'P-113', file: 'src/a.js', line: 10 }, // in baseline -> dropped
    { id: 'P-113', file: 'src/a.js', line: 42 }, // same file+id, new line -> kept
    { id: 'P-801', file: 'src/b.css', line: 3 }, // not in baseline -> kept
  ];
  const kept = filterAgainstBaseline(findings, baseline);
  assert.equal(kept.length, 2);
  assert.ok(kept.some((f) => f.line === 42 && f.id === 'P-113'));
  assert.ok(kept.some((f) => f.id === 'P-801'));
  assert.ok(!kept.some((f) => f.line === 10));
});
