import { test } from 'node:test';
import assert from 'node:assert/strict';
import probe from '../probes/p301-overflow.mjs';
import { fixturePath, runProbeAgainst } from './helpers.mjs';

test('P-301 FAILs on a page with a 500px rail and names the culprit selector', async () => {
  const res = await runProbeAgainst(probe, fixturePath('bad', 'p301-overflow'));
  assert.equal(res.outcome, 'FAIL');
  assert.ok(res.findings.length > 0, 'expected at least one overflow finding');
  const excerpts = res.findings.map((f) => f.excerpt).join('\n');
  assert.match(excerpts, /wide-rail/, 'finding should name the offending element');
  assert.match(excerpts, /past the \d+px viewport/);
});

test('P-301 PASSes on a fully responsive page', async () => {
  const res = await runProbeAgainst(probe, fixturePath('good', 'p301-overflow'));
  assert.equal(res.outcome, 'PASS');
  assert.equal(res.findings.length, 0);
});

test('P-301 reports BLOCKED, never PASS, when the configured route 404s', async () => {
  const res = await runProbeAgainst(probe, fixturePath('good', 'p301-overflow'), {
    routes: ['/definitely-missing.html'],
  });
  assert.equal(res.outcome, 'BLOCKED');
  assert.equal(res.findings.length, 0);
});
