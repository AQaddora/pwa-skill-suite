#!/usr/bin/env node
// Runtime probe CLI: `node packages/probes/cli.mjs <projectRoot> [--json]`
//
// Discovers pwa-probes.config.mjs under <projectRoot>. If the config supplies no baseURL, the
// project directory is served statically (source-dir target). Findings render through the
// shared packages/report renderer; probe outcomes and the device-only block render here.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/config.mjs';
import { serveDir } from './lib/server.mjs';
import { runProbes } from './runner.mjs';
import { deviceOnlyResults } from './lib/device-only.mjs';
import { collectFindings, anyFailures, renderProbeOutcomes, renderDeviceOnlyBlock } from './report.mjs';
import { buildReport } from '../report/index.mjs';
import { renderMarkdown } from '../report/render-md.mjs';

const CATALOG_PATH = fileURLToPath(new URL('../catalog/catalog.json', import.meta.url));

function loadCatalog() {
  try {
    return JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Run the probe suite against a project root, returning a rendered report and pass/fail.
 * @param {string} projectRoot
 * @returns {Promise<{ markdown: string, results: object[], engines: string[], skipped: object[], failed: boolean }>}
 */
export async function runProbeSuite(projectRoot) {
  const catalog = loadCatalog();
  const config = await loadConfig(projectRoot);
  let server = null;
  if (!config.baseURL) {
    server = await serveDir(projectRoot);
    config.baseURL = server.url;
    config.target = 'source-dir';
    config.targetIsLocal = true;
  }

  try {
    const { results, engines, skipped } = await runProbes({ config });
    const all = [...results, ...deviceOnlyResults(catalog)];
    const findings = collectFindings(all);
    const model = buildReport({ findings, catalog });

    const markdown = [
      renderMarkdown(model),
      renderProbeOutcomes(all, { engines, skipped }),
      renderDeviceOnlyBlock(all),
    ]
      .filter(Boolean)
      .join('\n');

    return { markdown, results: all, engines, skipped, failed: anyFailures(all) };
  } finally {
    if (server) await server.close();
  }
}

async function main(argv) {
  const args = argv.filter((a) => !a.startsWith('--'));
  const json = argv.includes('--json');
  const projectRoot = path.resolve(args[0] || process.cwd());

  const suite = await runProbeSuite(projectRoot);
  if (json) {
    console.log(JSON.stringify({ results: suite.results, engines: suite.engines, skipped: suite.skipped, failed: suite.failed }, null, 2));
  } else {
    console.log(suite.markdown);
  }
  process.exit(suite.failed ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(2);
  });
}
