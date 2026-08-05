import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { serveDir } from '../lib/server.mjs';
import { availableEngines } from '../lib/engines.mjs';
import { createHarness } from '../lib/harness.mjs';
import { normalizeConfig } from '../lib/config.mjs';
import { resolveRole } from '../lib/roles.mjs';
import { runProbes } from '../runner.mjs';

let dir;
let server;

const AUTH_CONTRACT_PROBE = {
  ids: ['AUTH-CONTRACT'],
  name: 'authenticated repository contract',
  async run(harness) {
    const opened = await harness.openPage({
      engine: 'chromium',
      route: harness.config.routes[0] || '/',
    });
    await opened.close();
    return { outcome: 'PASS', findings: [], detail: 'authenticated' };
  },
};

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

test('serveDir refuses source, secret, hidden, metadata, and symlink-escaped files', async () => {
  const artifact = mkdtempSync(path.join(tmpdir(), 'pwa-artifact-'));
  const outside = mkdtempSync(path.join(tmpdir(), 'pwa-private-'));
  let isolatedServer;
  try {
    mkdirSync(path.join(artifact, '.git'));
    mkdirSync(path.join(artifact, '.well-known'));
    writeFileSync(path.join(artifact, 'index.html'), '<!doctype html><p>public</p>');
    writeFileSync(path.join(artifact, '.env'), 'TOKEN=do-not-serve');
    writeFileSync(path.join(artifact, 'package.json'), '{"private":true}');
    writeFileSync(path.join(artifact, 'component.tsx'), 'export const secret = 1');
    writeFileSync(path.join(artifact, 'app.js.map'), '{"sourcesContent":["secret"]}');
    writeFileSync(path.join(artifact, 'credentials.json'), '{"token":"secret"}');
    writeFileSync(path.join(artifact, 'private-key.pem'), 'private key');
    writeFileSync(path.join(artifact, 'private-token'), 'secret');
    writeFileSync(path.join(artifact, 'public-target.js'), 'window.publicAlias = true;');
    writeFileSync(path.join(artifact, '.git', 'config'), '[remote "origin"]');
    writeFileSync(path.join(artifact, '.well-known', 'assetlinks.json'), '[]');
    writeFileSync(path.join(artifact, '.well-known', 'apple-app-site-association'), '{}');
    writeFileSync(path.join(outside, 'private.txt'), 'outside');
    symlinkSync(path.join(outside, 'private.txt'), path.join(artifact, 'leaked.txt'));
    symlinkSync(path.join(artifact, 'credentials.json'), path.join(artifact, 'cred.js'));
    symlinkSync(path.join(artifact, 'private-key.pem'), path.join(artifact, 'key.js'));
    symlinkSync(path.join(artifact, 'component.tsx'), path.join(artifact, 'source.js'));
    symlinkSync(path.join(artifact, 'public-target.js'), path.join(artifact, 'public-alias.js'));

    isolatedServer = await serveDir(artifact);
    for (const requestPath of [
      '/.env',
      '/package.json',
      '/component.tsx',
      '/app.js.map',
      '/credentials.json',
      '/cred.js',
      '/key.js',
      '/source.js',
      '/private-token',
      '/.git/config',
      '/leaked.txt',
    ]) {
      const response = await fetch(isolatedServer.url + requestPath);
      assert.equal(response.status, 403, `${requestPath} must not be served`);
    }

    const association = await fetch(
      isolatedServer.url + '/.well-known/assetlinks.json',
    );
    assert.equal(association.status, 200);
    assert.equal(await association.text(), '[]');
    const appleAssociation = await fetch(
      isolatedServer.url + '/.well-known/apple-app-site-association',
    );
    assert.equal(appleAssociation.status, 200);
    assert.equal(await appleAssociation.text(), '{}');
    const publicAlias = await fetch(isolatedServer.url + '/public-alias.js');
    assert.equal(publicAlias.status, 200);
    assert.match(await publicAlias.text(), /publicAlias/);
  } finally {
    if (isolatedServer) await isolatedServer.close();
    rmSync(artifact, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('serveDir rejects a file in place of an artifact directory', async () => {
  const file = path.join(dir, 'not-a-directory.html');
  writeFileSync(file, '<!doctype html>');
  await assert.rejects(() => serveDir(file), /root must be a directory/);
});

test('serveDir rejects directories without a contained index.html entry document', async () => {
  const artifact = mkdtempSync(path.join(tmpdir(), 'pwa-artifact-'));
  const outside = mkdtempSync(path.join(tmpdir(), 'pwa-private-'));
  try {
    await assert.rejects(() => serveDir(artifact), /must contain an index\.html/);
    writeFileSync(path.join(outside, 'index.html'), '<!doctype html>');
    symlinkSync(path.join(outside, 'index.html'), path.join(artifact, 'index.html'));
    await assert.rejects(() => serveDir(artifact), /inside the artifact root/);
  } finally {
    rmSync(artifact, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
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

test('configured auth state is exercised by default and can be explicitly disabled', async () => {
  const artifact = mkdtempSync(path.join(tmpdir(), 'pwa-auth-harness-'));
  let authServer;
  let harness;
  try {
    writeFileSync(
      path.join(artifact, 'index.html'),
      '<!doctype html><output id="session"></output><script>session.textContent = localStorage.getItem("session") || "anonymous"; if (session.textContent === "authenticated") document.body.dataset.authenticatedUser = "";</script>',
    );
    authServer = await serveDir(artifact);
    const storageStatePath = path.join(artifact, 'auth-state.json');
    writeFileSync(
      storageStatePath,
      JSON.stringify({
        cookies: [],
        origins: [
          {
            origin: authServer.url,
            localStorage: [{ name: 'session', value: 'authenticated' }],
          },
        ],
      }),
    );
    const { available } = await availableEngines();
    const config = normalizeConfig(
      {
        baseURL: authServer.url,
        auth: {
          storageState: './auth-state.json',
          success: { selector: '[data-authenticated-user]' },
        },
      },
      { projectRoot: artifact },
    );
    harness = createHarness({ config, engines: available });

    const authenticated = await harness.openPage({ engine: 'chromium' });
    assert.equal(await authenticated.page.locator('#session').textContent(), 'authenticated');
    await authenticated.close();

    const anonymous = await harness.openPage({ engine: 'chromium', authenticated: false });
    assert.equal(await anonymous.page.locator('#session').textContent(), 'anonymous');
    await anonymous.close();
  } finally {
    if (harness) await harness.closeAll();
    if (authServer) await authServer.close();
    rmSync(artifact, { recursive: true, force: true });
  }
});

test('authenticated URL postconditions use portable same-origin path patterns', async () => {
  const artifact = mkdtempSync(path.join(tmpdir(), 'pwa-auth-url-harness-'));
  let authServer;
  let harness;
  try {
    writeFileSync(path.join(artifact, 'index.html'), '<!doctype html><p>account</p>');
    authServer = await serveDir(artifact);
    const storageStatePath = path.join(artifact, 'auth-state.json');
    writeFileSync(storageStatePath, JSON.stringify({ cookies: [], origins: [] }));
    const { available } = await availableEngines();
    const config = normalizeConfig(
      {
        baseURL: authServer.url,
        routes: ['/account/profile'],
        auth: {
          storageState: './auth-state.json',
          success: { urlPattern: '/account/*' },
        },
      },
      { projectRoot: artifact },
    );
    harness = createHarness({ config, engines: available });

    const opened = await harness.openPage({ engine: 'chromium', route: '/account/profile' });
    assert.equal(opened.ok, true);
    assert.equal(new URL(opened.page.url()).pathname, '/account/profile');
    await opened.close();
  } finally {
    if (harness) await harness.closeAll();
    if (authServer) await authServer.close();
    rmSync(artifact, { recursive: true, force: true });
  }
});

test('an ineffective auth seed returns a typed BLOCKED probe result', async () => {
  const artifact = mkdtempSync(path.join(tmpdir(), 'pwa-auth-blocked-'));
  let authServer;
  try {
    writeFileSync(path.join(artifact, 'index.html'), '<!doctype html><p>anonymous</p>');
    authServer = await serveDir(artifact);
    writeFileSync(
      path.join(artifact, 'auth-state.json'),
      JSON.stringify({ cookies: [], origins: [] }),
    );
    const config = normalizeConfig(
      {
        baseURL: authServer.url,
        auth: {
          storageState: './auth-state.json',
          success: { selector: '[data-authenticated-user]' },
        },
      },
      { projectRoot: artifact },
    );
    const suite = await runProbes({
      config,
      probes: [AUTH_CONTRACT_PROBE],
      engines: ['chromium'],
      requiredEngines: ['chromium'],
    });
    assert.equal(suite.results[0].outcome, 'BLOCKED');
    assert.deepEqual(suite.results[0].diagnostic, {
      code: 'AUTH_POSTCONDITION_FAILED',
      message:
        'Configured authentication was ineffective on /: auth.success.selector did not resolve after navigation',
    });
    assert.equal(suite.results[0].detail, suite.results[0].diagnostic.message);
  } finally {
    if (authServer) await authServer.close();
    rmSync(artifact, { recursive: true, force: true });
  }
});

test('an unreadable auth seed returns typed AUTH_SEED_FAILED', async () => {
  const artifact = mkdtempSync(path.join(tmpdir(), 'pwa-auth-seed-blocked-'));
  let authServer;
  try {
    writeFileSync(path.join(artifact, 'index.html'), '<!doctype html><p>account</p>');
    authServer = await serveDir(artifact);
    const config = normalizeConfig(
      {
        baseURL: authServer.url,
        auth: {
          storageState: './missing-auth-state.json',
          success: { selector: '[data-authenticated-user]' },
        },
      },
      { projectRoot: artifact },
    );
    const suite = await runProbes({
      config,
      probes: [AUTH_CONTRACT_PROBE],
      engines: ['chromium'],
      requiredEngines: ['chromium'],
    });
    assert.equal(suite.results[0].outcome, 'BLOCKED');
    assert.equal(suite.results[0].diagnostic.code, 'AUTH_SEED_FAILED');
    assert.match(
      suite.results[0].diagnostic.message,
      /authentication state could not be applied to the browser context/,
    );
  } finally {
    if (authServer) await authServer.close();
    rmSync(artifact, { recursive: true, force: true });
  }
});

test('authenticated navigation without a usable HTTP response is typed BLOCKED', async () => {
  const artifact = mkdtempSync(path.join(tmpdir(), 'pwa-auth-navigation-blocked-'));
  try {
    writeFileSync(
      path.join(artifact, 'auth-state.json'),
      JSON.stringify({ cookies: [], origins: [] }),
    );
    const config = normalizeConfig(
      {
        baseURL: 'http://127.0.0.1:1',
        auth: {
          storageState: './auth-state.json',
          success: { urlPattern: '/' },
        },
      },
      { projectRoot: artifact },
    );

    const suite = await runProbes({
      config,
      probes: [AUTH_CONTRACT_PROBE],
      engines: ['chromium'],
      requiredEngines: ['chromium'],
    });
    assert.equal(suite.results[0].outcome, 'BLOCKED');
    assert.deepEqual(suite.results[0].diagnostic, {
      code: 'AUTH_POSTCONDITION_FAILED',
      message:
        'Configured authentication was ineffective on /: authenticated navigation did not produce an HTTP response',
    });
  } finally {
    rmSync(artifact, { recursive: true, force: true });
  }
});

test('every authenticated HTTP error is typed BLOCKED before a probe can PASS', async () => {
  const artifact = mkdtempSync(path.join(tmpdir(), 'pwa-auth-http-blocked-'));
  let authServer;
  try {
    writeFileSync(path.join(artifact, 'index.html'), '<!doctype html><p>account</p>');
    writeFileSync(
      path.join(artifact, 'auth-state.json'),
      JSON.stringify({ cookies: [], origins: [] }),
    );
    authServer = await serveDir(artifact);
    const config = normalizeConfig(
      {
        baseURL: authServer.url,
        routes: ['/missing.html'],
        auth: {
          storageState: './auth-state.json',
          success: { urlPattern: '/missing.html' },
        },
      },
      { projectRoot: artifact },
    );

    const suite = await runProbes({
      config,
      probes: [AUTH_CONTRACT_PROBE],
      engines: ['chromium'],
      requiredEngines: ['chromium'],
    });
    assert.equal(suite.results[0].outcome, 'BLOCKED');
    assert.deepEqual(suite.results[0].diagnostic, {
      code: 'AUTH_POSTCONDITION_FAILED',
      message:
        'Configured authentication was ineffective on /missing.html: the authenticated request returned HTTP 404',
    });
  } finally {
    if (authServer) await authServer.close();
    rmSync(artifact, { recursive: true, force: true });
  }
});
