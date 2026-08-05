import assert from 'node:assert/strict';
import {
  access,
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const installer = path.join(repoRoot, 'install.sh');

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    ...options,
  });
}

test('an explicit destination installs a self-contained audit skill', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'pwa skill suite install-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const skillsDir = path.join(root, 'skills');
  const fixtureDir = path.join(root, 'unrelated-project');
  const linkedInstaller = path.join(root, 'installer link.sh');
  await symlink(installer, linkedInstaller);
  await mkdir(fixtureDir);
  await writeFile(
    path.join(fixtureDir, 'index.html'),
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fixture</title>',
  );

  const installEnv = { ...process.env };
  delete installEnv.HOME;
  delete installEnv.CLAUDE_HOME;
  delete installEnv.CLAUDE_SKILLS_DIR;
  const installed = run('bash', [linkedInstaller, '--dest', skillsDir], {
    cwd: root,
    env: installEnv,
  });
  assert.equal(installed.status, 0, installed.stderr || installed.stdout);
  assert.match(installed.stdout, /npm ci --prefix/);
  assert.match(installed.stdout, /playwright install chromium webkit/);
  assert.match(
    await readFile(
      path.join(skillsDir, '.pwa-skill-suite', 'packages', 'catalog', 'catalog.json'),
      'utf8',
    ),
    /"P-101"/,
  );
  const installedRuntime = path.join(skillsDir, '.pwa-skill-suite');
  const installedPackage = JSON.parse(
    await readFile(path.join(installedRuntime, 'package.json'), 'utf8'),
  );
  assert.ok(installedPackage.dependencies.playwright);
  assert.equal(
    installedPackage.scripts.verify,
    'node ../pwa-verify/scripts/run-verify.mjs',
  );
  assert.match(
    await readFile(path.join(skillsDir, '.pwa-skill-suite', 'package-lock.json'), 'utf8'),
    /"lockfileVersion"/,
  );
  assert.match(
    await readFile(
      path.join(
        skillsDir,
        'pwa-convert',
        'references',
        'catalog-ownership.json',
      ),
      'utf8',
    ),
    /"service-worker": "pwa-offline"/,
  );

  const packageVerify = run(
    'npm',
    [
      '--silent',
      '--prefix',
      installedRuntime,
      'run',
      'verify',
      '--',
      path.join(root, 'missing-project-via-package-script'),
      '--json',
    ],
    { cwd: fixtureDir },
  );
  assert.equal(packageVerify.status, 2, packageVerify.stderr || packageVerify.stdout);
  assert.equal(JSON.parse(packageVerify.stdout).status, 'BLOCKED');

  // A sibling checkout-looking path must never shadow the installed runtime. This models
  // ~/.codex/packages (or any parent workspace) containing an unrelated catalog.
  const decoyCatalogDir = path.join(root, 'packages', 'catalog');
  await mkdir(decoyCatalogDir, { recursive: true });
  await writeFile(path.join(decoyCatalogDir, 'catalog.json'), '[]');

  const auditScript = path.join(skillsDir, 'pwa-audit', 'scripts', 'run-audit.mjs');
  const audited = run(process.execPath, [auditScript, fixtureDir, '--json'], { cwd: fixtureDir });
  assert.equal(audited.status, 0, audited.stderr || audited.stdout);

  const report = JSON.parse(audited.stdout);
  assert.equal(report.status, 'COMPLETE');
  assert.equal(report.summary.p0, 0);
  assert.equal(report.outcomes['P-102'], 'PASS');

  const blockedAudit = run(
    process.execPath,
    [auditScript, path.join(root, 'missing-project'), '--json'],
    { cwd: fixtureDir },
  );
  assert.equal(blockedAudit.status, 2, blockedAudit.stderr || blockedAudit.stdout);
  const blockedReport = JSON.parse(blockedAudit.stdout);
  assert.equal(blockedReport.status, 'BLOCKED');
  assert.equal(blockedReport.diagnostics[0].code, 'TARGET_NOT_FOUND');

  // Execute the installed CLI from a path containing spaces. A raw `file://${argv[1]}`
  // comparison silently skipped main here; a real file URL must return structured output.
  const canonicalSkillsDir = await realpath(skillsDir);
  const verifyScript = path.join(
    canonicalSkillsDir,
    'pwa-verify',
    'scripts',
    'run-verify.mjs',
  );
  const blockedVerify = run(
    process.execPath,
    [verifyScript, path.join(root, 'missing-project'), '--json'],
    { cwd: fixtureDir },
  );
  assert.equal(blockedVerify.status, 2, blockedVerify.stderr || blockedVerify.stdout);
  const verifyReport = JSON.parse(blockedVerify.stdout);
  assert.equal(verifyReport.status, 'BLOCKED');
  assert.equal(verifyReport.blocked, true);
  assert.equal(verifyReport.verification.status, 'BLOCKED');
  assert.ok(
    verifyReport.verification.diagnostics.some(
      ({ code }) => code === 'TARGET_NOT_FOUND' || code === 'PLAYWRIGHT_NOT_INSTALLED',
    ),
  );

  // Model an already-enabled browser runtime. A compatible reinstall must carry the
  // dependency tree forward instead of silently disabling the installed verifier.
  const playwrightDir = path.join(
    skillsDir,
    '.pwa-skill-suite',
    'node_modules',
    'playwright',
  );
  await mkdir(playwrightDir, { recursive: true });
  await writeFile(
    path.join(playwrightDir, 'package.json'),
    JSON.stringify({ name: 'playwright', type: 'module', exports: './index.mjs' }),
  );
  await writeFile(
    path.join(playwrightDir, 'index.mjs'),
    'export const chromium = {}; export const webkit = {};',
  );
  await writeFile(path.join(playwrightDir, 'preserved-marker.txt'), 'keep dependencies');

  const unrelatedPath = path.join(skillsDir, 'my-unrelated-skill.txt');
  const staleInstalledPath = path.join(skillsDir, 'pwa-audit', 'stale-from-old-install.txt');
  await writeFile(unrelatedPath, 'keep me');
  await writeFile(staleInstalledPath, 'replace me');
  const reinstalled = run('bash', [linkedInstaller, '--dest', skillsDir], {
    cwd: root,
    env: installEnv,
  });
  assert.equal(reinstalled.status, 0, reinstalled.stderr || reinstalled.stdout);
  assert.match(reinstalled.stdout, /Preserved compatible browser verification dependencies/);
  assert.equal(await readFile(unrelatedPath, 'utf8'), 'keep me');
  assert.equal(
    await readFile(path.join(playwrightDir, 'preserved-marker.txt'), 'utf8'),
    'keep dependencies',
  );
  await assert.rejects(access(staleInstalledPath));
  assert.equal(
    (await readdir(skillsDir)).some((entry) => entry.startsWith('.pwa-skill-suite.install.')),
    false,
  );

  const developmentAudit = run(
    process.execPath,
    [path.join(repoRoot, 'skills', 'pwa-audit', 'scripts', 'run-audit.mjs'), fixtureDir, '--json'],
    { cwd: fixtureDir },
  );
  assert.equal(developmentAudit.status, 0, developmentAudit.stderr || developmentAudit.stdout);
  assert.deepEqual(JSON.parse(developmentAudit.stdout).summary, report.summary);
});

