import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupByFix } from '../group.mjs';

const catalog = [
  { id: 'P-801', title: 'Physical CSS', severity: 'P0' },
  { id: 'P-113', title: 'Body scroll lock', severity: 'P0' },
];

test('groups findings by catalog id (root cause), not per file', () => {
  const findings = [
    { id: 'P-801', file: 'a.css', line: 1, excerpt: 'ml-4' },
    { id: 'P-801', file: 'b.css', line: 9, excerpt: 'mr-2' },
    { id: 'P-113', file: 'c.js', line: 4, excerpt: 'overflow' },
  ];
  const groups = groupByFix(findings, catalog);
  assert.equal(groups.length, 2);
  const p801 = groups.find((g) => g.id === 'P-801');
  assert.equal(p801.count, 2);
  assert.equal(p801.instances.length, 2);
  assert.equal(p801.catalogEntry.title, 'Physical CSS');
  assert.deepEqual(
    p801.instances.map((i) => i.file).sort(),
    ['a.css', 'b.css'],
  );
});

test('groups with no findings produce no entries', () => {
  assert.deepEqual(groupByFix([], catalog), []);
});
