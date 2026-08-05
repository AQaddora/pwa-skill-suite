import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { normalizeConfig, loadConfig } from '../lib/config.mjs';

test('normalizeConfig defaults routes to ["/"]', () => {
  const config = normalizeConfig({});
  assert.deepEqual(config.routes, ['/']);
  assert.deepEqual(config.scenarios, { overlays: [] });
  assert.equal(config.staticRoot, null);
});

test('normalizeConfig accepts declarative overlay journeys including nested and RTL states', () => {
  const config = normalizeConfig({
    scenarios: {
      overlays: [
        {
          name: 'install guide',
          route: '/ar/settings',
          triggers: ['[data-menu]', '[data-install]'],
          overlay: '[data-install-dialog]',
          close: '[data-install-close]',
          direction: 'rtl',
        },
      ],
    },
  });

  assert.deepEqual(config.scenarios.overlays, [
    {
      name: 'install guide',
      route: '/ar/settings',
      triggers: ['[data-menu]', '[data-install]'],
      overlay: '[data-install-dialog]',
      close: '[data-install-close]',
      direction: 'rtl',
    },
  ]);
});

test('normalizeConfig rejects malformed overlay journeys before a browser is launched', () => {
  assert.throws(
    () => normalizeConfig({ scenarios: { overlays: [{ triggers: [42] }] } }),
    /triggers must be CSS-selector strings/,
  );
  assert.throws(
    () => normalizeConfig({ scenarios: { overlays: [{ direction: 'auto' }] } }),
    /direction must be document, ltr, or rtl/,
  );
});

test('normalizeConfig rejects unknown repository-contract keys at every object boundary', () => {
  const cases = [
    [{ route: ['/catalog'] }, /root contains unknown key: route/],
    [{ selectors: { tabBar: '#tabs' } }, /selectors contains unknown key: tabBar/],
    [{ scenarios: { overlay: [] } }, /scenarios contains unknown key: overlay/],
    [
      { scenarios: { overlays: [{ triggers: ['#open'], dialog: '#dialog' }] } },
      /scenarios\.overlays\[0\] contains unknown key: dialog/,
    ],
    [
      {
        auth: {
          storageState: './state.json',
          success: { selector: '[data-user]' },
          provider: 'google',
        },
      },
      /auth contains unknown key: provider/,
    ],
    [
      {
        auth: {
          storageState: './state.json',
          success: { selector: '[data-user]', text: 'Signed in' },
        },
      },
      /auth\.success contains unknown key: text/,
    ],
  ];

  for (const [config, expected] of cases) {
    assert.throws(() => normalizeConfig(config), expected);
  }
});

test('auth requires exactly one seed and exactly one observable success postcondition', () => {
  assert.throws(() => normalizeConfig({ auth: {} }), /exactly one seed/);
  assert.throws(
    () =>
      normalizeConfig({
        auth: {
          storageState: './state.json',
          login() {},
          success: { selector: '[data-user]' },
        },
      }),
    /exactly one seed/,
  );
  assert.throws(
    () => normalizeConfig({ auth: { storageState: './state.json' } }),
    /auth\.success must be an object/,
  );
  assert.throws(
    () =>
      normalizeConfig({
        auth: {
          storageState: './state.json',
          success: {},
        },
      }),
    /exactly one postcondition/,
  );
  assert.throws(
    () =>
      normalizeConfig({
        auth: {
          storageState: './state.json',
          success: { selector: '[data-user]', urlPattern: '/account*' },
        },
      }),
    /exactly one postcondition/,
  );
  assert.throws(
    () =>
      normalizeConfig({
        auth: { storageState: '', success: { selector: '[data-user]' } },
      }),
    /non-empty path string/,
  );
});

test('auth supports provider-neutral selector and same-origin URL postconditions', () => {
  const selector = normalizeConfig({
    auth: {
      storageState: './state.json',
      success: { selector: '[data-authenticated-user]' },
    },
  });
  assert.deepEqual(selector.auth.success, { selector: '[data-authenticated-user]' });

  const url = normalizeConfig({
    auth: {
      login() {},
      success: { urlPattern: '/account/*' },
    },
  });
  assert.deepEqual(url.auth.success, { urlPattern: '/account/*' });
  assert.throws(
    () =>
      normalizeConfig({
        auth: {
          storageState: './state.json',
          success: { urlPattern: 'https://idp.example.com/account' },
        },
      }),
    /same-origin path pattern/,
  );
});

