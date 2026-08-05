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

test('P-207 is N/A when overlay scenarios are absent and no surface is declared', async () => {
  const result = await runProbeAgainst(p207, fixturePath('good', 'p301-overflow'));

  assert.deepEqual(
    { outcome: result.outcome, findings: result.findings, detail: result.detail },
    {
      outcome: 'N/A',
      findings: [],
      detail: 'no overlay surface or overlay journey is declared for the configured routes',
    },
  );
});

test('P-207 is N/A when overlay scenarios are explicitly empty and no surface is declared', async () => {
  const result = await runProbeAgainst(
    p207,
    fixturePath('good', 'p301-overflow'),
    { scenarios: { overlays: [] } },
  );

  assert.equal(result.outcome, 'N/A');
  assert.equal(result.findings.length, 0);
});

test('P-207 honors the legacy selectors.overlay fallback without a journey', async () => {
  const result = await runProbeAgainst(
    p207,
    fixturePath('good', 'p207-overlay-contract'),
    {
      selectors: {
        overlay: '#legacy-surface',
        overlayTrigger: '#open',
        tabbar: '.tabbar',
      },
    },
  );

  assert.equal(result.outcome, 'PASS');
  assert.equal(result.findings.length, 0);
  assert.match(result.detail, /checked 1 overlay journey/);
});

test('P-207 treats a configured overlay trigger as a journey when the overlay mounts lazily', async () => {
  const result = await runProbeAgainst(
    p207,
    fixturePath('good', 'p207-overlay-lazy'),
    { selectors: { overlayTrigger: '#open' } },
  );

  assert.equal(result.outcome, 'PASS');
  assert.equal(result.findings.length, 0);
  assert.match(result.detail, /checked 1 overlay journey/);
});

test('P-207 treats an annotated live trigger as a journey when the overlay mounts lazily', async () => {
  const result = await runProbeAgainst(
    p207,
    fixturePath('good', 'p207-overlay-lazy'),
    { routes: ['/?annotated'] },
  );

  assert.equal(result.outcome, 'PASS');
  assert.equal(result.findings.length, 0);
  assert.match(result.detail, /checked 1 overlay journey/);
});

test('P-207 rejects an explicit close selector that only matches outside the opened overlay', async () => {
  const result = await runProbeAgainst(
    p207,
    fixturePath('good', 'p207-overlay-contract'),
    {
      scenarios: {
        overlays: [
          {
            name: 'scoped close',
            trigger: '#open',
            overlay: '#legacy-surface',
            close: '.page-close',
          },
        ],
      },
      selectors: { tabbar: '.tabbar' },
    },
  );

  assert.equal(result.outcome, 'FAIL');
  assert.equal(result.findings.length, 4);
  assert.ok(
    result.findings.every((finding) => /overlay has no visible close control/.test(finding.excerpt)),
  );
});

test('P-207 catches clipped short-viewport sheets and accepts internally scrolling geometry', async () => {
  const bad = await runProbeAgainst(p207, fixturePath('bad', 'p207-overlay-viewport'));
  assert.equal(bad.outcome, 'FAIL');
  assert.match(
    bad.findings.map((finding) => finding.excerpt).join('\n'),
    /outside the visual viewport|horizontal overflow|without an internal scroll owner|close control is outside/,
  );

  const good = await runProbeAgainst(p207, fixturePath('good', 'p207-overlay-viewport'));
  assert.equal(good.outcome, 'PASS');
});

test('P-207 drives a configured nested RTL overlay journey without repository-specific code', async () => {
  const result = await runProbeAgainst(
    p207,
    fixturePath('good', 'p207-overlay-viewport'),
    {
      scenarios: {
        overlays: [
          {
            name: 'nested install help',
            triggers: ['#open', '#open-nested'],
            overlay: '#nested',
            close: '#close-nested',
            direction: 'rtl',
          },
        ],
      },
    },
  );

  assert.equal(result.outcome, 'PASS');
  assert.match(result.detail, /1 overlay journey/);
});

test('P-207 mobile overlay geometry runs in both Chromium and WebKit', async () => {
  const result = await runProbeAgainst(
    p207,
    fixturePath('good', 'p207-overlay-viewport'),
    { engines: ['chromium', 'webkit'] },
  );

  assert.equal(result.outcome, 'PASS');
  assert.match(result.detail, /8 short portrait\/landscape engine cell/);
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
