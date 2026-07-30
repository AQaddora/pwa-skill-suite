import { test } from 'node:test';
import assert from 'node:assert/strict';
import p203 from '../probes/p203-shell-identity.mjs';
import p204 from '../probes/p204-scroll-restore.mjs';
import p208 from '../probes/p208-back-closes-overlay.mjs';
import p115 from '../probes/p115-standalone-back.mjs';
import p509 from '../probes/p509-offline-fallback.mjs';
import { fixturePath, runProbeAgainst } from './helpers.mjs';

const TWO = { routes: ['/', '/two'] };

test('P-203 FAILs on a full-reload MPA, PASSes on a persistent-shell SPA', async () => {
  const bad = await runProbeAgainst(p203, fixturePath('bad', 'p203-shell-identity'), TWO);
  assert.equal(bad.outcome, 'FAIL');
  assert.match(bad.findings.map((f) => f.excerpt).join('\n'), /re-created on navigation/);
  const good = await runProbeAgainst(p203, fixturePath('good', 'p203-shell-identity'), TWO);
  assert.equal(good.outcome, 'PASS');
});

test('P-204 FAILs without scroll restoration, PASSes with per-tab restore', async () => {
  const bad = await runProbeAgainst(p204, fixturePath('bad', 'p204-scroll-restore'), TWO);
  assert.equal(bad.outcome, 'FAIL');
  assert.match(bad.findings.map((f) => f.excerpt).join('\n'), /scroll not restored/);
  const good = await runProbeAgainst(p204, fixturePath('good', 'p204-scroll-restore'), TWO);
  assert.equal(good.outcome, 'PASS');
});

test('P-208 FAILs when back does not close the overlay, PASSes when it does', async () => {
  const bad = await runProbeAgainst(p208, fixturePath('bad', 'p208-back-closes-overlay'));
  assert.equal(bad.outcome, 'FAIL');
  const good = await runProbeAgainst(p208, fixturePath('good', 'p208-back-closes-overlay'));
  assert.equal(good.outcome, 'PASS');
});

test('P-115 FAILs without a standalone back affordance, PASSes with one', async () => {
  const opts = { routes: ['/detail'] };
  const bad = await runProbeAgainst(p115, fixturePath('bad', 'p115-standalone-back'), opts);
  assert.equal(bad.outcome, 'FAIL');
  const good = await runProbeAgainst(p115, fixturePath('good', 'p115-standalone-back'), opts);
  assert.equal(good.outcome, 'PASS');
});

test('P-509 FAILs with no offline handling, PASSes with a SW offline fallback', async () => {
  const bad = await runProbeAgainst(p509, fixturePath('bad', 'p509-offline-fallback'));
  assert.equal(bad.outcome, 'FAIL');
  const good = await runProbeAgainst(p509, fixturePath('good', 'p509-offline-fallback'));
  assert.equal(good.outcome, 'PASS');
});
