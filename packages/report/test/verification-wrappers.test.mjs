import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  completionGate,
  loadBrowserRuntime,
  runVerify,
} from '../../../skills/pwa-verify/scripts/run-verify.mjs';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

async function fixture(t, { config = false } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'pwa-wrapper-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    path.join(root, 'index.html'),
    '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fixture</title>',
  );
  if (config) {
    await writeFile(
      path.join(root, 'pwa-probes.config.mjs'),
      "export default { baseURL: 'http://127.0.0.1:9', target: 'dev-server' };\n",
    );
  }
  return root;
}

async function unsupportedAstroFixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'pwa-wrapper-astro-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, 'package.json'), '{"scripts":{"build":"astro build"}}');
  await writeFile(
    path.join(root, 'src', 'layout.astro'),
    '<meta name="viewport" content="width=device-width, user-scalable=no">',
  );
  return root;
}

test('the completion gate blocks even advisory-confidence static findings', () => {
  assert.equal(
    completionGate({
      scanFindings: [
        {
          id: 'P-701',
          file: 'src/guard.js',
          line: 1,
          confidence: 'advisory',
          severity: 'P0',
        },
      ],
    }),
    true,
  );
});

test('the completion gate blocks incomplete required-engine coverage by policy', () => {
  assert.equal(
    completionGate({
      probeResults: [{ ids: ['TEST'], outcome: 'PASS', findings: [] }],
      engineCoverage: { status: 'BLOCKED' },
    }),
    true,
  );
});

test('a missing Playwright package becomes a typed BLOCKED runtime result', async (t) => {
  const missing = new Error(
    "Cannot find package 'playwright' imported from /portable/runtime/packages/probes/lib/engines.mjs",
  );
  missing.code = 'ERR_MODULE_NOT_FOUND';
  const runtime = await loadBrowserRuntime(async () => {
    throw missing;
  });
  assert.deepEqual(runtime, {
    ok: false,
    diagnostic: {
      code: 'PLAYWRIGHT_NOT_INSTALLED',
      message:
        'Playwright is not installed in the PWA Skill Suite runtime. Install its dependencies and browser engines, then rerun pwa-verify.',
    },
  });

  const root = await fixture(t);
  const result = await runVerify(root, { runtimeLoader: async () => runtime });
  const report = JSON.parse(result.json);
  assert.equal(result.failed, true);
  assert.equal(report.status, 'BLOCKED');
  assert.equal(report.blocked, true);
  assert.equal(report.verification.status, 'BLOCKED');
  assert.equal(report.verification.diagnostics.at(-1).code, 'PLAYWRIGHT_NOT_INSTALLED');
  assert.equal(report.probes[0].outcome, 'BLOCKED');
  assert.equal(report.harnessSelfTest[0].outcome, 'BLOCKED');
  assert.equal(report.targetDeployEvidence.outcome, 'UNVERIFIED');
  assert.equal(Object.hasOwn(report, 'harness'), false);
});

test('bundled harness findings never enter target findings or target outcomes', async (t) => {
  const root = await fixture(t, { config: true });
  const fixtureFinding = {
    id: 'P-523',
    file: 'suite-fixture/build-a/app.js',
    line: 1,
    excerpt: 'synthetic failure',
    severity: 'P0',
    confidence: 'high',
  };
  const runtimeLoader = async () => ({
    ok: true,
    runProbes: async () => ({
      results: [
        {
          ids: ['PWA-PROBE-SELFTEST'],
          name: 'Probe fixture',
          outcome: 'PASS',
          findings: [],
          detail: 'test seam',
        },
      ],
      engines: ['chromium', 'webkit'],
      skipped: [],
    }),
    runHarness: async () => ({
      results: [
        {
          ids: ['P-523'],
          name: 'Fixture privacy assertion',
          outcome: 'FAIL',
          findings: [fixtureFinding],
          detail: 'suite self-test failed',
        },
      ],
    }),
  });

  const result = await runVerify(root, { runtimeLoader, allowConfigCode: true });
  const report = JSON.parse(result.json);
  assert.equal(result.failed, true, 'a broken self-test still makes the verifier untrustworthy');
  assert.equal(report.status, 'FAIL');
  assert.equal(report.blocked, false);
  assert.equal(report.verification.status, 'FAIL');
  assert.equal(report.findings.some((finding) => finding.file === fixtureFinding.file), false);
  assert.equal(report.outcomes['P-523'], 'UNVERIFIED');
  assert.deepEqual(report.harnessSelfTest[0].findings, [fixtureFinding]);
  assert.match(result.markdown, /suite fixtures only/);
  assert.match(result.markdown, /never count as app evidence/);
});

