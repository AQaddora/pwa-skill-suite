// Probe-side rendering: the per-entry outcome table (with honest engine coverage) and the
// "Verify on a real device" block. It deliberately does NOT render findings — those go
// through packages/report's renderer, reused by the CLI and pwa-verify, so there is exactly
// one findings renderer in the suite.

const OUTCOME_ORDER = { FAIL: 0, BLOCKED: 1, UNVERIFIED: 2, 'N/A': 3, PASS: 4 };

export function collectFindings(results) {
  return results.flatMap((r) => r.findings || []);
}

export function anyFailures(results) {
  return results.some((r) => r.outcome === 'FAIL');
}

export function renderProbeOutcomes(results, { engines = [], skipped = [] } = {}) {
  const lines = [];
  lines.push('## Probe results', '');
  lines.push(`Engines exercised: ${engines.length ? engines.join(', ') : '(none)'}`);
  if (skipped.length) {
    lines.push('');
    for (const s of skipped) lines.push(`Engine skipped: **${s.engine}** — ${s.reason}`);
  }
  lines.push('', '| id | outcome | detail |', '|----|---------|--------|');
  const sorted = [...results].sort(
    (a, b) => (OUTCOME_ORDER[a.outcome] ?? 9) - (OUTCOME_ORDER[b.outcome] ?? 9) || a.ids[0].localeCompare(b.ids[0]),
  );
  for (const r of sorted) {
    lines.push(`| ${r.ids.join(', ')} | ${r.outcome} | ${(r.detail || '').replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
  return lines.join('\n');
}

export function renderDeviceOnlyBlock(results) {
  const deviceOnly = results.filter((r) => r.outcome === 'UNVERIFIED' && r.reproduction);
  if (!deviceOnly.length) return '';
  const lines = [];
  lines.push('## Verify on a real device (UNVERIFIED — device-only)', '');
  lines.push('WebKit in CI is not iOS Safari. These cannot be proven here — check each on a real device:', '');
  for (const r of deviceOnly) {
    lines.push(`### ${r.ids.join(', ')} — ${r.name}`);
    for (const step of r.reproduction.split('\n')) lines.push(`- ${step}`);
    lines.push('');
  }
  return lines.join('\n');
}