test('a localhost baseURL is treated as a local (non-origin) target', () => {
  const c = normalizeConfig({ baseURL: 'http://localhost:5173' });
  assert.equal(c.target, 'dev-server');
  assert.equal(c.targetIsLocal, true);
});

test('a public baseURL is treated as a deployed origin', () => {
  const c = normalizeConfig(
    { baseURL: 'https://app.example.com' },
    { allowExternal: true },
  );
  assert.equal(c.target, 'deployed-origin');
  assert.equal(c.targetIsLocal, false);
});

test('non-local origins require explicit trust', () => {
  assert.throws(
    () => normalizeConfig({ baseURL: 'https://app.example.com' }),
    /--allow-external-targets/,
  );
});

test('baseURL never accepts embedded credentials', () => {
  assert.throws(
    () => normalizeConfig({ baseURL: 'http://user:secret@localhost:4173' }),
    /must not embed credentials/,
  );
});

test('explicit target overrides the baseURL heuristic', () => {
  const c = normalizeConfig({ baseURL: 'http://localhost:3000', target: 'deployed-origin' });
  assert.equal(c.target, 'deployed-origin');
  assert.equal(c.targetIsLocal, true);
});

test('invalid target is rejected', () => {
  assert.throws(() => normalizeConfig({ target: 'staging' }), /target/);
});

