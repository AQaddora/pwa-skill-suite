import { test } from 'node:test';
import assert from 'node:assert/strict';
import p308 from '../probes/p308-touch-targets.mjs';
import p703 from '../probes/p703-icon-name.mjs';
import p704 from '../probes/p704-div-onclick.mjs';
import { fixturePath, runProbeAgainst } from './helpers.mjs';

test('P-308 FAILs on 24px icon buttons and names each violation with its size', async () => {
  const res = await runProbeAgainst(p308, fixturePath('bad', 'p308-touch-targets'));
  assert.equal(res.outcome, 'FAIL');
  assert.match(res.findings.map((f) => f.excerpt).join('\n'), /tiny-fav/);
  assert.match(res.findings.map((f) => f.excerpt).join('\n'), /24×24|24px/);
});

test('P-308 PASSes when every control is at least 44px', async () => {
  const res = await runProbeAgainst(p308, fixturePath('good', 'p308-touch-targets'));
  assert.equal(res.outcome, 'PASS');
});

test('P-703 FAILs on icon-only buttons with no accessible name', async () => {
  const res = await runProbeAgainst(p703, fixturePath('bad', 'p703-icon-name'));
  assert.equal(res.outcome, 'FAIL');
  assert.match(res.findings.map((f) => f.excerpt).join('\n'), /icon-menu/);
});

test('P-703 PASSes when icon buttons carry aria-label', async () => {
  const res = await runProbeAgainst(p703, fixturePath('good', 'p703-icon-name'));
  assert.equal(res.outcome, 'PASS');
});

test('P-704 FAILs on <div onclick> and names it', async () => {
  const res = await runProbeAgainst(p704, fixturePath('bad', 'p704-div-onclick'));
  assert.equal(res.outcome, 'FAIL');
  assert.match(res.findings.map((f) => f.excerpt).join('\n'), /fake-btn/);
});

test('P-704 PASSes when real button/anchor elements are used', async () => {
  const res = await runProbeAgainst(p704, fixturePath('good', 'p704-div-onclick'));
  assert.equal(res.outcome, 'PASS');
});
