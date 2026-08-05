#!/usr/bin/env node
// pwa-verify entry point: static scan + runtime probes against <project-dir>, plus the
// deploy harness's bundled-fixture self-conformance check (see
// packages/deploy-harness/README.md — the harness is not yet wired to an arbitrary
// project's own build output; that gap is surfaced in the report, not hidden).
//
// This is the done-gate: exits non-zero on any FAIL or BLOCKED outcome. UNVERIFIED
// (device-only) entries never block completion — they are listed explicitly instead,
// per the project's central honesty rule.
import { existsSync, readFileSync } from 'node:fs';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

function resolvePackagesRoot() {
  const candidates = [
    // Installed layout: <skills>/.pwa-skill-suite/packages.
    path.resolve(scriptDir, '../../.pwa-skill-suite/packages'),
    // Repository development layout: <repo>/skills/pwa-verify/scripts.
    path.resolve(scriptDir, '../../../packages'),
  ];
  const resolved = candidates.find((candidate) =>
    existsSync(path.join(candidate, 'catalog', 'catalog.json')),
  );
  if (!resolved) {
    throw new Error(
      'pwa-verify runtime not found. Install the suite with install.sh so its shared runtime is available.',
    );
  }
  return resolved;
}

const packagesRoot = resolvePackagesRoot();
const fromRuntime = (relativePath) =>
  import(pathToFileURL(path.join(packagesRoot, relativePath)).href);

const [
  { runScan },
  { buildReport },
  { renderMarkdown },
  { renderJson },
  { loadConfig },
  { serveDir },
  { deviceOnlyResults },
  enginePolicy,
  probeReport,
  harnessReport,
] = await Promise.all([
  fromRuntime('scanner/cli.mjs'),
  fromRuntime('report/index.mjs'),
  fromRuntime('report/render-md.mjs'),
  fromRuntime('report/render-json.mjs'),
  fromRuntime('probes/lib/config.mjs'),
  fromRuntime('probes/lib/server.mjs'),
  fromRuntime('probes/lib/device-only.mjs'),
  fromRuntime('probes/lib/engine-policy.mjs'),
  fromRuntime('probes/report.mjs'),
  fromRuntime('deploy-harness/report.mjs'),
]);

const {
  assessEngineCoverage,
  DEFAULT_REQUIRED_ENGINES,
  engineCoverageBlockedResult,
} = enginePolicy;

const {
  collectFindings: collectProbeFindings,
  anyFailures: anyProbeFailures,
  renderProbeOutcomes,
  renderDeviceOnlyBlock,
} = probeReport;
const {
  anyFailures: anyHarnessFailures,
  renderHarnessOutcomes,
} = harnessReport;

const CATALOG_PATH = path.join(packagesRoot, 'catalog', 'catalog.json');

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function loadCatalog() {
  try {
    const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
    if (!Array.isArray(catalog) || catalog.length === 0) {
      throw new Error('catalog must be a non-empty JSON array');
    }
    return { catalog, diagnostic: null };
  } catch (error) {
    return {
      catalog: [],
      diagnostic: {
        code: 'CATALOG_LOAD_FAILED',
        path: CATALOG_PATH,
        message: `Could not load the verification catalog: ${messageOf(error)}`,
      },
    };
  }
}

function anyBlocked(results) {
  return results.some((r) => r.outcome === 'BLOCKED');
}

export const TARGET_DEPLOY_EVIDENCE = Object.freeze({
  outcome: 'UNVERIFIED',
  scope: 'target-repository',
  detail:
    'No provider-neutral A→B adapter is configured for this repository. The bundled fixture self-test below is not evidence about this app or its deployment.',
});

const TARGET_DEPLOY_EVIDENCE_BLOCK = [
  '## Target-repository deploy evidence',
  '',
  `**${TARGET_DEPLOY_EVIDENCE.outcome}:** ${TARGET_DEPLOY_EVIDENCE.detail}`,
  '',
].join('\n');

const HARNESS_SELF_TEST_SCOPE_NOTE = [
  '## Bundled deploy-harness self-test scope',
  '',
  'The table below comes from the suite-owned A→B fixture pair, **not** the target',
  'repository. It is a self-test proving the stale-code/version-skew checks still execute;',
  'its PASS rows are never added to the target report and never count as app evidence.',
  'See `packages/deploy-harness/README.md` for why (no static output to swap for SSR apps,',
  'and the skew assertions need seeded auth/storage state this project has not supplied).',
  '',
].join('\n');