test('missing expected WebKit blocks the combined verifier and is explicit in JSON', async (t) => {
  const root = await fixture(t, { config: true });
  const runtimeLoader = async () => ({
    ok: true,
    runProbes: async () => ({
      results: [
        {
          ids: ['PWA-PROBE-SELFTEST'],
          name: 'Probe fixture',
          outcome: 'PASS',
          findings: [],
          detail: 'Chromium assertions passed',
        },
      ],
      engines: ['chromium'],
      skipped: [{ engine: 'webkit', reason: 'WebKit executable is not installed' }],
      // The verifier, not the injected runner, owns the default required-engine policy.
      engineCoverage: {
        status: 'COMPLETE',
        expected: ['chromium'],
        run: ['chromium'],
        skipped: [],
        missing: [],
      },
    }),
    runHarness: async () => ({
      results: [
        {
          ids: ['PWA-HARNESS-SELFTEST'],
          name: 'Harness fixture',
          outcome: 'PASS',
          findings: [],
          detail: 'test seam',
        },
      ],
    }),
  });

  const result = await runVerify(root, { runtimeLoader, allowConfigCode: true });
  const report = JSON.parse(result.json);
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.failed, true);
  assert.deepEqual(report.engineCoverage, {
    status: 'BLOCKED',
    expected: ['chromium', 'webkit'],
    run: ['chromium'],
    skipped: [{ engine: 'webkit', reason: 'WebKit executable is not installed' }],
    missing: ['webkit'],
  });
  assert.deepEqual(report.verification.engineCoverage, report.engineCoverage);
  assert.equal(
    report.verification.diagnostics.at(-1).code,
    'REQUIRED_BROWSER_ENGINE_UNAVAILABLE',
  );
  assert.equal(
    report.probes.find((entry) => entry.ids.includes('PWA-ENGINE-COVERAGE'))?.outcome,
    'BLOCKED',
  );
  assert.equal(report.targetDeployEvidence.outcome, 'UNVERIFIED');
  assert.match(result.markdown, /Engine coverage: \*\*BLOCKED\*\*/);
  assert.match(result.markdown, /WebKit executable is not installed/);
});

test('executable repository config is default-deny and requires explicit trust', async (t) => {
  const root = await fixture(t, { config: true });
  let probesStarted = false;
  const runtimeLoader = async () => ({
    ok: true,
    runProbes: async () => {
      probesStarted = true;
      return { results: [], engines: [], skipped: [] };
    },
    runHarness: async () => ({
      results: [
        {
          ids: ['PWA-HARNESS-SELFTEST'],
          name: 'Harness fixture',
          outcome: 'PASS',
          findings: [],
          detail: 'test seam',
        },
      ],
    }),
  });

  const result = await runVerify(root, { runtimeLoader });
  const report = JSON.parse(result.json);
  assert.equal(probesStarted, false);
  assert.equal(report.status, 'BLOCKED');
  assert.equal(report.blocked, true);
  assert.equal(report.verification.diagnostics.at(-1).code, 'PROBE_CONFIG_LOAD_FAILED');
  assert.match(report.verification.diagnostics.at(-1).message, /refusing to execute/);
});

test('an unconfigured repository root is never exposed as an implicit static server', async (t) => {
  const root = await fixture(t);
  let probesStarted = false;
  const result = await runVerify(root, {
    runtimeLoader: async () => ({
      ok: true,
      runProbes: async () => {
        probesStarted = true;
        return { results: [], engines: [], skipped: [] };
      },
      runHarness: async () => ({
        results: [
          {
            ids: ['PWA-HARNESS-SELFTEST'],
            name: 'Harness fixture',
            outcome: 'PASS',
            findings: [],
            detail: 'test seam',
          },
        ],
      }),
    }),
  });
  const report = JSON.parse(result.json);
  assert.equal(probesStarted, false);
  assert.equal(report.status, 'BLOCKED');
  assert.match(
    report.verification.diagnostics.at(-1).message,
    /no runtime target configured/,
  );
});

test('empty runtime layers are BLOCKED rather than treated as a clean run', async (t) => {
  const root = await fixture(t, { config: true });
  const result = await runVerify(root, {
    allowConfigCode: true,
    runtimeLoader: async () => ({
      ok: true,
      runProbes: async () => ({ results: [], engines: [], skipped: [] }),
      runHarness: async () => ({ results: [] }),
    }),
  });
  const report = JSON.parse(result.json);
  assert.equal(report.status, 'BLOCKED');
  assert.deepEqual(
    report.verification.diagnostics.slice(-2).map((diagnostic) => diagnostic.code),
    ['PROBE_RUNTIME_FAILED', 'HARNESS_SELF_TEST_FAILED'],
  );
});

