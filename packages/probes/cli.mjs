#!/usr/bin/env node
// Runtime probe CLI: `node packages/probes/cli.mjs <projectRoot> [--json]`
//
// Discovers pwa-probes.config.json under <projectRoot>. Executable config and non-local
// targets require explicit trust flags. If the config supplies no baseURL, it must name an
// explicit contained staticRoot (source-dir target). Findings render through the
// shared packages/report renderer; probe outcomes and the device-only block render here.
import { existsSync, readFileSync } from 'node:fs';
import { realpathSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig } from './lib/config.mjs';
import { serveDir } from './lib/server.mjs';
import { deviceOnlyResults } from './lib/device-only.mjs';
import { assessEngineCoverage, DEFAULT_REQUIRED_ENGINES } from './lib/engine-policy.mjs';
import { collectFindings, anyFailures, renderProbeOutcomes, renderDeviceOnlyBlock } from './report.mjs';
import { buildReport } from '../report/index.mjs';
import { renderMarkdown } from '../report/render-md.mjs';

const CATALOG_PATH = fileURLToPath(new URL('../catalog/catalog.json', import.meta.url));

function loadCatalog() {
  try {
    const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
    if (!Array.isArray(catalog) || catalog.length === 0) {
      throw new Error('catalog must be a non-empty JSON array');
    }
    return catalog;
  } catch (error) {
    throw blockedError(
      'CATALOG_LOAD_FAILED',
      `Could not load the probe catalog: ${messageOf(error)}`,
      { path: CATALOG_PATH, cause: error },
    );
  }
}

const USAGE =
  'Usage: cli.mjs [project-dir] [--json] [--allow-config-code] [--allow-external-targets]';

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function blockedError(code, message, { path: targetPath, cause } = {}) {
  const error = new Error(message, cause === undefined ? undefined : { cause });
  error.diagnostic = {
    code,
    ...(targetPath ? { path: targetPath } : {}),
    message,
  };
  return error;
}

function diagnosticOf(error) {
  if (
    error &&
    typeof error === 'object' &&
    error.diagnostic &&
    typeof error.diagnostic.code === 'string' &&
    typeof error.diagnostic.message === 'string'
  ) {
    return error.diagnostic;
  }
  return {
    code: 'PROBE_SUITE_FAILED',
    message: `Browser probes could not complete: ${messageOf(error).split('\n')[0]}`,
  };
}

function enginesNotRun(reason) {
  return assessEngineCoverage({
    expected: DEFAULT_REQUIRED_ENGINES,
    run: [],
    skipped: DEFAULT_REQUIRED_ENGINES.map((engine) => ({ engine, reason })),
  });
}

function blockedSuite(diagnostic) {
  const engineCoverage = enginesNotRun(diagnostic.message);
  const result = {
    ids: ['PWA-PROBES'],
    name: 'Browser runtime probes',
    outcome: 'BLOCKED',
    findings: [],
    detail: diagnostic.message,
    diagnostic,
  };
  return {
    status: 'BLOCKED',
    blocked: true,
    failed: true,
    diagnostics: [diagnostic],
    results: [result],
    engines: [],
    skipped: engineCoverage.skipped,
    engineCoverage,
  };
}

function suitePayload(suite) {
  return {
    status: suite.blocked ? 'BLOCKED' : suite.failed ? 'FAIL' : 'PASS',
    blocked: suite.blocked,
    failed: suite.failed,
    diagnostics: suite.diagnostics ?? [],
    results: suite.results,
    engines: suite.engines,
    skipped: suite.skipped,
    engineCoverage: suite.engineCoverage,
  };
}

function writeBlocked(diagnostic, { json }) {
  if (json) {
    console.log(JSON.stringify(blockedSuite(diagnostic), null, 2));
    return;
  }
  const location = diagnostic.path ? ` (${diagnostic.path})` : '';
  console.error(`BLOCKED [${diagnostic.code}]${location}: ${diagnostic.message}`);
}

async function validateProjectRoot(projectRoot) {
  try {
    const target = await stat(projectRoot);
    if (!target.isDirectory()) {
      throw blockedError('TARGET_NOT_DIRECTORY', 'Probe target must be a readable directory.', {
        path: projectRoot,
      });
    }
    await readdir(projectRoot);
  } catch (error) {
    if (error?.diagnostic) throw error;
    const notFound = error && typeof error === 'object' && error.code === 'ENOENT';
    throw blockedError(
      notFound ? 'TARGET_NOT_FOUND' : 'TARGET_UNREADABLE',
      notFound
        ? 'Probe target does not exist.'
        : `Probe target could not be read: ${messageOf(error)}`,
      { path: projectRoot, cause: error },
    );
  }
}

function discoveredConfigPath(projectRoot) {
  return ['pwa-probes.config.json', 'pwa-probes.config.mjs']
    .map((name) => path.join(projectRoot, name))
    .find((candidate) => existsSync(candidate));
}

/**
 * Run the probe suite against a project root, returning a rendered report and pass/fail.
 * @param {string} projectRoot
 * @returns {Promise<{ markdown: string, results: object[], engines: string[], skipped: object[], engineCoverage: object, diagnostics: object[], blocked: boolean, failed: boolean }>}
 */
