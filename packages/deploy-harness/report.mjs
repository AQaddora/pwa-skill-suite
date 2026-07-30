// Harness-side rendering: the per-assertion outcome table. Findings themselves render through
// the shared packages/report renderer (reused by packages/probes and this package alike), so
// there is exactly one findings renderer in the suite.

const OUTCOME_ORDER = { FAIL: 0, BLOCKED: 1, PASS: 2 };

export function collectFindings(results) {
  return results.flatMap((r) => r.findings || []);
}

export function anyFailures(results) {
  return results.some((r) => r.outcome === 'FAIL');
}

export function renderHarnessOutcomes(results) {
  const lines = [];
  lines.push('## Deploy harness results (A → B, single origin)', '');
  lines.push('| id | outcome | detail |', '|----|---------|--------|');
  const sorted = [...results].sort(
    (a, b) => (OUTCOME_ORDER[a.outcome] ?? 9) - (OUTCOME_ORDER[b.outcome] ?? 9) || a.ids[0].localeCompare(b.ids[0]),
  );
  for (const r of sorted) {
    lines.push(`| ${r.ids.join(', ')} | ${r.outcome} | ${(r.detail || '').replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
  return lines.join('\n');
}
