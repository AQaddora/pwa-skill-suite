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
  const {
    status = model.blocked ? 'BLOCKED' : 'COMPLETE',
    diagnostics = [],
    summary = {},
    grouped = [],
    baselinedFindings = [],
    outcomesByEntry = new Map(),
    incompleteCoverageById = {},
    blindSpots = '',
  } = model;
  const out = [];
  out.push('# PWA audit report');
  out.push('');
  out.push(`**Scan status:** ${status}`);
  out.push('');
  if (status === 'BLOCKED') {
    out.push('> **BLOCKED:** The scanner did not complete reliably. Do not treat absent findings as PASS.');
    out.push('>');
    if (diagnostics.length === 0) {
      out.push('> - `UNKNOWN_SCAN_FAILURE` — No diagnostic was supplied.');
    } else {
      for (const diagnostic of diagnostics) {
        const location = diagnostic.path ? ` (${diagnostic.path})` : '';
        out.push(`> - \`${diagnostic.code || 'SCAN_FAILURE'}\`${location} — ${diagnostic.message}`);
      }
    }
    out.push('');
  }
  out.push(
    `**Summary:** ${summary.p0 || 0} P0 · ${summary.p1 || 0} P1 · ${summary.p2 || 0} P2 · ${
      summary.advisory || 0
    } advisory`,
  );
  out.push('');
  const policyExemptions = model.policyExemptions || [];
  if (policyExemptions.length > 0) {
    const activePolicy = model.policy || 'app';
    const waivedFindings = policyExemptions.reduce((n, e) => n + (e.suppressedFindings || 0), 0);
    out.push(
      `> **Policy waivers (\`${activePolicy}\`):** ${policyExemptions.length} entr${policyExemptions.length === 1 ? 'y is' : 'ies are'} reported as N/A by audit policy, setting aside ${waivedFindings} finding${waivedFindings === 1 ? '' : 's'}. These are decisions, not clean results.`,
      '',
    );
    for (const e of policyExemptions) {
      out.push(`- **${e.id} · ${e.title}** (${e.severity}) — N/A. ${e.reason}`);
      if (e.caveat) out.push(`  - ${e.caveat}`);
      if (e.suppressedFindings > 0) {
        out.push(`  - ${e.suppressedFindings} finding${e.suppressedFindings === 1 ? '' : 's'} set aside by this waiver.`);
      }
    }
    out.push('', 'Re-run with `--policy document` to audit this target as a website, where nothing is waived.', '');
  }

  if (outcomesByEntry.size > 0) {
    const outcomeCounts = { PASS: 0, FAIL: 0, UNVERIFIED: 0, 'N/A': 0, BLOCKED: 0 };
    for (const outcome of outcomesByEntry.values()) outcomeCounts[outcome] += 1;
    out.push(
      `**Rule outcomes:** ${outcomeCounts.PASS} PASS · ${outcomeCounts.FAIL} FAIL · ${outcomeCounts.UNVERIFIED} UNVERIFIED · ${outcomeCounts['N/A']} N/A · ${outcomeCounts.BLOCKED} BLOCKED`,
    );
    out.push('');
    if (status !== 'BLOCKED') {
      out.push(
        '**Interpretation:** the scan completed; this is not a readiness PASS. Review every FAIL and UNVERIFIED outcome.',
      );
      out.push('');
    }
  }

  if (baselinedFindings.length > 0) {
    const ids = [...new Set(baselinedFindings.map((finding) => finding.id))].sort();
    const shown = ids.slice(0, 12);
    const extra = ids.length - shown.length;
    out.push(
      `> **Baselined findings:** ${baselinedFindings.length} current finding${baselinedFindings.length === 1 ? '' : 's'} suppressed from the grouped list. Affected entries remain FAIL, never PASS.`,
    );
    out.push(`> ${shown.join(' · ')}${extra > 0 ? ` · +${extra} more` : ''}`);
    out.push('');
  }

  const incompleteEntries = (
    incompleteCoverageById instanceof Map
      ? [...incompleteCoverageById.entries()]
      : Object.entries(incompleteCoverageById)
  ).filter(([, count]) => Number.isFinite(count) && count > 0);
  if (incompleteEntries.length > 0) {
    const shown = incompleteEntries.slice(0, 12).map(([id, count]) => `${id} (${count})`);
    const extra = incompleteEntries.length - shown.length;
    out.push(
      `> **UNVERIFIED source coverage:** ${incompleteEntries.length} rule${incompleteEntries.length === 1 ? '' : 's'} encountered relevant source formats they cannot inspect.`,
    );
    out.push(`> ${shown.join(' · ')}${extra > 0 ? ` · +${extra} more` : ''}`);
    out.push('');
  }
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
    if (status === 'BLOCKED') {
      out.push('The finding set is incomplete because the audit is BLOCKED.');
    } else {
      out.push('No findings from the static rules. See the disclosure above — this is not');
      out.push('proof of correctness.');
    }
  }
  return out.join('\n');
}
