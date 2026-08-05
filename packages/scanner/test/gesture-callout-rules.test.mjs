import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runScan } from '../cli.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixtureDir = (kind, slug) => join(HERE, '..', 'fixtures', kind, slug);

test('P-701 covers viewport, framework export, gesture listener, and root CSS zoom locks', async () => {
  const { findings } = await runScan(fixtureDir('bad', 'p701-user-scalable'));
  const p701 = findings.filter((finding) => finding.id === 'P-701');
  const files = new Set(p701.map((finding) => finding.file));

  assert.ok(files.has('index.html'), 'expected viewport meta detection');
  assert.ok(files.has('viewport.ts'), 'expected Next-style viewport export detection');
  assert.ok(files.has('MobileInteractionGuard.tsx'), 'expected gesture listener detection');
  assert.ok(files.has('globals.css'), 'expected root touch-action detection');
  assert.ok(files.has('lexical-shadowing.ts'), 'expected the nearest blocking callback binding');
  assert.ok(files.has('inline-and-arrow.ts'), 'expected bounded arrow export and inline listener detection');
  assert.ok(
    p701.some((finding) => finding.excerpt.includes("addEventListener('touchmove'")),
    'expected named multi-touch callback detection',
  );
  assert.ok(
    p701.some((finding) => finding.excerpt.includes("addEventListener('gesturechange'")),
    'expected inline gesture callback detection',
  );
  assert.ok(
    p701.some(
      (finding) =>
        finding.file === 'inline-and-arrow.ts' && finding.excerpt.includes('maximumScale: 1'),
    ),
    'expected generateViewport arrow expression detection',
  );
});

test('P-701 permits zoomable viewport, lexical shadows, decoys, and manipulation controls', async () => {
  const { findings } = await runScan(fixtureDir('good', 'p701-user-scalable'));
  assert.deepEqual(findings.filter((finding) => finding.id === 'P-701'), []);
});

test('P-112 flags global/content callout suppression including :where alternatives', async () => {
  const { findings } = await runScan(fixtureDir('bad', 'p112-touch-callout'));
  const p112 = findings.filter((finding) => finding.id === 'P-112');

  assert.equal(p112.length, 4);
  assert.ok(p112.some((finding) => finding.excerpt.includes(':where(a, button, summary)')));
  assert.ok(p112.some((finding) => finding.excerpt.includes('main, .content')));
  assert.ok(p112.some((finding) => finding.excerpt.includes('img')));
  assert.ok(p112.some((finding) => finding.excerpt.includes('body a')));
});

test('P-112 permits button and app-chrome navigation callout suppression', async () => {
  const { findings } = await runScan(fixtureDir('good', 'p112-touch-callout'));
  assert.deepEqual(findings.filter((finding) => finding.id === 'P-112'), []);
});
