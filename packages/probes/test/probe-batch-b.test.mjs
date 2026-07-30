import { test } from 'node:test';
import assert from 'node:assert/strict';
import p201 from '../probes/p201-tabbar-fixed.mjs';
import p202 from '../probes/p202-content-behind-bar.mjs';
import p207 from '../probes/p207-overlay-above-bar.mjs';
import p711 from '../probes/p711-inert-bg.mjs';
import p705 from '../probes/p705-focus-visible.mjs';
import p706 from '../probes/p706-focus-trap.mjs';
import { fixturePath, runProbeAgainst } from './helpers.mjs';

test('P-201 FAILs on a static-flow tab bar, PASSes on a fixed one', async () => {
  const bad = await runProbeAgainst(p201, fixturePath('bad', 'p201-tabbar-fixed'));
  assert.equal(bad.outcome, 'FAIL');
  assert.match(bad.findings.map((f) => f.excerpt).join('\n'), /position:static/);
  const good = await runProbeAgainst(p201, fixturePath('good', 'p201-tabbar-fixed'));
  assert.equal(good.outcome, 'PASS');
});

test('P-201 is BLOCKED (not PASS) when no tab bar can be resolved', async () => {
  const res = await runProbeAgainst(p201, fixturePath('good', 'p301-overflow'));
  assert.equal(res.outcome, 'BLOCKED');
});

test('P-202 FAILs when content is buried behind the bar, PASSes when room is reserved', async () => {
  const bad = await runProbeAgainst(p202, fixturePath('bad', 'p202-content-behind-bar'));
  assert.equal(bad.outcome, 'FAIL');
  assert.match(bad.findings.map((f) => f.excerpt).join('\n'), /under the fixed tab bar/);
  const good = await runProbeAgainst(p202, fixturePath('good', 'p202-content-behind-bar'));
  assert.equal(good.outcome, 'PASS');
});

test('P-207 FAILs when the overlay is behind the bar, PASSes when above it', async () => {
  const bad = await runProbeAgainst(p207, fixturePath('bad', 'p207-overlay-clipped'));
  assert.equal(bad.outcome, 'FAIL');
  const good = await runProbeAgainst(p207, fixturePath('good', 'p207-overlay-clipped'));
  assert.equal(good.outcome, 'PASS');
});

test('P-711 FAILs when background stays reachable, PASSes when inert', async () => {
  const bad = await runProbeAgainst(p711, fixturePath('bad', 'p711-inert-bg'));
  assert.equal(bad.outcome, 'FAIL');
  const good = await runProbeAgainst(p711, fixturePath('good', 'p711-inert-bg'));
  assert.equal(good.outcome, 'PASS');
});

test('P-705 FAILs when the focus indicator is removed, PASSes with focus-visible', async () => {
  const bad = await runProbeAgainst(p705, fixturePath('bad', 'p705-focus-visible'));
  assert.equal(bad.outcome, 'FAIL');
  const good = await runProbeAgainst(p705, fixturePath('good', 'p705-focus-visible'));
  assert.equal(good.outcome, 'PASS');
});

test('P-706 FAILs without a focus trap/restore, PASSes with one', async () => {
  const bad = await runProbeAgainst(p706, fixturePath('bad', 'p706-focus-trap'));
  assert.equal(bad.outcome, 'FAIL');
  const good = await runProbeAgainst(p706, fixturePath('good', 'p706-focus-trap'));
  assert.equal(good.outcome, 'PASS');
});
