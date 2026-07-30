import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { normalizeConfig, loadConfig } from '../lib/config.mjs';

test('normalizeConfig defaults routes to ["/"]', () => {
  assert.deepEqual(normalizeConfig({}).routes, ['/']);
});

test('a localhost baseURL is treated as a local (non-origin) target', () => {
  const c = normalizeConfig({ baseURL: 'http://localhost:5173' });
  assert.equal(c.target, 'dev-server');
  assert.equal(c.targetIsLocal, true);
});

test('a public baseURL is treated as a deployed origin', () => {
  const c = normalizeConfig({ baseURL: 'https://app.example.com' });
  assert.equal(c.target, 'deployed-origin');
  assert.equal(c.targetIsLocal, false);
});

test('explicit target overrides the baseURL heuristic', () => {
  const c = normalizeConfig({ baseURL: 'http://localhost:3000', target: 'deployed-origin' });
  assert.equal(c.target, 'deployed-origin');
  assert.equal(c.targetIsLocal, false);
});

test('invalid target is rejected', () => {
  assert.throws(() => normalizeConfig({ target: 'staging' }), /target/);
});

test('loadConfig returns an undiscovered default when no config file is present', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pwa-cfg-'));
  try {
    const c = await loadConfig(dir);
    assert.equal(c.discovered, false);
    assert.deepEqual(c.routes, ['/']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadConfig discovers and normalizes pwa-probes.config.mjs', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pwa-cfg-'));
  try {
    writeFileSync(
      path.join(dir, 'pwa-probes.config.mjs'),
      `export default { baseURL: 'http://localhost:4000', routes: ['/', '/inbox'], selectors: { tabbar: 'nav.tabs' } };`,
    );
    const c = await loadConfig(dir);
    assert.equal(c.discovered, true);
    assert.deepEqual(c.routes, ['/', '/inbox']);
    assert.equal(c.selectors.tabbar, 'nav.tabs');
    assert.equal(c.targetIsLocal, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
