import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAttr, hasAttr } from '../lib/tags.mjs';

test('getAttr does not read a data-* attribute as the base attribute', () => {
  const tag = '<input data-type="danger" name="qty" />';
  assert.equal(getAttr(tag, 'type'), null);
  assert.equal(getAttr(tag, 'name'), 'qty');
});

test('getAttr reads the real attribute value', () => {
  assert.equal(getAttr('<input type="tel" name="phone" />', 'type'), 'tel');
});

test('hasAttr is not fooled by a data-* prefix', () => {
  assert.equal(hasAttr('<input data-autocomplete="x" type="password" />', 'autocomplete'), false);
  assert.equal(hasAttr('<input autocomplete="off" />', 'autocomplete'), true);
});