test('routes are same-origin paths and cannot bypass external-target consent', () => {
  assert.throws(() => normalizeConfig({ routes: [] }), /non-empty array/);
  for (const route of [
    'https://example.com/private',
    '//example.com/private',
    'file:///etc/passwd',
    '/\\example.com/private',
  ]) {
    assert.throws(() => normalizeConfig({ routes: [route] }), /same-origin|one slash/);
  }
  assert.throws(
    () =>
      normalizeConfig({
        scenarios: { overlays: [{ route: 'http://127.0.0.1/admin' }] },
      }),
    /same-origin|one slash/,
  );
  assert.deepEqual(normalizeConfig({ routes: ['/catalog?sort=new#top'] }).routes, [
    '/catalog?sort=new#top',
  ]);
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

test('loadConfig discovers inert JSON and resolves auth state from the project root', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pwa-cfg-'));
  try {
    writeFileSync(
      path.join(dir, 'pwa-probes.config.json'),
      JSON.stringify({
        baseURL: 'http://localhost:4000',
        routes: ['/', '/inbox'],
        auth: {
          storageState: './fixtures/session.json',
          success: { selector: '[data-authenticated-user]' },
        },
        selectors: { tabbar: 'nav.tabs' },
      }),
    );
    const c = await loadConfig(dir);
    assert.equal(c.discovered, true);
    assert.deepEqual(c.routes, ['/', '/inbox']);
    assert.equal(c.selectors.tabbar, 'nav.tabs');
    assert.equal(c.auth.storageState, path.join(dir, 'fixtures', 'session.json'));
    assert.deepEqual(c.auth.success, { selector: '[data-authenticated-user]' });
    assert.equal(c.targetIsLocal, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadConfig refuses executable config by default and requires explicit trust', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pwa-cfg-'));
  try {
    writeFileSync(
      path.join(dir, 'pwa-probes.config.mjs'),
      `export default { baseURL: 'http://localhost:4000', routes: ['/', '/trusted'] };`,
    );
    await assert.rejects(() => loadConfig(dir), /refusing to execute.*--allow-config-code/);
    const c = await loadConfig(dir, { allowExecutable: true });
    assert.equal(c.discovered, true);
    assert.deepEqual(c.routes, ['/', '/trusted']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('executable config does not silently grant external-target trust', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pwa-cfg-'));
  try {
    writeFileSync(
      path.join(dir, 'pwa-probes.config.mjs'),
      `export default { baseURL: 'https://app.example.com', routes: ['/'] };`,
    );
    await assert.rejects(
      () => loadConfig(dir, { allowExecutable: true }),
      /--allow-external-targets/,
    );
    const c = await loadConfig(dir, { allowExecutable: true, allowExternal: true });
    assert.equal(c.baseURL, 'https://app.example.com');
    assert.equal(c.targetIsLocal, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('auth state cannot escape the project root without explicit trust', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pwa-cfg-'));
  try {
    writeFileSync(
      path.join(dir, 'pwa-probes.config.json'),
      JSON.stringify({
        auth: {
          storageState: '../private-session.json',
          success: { selector: '[data-authenticated-user]' },
        },
      }),
    );
    await assert.rejects(() => loadConfig(dir), /must stay inside the project root/);
    const c = await loadConfig(dir, { allowExternal: true });
    assert.equal(c.auth.storageState, path.resolve(dir, '../private-session.json'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an explicit static root must be an existing artifact directory inside the project', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pwa-cfg-'));
  try {
    mkdirSync(path.join(dir, 'dist'));
    writeFileSync(path.join(dir, 'dist', 'index.html'), '<!doctype html>');
    writeFileSync(
      path.join(dir, 'pwa-probes.config.json'),
      JSON.stringify({ staticRoot: './dist' }),
    );
    const c = await loadConfig(dir);
    assert.equal(c.staticRoot, realpathSync(path.join(dir, 'dist')));

    writeFileSync(
      path.join(dir, 'pwa-probes.config.json'),
      JSON.stringify({ staticRoot: '../private-build' }),
    );
    await assert.rejects(() => loadConfig(dir), /staticRoot must be a dedicated artifact/);

    writeFileSync(
      path.join(dir, 'pwa-probes.config.json'),
      JSON.stringify({ staticRoot: './missing-build' }),
    );
    await assert.rejects(() => loadConfig(dir), /existing dedicated artifact directory/);

    writeFileSync(path.join(dir, 'artifact.html'), '<!doctype html>');
    writeFileSync(
      path.join(dir, 'pwa-probes.config.json'),
      JSON.stringify({ staticRoot: './artifact.html' }),
    );
    await assert.rejects(() => loadConfig(dir), /must resolve to a directory/);

    mkdirSync(path.join(dir, 'not-an-artifact'));
    writeFileSync(
      path.join(dir, 'pwa-probes.config.json'),
      JSON.stringify({ staticRoot: './not-an-artifact' }),
    );
    await assert.rejects(() => loadConfig(dir), /must contain an existing index\.html/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('staticRoot can never alias the project root', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pwa-cfg-'));
  try {
    symlinkSync(dir, path.join(dir, 'root-alias'), 'dir');
    for (const staticRoot of ['.', './', './nested/..', dir, './root-alias']) {
      writeFileSync(
        path.join(dir, 'pwa-probes.config.json'),
        JSON.stringify({ staticRoot }),
      );
      await assert.rejects(
        () => loadConfig(dir),
        /project root|aliases of the project root|strictly inside/,
        `expected ${staticRoot} to be rejected`,
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('staticRoot symlinks stay realpath-contained even with external-target trust', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pwa-cfg-'));
  const outside = mkdtempSync(path.join(tmpdir(), 'pwa-private-'));
  try {
    mkdirSync(path.join(dir, 'dist'));
    writeFileSync(path.join(dir, 'dist', 'index.html'), '<!doctype html>');
    symlinkSync(path.join(dir, 'dist'), path.join(dir, 'dist-link'), 'dir');
    writeFileSync(
      path.join(dir, 'pwa-probes.config.json'),
      JSON.stringify({ staticRoot: './dist-link' }),
    );
    assert.equal((await loadConfig(dir)).staticRoot, realpathSync(path.join(dir, 'dist')));

    symlinkSync(outside, path.join(dir, 'outside-link'), 'dir');
    writeFileSync(
      path.join(dir, 'pwa-probes.config.json'),
      JSON.stringify({ staticRoot: './outside-link' }),
    );
    await assert.rejects(() => loadConfig(dir), /symlink escapes/);
    await assert.rejects(
      () => loadConfig(dir, { allowExternal: true }),
      /symlink escapes/,
      '--allow-external-targets must not widen the static server filesystem boundary',
    );

    writeFileSync(
      path.join(dir, 'pwa-probes.config.json'),
      JSON.stringify({ staticRoot: outside }),
    );
    await assert.rejects(
      () => loadConfig(dir, { allowExternal: true }),
      /external paths are never served/,
      '--allow-external-targets must not authorize an absolute external staticRoot',
    );

    mkdirSync(path.join(dir, 'tainted-dist'));
    writeFileSync(path.join(outside, 'index.html'), '<p>outside</p>');
    symlinkSync(
      path.join(outside, 'index.html'),
      path.join(dir, 'tainted-dist', 'index.html'),
    );
    writeFileSync(
      path.join(dir, 'pwa-probes.config.json'),
      JSON.stringify({ staticRoot: './tainted-dist' }),
    );
    await assert.rejects(() => loadConfig(dir), /index\.html must resolve inside/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