test('the audit wrapper preserves scanner diagnostics and exits 2 for a missing target', async (t) => {
  const root = await fixture(t);
  const missing = path.join(root, 'missing-repository');
  await mkdir(path.join(root, 'working-directory'));
  const script = path.join(repoRoot, 'skills', 'pwa-audit', 'scripts', 'run-audit.mjs');
  const result = spawnSync(process.execPath, [script, missing, '--json'], {
    cwd: path.join(root, 'working-directory'),
    encoding: 'utf8',
  });
  assert.equal(result.status, 2, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'BLOCKED');
  assert.equal(report.diagnostics[0].code, 'TARGET_NOT_FOUND');
});

test('audit and verify wrappers preserve zero coverage for unsupported source formats', async (t) => {
  const root = await unsupportedAstroFixture(t);
  const auditScript = path.join(repoRoot, 'skills', 'pwa-audit', 'scripts', 'run-audit.mjs');
  // This test is about COVERAGE honesty, not zoom policy — it only happens to use P-701 as
  // its subject. Pin it to `document` so the audit CLI's app-shell waiver cannot mask the
  // UNVERIFIED result this test exists to protect. App-policy behaviour is asserted below.
  const audit = spawnSync(process.execPath, [auditScript, root, '--json', '--policy', 'document'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(audit.status, 0, audit.stderr || audit.stdout);
  const auditReport = JSON.parse(audit.stdout);
  assert.equal(auditReport.coverage['P-701'], 0);
  assert.equal(auditReport.incompleteCoverage['P-701'], 1);
  assert.equal(auditReport.outcomes['P-701'], 'UNVERIFIED');

  const auditMarkdown = spawnSync(process.execPath, [auditScript, root, '--policy', 'document'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(auditMarkdown.status, 0, auditMarkdown.stderr || auditMarkdown.stdout);
  assert.match(auditMarkdown.stdout, /UNVERIFIED source coverage/);

  const verify = await runVerify(root, {
    runtimeLoader: async () => ({
      ok: false,
      diagnostic: { code: 'TEST_RUNTIME_BLOCKED', message: 'test seam' },
    }),
  });
  const verifyReport = JSON.parse(verify.json);
  assert.equal(verifyReport.coverage['P-701'], 0);
  assert.equal(verifyReport.incompleteCoverage['P-701'], 1);
  assert.equal(verifyReport.outcomes['P-701'], 'UNVERIFIED');
});

test('verify propagates target diagnostics and never probes a missing repository', async (t) => {
  const root = await fixture(t);
  let probesStarted = false;
  const result = await runVerify(path.join(root, 'missing-repository'), {
    runtimeLoader: async () => ({
      ok: true,
      runProbes: async () => {
        probesStarted = true;
        return { results: [], engines: [], skipped: [] };
      },
      runHarness: async () => ({ results: [] }),
    }),
  });
  const report = JSON.parse(result.json);
  assert.equal(probesStarted, false);
  assert.equal(report.status, 'BLOCKED');
  assert.equal(report.verification.status, 'BLOCKED');
  assert.equal(report.diagnostics[0].code, 'TARGET_NOT_FOUND');
  assert.equal(report.probes[0].outcome, 'BLOCKED');
});

test('the audit CLI waives app-shell zoom entries but never hides them', async (t) => {
  const root = await unsupportedAstroFixture(t);
  const auditScript = path.join(repoRoot, 'skills', 'pwa-audit', 'scripts', 'run-audit.mjs');

  const appRun = spawnSync(process.execPath, [auditScript, root, '--json'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(appRun.status, 0, appRun.stderr || appRun.stdout);
  const appReport = JSON.parse(appRun.stdout);

  // Default product surface is the app-shell policy.
  assert.equal(appReport.policy, 'app');
  assert.equal(appReport.outcomes['P-701'], 'N/A');
  assert.equal(appReport.outcomes['P-101'], 'N/A');

  // Waived, never silent: the waiver is reported with a reason for every exempt id.
  const waivedIds = appReport.policyExemptions.map((e) => e.id).sort();
  assert.deepEqual(waivedIds, ['P-101', 'P-701']);
  for (const exemption of appReport.policyExemptions) {
    assert.ok(exemption.reason && exemption.reason.length > 0, `${exemption.id} needs a reason`);
  }

  // And the markdown says so out loud, including how to turn it off.
  const appMarkdown = spawnSync(process.execPath, [auditScript, root], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(appMarkdown.status, 0, appMarkdown.stderr || appMarkdown.stdout);
  assert.match(appMarkdown.stdout, /Policy waivers/);
  assert.match(appMarkdown.stdout, /--policy document/);

  // The strict policy waives nothing.
  const docRun = spawnSync(process.execPath, [auditScript, root, '--json', '--policy', 'document'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(docRun.status, 0, docRun.stderr || docRun.stdout);
  const docReport = JSON.parse(docRun.stdout);
  assert.equal(docReport.policy, 'document');
  assert.deepEqual(docReport.policyExemptions, []);
  assert.notEqual(docReport.outcomes['P-701'], 'N/A');
});