function blockedLayer(ids, name, detail) {
  return { ids: [ids], name, outcome: 'BLOCKED', findings: [], detail };
}

function runtimeLoadDiagnostic(error) {
  const missingPlaywright =
    error &&
    typeof error === 'object' &&
    error.code === 'ERR_MODULE_NOT_FOUND' &&
    /(?:package\s+['"]?playwright|playwright)/i.test(messageOf(error));
  return {
    code: missingPlaywright ? 'PLAYWRIGHT_NOT_INSTALLED' : 'BROWSER_RUNTIME_LOAD_FAILED',
    message: missingPlaywright
      ? 'Playwright is not installed in the PWA Skill Suite runtime. Install its dependencies and browser engines, then rerun pwa-verify.'
      : `Could not load the browser verification runtime: ${messageOf(error)}`,
  };
}

/** Load browser-dependent modules lazily so a missing optional dependency is reportable. */
export async function loadBrowserRuntime(importer = fromRuntime) {
  try {
    const [{ runProbes }, { runHarness }] = await Promise.all([
      importer('probes/runner.mjs'),
      importer('deploy-harness/runner.mjs'),
    ]);
    return { ok: true, runProbes, runHarness };
  } catch (error) {
    return { ok: false, diagnostic: runtimeLoadDiagnostic(error) };
  }
}

/** Pure done-gate policy, exported so regressions cannot hide behind report bucketing. */
export function completionGate({
  scanBlocked = false,
  scanFindings = [],
  catalogBlocked = false,
  probeResults = [],
  engineCoverage = null,
  harnessSelfTestResults = [],
}) {
  return (
    scanBlocked ||
    catalogBlocked ||
    // Every emitted static finding blocks. Advisory confidence changes ranking, not truth.
    scanFindings.length > 0 ||
    engineCoverage?.status === 'BLOCKED' ||
    anyProbeFailures(probeResults) ||
    anyBlocked(probeResults) ||
    anyHarnessFailures(harnessSelfTestResults) ||
    anyBlocked(harnessSelfTestResults)
  );
}

function enginesNotRun(reason) {
  return assessEngineCoverage({
    expected: DEFAULT_REQUIRED_ENGINES,
    run: [],
    skipped: DEFAULT_REQUIRED_ENGINES.map((engine) => ({ engine, reason })),
  });
}

function normalizeRunnerEngineCoverage(result) {
  return assessEngineCoverage({
    // The combined gate owns its policy. A runner cannot narrow the required matrix by
    // reporting a self-selected expectation such as Chromium-only.
    expected: DEFAULT_REQUIRED_ENGINES,
    run: Array.isArray(result?.engines) ? result.engines : [],
    skipped: Array.isArray(result?.skipped) ? result.skipped : [],
  });
}

function renderVerificationHeader(status, diagnostics) {
  const lines = ['# PWA verification gate', '', `**Status:** ${status}`, ''];
  if (diagnostics.length) {
    lines.push('## Verification diagnostics', '');
    for (const diagnostic of diagnostics) {
      const location = diagnostic.path ? ` (${diagnostic.path})` : '';
      lines.push(`- \`${diagnostic.code}\`${location} — ${diagnostic.message}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function renderHarnessSelfTest(results) {
  return renderHarnessOutcomes(results).replace(
    '## Deploy harness results (A → B, single origin)',
    '## Bundled deploy-harness self-test results (suite fixtures only)',
  );
}

/**
 * @param {string} projectRoot
 * @param {{ runtimeLoader?: typeof loadBrowserRuntime, allowConfigCode?: boolean, allowExternalTargets?: boolean }} [options]
 * @returns {Promise<{ markdown: string, json: string, failed: boolean }>}
 */
export async function runVerify(
  projectRoot,
  {
    runtimeLoader = loadBrowserRuntime,
    allowConfigCode = false,
    allowExternalTargets = false,
  } = {},
) {
  const catalogResult = loadCatalog();
  const catalog = catalogResult.catalog;

  const {
    findings: scanFindings,
    surfaces,
    coverageById,
    incompleteCoverageById,
    blocked: scanBlocked,
    diagnostics: scanDiagnostics,
  } = await runScan(projectRoot, { detectSurfaces: true });

  const scannerDiagnostics = [...scanDiagnostics];
  if (catalogResult.diagnostic) scannerDiagnostics.push(catalogResult.diagnostic);
  const verificationDiagnostics = [...scannerDiagnostics];

  let probeResults = [];
  let probeEngines = [];
  let probeEngineCoverage = enginesNotRun('browser probes did not start');
  let harnessSelfTestResults = [];

  const runtime = await runtimeLoader();
  if (!runtime.ok) {
    verificationDiagnostics.push(runtime.diagnostic);
    probeResults = [
      blockedLayer('PWA-PROBES', 'Browser runtime probes', runtime.diagnostic.message),
    ];
    harnessSelfTestResults = [
      blockedLayer(
        'PWA-HARNESS-SELFTEST',
        'Bundled deploy-harness self-test',
        runtime.diagnostic.message,
      ),
    ];
    probeEngineCoverage = enginesNotRun(runtime.diagnostic.message);
  } else {
    let config = null;
    if (scanBlocked) {
      const reason =
        'runtime probes were not started because the target repository failed static validation';
      probeResults = [
        blockedLayer(
          'PWA-PROBES',
          'Browser runtime probes',
          `${reason}.`,
        ),
      ];
      probeEngineCoverage = enginesNotRun(reason);
    } else {
      try {
        config = await loadConfig(projectRoot, {
          allowExecutable: allowConfigCode,
          allowExternal: allowExternalTargets,
        });
      } catch (error) {
        const configPath = ['pwa-probes.config.json', 'pwa-probes.config.mjs']
          .map((name) => path.join(projectRoot, name))
          .find((candidate) => existsSync(candidate));
        const diagnostic = {
          code: 'PROBE_CONFIG_LOAD_FAILED',
          path: configPath ?? projectRoot,
          message: `Could not load the probe config: ${messageOf(error)}`,
        };
        verificationDiagnostics.push(diagnostic);
        probeResults = [blockedLayer('PWA-PROBES', 'Browser runtime probes', diagnostic.message)];
        probeEngineCoverage = enginesNotRun(diagnostic.message);
      }
    }

    if (config) {
      let server = null;
      try {
        if (!config.baseURL) {
          if (!config.staticRoot) {
            throw new Error(
              'no runtime target configured; set a local baseURL or an explicit contained staticRoot in pwa-probes.config.json',
            );
          }
          server = await serveDir(config.staticRoot);
          config.baseURL = server.url;
          config.target = 'source-dir';
          config.targetIsLocal = true;
        }
        const result = await runtime.runProbes({ config });
        probeEngines = Array.isArray(result?.engines) ? result.engines : [];
        probeEngineCoverage = normalizeRunnerEngineCoverage(result);
        if (!Array.isArray(result?.results) || result.results.length === 0) {
          throw new Error('probe runner returned no outcomes');
        }
        probeResults = [...result.results];
        if (probeEngineCoverage.status === 'BLOCKED') {
          const diagnostic = {
            code: 'REQUIRED_BROWSER_ENGINE_UNAVAILABLE',
            message: `Required browser engine coverage is incomplete: ${probeEngineCoverage.skipped
              .filter((item) => probeEngineCoverage.missing.includes(item.engine))
              .map((item) => `${item.engine} — ${item.reason}`)
              .join('; ')}`,
          };
          verificationDiagnostics.push(diagnostic);
          const runnerReportedBlock = probeResults.some((entry) =>
            entry?.ids?.includes('PWA-ENGINE-COVERAGE'),
          );
          if (!runnerReportedBlock) {
            probeResults.push(engineCoverageBlockedResult(probeEngineCoverage));
          }
        }
      } catch (error) {
        const diagnostic = {
          code: 'PROBE_RUNTIME_FAILED',
          message: `Browser probes could not complete: ${messageOf(error).split('\n')[0]}`,
        };
        verificationDiagnostics.push(diagnostic);
        probeResults = [blockedLayer('PWA-PROBES', 'Browser runtime probes', diagnostic.message)];
        probeEngines = [];
        probeEngineCoverage = enginesNotRun(diagnostic.message);
      } finally {
        if (server) await server.close();
      }
    }

    try {
      const harnessRun = await runtime.runHarness();
      if (!Array.isArray(harnessRun?.results) || harnessRun.results.length === 0) {
        throw new Error('bundled deploy-harness returned no outcomes');
      }
      harnessSelfTestResults = harnessRun.results;
    } catch (error) {
      const diagnostic = {
        code: 'HARNESS_SELF_TEST_FAILED',
        message: `Bundled deploy-harness self-test could not complete: ${messageOf(error).split('\n')[0]}`,
      };
      verificationDiagnostics.push(diagnostic);
      harnessSelfTestResults = [
        blockedLayer(
          'PWA-HARNESS-SELFTEST',
          'Bundled deploy-harness self-test',
          diagnostic.message,
        ),
      ];
    }
  }

  probeResults = [...probeResults, ...deviceOnlyResults(catalog)];
  const probeFindings = collectProbeFindings(probeResults);

  // Bundled harness findings belong to the suite's synthetic fixtures. Never merge them
  // into target findings or catalog outcomes.
  const allFindings = [...scanFindings, ...probeFindings];
  const model = buildReport({
    findings: allFindings,
    catalog,
    surfaces,
    coverageById,
    incompleteCoverageById,
    blocked: scanBlocked || Boolean(catalogResult.diagnostic),
    diagnostics: scannerDiagnostics,
  });

  const failed = completionGate({
    scanBlocked,
    scanFindings,
    catalogBlocked: Boolean(catalogResult.diagnostic),
    probeResults,
    engineCoverage: probeEngineCoverage,
    harnessSelfTestResults,
  });
  const blocked =
    scanBlocked ||
    Boolean(catalogResult.diagnostic) ||
    probeEngineCoverage.status === 'BLOCKED' ||
    anyBlocked(probeResults) ||
    anyBlocked(harnessSelfTestResults);
  const status = blocked ? 'BLOCKED' : failed ? 'FAIL' : 'PASS';

  const markdown = [
    renderVerificationHeader(status, verificationDiagnostics),
    renderMarkdown(model),
    renderProbeOutcomes(probeResults, {
      engines: probeEngines,
      skipped: probeEngineCoverage.skipped,
      engineCoverage: probeEngineCoverage,
    }),
    renderDeviceOnlyBlock(probeResults),
    TARGET_DEPLOY_EVIDENCE_BLOCK,
    HARNESS_SELF_TEST_SCOPE_NOTE,
    renderHarnessSelfTest(harnessSelfTestResults),
  ]
    .filter(Boolean)
    .join('\n');

  const verification = {
    status,
    failed,
    diagnostics: verificationDiagnostics,
    engineCoverage: probeEngineCoverage,
  };
  const json = JSON.stringify(
    {
      ...JSON.parse(renderJson(model)),
      // Verification status is the public top-level status. The nested audit renderer's
      // COMPLETE state covers only its static report model and must not mask runtime gates.
      status,
      blocked,
      verification,
      engineCoverage: probeEngineCoverage,
      probes: probeResults,
      targetDeployEvidence: TARGET_DEPLOY_EVIDENCE,
      harnessSelfTest: harnessSelfTestResults,
      failed,
    },
    null,
    2,
  );
  return {
    markdown,
    json,
    status,
    failed,
    probeResults,
    engineCoverage: probeEngineCoverage,
    targetDeployEvidence: TARGET_DEPLOY_EVIDENCE,
    harnessSelfTestResults,
  };
}

async function main(argv) {
  const unknownOption = argv.find(
    (arg) =>
      arg.startsWith('--') &&
      !['--json', '--allow-config-code', '--allow-external-targets'].includes(arg),
  );
  const args = argv.filter((a) => !a.startsWith('--'));
  if (unknownOption || args.length > 1) {
    if (unknownOption) console.error(`unknown option: ${unknownOption}`);
    else console.error(`unexpected argument: ${args[1]}`);
    console.error(
      'Usage: run-verify.mjs [project-dir] [--json] [--allow-config-code] [--allow-external-targets]',
    );
    process.exit(2);
  }
  const jsonFlag = argv.includes('--json');
  const allowConfigCode = argv.includes('--allow-config-code');
  const allowExternalTargets = argv.includes('--allow-external-targets');
  const dir = path.resolve(args[0] || process.cwd());

  const result = await runVerify(dir, { allowConfigCode, allowExternalTargets });
  console.log(jsonFlag ? result.json : result.markdown);
  // process.exit() terminates before Node flushes an async stdout write, so a report
  // larger than the pipe buffer (8 KiB on macOS) is silently truncated mid-token for any
  // caller capturing the output. Set the code and let the runtime exit once stdout drains.
  process.exitCode = result.status === 'BLOCKED' ? 2 : result.failed ? 1 : 0;
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
  main(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(2);
  });
}
