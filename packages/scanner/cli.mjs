#!/usr/bin/env node
// Scanner CLI: node cli.mjs <project-dir> [--json] [--baseline <file>]
//   [--write-baseline] [--ignore <repo-relative-glob>]
// Exposes runScan(dir, opts) for reuse by tests and skills. Failed traversal or
// rule execution is fail-closed: callers receive `blocked: true`, and the CLI
// emits a BLOCKED report with a non-zero exit status.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { walkFiles, compileIgnorePatterns } from './lib/walk.mjs';
import { loadRules } from './lib/registry.mjs';
import {
  isUnsupportedWebSource,
  isServiceWorkerPluginSurface,
} from './lib/applicability.mjs';
import { readBaseline, writeBaseline, partitionAgainstBaseline } from './lib/baseline.mjs';
import { buildReport } from '../report/index.mjs';
import { renderMarkdown } from '../report/render-md.mjs';
import { renderJson } from '../report/render-json.mjs';

const CATALOG_PATH = fileURLToPath(new URL('../catalog/catalog.json', import.meta.url));
const IGNORE_FILE_NAME = '.pwa-auditignore';
const BLOCKED_EXIT_CODE = 2;

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
        message: `Could not load the audit catalog: ${messageOf(error)}`,
      },
    };
  }
}

