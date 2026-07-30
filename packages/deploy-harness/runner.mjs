// Orchestrates a harness run: one proxy + one browser, every check driven in sequence
// against the bundled A / B / B-breaking fixtures. A check that throws is recorded as
// BLOCKED with the error — never silently dropped, never a false PASS. Mirrors
// packages/probes/runner.mjs's shape so both packages' CLIs render the same way.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { withDeployHarness } from './lib/harness.mjs';
import { ALL_CHECKS } from './checks/index.mjs';
import { collectFindings, anyFailures, renderHarnessOutcomes } from './report.mjs';
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
 * @param {{ checks?: Array }} [o]
 * @returns {Promise<{ results: object[] }>}
 */
export async function runHarness({ checks = ALL_CHECKS } = {}) {
  return withDeployHarness(async (ctx) => {
    const results = [];
    for (const check of checks) {
      let res;
      try {
        res = await check.run(ctx);
      } catch (err) {
        res = {
          outcome: 'BLOCKED',
          findings: [],
          detail: `check error: ${(err?.message || String(err)).split('\n')[0]}`,
        };
      }
      results.push({ ids: check.ids, name: check.name, ...res });
    }
    return { results };
  });
}

/**
 * Runs the full suite and renders it through the shared report renderer, for the CLI.
 * @returns {Promise<{ markdown: string, results: object[], failed: boolean }>}
 */
export async function runHarnessSuite() {
  const catalog = loadCatalog();
  const { results } = await runHarness();
  const findings = collectFindings(results);
  const model = buildReport({ findings, catalog });
  const markdown = [renderMarkdown(model), renderHarnessOutcomes(results)].filter(Boolean).join('\n');
  return { markdown, results, failed: anyFailures(results) };
}