export async function runProbeSuite(
  projectRoot,
  { allowConfigCode = false, allowExternalTargets = false } = {},
) {
  await validateProjectRoot(projectRoot);
  const catalog = loadCatalog();
  let config;
  try {
    config = await loadConfig(projectRoot, {
      allowExecutable: allowConfigCode,
      allowExternal: allowExternalTargets,
    });
  } catch (error) {
    throw blockedError(
      'PROBE_CONFIG_LOAD_FAILED',
      `Could not load the probe config: ${messageOf(error)}`,
      { path: discoveredConfigPath(projectRoot) ?? projectRoot, cause: error },
    );
  }
  let server = null;
  if (!config.baseURL) {
    if (!config.staticRoot) {
      throw blockedError(
        'RUNTIME_TARGET_NOT_CONFIGURED',
        'No runtime target is configured; set a local baseURL or an explicit contained staticRoot in pwa-probes.config.json.',
        { path: path.join(projectRoot, 'pwa-probes.config.json') },
      );
    }
    try {
      server = await serveDir(config.staticRoot);
    } catch (error) {
      throw blockedError(
        'PROBE_TARGET_START_FAILED',
        `Could not start the local probe target: ${messageOf(error).split('\n')[0]}`,
        { path: config.staticRoot, cause: error },
      );
    }
    config.baseURL = server.url;
    config.target = 'source-dir';
    config.targetIsLocal = true;
  }

  try {
    let runProbes;
    try {
      ({ runProbes } = await import('./runner.mjs'));
    } catch (error) {
      const missingPlaywright =
        error &&
        typeof error === 'object' &&
        error.code === 'ERR_MODULE_NOT_FOUND' &&
        /(?:package\s+['"]?playwright|playwright)/i.test(messageOf(error));
      throw blockedError(
        missingPlaywright ? 'PLAYWRIGHT_NOT_INSTALLED' : 'BROWSER_RUNTIME_LOAD_FAILED',
        missingPlaywright
          ? 'Playwright is not installed in the PWA Skill Suite runtime. Install its dependencies and browser engines, then rerun the probes.'
          : `Could not load the browser probe runtime: ${messageOf(error).split('\n')[0]}`,
        { cause: error },
      );
    }
    const { results, engines, skipped, engineCoverage } = await runProbes({ config });
    const all = [...results, ...deviceOnlyResults(catalog)];
    const findings = collectFindings(all);
    const model = buildReport({ findings, catalog });

    const markdown = [
      renderMarkdown(model),
      renderProbeOutcomes(all, { engines, skipped, engineCoverage }),
      renderDeviceOnlyBlock(all),
    ]
      .filter(Boolean)
      .join('\n');

    const blocked = all.some((result) => result.outcome === 'BLOCKED');
    const diagnostics = all
      .filter((result) => result.diagnostic)
      .map((result) => ({
        ...result.diagnostic,
        message: result.diagnostic.message ?? result.detail,
      }));
    return {
      markdown,
      results: all,
      engines,
      skipped,
      engineCoverage,
      blocked,
      failed: blocked || anyFailures(all),
      diagnostics,
    };
  } catch (error) {
    if (error?.diagnostic) throw error;
    throw blockedError(
      'PROBE_RUNTIME_FAILED',
      `Browser probes could not complete: ${messageOf(error).split('\n')[0]}`,
      { cause: error },
    );
  } finally {
    if (server) await server.close();
  }
}

export async function main(argv, { runSuite = runProbeSuite } = {}) {
  const allowed = new Set(['--json', '--allow-config-code', '--allow-external-targets']);
  const unknownOption = argv.find((arg) => arg.startsWith('--') && !allowed.has(arg));
  const args = argv.filter((a) => !a.startsWith('--'));
  const json = argv.includes('--json');
  if (unknownOption || args.length > 1) {
    const problem = unknownOption
      ? `Unknown option: ${unknownOption}.`
      : `Unexpected argument: ${args[1]}.`;
    writeBlocked(
      {
        code: 'CLI_ARGUMENT_ERROR',
        message: `${problem} ${USAGE}`,
      },
      { json },
    );
    return 2;
  }
  const projectRoot = path.resolve(args[0] || process.cwd());

  try {
    const suite = await runSuite(projectRoot, {
      allowConfigCode: argv.includes('--allow-config-code'),
      allowExternalTargets: argv.includes('--allow-external-targets'),
    });
    console.log(json ? JSON.stringify(suitePayload(suite), null, 2) : suite.markdown);
    return suite.blocked ? 2 : suite.failed ? 1 : 0;
  } catch (error) {
    writeBlocked(diagnosticOf(error), { json });
    return 2;
  }
}

// `import.meta.url === pathToFileURL(process.argv[1]).href` silently fails whenever any
// component of the path is a symlink: Node resolves import.meta.url to the REAL path while
// process.argv[1] keeps the symlinked one. On macOS os.tmpdir() lives under /var -> /private/var,
// so this entrypoint would load and exit 0 having done nothing. A silent exit 0 is the worst
// possible failure for a verification tool — it reads as "clean". Compare canonical paths.
function invokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  const argv = process.argv.slice(2);
  main(argv)
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      writeBlocked(
        {
          code: 'PROBE_CLI_CRASH',
          message: `Probe CLI crashed before it could complete: ${messageOf(error).split('\n')[0]}`,
        },
        { json: argv.includes('--json') },
      );
      process.exitCode = 2;
    });
}
