// Builds the report model: findings grouped by fix, an outcome per catalog entry, the
// blind-spots disclosure, and a severity/confidence summary.
import { groupByFix } from './group.mjs';
import { deriveOutcome } from './outcomes.mjs';
import { exemptionFor, normalizePolicy } from './policy.mjs';
import { SCANNER_BLIND_SPOTS } from './visibility.mjs';

// Sections that map to a detectable "surface". If the caller reports the surface absent,
// entries in that section are N/A rather than failures. Sections not listed here are
// always considered present (we can't cheaply prove their absence).
const SURFACE_SECTIONS = new Set(['forms', 'service-worker', 'rtl', 'manifest']);

function bucketOf(entry) {
  if (!entry) return 'P2';
  if (entry.confidence === 'advisory') return 'advisory';
  return entry.severity || 'P2';
}

export function buildReport({
  findings = [],
  baselinedFindings = [],
  catalog = [],
  surfaces = {},
  coverageById = {},
  incompleteCoverageById = {},
  blocked = false,
  diagnostics = [],
  policy = undefined,
}) {
  const findingsById = new Map();
  for (const f of findings) {
    if (!findingsById.has(f.id)) findingsById.set(f.id, []);
    findingsById.get(f.id).push(f);
  }
  const baselinedFindingsById = new Map();
  for (const f of baselinedFindings) {
    if (!baselinedFindingsById.has(f.id)) baselinedFindingsById.set(f.id, []);
    baselinedFindingsById.get(f.id).push(f);
  }

  const activePolicy = normalizePolicy(policy);
  const policyExemptions = [];
  const outcomesByEntry = new Map();
  for (const entry of catalog) {
    const entryFindings = findingsById.get(entry.id) || [];
    const entryBaselinedFindings = baselinedFindingsById.get(entry.id) || [];
    const surfacePresent = SURFACE_SECTIONS.has(entry.section) ? surfaces[entry.section] : undefined;
    const applicableFiles =
      coverageById instanceof Map ? coverageById.get(entry.id) ?? 0 : coverageById[entry.id] ?? 0;
    const incompleteFiles =
      incompleteCoverageById instanceof Map
        ? incompleteCoverageById.get(entry.id) ?? 0
        : incompleteCoverageById[entry.id] ?? 0;
    outcomesByEntry.set(
      entry.id,
      deriveOutcome({
        catalogEntry: entry,
        findings: entryFindings,
        baselinedFindings: entryBaselinedFindings,
        surfacePresent,
        applicableFiles,
        incompleteFiles,
        blocked,
        policyExempt: exemptionFor(entry.id, activePolicy),
      }),
    );

    const waiver = exemptionFor(entry.id, activePolicy);
    if (waiver) {
      policyExemptions.push({
        id: entry.id,
        title: entry.title,
        severity: entry.severity,
        reason: waiver.reason,
        caveat: waiver.caveat,
        // Waived, not deleted: the reader still sees how much was set aside.
        suppressedFindings: entryFindings.length,
      });
    }
  }

  // A waived entry reports N/A, so its findings must not also be counted as blocking —
  // otherwise the summary contradicts the outcome. They stay in `findings` (nothing is
  // deleted from the data) and are listed under the waiver section instead.
  const waivedIds = new Set(policyExemptions.map((e) => e.id));
  const policyWaivedFindings = findings.filter((f) => waivedIds.has(f.id));
  const countableFindings = waivedIds.size === 0 ? findings : findings.filter((f) => !waivedIds.has(f.id));

  const grouped = groupByFix(countableFindings, catalog);
  const summary = { p0: 0, p1: 0, p2: 0, advisory: 0 };
  for (const g of grouped) {
    const bucket = bucketOf(g.catalogEntry);
    if (bucket === 'advisory') summary.advisory += g.count;
    else if (bucket === 'P0') summary.p0 += g.count;
    else if (bucket === 'P1') summary.p1 += g.count;
    else summary.p2 += g.count;
  }

  return {
    status: blocked ? 'BLOCKED' : 'COMPLETE',
    blocked,
    policy: activePolicy,
    policyExemptions,
    policyWaivedFindings,
    diagnostics,
    findings,
    baselinedFindings,
    coverageById,
    incompleteCoverageById,
    grouped,
    outcomesByEntry,
    blindSpots: SCANNER_BLIND_SPOTS,
    summary,
  };
}
