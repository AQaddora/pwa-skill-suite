import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_WIDTHS, portraitSize, cells } from '../lib/matrix.mjs';

test('covers the six required device widths', () => {
  assert.deepEqual(DEVICE_WIDTHS, [320, 360, 390, 430, 768, 1024]);
});

test('portrait size is taller than wide for every width', () => {
  for (const w of DEVICE_WIDTHS) {
    const { width, height } = portraitSize(w);
    assert.equal(width, w);
    assert.ok(height > width, `portrait ${w} should be taller than wide`);
  }
});

test('cells expands engines x widths x both orientations', () => {
  const list = [...cells({ engines: ['chromium', 'webkit'] })];
  // 2 engines * 6 widths * 2 orientations
  assert.equal(list.length, 2 * 6 * 2);
});

test('landscape swaps the axes so width becomes the larger dimension', () => {
  const list = [...cells({ engines: ['chromium'] })];
  const land320 = list.find((c) => c.engine === 'chromium' && c.orientation === 'landscape' && c.height === 320);
  assert.ok(land320, 'expected a landscape cell derived from width 320');
  assert.ok(land320.width > land320.height, 'landscape width should exceed height');
});

test('every cell names its engine', () => {
  for (const c of cells({ engines: ['webkit'] })) {
    assert.equal(c.engine, 'webkit');
  }
});