test('a destination-scoped atomic lock rejects an overlapping install', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'pwa-skill-suite-lock-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const skillsDir = path.join(root, 'skills');
  const lockDir = path.join(skillsDir, '.pwa-skill-suite.install.lock');
  const unrelatedPath = path.join(skillsDir, 'unrelated.txt');
  await mkdir(lockDir, { recursive: true });
  await writeFile(path.join(lockDir, 'pid'), '424242\n');
  await writeFile(unrelatedPath, 'untouched');

  const result = run('bash', [installer, '--dest', skillsDir]);
  assert.equal(result.status, 3, result.stderr || result.stdout);
  assert.match(result.stderr, /another install is already using/);
  assert.match(result.stderr, /424242/);
  assert.equal(await readFile(unrelatedPath, 'utf8'), 'untouched');
  assert.equal(await readFile(path.join(lockDir, 'pid'), 'utf8'), '424242\n');
  await assert.rejects(access(path.join(skillsDir, '.pwa-skill-suite')));
});

test('a failed restore preserves the only backup and reports its recovery path', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'pwa-skill-suite-recovery-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const skillsDir = path.join(root, 'skills');
  const first = run('bash', [installer, '--dest', skillsDir]);
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const originalMarker = path.join(skillsDir, '.pwa-skill-suite', 'original-marker.txt');
  await writeFile(originalMarker, 'recover me');

  const fakeBin = path.join(root, 'fake-bin');
  const fakeMv = path.join(fakeBin, 'mv');
  await mkdir(fakeBin);
  await writeFile(
    fakeMv,
    [
      '#!/bin/sh',
      "case \"$1\" in",
      "  */new-skills/pwa-a11y) exit 71 ;;",
      "  */backups/runtime) exit 72 ;;",
      'esac',
      'exec /bin/mv "$@"',
      '',
    ].join('\n'),
  );
  await chmod(fakeMv, 0o755);

  const failed = run('bash', [installer, '--dest', skillsDir], {
    env: { ...process.env, PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` },
  });
  assert.notEqual(failed.status, 0, failed.stdout);
  assert.match(failed.stderr, /ROLLBACK FAILED/);
  assert.match(failed.stderr, /original backups remain at/);

  const entries = await readdir(skillsDir);
  const recoveryName = entries.find((entry) => entry.startsWith('.pwa-skill-suite.install.'));
  assert.ok(recoveryName, `expected recovery directory in: ${entries.join(', ')}`);
  const recoveryDir = path.join(skillsDir, recoveryName);
  assert.equal(
    await readFile(path.join(recoveryDir, 'backups', 'runtime', 'original-marker.txt'), 'utf8'),
    'recover me',
  );
  await assert.rejects(access(path.join(skillsDir, '.pwa-skill-suite.install.lock')));
});

test('Claude and Codex targets resolve without depending on a project repository', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'pwa-skill-suite-targets-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const env = { ...process.env };
  // Do not let the developer machine's more-specific variables override the values this
  // test is intended to exercise.
  delete env.CLAUDE_HOME;
  delete env.CODEX_SKILLS_DIR;
  delete env.CODEX_HOME;
  env.CLAUDE_SKILLS_DIR = path.join(root, 'claude-skills');
  env.CODEX_HOME = path.join(root, 'codex-home');

  const claude = run('bash', [installer, '--target', 'claude', '--dry-run'], { env });
  assert.equal(claude.status, 0, claude.stderr || claude.stdout);
  assert.match(
    claude.stdout,
    new RegExp(path.join(root, 'claude-skills').replaceAll('\\', '\\\\')),
  );

  const codex = run('bash', [installer, '--target', 'codex', '--dry-run'], { env });
  assert.equal(codex.status, 0, codex.stderr || codex.stdout);
  assert.match(
    codex.stdout,
    new RegExp(path.join(root, 'codex-home', 'skills').replaceAll('\\', '\\\\')),
  );
});
