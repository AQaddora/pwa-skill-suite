import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSwapProxy } from '../lib/proxy.mjs';

function build(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'harness-build-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

test('serves the current backing dir over a single origin, then swaps to B', async () => {
  const a = build({ 'index.html': 'BUILD A', 'app.aaa.js': 'a-chunk' });
  const b = build({ 'index.html': 'BUILD B', 'app.bbb.js': 'b-chunk' });
  dirs.push(a, b);
  const proxy = await createSwapProxy(a);
  try {
    assert.match(await (await fetch(proxy.url + '/')).text(), /BUILD A/);
    proxy.swapTo(b);
    assert.match(await (await fetch(proxy.url + '/')).text(), /BUILD B/);
    // A's hashed chunk is gone from B — it 404s (chunk deletion is implicit in the swap).
    assert.equal((await fetch(proxy.url + '/app.aaa.js')).status, 404);
    assert.equal((await fetch(proxy.url + '/app.bbb.js')).status, 200);
  } finally {
    await proxy.close();
  }
});

test('hashed assets get an immutable long cache; sw.js/manifest do not', async () => {
  const a = build({ 'index.html': 'x', 'app.deadbeef.js': 'x', 'sw.js': 'x', 'manifest.webmanifest': '{}' });
  dirs.push(a);
  const proxy = await createSwapProxy(a);
  try {
    const hashed = (await fetch(proxy.url + '/app.deadbeef.js')).headers.get('cache-control') || '';
    const sw = (await fetch(proxy.url + '/sw.js')).headers.get('cache-control') || '';
    assert.match(hashed, /immutable|max-age=\d{6,}/);
    assert.doesNotMatch(sw, /immutable|max-age=\d{6,}/);
  } finally {
    await proxy.close();
  }
});

test('a build may override headers via .headers.json (models a misconfigured origin)', async () => {
  const a = build({ 'sw.js': 'x', '.headers.json': JSON.stringify({ '/sw.js': { 'cache-control': 'max-age=31536000, immutable' } }) });
  dirs.push(a);
  const proxy = await createSwapProxy(a);
  try {
    const sw = (await fetch(proxy.url + '/sw.js')).headers.get('cache-control') || '';
    assert.match(sw, /31536000/);
  } finally {
    await proxy.close();
  }
});
