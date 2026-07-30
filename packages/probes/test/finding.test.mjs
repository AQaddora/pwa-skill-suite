import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFinding, cellLabel } from '../lib/finding.mjs';

const CELL = { engine: 'webkit', width: 320, height: 568, orientation: 'portrait' };

test('cellLabel names engine, size and orientation', () => {
  assert.equal(cellLabel(CELL), '320×568 webkit portrait');
});

test('makeFinding is report-shaped: id, file, line, excerpt', () => {
  const f = makeFinding('P-301', {
    context: '/settings',
    selector: 'div.card',
    detail: 'overflows viewport by 42px',
    cell: CELL,
  });
  assert.equal(f.id, 'P-301');
  assert.equal(f.file, '/settings');
  assert.equal(f.line, 0);
  assert.equal(f.excerpt, 'div.card — overflows viewport by 42px [320×568 webkit portrait]');
});

test('makeFinding names the culprit selector — never a bare page-level message', () => {
  const f = makeFinding('P-301', { context: '/', selector: 'header > nav', detail: 'x', cell: CELL });
  assert.ok(f.excerpt.includes('header > nav'));
});
