#!/usr/bin/env node
// pwa-verify entry point: static scan + runtime probes against <project-dir>, plus the
// deploy harness's bundled-fixture self-conformance check (see
// packages/deploy-harness/README.md — the harness is not yet wired to an arbitrary
// project's own build output; that gap is surfaced in the report, not hidden).
//
// This is the done-gate: exits non-zero on any FAIL or BLOCKED outcome. UNVERIFIED
// (device-only) entries never block completion — they are listed explicitly instead,
// per the project's central honesty rule.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScan } from '../../../packages/scanner/cli.mjs';
import { buildReport } from '../../../packages/report/index.mjs';
import { renderMarkdown } from '../../../packages/report/render-md.mjs';
import { renderJson } from '../../../packages/report/render-json.mjs';
import { loadConfig } from '../../../packages/probes/lib/config.mjs';
import { serveDir } from '../../../packages/probes/lib/server.mjs';
import { runProbes } from '../../../packages/probes/runner.mjs';
import { deviceOnlyResults } from '../../../packages/probes/lib/device-only.mjs';
import {
  collectFindings as collectProbeFindings,
  anyFailures as anyProbeFailures,
  renderProbeOutcomes,
  renderDeviceOnlyBlock,
} from '../../../packages/probes/report.mjs';
import { runHarness } from '../../../packages/deploy-harness/runner.mjs';
import {
  collectFindings as collectHarnessFindings,
  renderHarnessOutcomes,
} from '../../../packages/deploy-harness/report.mjs';

const CATALOG_PATH = fileURLToPath(new URL('../../../packages/catalog/catalog.json', import.meta.url));

function loadCatalog() {
  try {
    return JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function anyBlocked(results) {
  return results.some((r) => r.outcome === 'BLOCKED');
}

const HARNESS_SCOPE_NOTE = [
  '## Deploy harness scope',
  '',
  "The deploy harness below ran its bundled A→B fixture pair, **not** this project's own",
  'build output — it is a self-conformance check proving the 11 stale-code/version-skew',
  'assertions still fire correctly, not a verification of *this* app across a real deploy.',
  'See `packages/deploy-harness/README.md` for why (no static output to swap for SSR apps,',
  'and the skew assertions need seeded auth/storage state this project has not supplied).',
  'Treat its outcomes as "the harness works", not "this app is safe to deploy".',
  '',
].join('\n');

/**
 * @param {string} projectRoot
 * @returns {Promise<{ markdown: string, json: string, failed: boolean }>}
 */
export async function runVerify(projectRoot) {
  const catalog = loadCatalog();

  const { findings: scanFindings, surfaces } = await runScan(projectRoot, { detectSurfaces: true });

  const config = await loadConfig(projectRoot);
  let server = null;
  if (!config.baseURL) {
    server = await serveDir(projectRoot);
    config.baseURL = server.url;
    config.target = 'source-dir';
    config.targetIsLocal = true;
  }
  let probeResults = [];
  let probeEngines = [];
  let probeSkipped = [];
  try {
    const r = await runProbes({ config });
    probeResults = [...r.results, ...deviceOnlyResults(catalog)];
    probeEngines = r.engines;
    probeSkipped = r.skipped;
  } finally {
    if (server) await server.close();
  }
  const probeFindings = collectProbeFindings(probeResults);

  const { results: harnessResults } = await runHarness();
  const harnessFindings = collectHarnessFindings(harnessResults);

  const allFindings = [...scanFindings, ...probeFindings, ...harnessFindings];
  const model = buildReport({ findings: allFindings, catalog, surfaces });

  const failed =
    model.summary.p0 + model.summary.p1 + model.summary.p2 > 0 ||
    anyProbeFailures(probeResults) ||
    anyBlocked(probeResults) ||
    anyBlocked(harnessResults);

  const markdown = [
    renderMarkdown(model),
    renderProbeOutcomes(probeResults, { engines: probeEngines, skipped: probeSkipped }),
    renderDeviceOnlyBlock(probeResults),
    HARNESS_SCOPE_NOTE,
    renderHarnessOutcomes(harnessResults),
  ]
    .filter(Boolean)
    .join('\n');

  const json = JSON.stringify(
    { ...JSON.parse(renderJson(model)), probes: probeResults, harness: harnessResults, failed },
    null,
    2,
  );
  return { markdown, json, failed, probeResults, harnessResults };
}

async function main(argv) {
  const args = argv.filter((a) => !a.startsWith('--'));
  const jsonFlag = argv.includes('--json');
  const dir = path.resolve(args[0] || process.cwd());

  const result = await runVerify(dir);
  console.log(jsonFlag ? result.json : result.markdown);
  process.exit(result.failed ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(2);
  });
}
