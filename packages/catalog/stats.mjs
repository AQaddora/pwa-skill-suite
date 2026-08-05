// Computes a coverage report from packages/catalog/catalog.json: how many
// entries exist, broken down by severity and section, and how many of them
// have a scanner `rule` or `probe` actually implemented yet (vs. still
// cataloged-only). `computeStats(entries)` is pure (array in, object out);
// the CLI below just wires it to the filesystem and prints a Markdown
// table. Nothing here is hardcoded — every number is derived from the
// entries passed in, so this can never drift from catalog.json.

import { readFileSync } from 'node:fs';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const catalogPath = path.join(__dirname, 'catalog.json');

const SEVERITIES = ['P0', 'P1', 'P2'];

function isImplemented(value) {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Compute coverage stats from an array of catalog entries (the parsed
 * contents of catalog.json, or a fixture subset of it).
 *
 * Purely a function of `entries` — no filesystem access, no hidden state.
 *
 * @param {object[]} entries
 * @returns {{
 *   total: number,
 *   bySeverity: Record<string, number>,
 *   bySection: Record<string, number>,
 *   rulesImplemented: number,
 *   probesImplemented: number,
 *   deviceOnly: number,
 * }}
 */
export function computeStats(entries) {
  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  const bySection = {};
  let rulesImplemented = 0;
  let probesImplemented = 0;
  let deviceOnly = 0;

  for (const entry of entries) {
    if (entry.severity in bySeverity) {
      bySeverity[entry.severity] += 1;
    }
    bySection[entry.section] = (bySection[entry.section] ?? 0) + 1;
    if (isImplemented(entry.rule)) rulesImplemented += 1;
    if (isImplemented(entry.probe)) probesImplemented += 1;
    if (entry.deviceOnly === true) deviceOnly += 1;
  }

  return {
    total: entries.length,
    bySeverity,
    bySection,
    rulesImplemented,
    probesImplemented,
    deviceOnly,
  };
}

function pct(count, total) {
  if (total === 0) return 0;
  return Math.round((100 * count) / total);
}

function renderTable(stats) {
  const lines = [];

  lines.push(`# Catalog coverage report`, '');
  lines.push(`Total entries: **${stats.total}**`, '');

  lines.push('## By severity', '', '| severity | count |', '|---|---|');
  for (const sev of SEVERITIES) {
    lines.push(`| ${sev} | ${stats.bySeverity[sev]} |`);
  }
  lines.push('');

  lines.push('## By section', '', '| section | count |', '|---|---|');
  for (const section of Object.keys(stats.bySection).sort()) {
    lines.push(`| ${section} | ${stats.bySection[section]} |`);
  }
  lines.push('');

  lines.push('## Scanner implementation coverage', '', '| | implemented | of total | % |', '|---|---|---|---|');
  lines.push(`| rules | ${stats.rulesImplemented} | ${stats.total} | ${pct(stats.rulesImplemented, stats.total)}% |`);
  lines.push(`| probes | ${stats.probesImplemented} | ${stats.total} | ${pct(stats.probesImplemented, stats.total)}% |`);
  lines.push('');

  lines.push(
    `Device-only (cannot be verified in CI/emulation): **${stats.deviceOnly}** (${pct(stats.deviceOnly, stats.total)}% of total)`
  );

  return lines.join('\n');
}

function loadEntries() {
  return JSON.parse(readFileSync(catalogPath, 'utf8'));
}

function main() {
  const entries = loadEntries();
  const stats = computeStats(entries);
  console.log(renderTable(stats));
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
  main();
}
