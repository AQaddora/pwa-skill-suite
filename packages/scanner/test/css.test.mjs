import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractDeclarations } from '../lib/css.mjs';

test('block comments are ignored and do not corrupt the property/value split', () => {
  const decls = extractDeclarations('.a {\n  /* note: hi */\n  margin-left: 4px;\n}');
  const ml = decls.find((d) => d.property === 'margin-left');
  assert.ok(ml, 'margin-left should be parsed despite a preceding comment with a colon');
  assert.equal(ml.value, '4px');
});

test('plain declarations still parse', () => {
  const decls = extractDeclarations('.b { width: 100vw; height: 100dvh; }');
  assert.equal(decls.find((d) => d.property === 'width').value, '100vw');
  assert.equal(decls.find((d) => d.property === 'height').value, '100dvh');
});
