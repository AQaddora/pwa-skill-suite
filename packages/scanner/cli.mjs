#!/usr/bin/env node
// Scanner CLI: node cli.mjs <project-dir> [--json] [--baseline <file>] [--write-baseline]
// Exposes runScan(dir, opts) -> { findings, surfaces } for reuse by tests and the skill.
import { fileURLToPath } from 'node:url';
import { walkFiles } from './lib/walk.mjs';
import { loadRules } from './lib/registry.mjs';
import { readBaseline, writeBaseline, filterAgainstBaseline } from './lib/baseline.mjs';

// Heuristic surface detection: does the audited app have forms / a service worker / RTL?
// Used by the report layer to mark whole sections N/A instead of failing them.
function detectSurfacesFromFile({ file, contents }, surfaces) {
  if (/<form[\s>]/i.test(contents) || /<input[\s>]/i.test(contents)) surfaces.forms = true;
  if (/(^|\/)(sw|service-worker)\.[jt]s$/i.test(file) || /serviceWorker\.register/.test(contents)) {
    surfaces['service-worker'] = true;
  }
  if (/dir\s*=\s*["']rtl["']/i.test(contents) || /\[dir[~=]/.test(contents)) surfaces.rtl = true;
  if (/manifest\.(json|webmanifest)$/i.test(file) || /rel=["']manifest["']/i.test(contents)) {
    surfaces.manifest = true;
  }
}

export async function runScan(dir, { detectSurfaces = false } = {}) {
  const rules = await loadRules();
  const findings = [];
  const surfaces = detectSurfaces
    ? { forms: false, 'service-worker': false, rtl: false, manifest: false }
    : undefined;

  for await (const fileObj of walkFiles(dir)) {
    if (detectSurfaces) detectSurfacesFromFile(fileObj, surfaces);
    for (const rule of rules) {
      let results;
      try {
        results = rule.check(fileObj) || [];
      } catch {
        results = [];
      }
      for (const r of results) findings.push(r);
    }
  }

  findings.sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.id.localeCompare(b.id),
  );
  return { findings, surfaces };
}

// --- plain-text fallback renderer (replaced by packages/report in Task 7) ---
function renderPlain(findings) {
  if (findings.length === 0) return '0 findings';
  const bySev = {};
  for (const f of findings) (bySev[f.severity] ||= []).push(f);
  const lines = [`${findings.length} findings`];
  for (const sev of ['P0', 'P1', 'P2']) {
    for (const f of bySev[sev] || []) {
      lines.push(`  [${f.id}] ${f.severity} ${f.file}:${f.line} — ${f.excerpt || ''}`);
    }
  }
  return lines.join('\n');
}

function parseArgs(argv) {
  const opts = { json: false, baseline: null, writeBaseline: false, dir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--write-baseline') opts.writeBaseline = true;
    else if (a === '--baseline') opts.baseline = argv[++i];
    else if (!a.startsWith('--') && !opts.dir) opts.dir = a;
  }
  return opts;
}

export async function main(argv) {
  const opts = parseArgs(argv);
  if (!opts.dir) {
    console.error('Usage: cli.mjs <project-dir> [--json] [--baseline <file>] [--write-baseline]');
    return 1;
  }
  let { findings } = await runScan(opts.dir);

  if (opts.writeBaseline && opts.baseline) {
    writeBaseline(opts.baseline, findings);
    console.log(`Wrote ${findings.length} findings to baseline ${opts.baseline}`);
    return 0;
  }
  if (opts.baseline) {
    findings = filterAgainstBaseline(findings, readBaseline(opts.baseline));
  }

  console.log(opts.json ? JSON.stringify({ findings }, null, 2) : renderPlain(findings));
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