// Heuristic surface detection: does the audited app have forms / a service worker / RTL?
// Used by the report layer to mark whole sections N/A instead of failing them.
function detectSurfacesFromFile({ file, contents }, surfaces) {
  if (/<form[\s>]/i.test(contents) || /<input[\s>]/i.test(contents)) surfaces.forms = true;
  if (
    /(^|\/)(sw|service-worker)\.[jt]s$/i.test(file) ||
    /(?:navigator\s*\.\s*)?serviceWorker\s*\.\s*(?:register|ready)\b/.test(contents) ||
    isServiceWorkerPluginSurface({ file, contents })
  ) {
    surfaces['service-worker'] = true;
  }
  if (/dir\s*=\s*["']rtl["']/i.test(contents) || /\[dir[~=]/.test(contents)) surfaces.rtl = true;
  if (/manifest\.(json|webmanifest)$/i.test(file) || /rel=["']manifest["']/i.test(contents)) {
    surfaces.manifest = true;
  }
}

function emptySurfaces(enabled) {
  return enabled
    ? { forms: false, 'service-worker': false, rtl: false, manifest: false }
    : undefined;
}

async function validateTarget(rootDir) {
  try {
    const targetStat = await stat(rootDir);
    if (!targetStat.isDirectory()) {
      return {
        code: 'TARGET_NOT_DIRECTORY',
        path: rootDir,
        message: 'Audit target must be a readable directory.',
      };
    }
    // `stat` can succeed when directory listing is denied. Probe the actual
    // operation the walker needs so an unreadable root cannot look clean.
    await readdir(rootDir);
    return null;
  } catch (error) {
    const notFound = error && typeof error === 'object' && error.code === 'ENOENT';
    return {
      code: notFound ? 'TARGET_NOT_FOUND' : 'TARGET_UNREADABLE',
      path: rootDir,
      message: notFound
        ? 'Audit target does not exist.'
        : `Audit target could not be read: ${messageOf(error)}`,
    };
  }
}

async function readIgnoreFile(rootDir, ignoreFileName) {
  if (!ignoreFileName) return { patterns: [], diagnostic: null };
  const ignorePath = join(rootDir, ignoreFileName);
  try {
    const text = await readFile(ignorePath, 'utf8');
    return { patterns: text.split(/\r?\n/), diagnostic: null };
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return { patterns: [], diagnostic: null };
    }
    return {
      patterns: [],
      diagnostic: {
        code: 'IGNORE_FILE_READ_FAILED',
        path: ignorePath,
        message: `Could not read ${ignoreFileName}: ${messageOf(error)}`,
      },
    };
  }
}

function ruleName(rule) {
  const ids = Array.isArray(rule?.ids) ? rule.ids.join(', ') : 'unknown id';
  return rule?.slug ? `${rule.slug} (${ids})` : ids;
}

/**
 * Run the static scan.
 *
 * `ignorePatterns` are combined with a root-level `.pwa-auditignore`.
 * `rules` is an injection seam for embedders and fail-closed tests; normal
 * callers use the registry.
 */
export async function runScan(
  dir,
  {
    detectSurfaces = false,
    ignorePatterns = [],
    ignoreFileName = IGNORE_FILE_NAME,
    rules: suppliedRules,
  } = {},
) {
  const rootDir = resolve(dir);
  const findings = [];
  const diagnostics = [];
  const surfaces = emptySurfaces(detectSurfaces);
  const coverageById = {};
  const incompleteCoverageById = {};
  let filesScanned = 0;

  const targetDiagnostic = await validateTarget(rootDir);
  if (targetDiagnostic) {
    diagnostics.push(targetDiagnostic);
    return {
      findings,
      surfaces,
      coverageById,
      incompleteCoverageById,
      blocked: true,
      diagnostics,
      filesScanned,
    };
  }

  const ignoreFile = await readIgnoreFile(rootDir, ignoreFileName);
  if (ignoreFile.diagnostic) diagnostics.push(ignoreFile.diagnostic);

  let compiledIgnores;
  try {
    compiledIgnores = compileIgnorePatterns(ignoreFile.patterns);
  } catch (error) {
    diagnostics.push({
      code: 'IGNORE_PATTERN_INVALID',
      path: join(rootDir, ignoreFileName),
      message: `Invalid pattern in ${ignoreFileName}: ${messageOf(error)}`,
    });
    return {
      findings,
      surfaces,
      coverageById,
      incompleteCoverageById,
      blocked: true,
      diagnostics,
      filesScanned,
    };
  }
  try {
    compiledIgnores.push(...compileIgnorePatterns(ignorePatterns));
  } catch (error) {
    diagnostics.push({
      code: 'IGNORE_PATTERN_INVALID',
      message: `Invalid --ignore pattern: ${messageOf(error)}`,
    });
    return {
      findings,
      surfaces,
      coverageById,
      incompleteCoverageById,
      blocked: true,
      diagnostics,
      filesScanned,
    };
  }

  let rules;
  try {
    rules = suppliedRules ?? (await loadRules());
    if (!Array.isArray(rules) || rules.length === 0) {
      throw new Error('no scanner rules were loaded');
    }
    for (const rule of rules) {
      if (!Array.isArray(rule?.ids) || rule.ids.length === 0) {
        throw new Error('every scanner rule must declare a non-empty ids array');
      }
      if (typeof rule.appliesTo !== 'function') {
        throw new Error(`rule ${ruleName(rule)} must declare an appliesTo function`);
      }
      if (rule.relevantTo != null && typeof rule.relevantTo !== 'function') {
        throw new Error(`rule ${ruleName(rule)} relevantTo must be a function when supplied`);
      }
      if (rule.coverageComplete != null && typeof rule.coverageComplete !== 'function') {
        throw new Error(`rule ${ruleName(rule)} coverageComplete must be a function when supplied`);
      }
      if (typeof rule.check !== 'function') {
        throw new Error(`rule ${ruleName(rule)} must declare a check function`);
      }
      for (const id of rule.ids) {
        coverageById[id] = 0;
        incompleteCoverageById[id] = 0;
      }
    }
  } catch (error) {
    diagnostics.push({
      code: 'RULESET_LOAD_FAILED',
      message: `Could not load scanner rules: ${messageOf(error)}`,
    });
    return {
      findings,
      surfaces,
      coverageById,
      incompleteCoverageById,
      blocked: true,
      diagnostics,
      filesScanned,
    };
  }

  const traversalDiagnostic = (diagnostic) => diagnostics.push(diagnostic);
  const scannedFiles = [];
  for await (const fileObj of walkFiles(rootDir, {
    ignorePatterns: compiledIgnores,
    onError: traversalDiagnostic,
  })) {
    filesScanned += 1;
    scannedFiles.push(fileObj);
    if (detectSurfaces) detectSurfacesFromFile(fileObj, surfaces);
  }

  // Evaluate only after traversal completes. Aggregate rules such as P-563 must
  // see the same complete, ignore-aware file set as every other scanner rule;
  // they must not independently walk generated or explicitly ignored trees.
  for (const fileObj of scannedFiles) {
    for (const rule of rules) {
      try {
        const applicable = await rule.appliesTo(fileObj);
        if (typeof applicable !== 'boolean') {
          throw new TypeError(`appliesTo returned ${typeof applicable}; expected a boolean`);
        }
        if (!applicable) {
          // Most browser-facing rules treat a known-but-unsupported template as
          // potentially relevant. Narrow service-worker/config rules can export
          // `relevantTo` to prove that such a file cannot contain their concern.
          const relevant = rule.relevantTo
            ? await rule.relevantTo(fileObj)
            : isUnsupportedWebSource(fileObj);
          if (typeof relevant !== 'boolean') {
            throw new TypeError(`relevantTo returned ${typeof relevant}; expected a boolean`);
          }
          if (relevant) {
            for (const id of rule.ids) incompleteCoverageById[id] += 1;
          }
          continue;
        }
        for (const id of rule.ids) coverageById[id] += 1;
        if (rule.coverageComplete) {
          const complete = await rule.coverageComplete(fileObj);
          if (typeof complete !== 'boolean') {
            throw new TypeError(`coverageComplete returned ${typeof complete}; expected a boolean`);
          }
          if (!complete) {
            for (const id of rule.ids) incompleteCoverageById[id] += 1;
          }
        }
        const results = (await rule.check(fileObj, { scannedFiles })) ?? [];
        if (!Array.isArray(results)) {
          throw new TypeError(`rule returned ${typeof results}; expected an array`);
        }
        for (const result of results) findings.push(result);
      } catch (error) {
        diagnostics.push({
          code: 'RULE_EXECUTION_FAILED',
          path: fileObj.file,
          rule: ruleName(rule),
          message: `Rule ${ruleName(rule)} failed for ${fileObj.file}: ${messageOf(error)}`,
        });
      }
    }
  }

  findings.sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.id.localeCompare(b.id),
  );
  return {
    findings,
    surfaces,
    coverageById,
    incompleteCoverageById,
    blocked: diagnostics.length > 0,
    diagnostics,
    filesScanned,
  };
}

function parseArgs(argv) {
  const opts = {
    json: false,
    baseline: null,
    writeBaseline: false,
    dir: null,
    ignorePatterns: [],
    error: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') opts.json = true;
    else if (arg === '--write-baseline') opts.writeBaseline = true;
    else if (arg === '--baseline' || arg === '--ignore') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) {
        opts.error = `${arg} requires a value`;
        break;
      }
      if (arg === '--baseline') opts.baseline = value;
      else opts.ignorePatterns.push(value);
    } else if (arg.startsWith('--ignore=')) {
      const value = arg.slice('--ignore='.length);
      if (!value) opts.error = '--ignore requires a value';
      else opts.ignorePatterns.push(value);
    } else if (arg.startsWith('--')) {
      opts.error = `unknown option: ${arg}`;
      break;
    } else if (!opts.dir) opts.dir = arg;
    else {
      opts.error = `unexpected argument: ${arg}`;
      break;
    }
  }
  return opts;
}

