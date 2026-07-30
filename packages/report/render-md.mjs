// Renders a ReportModel to Markdown. Findings are grouped per fix and ordered
// P0 → P1 → P2 → advisory (advisory = heuristic/low-confidence, ranked below real
// findings). Symptom and fix text are pulled from the catalog entry so they cannot drift.
const MAX_INSTANCES_SHOWN = 5;

function bucketOf(group) {
  const entry = group.catalogEntry || {};
  if (entry.confidence === 'advisory') return 'advisory';
  return entry.severity || 'P2';
}

const SECTIONS = [
  ['P0', '## P0 — critical'],
  ['P1', '## P1 — high'],
  ['P2', '## P2 — medium'],
  ['advisory', '## Advisory — heuristic, verify before acting'],
];

function renderGroup(group) {
  const e = group.catalogEntry || {};
  const lines = [];
  lines.push(`### ${group.id} · ${e.title || ''}`.trimEnd());
  lines.push('');
  lines.push(`**1 root cause → ${group.count} instance${group.count === 1 ? '' : 's'}**`);
  if (e.symptom) lines.push(`- **Symptom:** ${e.symptom}`);
  if (e.correct) lines.push(`- **Fix:** ${e.correct}`);
  lines.push('');
  const shown = group.instances.slice(0, MAX_INSTANCES_SHOWN);
  for (const inst of shown) {
    const excerpt = inst.excerpt ? ` — \`${inst.excerpt}\`` : '';
    lines.push(`  - \`${inst.file}:${inst.line}\`${excerpt}`);
  }
  const extra = group.instances.length - shown.length;
  if (extra > 0) lines.push(`  - …+${extra} more`);
  lines.push('');
  return lines.join('\n');
}

export function renderMarkdown(model) {
  const { summary = {}, grouped = [], blindSpots = '' } = model;
  const out = [];
  out.push('# PWA audit report');
  out.push('');
  out.push(
    `**Summary:** ${summary.p0 || 0} P0 · ${summary.p1 || 0} P1 · ${summary.p2 || 0} P2 · ${
      summary.advisory || 0
    } advisory`,
  );
  out.push('');
  out.push(blindSpots);
  out.push('');

  const byBucket = { P0: [], P1: [], P2: [], advisory: [] };
  for (const g of grouped) byBucket[bucketOf(g)].push(g);

  let anyFindings = false;
  for (const [key, heading] of SECTIONS) {
    const groups = byBucket[key];
    if (!groups.length) continue;
    anyFindings = true;
    out.push(heading);
    out.push('');
    for (const g of groups) out.push(renderGroup(g));
  }
  if (!anyFindings) {
    out.push('No findings from the static rules. See the disclosure above — this is not');
    out.push('proof of correctness.');
  }
  return out.join('\n');
}
