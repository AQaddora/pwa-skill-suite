import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { serveDir } from '../lib/server.mjs';
import { availableEngines } from '../lib/engines.mjs';
import { createHarness } from '../lib/harness.mjs';
import { normalizeConfig } from '../lib/config.mjs';
import { resolveRole } from '../lib/roles.mjs';

let dir;
let server;

before(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'pwa-harness-'));
  writeFileSync(
    path.join(dir, 'index.html'),
    `<!doctype html><html><head><meta name=viewport content="width=device-width"></head>
     <body><nav data-pwa-role="tabbar">tabs</nav><main id=app>hello</main></body></html>`,
  );
});

after(() => rmSync(dir, { recursive: true, force: true }));

test('serveDir serves index.html at /', async () => {
  server = await serveDir(dir);
  const res = await fetch(server.url + '/');
  const body = await res.text();
  assert.match(body, /hello/);
  assert.match(res.headers.get('content-type'), /text\/html/);
});

test('serveDir SPA-falls-back unknown extensionless routes to index.html', async () => {
  const res = await fetch(server.url + '/settings');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /hello/);
});

test('chromium is an available engine on this host', async () => {
  const { available } = await availableEngines();
  assert.ok(available.includes('chromium'), `expected chromium, got ${available.join(',')}`);
});

test('harness opens a page at a viewport and resolves a data-pwa-role target', async () => {
  const { available } = await availableEngines();
  const config = normalizeConfig({ baseURL: server.url });
  const harness = createHarness({ config, engines: available });
  try {
    const { page, close } = await harness.openPage({ engine: 'chromium', width: 320, height: 568, route: '/' });
    const vp = page.viewportSize();
    assert.equal(vp.width, 320);
    const tabbar = await resolveRole(page, 'tabbar', config);
    assert.equal(tabbar, '[data-pwa-role="tabbar"]');
    const missing = await resolveRole(page, 'header', config);
    assert.equal(missing, null);
    await close();
  } finally {
    await harness.closeAll();
    await server.close();
  }
});
