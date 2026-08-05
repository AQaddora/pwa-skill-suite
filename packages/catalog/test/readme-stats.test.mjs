import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { computeStats } from '../stats.mjs';
import { runScan } from '../../scanner/cli.mjs';
import { buildReport } from '../../report/index.mjs';

const catalog = JSON.parse(readFileSync(new URL('../catalog.json', import.meta.url), 'utf8'));
const readme = readFileSync(new URL('../../../README.md', import.meta.url), 'utf8');

test('README catalog totals and coverage cannot drift from catalog.json', () => {
  const stats = computeStats(catalog);
  assert.match(readme, new RegExp(`catalogs \\*\\*${stats.total}\\*\\*`));
  assert.match(readme, new RegExp(`Total entries: ${stats.total}`));
  assert.match(readme, new RegExp(`P0 = ${stats.bySeverity.P0}\\s+P1 = ${stats.bySeverity.P1}\\s+P2 = ${stats.bySeverity.P2}`));
  assert.match(readme, new RegExp(`rules\\s+${stats.rulesImplemented} / ${stats.total}`));
  assert.match(readme, new RegExp(`probes\\s+${stats.probesImplemented} / ${stats.total}`));
  assert.match(readme, new RegExp(`Device-only[^\n]+: ${stats.deviceOnly}`));

  for (const [section, count] of Object.entries(stats.bySection)) {
    assert.match(readme, new RegExp(`${section}\\s+${count}(?:\\s|$)`));
  }
});

test('README real-output summary matches the current bad scanner fixture', async () => {
  const fixture = fileURLToPath(new URL('../../scanner/fixtures/bad', import.meta.url));
  const scan = await runScan(fixture, { detectSurfaces: true });
  assert.equal(scan.blocked, false);
  const report = buildReport({
    findings: scan.findings,
    catalog,
    surfaces: scan.surfaces,
  });
  assert.match(
    readme,
    new RegExp(
      `\\*\\*Summary:\\*\\* ${report.summary.p0} P0 · ${report.summary.p1} P1 · ${report.summary.p2} P2 · ${report.summary.advisory} advisory`,
    ),
  );
});