function usage() {
  return 'Usage: cli.mjs <project-dir> [--json] [--baseline <file>] [--write-baseline] [--ignore <glob>]';
}

export async function main(argv) {
  const opts = parseArgs(argv);
  if (!opts.dir || opts.error) {
    console.error(opts.error || usage());
    if (opts.error) console.error(usage());
    return 1;
  }

  let scan = await runScan(opts.dir, {
    detectSurfaces: true,
    ignorePatterns: opts.ignorePatterns,
  });
  scan.baselinedFindings = [];

  if (scan.blocked) {
    // A partial scan is evidence, but it is never a safe baseline.
    if (opts.writeBaseline) {
      scan.diagnostics.push({
        code: 'BASELINE_WRITE_BLOCKED',
        message: 'Refusing to write a baseline from an incomplete audit.',
      });
    }
  } else if (opts.writeBaseline && opts.baseline) {
    writeBaseline(opts.baseline, scan.findings);
    console.log(`Wrote ${scan.findings.length} findings to baseline ${opts.baseline}`);
    return 0;
  }

  if (!scan.blocked && opts.baseline) {
    try {
      const partition = partitionAgainstBaseline(scan.findings, readBaseline(opts.baseline));
      scan = {
        ...scan,
        findings: partition.findings,
        baselinedFindings: partition.baselinedFindings,
      };
    } catch (error) {
      scan.blocked = true;
      scan.diagnostics.push({
        code: 'BASELINE_READ_FAILED',
        path: opts.baseline,
        message: `Could not read baseline: ${messageOf(error)}`,
      });
    }
  }

  const catalogResult = loadCatalog();
  if (catalogResult.diagnostic) {
    scan.blocked = true;
    scan.diagnostics.push(catalogResult.diagnostic);
  }
  const report = buildReport({
    findings: scan.findings,
    baselinedFindings: scan.baselinedFindings,
    catalog: catalogResult.catalog,
    surfaces: scan.surfaces,
    coverageById: scan.coverageById,
    incompleteCoverageById: scan.incompleteCoverageById,
    blocked: scan.blocked,
    diagnostics: scan.diagnostics,
  });
  console.log(opts.json ? renderJson(report) : renderMarkdown(report));
  return scan.blocked ? BLOCKED_EXIT_CODE : 0;
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
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`BLOCKED: scanner crashed: ${messageOf(error)}`);
      process.exit(BLOCKED_EXIT_CODE);
    });
}
