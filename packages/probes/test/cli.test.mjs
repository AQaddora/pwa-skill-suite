import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const CLI_PATH = fileURLToPath(new URL('../cli.mjs', import.meta.url));

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'pwa-probe-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function run(args, options = {}) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: 'utf8',
    ...options,
  });
}

function expectedBlocked(diagnostic) {
  const skipped = ['chromium', 'webkit'].map((engine) => ({
    engine,
    reason: diagnostic.message,
  }));
  return {
    status: 'BLOCKED',
    blocked: true,
    failed: true,
    diagnostics: [diagnostic],
    results: [
      {
        ids: ['PWA-PROBES'],
        name: 'Browser runtime probes',
        outcome: 'BLOCKED',
        findings: [],
        detail: diagnostic.message,
        diagnostic,
      },
    ],
    engines: [],
    skipped,
    engineCoverage: {
      status: 'BLOCKED',
      expected: ['chromium', 'webkit'],
      run: [],
      skipped,
      missing: ['chromium', 'webkit'],
    },
  };
}

function assertExactBlockedJson(result, diagnostic) {
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.equal(result.signal, null);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), expectedBlocked(diagnostic));
}

test('--json reports a nonexistent project as typed BLOCKED data, not stderr', (t) => {
  const parent = fixture(t);
  const missing = path.join(parent, 'missing-project');
  assertExactBlockedJson(run([missing, '--json']), {
    code: 'TARGET_NOT_FOUND',
    path: missing,
    message: 'Probe target does not exist.',
  });
});

test('--json reports an unconfigured project with a complete blocked engine matrix', (t) => {
  const root = fixture(t);
  assertExactBlockedJson(run([root, '--json']), {
    code: 'RUNTIME_TARGET_NOT_CONFIGURED',
    path: path.join(root, 'pwa-probes.config.json'),
    message:
      'No runtime target is configured; set a local baseURL or an explicit contained staticRoot in pwa-probes.config.json.',
  });
});

test('--json reports invalid config as a stable typed config failure', (t) => {
  const root = fixture(t);
  const configPath = path.join(root, 'pwa-probes.config.json');
  writeFileSync(configPath, '{"baseURL":42}\n');
  assertExactBlockedJson(run([root, '--json']), {
    code: 'PROBE_CONFIG_LOAD_FAILED',
    path: configPath,
    message:
      'Could not load the probe config: pwa-probes config: baseURL must be a string or null',
  });
});

test('--json keeps argument errors machine-readable too', () => {
  const message =
    'Unknown option: --wat. Usage: cli.mjs [project-dir] [--json] [--allow-config-code] [--allow-external-targets]';
  assertExactBlockedJson(run(['--json', '--wat']), {
    code: 'CLI_ARGUMENT_ERROR',
    message,
  });
});

test('--json converts an unexpected suite rejection into structured BLOCKED data', () => {
  const script = [
    `import { main } from ${JSON.stringify(new URL('../cli.mjs', import.meta.url).href)};`,
    "const code = await main(['--json'], { runSuite: async () => { throw new Error('synthetic crash'); } });",
    'process.exit(code);',
  ].join('\n');
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    encoding: 'utf8',
  });
  assertExactBlockedJson(result, {
    code: 'PROBE_SUITE_FAILED',
    message: 'Browser probes could not complete: synthetic crash',
  });
});

test('non-JSON failures stay concise and do not print an Error stack', (t) => {
  const root = fixture(t);
  const configPath = path.join(root, 'pwa-probes.config.json');
  writeFileSync(configPath, '{"baseURL":42}\n');
  const result = run([root]);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(
    result.stderr,
    `BLOCKED [PROBE_CONFIG_LOAD_FAILED] (${configPath}): Could not load the probe config: pwa-probes config: baseURL must be a string or null\n`,
  );
  assert.doesNotMatch(result.stderr, /\n\s+at /);
});
