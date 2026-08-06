#!/usr/bin/env node
// Read-only PWA audit entry point. Runs the static scanner over <project-dir>, builds the
// graded report, and prints it. Never opens a write handle against the audited project.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

function resolvePackagesRoot() {
  const candidates = [
    // Installed layout: <skills>/.pwa-skill-suite/packages.
    path.resolve(scriptDir, '../../.pwa-skill-suite/packages'),
    // Repository development layout: <repo>/skills/pwa-audit/scripts.
    path.resolve(scriptDir, '../../../packages'),
  ];
  const resolved = candidates.find((candidate) =>
    existsSync(path.join(candidate, 'catalog', 'catalog.json')),
  );
  if (!resolved) {
    throw new Error(
      'pwa-audit runtime not found. Install the suite with install.sh so its shared runtime is available.',
    );
  }
  return resolved;
}

const packagesRoot = resolvePackagesRoot();
const fromRuntime = (relativePath) =>
  import(pathToFileURL(path.join(packagesRoot, relativePath)).href);
const [{ runScan }, { buildReport }, { renderMarkdown }, { renderJson }] = await Promise.all([
  fromRuntime('scanner/cli.mjs'),
  fromRuntime('report/index.mjs'),
  fromRuntime('report/render-md.mjs'),
  fromRuntime('report/render-json.mjs'),
]);

function parseArgs(argv) {
  const parsed = { dir: null, json: false, ignorePatterns: [], error: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') parsed.json = true;
    else if (arg === '--ignore') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) parsed.error = '--ignore requires a glob';
      else parsed.ignorePatterns.push(value);
    } else if (arg.startsWith('--ignore=')) {
      const value = arg.slice('--ignore='.length);
      if (!value) parsed.error = '--ignore requires a glob';
      else parsed.ignorePatterns.push(value);
    } else if (arg === '--policy') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) parsed.error = '--policy requires app|document';
      else parsed.policy = value;
    } else if (arg.startsWith('--policy=')) {
      const value = arg.slice('--policy='.length);
      if (!value) parsed.error = '--policy requires app|document';
      else parsed.policy = value;
    } else if (arg.startsWith('--')) parsed.error = `unknown option: ${arg}`;
    else if (!parsed.dir) parsed.dir = arg;
    else parsed.error = `unexpected argument: ${arg}`;
    if (parsed.error) break;
  }
  return parsed;
}

const args = parseArgs(process.argv.slice(2));
// Validate here rather than letting normalizePolicy throw from inside buildReport: a
// mistyped flag should print usage, not a stack trace from three packages away.
if (!args.error && args.policy != null && !['app', 'document'].includes(String(args.policy).toLowerCase())) {
  args.error = `--policy must be app or document (got "${args.policy}")`;
}
if (!args.dir || args.error) {
  if (args.error) console.error(args.error);
  console.error('Usage: run-audit.mjs <project-dir> [--json] [--ignore <glob>] [--policy app|document]');
  process.exit(1);
}

const scan = await runScan(args.dir, {
  detectSurfaces: true,
  ignorePatterns: args.ignorePatterns,
});
let catalog = [];
try {
  catalog = JSON.parse(
    readFileSync(path.join(packagesRoot, 'catalog', 'catalog.json'), 'utf8'),
  );
  if (!Array.isArray(catalog) || catalog.length === 0) {
    throw new Error('catalog must be a non-empty JSON array');
  }
} catch (error) {
  scan.blocked = true;
  scan.diagnostics.push({
    code: 'CATALOG_LOAD_FAILED',
    path: path.join(packagesRoot, 'catalog', 'catalog.json'),
    message: `Could not load the audit catalog: ${error instanceof Error ? error.message : String(error)}`,
  });
}
const report = buildReport({
  findings: scan.findings,
  catalog,
  surfaces: scan.surfaces,
  coverageById: scan.coverageById,
  incompleteCoverageById: scan.incompleteCoverageById,
  blocked: scan.blocked,
  diagnostics: scan.diagnostics,
  // This suite audits PWAs, so the app-shell policy is the product default here.
  // The waiver is always rendered; `--policy document` restores full WCAG strictness.
  policy: args.policy ?? 'app',
});
console.log(args.json ? renderJson(report) : renderMarkdown(report));
if (scan.blocked) process.exitCode = 2;
