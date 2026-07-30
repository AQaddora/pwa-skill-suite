#!/usr/bin/env node
// Read-only PWA audit entry point. Runs the static scanner over <project-dir>, builds the
// graded report, and prints it. Never opens a write handle against the audited project.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runScan } from '../../../packages/scanner/cli.mjs';
import { buildReport } from '../../../packages/report/index.mjs';
import { renderMarkdown } from '../../../packages/report/render-md.mjs';
import { renderJson } from '../../../packages/report/render-json.mjs';

const catalogPath = fileURLToPath(
  new URL('../../../packages/catalog/catalog.json', import.meta.url),
);
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));

const args = process.argv.slice(2);
const jsonFlag = args.includes('--json');
const dir = args.find((a) => !a.startsWith('--'));
if (!dir) {
  console.error('Usage: run-audit.mjs <project-dir> [--json]');
  process.exit(1);
}

const { findings, surfaces } = await runScan(dir, { detectSurfaces: true });
const report = buildReport({ findings, catalog, surfaces });
console.log(jsonFlag ? renderJson(report) : renderMarkdown(report));
