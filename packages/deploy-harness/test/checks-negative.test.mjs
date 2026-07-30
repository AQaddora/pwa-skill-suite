// Proves each check can actually fire — a check that always PASSes against every fixture is
// vapour, not a test. Builds minimal synthetic "bad" A/B pairs on the fly (same mkdtemp
// pattern as proxy.test.mjs) and runs the check module directly against them.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { createSwapProxy } from '../lib/proxy.mjs';
import p502 from '../checks/p502-no-stale-html.mjs';
import p504 from '../checks/p504-no-uncontrolled-skip-waiting.mjs';
import p514 from '../checks/p514-sw-manifest-cache-ttl.mjs';
import p523 from '../checks/p523-no-cross-user-data.mjs';
import p531 from '../checks/p531-breaking-forces-update.mjs';

const dirs = [];
function build(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'harness-bad-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  dirs.push(dir);
  return dir;
}

let browser;
before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser.close();
  dirs.forEach((d) => rmSync(d, { recursive: true, force: true }));
});

test('P-502 fails when the SW serves navigations cache-first', async () => {
  const badA = build({
    'index.html': `<script>window.__SHELL_BUILD__='A';navigator.serviceWorker&&navigator.serviceWorker.register('/sw.js');</script>`,
    // Precaches '/' at install time (the classic cache-first mistake) so even the very first,
    // not-yet-controlled navigation ends up pinned — a single post-swap reload is then enough
    // to prove staleness, matching what the real check does.
    'sw.js': `self.addEventListener('install', (e) => e.waitUntil(caches.open('nav').then((c) => c.add('/'))));
    self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
    self.addEventListener('fetch', (e) => {
      if (e.request.mode === 'navigate') {
        e.respondWith(caches.open('nav').then((c) => c.match('/').then((cached) => cached || fetch(e.request))));
      }
    });`,
  });
  const badB = build({ 'index.html': `<script>window.__SHELL_BUILD__='B';</script>` });
  const proxy = await createSwapProxy(badA);
  try {
    const result = await p502.run({ proxy, browser, buildADir: badA, buildBDir: badB });
    assert.equal(result.outcome, 'FAIL');
    assert.match(result.findings[0].excerpt, /stale/i);
  } finally {
    await proxy.close();
  }
});

test('P-504 fails when a new SW calls skipWaiting unconditionally at install', async () => {
  const badA = build({
    'index.html': `<script>window.app={buildId:'A'};navigator.serviceWorker&&navigator.serviceWorker.register('/sw.js');</script>`,
    'sw.js': `self.addEventListener('install', () => {});\nself.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));`,
  });
  const badB = build({
    'index.html': `<script>window.app={buildId:'A'};navigator.serviceWorker&&navigator.serviceWorker.register('/sw.js');</script>`,
    'sw.js': `self.addEventListener('install', () => self.skipWaiting());\nself.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));`,
  });
  const proxy = await createSwapProxy(badA);
  try {
    const result = await p504.run({ proxy, browser, buildADir: badA, buildBDir: badB });
    assert.equal(result.outcome, 'FAIL');
  } finally {
    await proxy.close();
  }
});

test('P-514 fails when sw.js is served with a long/immutable cache TTL', async () => {
  const badOrigin = build({
    'sw.js': 'self;',
    'manifest.webmanifest': '{}',
    '.headers.json': JSON.stringify({ '/sw.js': { 'cache-control': 'public, max-age=31536000, immutable' } }),
  });
  const proxy = await createSwapProxy(badOrigin);
  try {
    const result = await p514.run({ proxy, buildADir: badOrigin });
    assert.equal(result.outcome, 'FAIL');
    assert.match(result.findings[0].excerpt, /sw\.js/);
  } finally {
    await proxy.close();
  }
});

test('P-523 fails when logout does not clear a prior user\'s data', async () => {
  const appJs = (build) => `
    function setCookie(n,v){document.cookie=n+'='+v+'; path=/';}
    async function signIn(user){setCookie('sid','tok-'+user);localStorage.setItem('user:'+user+':profile',JSON.stringify({user}));}
    async function signOut(){ /* bug: never clears sid or user:* localStorage */ }
    window.app = {
      buildId: '${build}',
      signIn, signOut,
      authState: () => 'authed',
      lsKeys: () => Object.keys(localStorage),
      idbKeys: async () => [],
      cacheKeys: async () => [],
    };
  `;
  const badA = build({ 'index.html': `<script>${appJs('A')}</script>` });
  const badB = build({ 'index.html': `<script>${appJs('B')}</script>` });
  const proxy = await createSwapProxy(badA);
  try {
    const result = await p523.run({ proxy, browser, buildADir: badA, buildBDir: badB });
    assert.equal(result.outcome, 'FAIL');
    assert.match(result.findings[0].excerpt, /alice/i);
  } finally {
    await proxy.close();
  }
});

test('P-531 fails when a breaking deploy is not force-applied', async () => {
  const shell = (build) => `
    window.app = { buildId: '${build}' };
    navigator.serviceWorker && navigator.serviceWorker.register('/sw.js');
    window.app.checkUpdate = async () => {
      const v = await fetch('/version.json', { cache: 'no-store' }).then((r) => r.json());
      // bug: sets a flag but never actually forces the client onto the new build
      window.app.updateState = v.breaking ? 'forced' : 'available';
      return window.app.updateState;
    };
  `;
  const sw = `self.addEventListener('install', () => {});\nself.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));`;
  const badA = build({
    'index.html': `<script>${shell('A')}</script>`,
    'sw.js': sw,
    'version.json': JSON.stringify({ build: 'A', minSupported: 'A', breaking: false }),
  });
  const badBreaking = build({
    'index.html': `<script>${shell('A')}</script>`,
    'sw.js': sw,
    'version.json': JSON.stringify({ build: 'B', minSupported: 'B', breaking: true }),
  });
  const proxy = await createSwapProxy(badA);
  try {
    const result = await p531.run({ proxy, browser, buildADir: badA, buildBBreakingDir: badBreaking });
    assert.equal(result.outcome, 'FAIL');
    assert.match(result.findings[0].excerpt, /lingered/i);
  } finally {
    await proxy.close();
  }
});
