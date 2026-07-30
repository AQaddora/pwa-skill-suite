// Runs the full A→B→(B-breaking) check suite against the bundled fixtures once and asserts
// every assertion converges on PASS (or an explicitly-seeded BLOCKED reason, never a silent
// pass-through). One shared run — browsers are the expensive part — with per-check assertions
// below so a regression names exactly which id broke.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { runHarness } from '../runner.mjs';

let results;

before(async () => {
  ({ results } = await runHarness());
}, { timeout: 120_000 });

function outcomeFor(id) {
  const r = results.find((r) => r.ids.includes(id));
  assert.ok(r, `no result recorded for ${id}`);
  return r;
}

for (const id of ['P-502', 'P-503', 'P-504', 'P-505', 'P-514', 'P-520', 'P-522', 'P-523', 'P-525', 'P-528', 'P-531']) {
  test(`${id} passes against the bundled A→B fixtures`, () => {
    const r = outcomeFor(id);
    assert.equal(r.outcome, 'PASS', `${id} was ${r.outcome}: ${r.detail}\n${JSON.stringify(r.findings, null, 2)}`);
  });
}

test('every result carries findings shaped for the shared report renderer', () => {
  for (const r of results) {
    assert.ok(Array.isArray(r.findings));
    for (const f of r.findings) {
      assert.equal(typeof f.id, 'string');
      assert.equal(typeof f.file, 'string');
      assert.equal(typeof f.line, 'number');
      assert.equal(typeof f.excerpt, 'string');
    }
  }
});

after(() => {});
